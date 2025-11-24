## Flujo conversacional

### Nota sobre WhatsApp y sandbox
- El bot siempre responde al `from` del webhook (WA ID del remitente).
- En modo sandbox de WhatsApp Cloud API solo se puede enviar a números previamente autorizados en el panel (`Para`).
 - Si pasaron más de 24 horas sin mensaje del usuario, primero se envía una plantilla (ej. `hello_world`), luego se habilita el texto libre.

### Saludo y activación del agente
- Usuario: "Hola"
- Backend: registra `whatsapp_incoming` y llama al agente con `whatsappUserId` del `from` (`src/webhooks/whatsapp/router.ts:38`, `src/agent/index.ts:417-459`).
- Agente (Gemini): devuelve respuesta y, si corresponde, ejecuta tools HTTP (`src/agent/index.ts:349-411`).
- Envío: el backend publica a Graph con `to` igual al `from` (`src/webhooks/whatsapp/router.ts:43-45`, `src/webhooks/whatsapp/router.ts:55-68`).

### Explorar/buscar productos
- Usuario: "Mostrame camisetas deportivas", "Buscá pantalón negro talla M"
- Herramienta: `getProducts({ q, page, page_size })` → `GET /products?q=`
- Respuesta: lista paginada con `id, type, size, color, price50, stock` y guía: "Decime el ID para ver detalle".
 - Notas:
   - Soporta acentos y sinónimos (p. ej., `pantalón/pantalones`, `playera/camiseta/remera`).
   - IDs se muestran sin ceros a la izquierda.

### Ver detalle de producto
- Usuario: "Ver el detalle de 123"
- Herramienta: `getProductById({ id })` → `GET /products/:id`
- Respuesta: ficha corta con CTA: "¿Agregar al carrito? Ej: 'agregar 123 x2'".

### Crear carrito y agregar ítems
- Usuario: "Agregá 123 x2"
- Herramientas: `getCart({ whatsappUserId })` → si no existe, `createCart({ whatsappUserId, items })`
- Endpoint: `POST /carts` (crea/retorna OPEN y agrega ítems iniciales) o `PATCH /carts/:id` (`addItems`)
- Respuesta: confirmación y resumen de carrito.
 - Variantes admitidas:
   - "añade 5 unidades código 80" → agrega 5 al producto `80`.
   - "agrega 20 de pantalón verde" → si hay una sola coincidencia, agrega 20 al producto encontrado.
   - Cantidades en palabras: "ciento veinte y tres" → 123.

### Editar carrito
- Usuario: "Cambiá 123 a 1", "Eliminá 123", "Ver resumen"
- Endpoint: `PATCH /carts/:id` (`updateItems`/`removeItems`) y `GET /carts?whatsappUserId=&status=OPEN`
- Respuesta: acciones confirmadas y resumen actualizado.
 - El resumen incluye una línea con códigos: "🔢 Códigos en tu carrito: #91 Nombre · #100 Nombre …".

### Logs útiles
- `whatsapp_incoming` y `whatsapp_outgoing_request`: ver destino, mensaje y URL (`src/webhooks/whatsapp/router.ts:38, 44`).
- `whatsapp_outgoing_error`: ver `code` y `error_subcode`; clasifica `recipient_not_allowed` (131030) y `token_expired` (190/463) (`src/webhooks/whatsapp/router.ts:80-81`).
 - `code 104` en Graph → falta `Authorization: Bearer` (token requerido).
