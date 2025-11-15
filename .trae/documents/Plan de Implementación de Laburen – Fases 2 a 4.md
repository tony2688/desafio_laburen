## Alcance
- Implementar BD (Prisma/PostgreSQL), API REST (Express), agente IA (OpenAI + herramientas HTTP) e integración WhatsApp Cloud API.
- Entregables ejecutables, pruebas automatizadas, y preparación para despliegue en Azure con opción de Cloudflare como proxy.

## Preparación
- Variables de entorno: `DATABASE_URL`, `OPENAI_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `BASE_URL`.
- Estructura de proyecto:
  - `src/api/products`, `src/api/carts` (controladores/routers)
  - `src/services/products`, `src/services/carts` (dominio)
  - `src/agent` (prompt, herramientas, orquestación)
  - `src/webhooks/whatsapp` (webhook y envío de mensajes)
  - `src/infra/prisma` (cliente Prisma), `src/infra/http` (cliente HTTP del agente)
  - `tests/` (unitarios e integración)

## Fase 2: BD + Prisma + Seed
### Schema Prisma
- `Product`:
  - `id: String @id`
  - `type: String`, `size: String`, `color: String`
  - `availableQuantity: Int`, `isAvailable: Boolean`
  - `price50: Decimal`, `price100: Decimal`, `price200: Decimal`, `currency: String`
  - `category: String`, `description: String?`
  - `createdAt: DateTime @default(now())`, `updatedAt: DateTime @updatedAt`
- `Cart`:
  - `id: String @id @default(uuid())`
  - `whatsappUserId: String`, `status: Enum("OPEN","COMPLETED","CANCELLED")`
  - `currency: String`, `subtotal: Decimal @default(0)`, `total: Decimal @default(0)`
  - `createdAt: DateTime @default(now())`, `updatedAt: DateTime @updatedAt`
  - Índice único condicional: un `OPEN` por `whatsappUserId` (implementado en lógica de servicio si el motor no soporta filtro único condicional).
- `CartItem`:
  - `id: String @id @default(uuid())`, `cartId: String`, `productId: String`
  - `productNameSnapshot: String?`, `unitPrice: Decimal`, `quantity: Int`, `subtotal: Decimal`
  - `createdAt: DateTime @default(now())`, `updatedAt: DateTime @updatedAt`
  - Relaciones: `CartItem.cart -> Cart`, `CartItem.product -> Product`.

### Seed desde products.xlsx
- Utilidad para parsear Excel (ej. `xlsx`/SheetJS) y cargar filas:
  - Mapear columnas: `ID`, `TIPO_PRENDA`, `TALLA`, `COLOR`, `CANTIDAD_DISPONIBLE`, `PRECIO_50_U`, `PRECIO_100_U`, `PRECIO_200_U`, `DISPONIBLE`, `CATEGORÍA`, `DESCRIPCIÓN`.
  - Normalizar tipos (int/decimal/bool) y moneda por defecto `ARS`.
  - Idempotente: upsert por `Product.id`.

## Fase 2: API REST (Express)
### Endpoints y contratos
- `GET /products?q=&page=&page_size=`
  - Filtro texto libre sobre `type`, `size`, `color`, `category`, `description` usando `ILIKE`.
  - Paginación (`page` default 1, `page_size` default 10, máx 50).
  - Solo `isAvailable = true` y `availableQuantity > 0` (configurable incluir agotados con flag).
  - Respuesta: `{ items:[{ id, type, size, color, category, price50, currency, availableQuantity }], page, page_size, total }`.
- `GET /products/:id`
  - Respuesta: `{ id, type, size, color, category, price50, price100, price200, currency, availableQuantity, isAvailable, description }`.
- `POST /carts`
  - Body: `{ whatsappUserId: string, items?: [{ productId: string, quantity: number }] }`.
  - Política: si existe `OPEN` para `whatsappUserId`, retornar ese; si llegan `items`, agregarlos.
  - Respuesta: carrito `OPEN` con `{ id, whatsappUserId, status, currency, subtotal, total, items:[{ productId, productNameSnapshot, quantity, unitPrice, subtotal }] }`.
- `PATCH /carts/:id`
  - Body: `{ addItems?: [{ productId, quantity }], updateItems?: [{ productId, quantity }], removeItems?: [{ productId }] }`.
  - Validaciones: carrito `OPEN`, `quantity >= 1`, stock suficiente; transacción con recálculo de `subtotal/total`.
  - Respuesta: carrito actualizado con items y totales.
- Opcional: `GET /carts?whatsappUserId=&status=OPEN`.

### Controladores y servicios
- `ProductsService`:
  - `search(q, page, pageSize)` y `getById(id)`.
- `CartsService`:
  - `getOrCreateOpenCart(whatsappUserId)`.
  - `addItems(cartId, items)`; `updateItems(cartId, items)`; `removeItems(cartId, items)`.
  - Revalida stock (`availableQuantity`) y actualiza totales y snapshots.

### Validación y errores
- Validación con `zod` en controladores; códigos:
  - `400` inputs inválidos, `404` no encontrado, `409` conflictos (p.ej. editar carrito no `OPEN`).

## Fase 3: Agente IA
### Herramientas HTTP (wrappers)
- `getProducts({ q?, page?, page_size? })` → `GET /products`
- `getProductById({ id })` → `GET /products/:id`
- `getCart({ whatsappUserId })` → `GET /carts?whatsappUserId=&status=OPEN`
- `createCart({ whatsappUserId, items? })` → `POST /carts`
- `updateCart({ cartId, addItems?, updateItems?, removeItems? })` → `PATCH /carts/:id`

### Orquestación y prompt
- Prompt de sistema (resumen): asistente de ventas; usar siempre herramientas; mantener contexto por `whatsappUserId`; desambiguar; validar stock.
- Intenciones: `buscar`, `ver_detalle`, `agregar`, `cambiar_cantidad`, `eliminar`, `ver_resumen`.
- Estrategia:
  - Resolver `id` vía `getProducts` si llega texto.
  - Recuperar carrito `OPEN` antes de crear; crear automáticamente al agregar si no existe.
  - Respuestas cortas, top-5, CTA claras.

## Fase 4: WhatsApp + Webhook
- Webhook `POST /webhooks/whatsapp`:
  - Verificación de `hub.challenge` y firma.
  - Normalizar mensajes entrantes a `{ text, whatsappUserId }`.
  - Invocar agente y enviar respuesta con WhatsApp Cloud API (mensajes de texto simples).
- Manejo de errores y reintentos (idempotencia básica por `message_id`).

## Pruebas
- Unitarias:
  - Servicios de productos (búsqueda, filtros) y carritos (add/update/remove, totales, stock).
- Integración:
  - Endpoints `products` y `carts` con Prisma en BD de test.
- E2E (simulado):
  - Flujo: buscar→detalle→agregar→editar→resumen.
- Datos de prueba: extracción parcial del Excel o fixtures mínimos.

## Observabilidad y seguridad
- Logging (`pino`), manejo de errores centralizado, correlación por `whatsappUserId`.
- Validación de entrada (`zod`), límites de paginación, rate limit en proxy (Cloudflare).
- Secrets vía variables de entorno; nunca loggear tokens.

## Despliegue
- Azure App Service para backend; Azure Database for PostgreSQL.
- Cloudflare como proxy opcional para `/products` con cache liviana.
- CI/CD: lint, build, tests, migración Prisma, seed.

## Hitos y aceptación
- Hito 1: Prisma + migraciones + seed exitoso.
- Hito 2: API REST funcional con contratos definidos y pruebas integración.
- Hito 3: Agente IA operando contra API con flujos principales.
- Hito 4: Webhook WhatsApp conectado, mensajes de ida y vuelta.

## Entregables
- Código fuente con estructura indicada.
- Colección Postman/Insomnia para endpoints.
- Scripts de migración y seed.
- Pruebas unitarias e integración con cobertura mínima acordada.