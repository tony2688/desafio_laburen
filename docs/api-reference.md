## API Reference

### GET /products?q=&page=&page_size=
- Query:
  - `q?: string`
  - `page?: number` (default 1)
  - `page_size?: number` (default 10, máx 50)
- Respuesta:
  - `{ items: ProductSummary[], page: number, page_size: number, total: number }`
- Notas:
  - Búsqueda por texto libre sobre `type`, `size`, `color`, `category`, `description`.
  - Solo productos disponibles y con stock > 0.
 - Implementación: `src/api/products/router.ts` y servicio correspondiente.

### GET /products/:id
- Respuesta: `Product`
- Campos: `{ id, type, size, color, category, price50, price100, price200, currency, availableQuantity, isAvailable, description }`
 - Implementación: `src/api/products/router.ts`.

### POST /carts
- Body:
  - `{ whatsappUserId: string, items?: { productId: string, quantity: number }[] }`
- Comportamiento:
  - Devuelve el carrito `OPEN` del usuario; si no existe, lo crea.
  - Si `items` viene, los agrega con validación de stock y recalcula totales.
 - Códigos: 200 en creación/retorno; 500 ante error general.
 - Implementación: `src/api/carts/router.ts:17-47` y `src/services/carts/service.ts`.

### PATCH /carts/:id
- Body (contrato real):
```json
{
  "addItems":    [{ "productId": "string", "quantity": 1 }],
  "updateItems": [{ "productId": "string", "quantity": 1 }],
  "removeItems": [{ "productId": "string" }]
}
```
- Semántica:
  - `addItems`: suma cantidad a ítems existentes o crea el ítem; valida stock; ajusta precio por tramo.
  - `updateItems`: establece una nueva cantidad; valida stock; ajusta precio por tramo.
  - `removeItems`: elimina ítems del carrito.
- Respuesta:
  - Carrito actualizado: `{ id, whatsappUserId, status, currency, subtotal, total, items: [{ productId, productNameSnapshot, quantity, unitPrice, subtotal }] }`
 - Códigos: 200; errores de negocio 409 (`stock_insufficient`, `cart_not_open`), 404 (`product_not_found`, `cart_not_found`).
- Implementación: `src/api/carts/router.ts:49-71` y `src/middlewares/errorHandler.ts:1-23`.
 - Implementación: `src/api/carts/router.ts:51-73` y `src/middlewares/errorHandler.ts:1-24`.

### GET /carts?whatsappUserId=&status=OPEN
- Respuesta: carrito `OPEN` del usuario si existe; `404` si no.
- Implementación: `src/api/carts/router.ts:8-20`.

### Health
- `GET /healthz` → `{ status: "ok" }`.
- `GET /healthz/gemini` → `{ status, model, text }` (llamada mínima al modelo).
 - Implementación: `src/index.ts:29-43`.