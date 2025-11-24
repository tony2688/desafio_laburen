<div align="center">

# Agente de IA en WhatsApp · Laburen

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![WhatsApp Cloud API](https://img.shields.io/badge/WhatsApp%20Cloud%20API-Meta-25D366?logo=whatsapp&logoColor=white)](https://developers.facebook.com/docs/whatsapp/)
[![Gemini](https://img.shields.io/badge/Gemini-Google%20GenAI-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

</div>

Agente de IA que atiende clientes por **WhatsApp**: interpreta lenguaje natural, consulta la **API REST** del catálogo y arma/edita un **carrito** con datos reales. No utiliza menús predefinidos; opera mediante tools (function calling) integradas con el backend.

## Índice
- Introducción
- Requisitos del sistema
- Instalación y configuración
- Ejemplos de uso
- Arquitectura
- Estructura del proyecto
- API y WhatsApp Cloud API
- Contribución y código de conducta
- Estado del proyecto y roadmap
- Licencia y créditos

## Introducción
- Explora productos, busca por tipo/color/talle y muestra detalle con stock y precios por tramo.
- Crea y actualiza carritos desde la conversación. El identificador de sesión es `whatsappUserId`.
- Tools disponibles: `getProducts`, `getProductById`, `getCart`, `createCart`, `updateCart`.
- Documentación ampliada: `docs/README_IA.md`.

### Cambios recientes
- Visualización de códigos sin ceros a la izquierda (#100 en vez de #001) en catálogo, detalle, carrito y confirmaciones.
- Búsqueda tolerante a acentos y sinónimos (map estático + variantes dinámicas desde datos reales).
- Parser conversacional mejorado: agregar por descripción (tipo/color/talle), cantidades en palabras y flujos guía.
- Código fuente documentado con JSDoc en módulos críticos (parser, agente, servicios, routers, webhook).

## Requisitos del sistema
- Sistema operativo: Windows/macOS/Linux.
- Node.js `>=20` y TypeScript `>=5`.
- PostgreSQL accesible vía `DATABASE_URL`.
- Cuenta de WhatsApp Cloud API (token, phone number ID y verify token).
- Clave de API de Gemini (`GEMINI_API_KEY`).

## Instalación y configuración

### 1) Clonar e instalar dependencias
```bash
git clone https://github.com/tony2688/desafio_laburen.git
cd desafio_laburen
npm install
```

### 2) Variables de entorno (`.env`)
```bash
# App
PORT=3000
BASE_URL=http://localhost:3000

# DB
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DBNAME

# Gemini
GEMINI_API_KEY=xxxx
GEMINI_MODEL=gemini-2.5-flash

# WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=xxxx
WHATSAPP_PHONE_NUMBER_ID=xxxx
WHATSAPP_VERIFY_TOKEN=xxxx
WHATSAPP_API_VERSION=24.0
WHATSAPP_OUTGOING_TO_OVERRIDE= # opcional para pruebas locales
```

### 3) Base de datos
```bash
npm run prisma:generate
npx prisma migrate deploy # o: npx prisma migrate dev
```

### 4) Puesta en marcha
```bash
npm run build   # compila TypeScript
npm run dev     # entorno de desarrollo (watch)
# Opcional: npm start   # requiere build previo
```

Health:
- `GET /` → `ok`
- `GET /healthz` → `{ status:"ok" }`
- `GET /healthz/gemini` → `{ status, model, text }`

## Ejemplos de uso

Conversación típica (WhatsApp):
- "mostrame el catálogo"
- "ver 100"
- "agregá 50 del 100"
- "cambiá a 5 unidades del 100"
- "eliminá el 100 del carrito"
- "ver carrito"

Casos prácticos tolerantes:
- Agregar por descripción: "agregá 20 de pantalón verde" → busca y agrega si hay una sola coincidencia.
- Cantidades en palabras: "ciento veinte y tres" → `123`.
- Sinónimos y acentos: "camiseta" ≈ "remera", "pantalon" ≈ "pantalón".

API (curl):
```bash
# Buscar productos
curl "http://localhost:3000/products?q=remera&page=1&page_size=5"

# Ver detalle
curl "http://localhost:3000/products/100"

# Obtener carrito abierto
curl "http://localhost:3000/carts?whatsappUserId=54911...&status=OPEN"

# Crear carrito y agregar items
curl -X POST "http://localhost:3000/carts" \
  -H "Content-Type: application/json" \
  -d '{"whatsappUserId":"54911...","items":[{"productId":"100","quantity":50}]}'

# Editar carrito
curl -X PATCH "http://localhost:3000/carts/<cartId>" \
  -H "Content-Type: application/json" \
  -d '{"updateItems":[{"productId":"100","quantity":5}]}'
```

Errores de negocio mapeados: `stock_insufficient` / `cart_not_open` → 409; `cart_not_found` / `product_not_found` → 404 (`src/middlewares/errorHandler.ts`).

## Arquitectura

```mermaid
flowchart LR
  U[Usuario WhatsApp] --> WA[WhatsApp Cloud API]
  WA --> WH[Webhook WhatsApp]
  WH --> AG[Agente IA]
  AG -- HTTP Tools --> API[API REST: products, carts]
  API --> SVC[Servicios de dominio]
  SVC --> PR[Prisma ORM]
  PR --> PG[(PostgreSQL)]
  AG --> LLM[Gemini]
```

- Punto de entrada del servidor: `src/index.ts`.
- Webhook WhatsApp: `src/webhooks/whatsapp/router.ts`.
- Agente IA (orquestación y tools): `src/agent/index.ts`.
- Cliente Gemini: `src/agent/geminiClient.ts`.
- Routers y servicios: `src/api/*`, `src/services/*`.

## Estructura del proyecto
- `src/index.ts` servidor Express y health.
- `src/webhooks/whatsapp/router.ts` entrada y salida de WhatsApp.
- `src/agent/index.ts` lógica del agente y ejecución de tools.
- `src/agent/tools.ts` llamadas HTTP a la API local.
- `src/agent/geminiClient.ts` integración con Google GenAI.
- `src/api/*` routers de productos y carritos.
- `src/services/*` reglas de negocio (Prisma ORM).
- `src/infra/*` Prisma client (si aplica en futuras fases).
- `prisma/*` esquema y migraciones.

## API y WhatsApp Cloud API
- Endpoint de webhook: `POST /webhooks/whatsapp`; verificación: `GET /webhooks/whatsapp?...`.
- Envío de respuestas a Graph con `Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>`.
- Errores comunes: token expirado (190/463), destinatario no permitido (131030).
- Flujo conversacional y herramientas del agente: `docs/conversation-flow.md`.

## Contribución y código de conducta

### Cómo contribuir
- Fork y branch por feature: `feature/<breve-descripcion>`.
- Mantener estilo de código y patrones existentes.
- No incluir secretos en commits; usar `.env` local.
- Antes de abrir PR:
  - `npm run build` sin errores.
  - Verificación manual de endpoints y flujo WhatsApp.
  - Describir cambios y motivación en el PR.

### Código de conducta
- Comunicación respetuosa y profesional.
- Cero tolerancia con discriminación u hostigamiento.
- Constructivo en revisiones: enfocar en código y requerimientos.

## Estado del proyecto y roadmap

Estado actual:
- Catálogo y carritos operativos vía tools y API.
- Visualización de códigos sin ceros a la izquierda.
- Búsqueda robusta: acentos y sinónimos (estático + dinámico).
- Parser conversacional con agregar por descripción y cantidades en palabras.
- Código fuente comentado con JSDoc en módulos críticos.

Próximas características:
- Integración de pagos y cierre de carrito.
- Panel admin básico para monitoreo y validaciones.
- Rate limiting y controles anti-abuso.
- Tests automatizados y cobertura mínima.
- Multilenguaje mejorado y más sinónimos del dominio.

## Licencia y créditos
- Licencia: MIT (se recomienda agregar `LICENSE` al repositorio en producción).
- Autor: **Antonio Orlando Romero**
  - GitHub: [@tony2688](https://github.com/tony2688/desafio_laburen)
  - Email: antonioorlandoromero@gmail.com
  - LinkedIn: https://www.linkedin.com/in/antonio-orlando-romero-7158b414b/

Proyecto desarrollado como parte del desafío técnico para el rol de **AI Engineer / Desarrollador de agentes de IA**.
