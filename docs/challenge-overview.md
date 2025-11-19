# Desafío Técnico · Diseño del Agente de IA (Laburen)

## 1. Mapa de flujo (cliente → agente → API)

```mermaid
flowchart LR
    A[Cliente en WhatsApp] --> B[Webhook WhatsApp]
    B --> C[Agente IA (LLM: Gemini)]
    C -->|GET /products| D[API REST]
    C -->|POST /carts| D
    C -->|PATCH /carts/:id| D
    D --> E[(PostgreSQL / Prisma)]
    D --> C
    C --> B
    B --> A
```

1) Explorar productos: el agente llama `GET /products` con `q` y pagina.  
2) Crear carrito: ante intención de compra, el agente llama `POST /carts` con `items`.  
3) Editar carrito (extra): el agente llama `PATCH /carts/:id` para actualizar o eliminar.

## 2. Arquitectura de alto nivel

```mermaid
flowchart TB
    subgraph Cliente
      W[WhatsApp App]
    end
    subgraph Integración
      WH[Webhook WhatsApp]
      AG[Agente IA (Gemini)]
    end
    subgraph Backend
      API[API REST (Express)]
      DB[(PostgreSQL)]
    end
    W --> WH --> AG --> API --> DB
    API --> AG
```

- LLM: Gemini con tools para consultar y operar sobre la API.  
- API: Express con endpoints de productos y carritos.  
- DB: PostgreSQL vía Prisma ORM.  
- WhatsApp: Webhook de Cloud API para entrada/salida de mensajes.

## 3. Endpoints requeridos (contratos mínimos)

- `GET /products?q=&page=&page_size=`  
  - Respuesta 200: `{ items:[{id,type,size,color,category,price50,price100,price200}], page, page_size, total }`  
  - Errores: `500`.

- `GET /products/:id`  
  - Respuesta 200: `{ id, type, size, color, availableQuantity, isAvailable, price50, price100, price200, currency, category, description }`  
  - Errores: `404` (`product_not_found`).

- `POST /carts` Body: `{ whatsappUserId, items:[{ productId, quantity }] }`  
  - Respuesta 200: `{ id, status:"OPEN", items:[...], subtotal, total }`  
  - Errores: `404` (`product_not_found` si referencias inválidas).

- `PATCH /carts/:id` Body: `{ addItems?, updateItems?, removeItems? }`  
  - Respuesta 200: `{ id, items:[...], subtotal, total }`  
  - Errores: `404` (`cart_not_found`), `409` (`stock_insufficient`, `cart_not_open`).

## 4. Diseño clave y supuestos

- Un carrito por conversación: `Cart.whatsappUserId` identifica la sesión del cliente.  
- Precios por tramo: `getUnitPriceForQuantity` aplica `50/100/200`.  
- Búsqueda amigable: tokenización, sinónimos y paginación en `/products`.  
- Manejo de errores: middleware mapea a `404/409/500`.  
- Variables sensibles en `.env` ya comentadas.

## 5. Cómo correr (resumen)

```bash
npm run build
npm run seed
npm run dev
```

- Health: `GET /` → `ok`, `GET /healthz` → `{ status:"ok" }`.  
- Probar: `GET /products?q=remera`, `POST /carts`, `PATCH /carts/:id`.