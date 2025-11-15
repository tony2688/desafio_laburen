## Flujo conversacional

### Explorar/buscar productos
- Usuario: "Mostrame camisetas deportivas", "Buscá pantalón negro talla M"
- Herramienta: `getProducts({ q, page, page_size })` → `GET /products?q=`
- Respuesta: lista paginada con `id, type, size, color, price50, stock` y guía: "Decime el ID para ver detalle".

### Ver detalle de producto
- Usuario: "Ver el detalle de 123"
- Herramienta: `getProductById({ id })` → `GET /products/:id`
- Respuesta: ficha corta con CTA: "¿Agregar al carrito? Ej: 'agregar 123 x2'".

### Crear carrito y agregar ítems
- Usuario: "Agregá 123 x2"
- Herramientas: `getCart({ whatsappUserId })` → si no existe, `createCart({ whatsappUserId, items })`
- Endpoint: `POST /carts` (crea/retorna OPEN y agrega ítems iniciales) o `PATCH /carts/:id` (`addItems`)
- Respuesta: confirmación y resumen de carrito.

### Editar carrito
- Usuario: "Cambiá 123 a 1", "Eliminá 123", "Ver resumen"
- Endpoint: `PATCH /carts/:id` (`updateItems`/`removeItems`) y `GET /carts?whatsappUserId=&status=OPEN`
- Respuesta: acciones confirmadas y resumen actualizado.