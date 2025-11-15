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

### GET /products/:id
- Respuesta: `Product`
- Campos: `{ id, type, size, color, category, price50, price100, price200, currency, availableQuantity, isAvailable, description }`

### POST /carts
- Body:
  - `{ whatsappUserId: string, items?: { productId: string, quantity: number }[] }`
- Comportamiento:
  - Devuelve el carrito `OPEN` del usuario; si no existe, lo crea.
  - Si `items` viene, los agrega con validación de stock y recalcula totales.

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

### GET /carts?whatsappUserId=&status=OPEN
- Respuesta: carrito `OPEN` del usuario si existe; `404` si no.