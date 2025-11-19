<div align="center">

# Agente de IA en WhatsApp · Laburen

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![WhatsApp Cloud API](https://img.shields.io/badge/WhatsApp%20Cloud%20API-Meta-25D366?logo=whatsapp&logoColor=white)](https://developers.facebook.com/docs/whatsapp/)
[![Gemini](https://img.shields.io/badge/Gemini-Google%20GenAI-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

</div>

Proyecto que implementa un **agente de IA** que atiende clientes por **WhatsApp**: interpreta lenguaje natural, consulta la **API REST** del catálogo, y arma/edita un **carrito**. No usa menús predefinidos; usa tools (function calling) para operar con datos reales.

## Índice
- Introducción
- Arquitectura
- Requisitos
- Configuración (env / base de datos)
- Puesta en marcha (dev)
- API de ejemplo (curl)
- WhatsApp Cloud API (sandbox)
- Estructura del proyecto
- Seguridad
- Autor

## Introducción
- Explora productos, busca por tipo/color/talle, y muestra detalle con stock y precios por tramo.
- Crea y actualiza carritos desde la conversación. El identificador de sesión es el `whatsappUserId` (WA ID).
- El agente usa herramientas HTTP: `getProducts`, `getProductById`, `getCart`, `createCart`, `updateCart`.
- Documentación ampliada: `docs/README_IA.md`.

## Arquitectura

```mermaid
flowchart LR
  U[Usuario WhatsApp] --> WA[WhatsApp Cloud API]
  WA --> WH[/webhooks/whatsapp]
  WH --> AG[Agente IA]
  AG -->|HTTP Tools| API[API REST /products, /carts]
  API --> SVC[Servicios de dominio]
  SVC --> PR[Prisma ORM]
  PR --> PG[(PostgreSQL)]
  AG --> LLM[Gemini]
```

- Punto de entrada del servidor: `src/index.ts:1-51`.
- Webhook WhatsApp: `GET` verificación `src/webhooks/whatsapp/router.ts:10-23`; `POST` recepción `src/webhooks/whatsapp/router.ts:26-89`.
- Agente IA: orquestación y tools en `src/agent/index.ts:1-459`.
- Cliente Gemini: `src/agent/geminiClient.ts:1-85`.
- API y servicios: `src/api/products/router.ts`, `src/api/carts/router.ts`, `src/services/*`.

## Requisitos
- Node.js 20+.
- PostgreSQL accesible vía `DATABASE_URL`.

## Configuración

Variables de entorno principales:

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

Base de datos y datos iniciales:
- Generar cliente: `npm run prisma:generate`.
- Aplicar migraciones: `npx prisma migrate deploy` (o `npx prisma migrate dev`).
- Cargar catálogo desde `products.xlsx`: `npm run seed`.

## Puesta en marcha (dev)
- Compilar: `npm run build`.
- Semilla: `npm run seed`.
- Desarrollo: `npm run dev`.
- Health: `GET /` → `ok`; `GET /healthz` → `{ status:"ok" }`; `GET /healthz/gemini` → `{ status, model, text }`.

## API de ejemplo (curl)

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

Errores de negocio mapeados: `stock_insufficient` / `cart_not_open` → 409; `cart_not_found` / `product_not_found` → 404 (`src/middlewares/errorHandler.ts:1-24`).

## WhatsApp Cloud API (sandbox)
- Endpoint: `POST /webhooks/whatsapp`; verificación `GET /webhooks/whatsapp?...`.
- Envío de respuestas a Graph con `Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>` (`src/webhooks/whatsapp/router.ts:63-66`).
- Errores comunes: token expirado (190/463), destinatario no permitido (131030). Guía completa en `docs/whatsapp-setup.md`.
- Flujo conversacional y herramientas del agente: `docs/conversation-flow.md`.

## Estructura del proyecto
- `src/index.ts` servidor Express y health.
- `src/webhooks/whatsapp/router.ts` entrada y salida de WhatsApp.
- `src/agent/index.ts` lógica del agente y ejecución de tools.
- `src/agent/tools.ts` llamadas HTTP a la API local.
- `src/agent/geminiClient.ts` integración con Google GenAI.
- `src/api/*` routers de productos y carritos.
- `src/services/*` reglas de negocio (Prisma ORM).
- `src/infra/*` Prisma client y `seed.ts` (carga `products.xlsx`).
- `prisma/*` esquema y migraciones.

## Seguridad
- No publicar claves en el repo. Usar `.env` local seguro.
- El webhook registra logs útiles, pero evita incluir datos sensibles.

## Autor
**Antonio Orlando Romero**
- GitHub: [@tony2688](https://github.com/tony2688/desafio_laburen)
- Email: antonioorlandoromero@gmail.com
- LinkedIn: https://www.linkedin.com/in/antonio-orlando-romero-7158b414b/

Proyecto desarrollado como parte del desafío técnico para el rol de **AI Engineer / Desarrollador de agentes de IA**.
