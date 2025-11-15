## Arquitectura

- Stack: Node.js + TypeScript + Express; Prisma + PostgreSQL; IA (OpenAI); WhatsApp Cloud API.
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
  AG --> LLM[OpenAI]
```

**Descripción breve**
- Webhook recibe eventos y normaliza mensajes.
- El agente interpreta intención y usa herramientas HTTP hacia la API.
- La API delega en servicios que operan con Prisma sobre PostgreSQL.
- El agente se apoya en OpenAI para clasificación de intención y desambiguación.