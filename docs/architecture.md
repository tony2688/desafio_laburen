## Arquitectura

- Stack: Node.js + TypeScript + Express; Prisma + PostgreSQL; IA (Gemini, Google GenAI); WhatsApp Cloud API.
- Capas: Webhook WhatsApp → agente IA → API REST → servicios → Prisma → DB.

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

**Descripción breve**
- Webhook recibe eventos y normaliza mensajes.
- El agente interpreta intención y usa herramientas HTTP hacia la API.
- La API delega en servicios que operan con Prisma sobre PostgreSQL.
- El agente se apoya en Gemini para clasificación de intención y desambiguación (cliente `@google/genai`).

**Integración y referencias de código**
- Punto de entrada del servidor: `src/index.ts:1-51`.
- Webhook WhatsApp: verificación `GET` en `src/webhooks/whatsapp/router.ts:10-23` y recepción `POST` en `src/webhooks/whatsapp/router.ts:26-89`.
- Agente IA (prompt, tools y orquestación): `src/agent/index.ts:1-459` (ejecución de tools `src/agent/index.ts:349-411`, entrada principal `handleUserMessage` `src/agent/index.ts:417-459`).
- Cliente Gemini (`GEMINI_MODEL`, `GEMINI_API_KEY`): `src/agent/geminiClient.ts:1-85`.
- API REST de catálogo y carritos: `src/api/products/router.ts`, `src/api/carts/router.ts`.
- Servicios de dominio (Prisma): `src/services/products/service.ts`, `src/services/carts/service.ts`.
- Base de URL para tools del agente: `BASE_URL` (opcional) o `http://localhost:PORT` (`src/agent/tools.ts:4-18`).

**Health y observabilidad**
- `GET /healthz` estado general.
- `GET /healthz/gemini` ejecuta una llamada mínima al modelo y retorna `status`, `model` y `text` (`src/index.ts:29-43`).
- Logs clave:
  - Entrada webhook: `whatsapp_incoming` (`src/webhooks/whatsapp/router.ts:38`).
  - Solicitud a Graph: `whatsapp_outgoing_request` con `to`, `url` y `replyText` (`src/webhooks/whatsapp/router.ts:44`).
  - Respuesta de Graph: `whatsapp_outgoing_response` (`src/webhooks/whatsapp/router.ts:69`).
  - Errores de Graph y clasificación: `whatsapp_outgoing_error` (`src/webhooks/whatsapp/router.ts:80-81`).