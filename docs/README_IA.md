# Agente IA de ventas en WhatsApp – Laburen

Este documento explica brevemente cómo funciona el **agente de IA** que atiende a los clientes de Laburen por WhatsApp y muestra un **ejemplo real de conversación** (basado en logs) para que el evaluador pueda probarlo rápido.

---

## 1. ¿Qué es este agente?

No es un chatbot de flujos (menús, botones, FAQ preconfiguradas).  
Es un **agente de IA** que:

- Usa un modelo generativo (Gemini) con un **prompt de sistema** específico.
- Interpreta el texto libre del usuario (intenciones como “mostrame el catálogo”, “ver 100”, “agrega 50 del 100”).
- Llama a herramientas (functions) que a su vez hablan con una **API REST** propia:
  - `/products` (catálogo)
  - `/products/:id` (detalle)
  - `/carts` y `/carts/:id` (carritos)
- Usa SIEMPRE los datos reales de la API (precios, stock, disponibilidad) para responder.

---

## 2. Flujo lógico del agente

Arquitectura simplificada:

1. Usuario escribe por **WhatsApp**.
2. Llega un webhook a **Node.js/Express**.
3. El backend llama a **Gemini** con:
   - `systemPrompt` (rol del agente de ventas).
   - `userText` (mensaje del usuario).
   - `tools` disponibles (`getProducts`, `getProductById`, `getCart`, `createCart`, `updateCart`).
4. Gemini decide si:
   - responde directo (sin tools), o
   - realiza un `toolCall` (ej: `getProducts`).
5. El backend ejecuta la tool contra la API REST local.
6. El backend formatea la respuesta en texto y la envía de vuelta por WhatsApp.

---

## 3. Ejemplo de conversación real (desde logs)

A continuación, un ejemplo **real** tomado de los logs del sistema, mostrado en formato de chat para que se entienda el flujo.

### Paso 1 – Saludo inicial

**Usuario (WhatsApp)**  
`Hola`

**Agente (IA)**  
```text
¡Hola! Soy tu asistente de ventas de Laburen. 😊

¿En qué puedo ayudarte hoy? Por ejemplo, puedo mostrarte el catálogo, buscar productos por tipo, color o talle, o mostrarte los detalles de un producto si sabés su código. ¡Decime lo que necesites!

Paso 2 – Mostrar el catálogo (getProducts)

Usuario
mostrame el catalogo

Agente (IA)
(el modelo decide llamar a getProducts con una búsqueda general)

ToolCall interno (simplificado)

{
  "name": "getProducts",
  "args": {
    "q": "",
    "page": 1,
    "page_size": 5
  }
}


Respuesta al usuario (vía WhatsApp)

Encontré 73 producto(s). Página 1 de 15:

• 100 - Chaqueta – Deportivo - Diseño moderno y elegante. - Talle XL - Color Rojo
• 099 - Camiseta – Formal - Ideal para uso diario. - Talle S - Color Verde
• 098 - Sudadera – Casual - Perfecta para actividades al aire libre. - Talle XXL - Color Azul
• 097 - Falda – Formal - Perfecta para actividades al aire libre. - Talle XXL - Color Azul
• 096 - Falda – Deportivo - Prenda cómoda y ligera. - Talle L - Color Negro

Si te interesa alguno, decime por ejemplo:
- "ver 001"
- "agregá 10 del 001 al carrito"

Para ver más resultados, pedime "ver página 2" o decime un filtro más específico (tipo, color, talle).


Notas:

El agente no usa un menú fijo, sino que interpreta “mostrame el catálogo” y decide usar getProducts.

El formato de cada línea viene de la data de la API: id, type, category, description, size, color.

Paso 3 – Ver detalle de un producto (getProductById)

Usuario
ver 100

Agente (IA)
(el modelo detecta que “100” es un ID y llama a getProductById)

ToolCall interno (simplificado)

{
  "name": "getProductById",
  "args": {
    "id": "100"
  }
}


Respuesta al usuario

Producto 100 - Chaqueta – Deportivo - Diseño moderno y elegante.
Talle XL - Color Rojo

Cantidad disponible: 347
Precio 50u: 1117 ARS
Precio 100u: 565 ARS
Precio 200u: 358 ARS

Si querés, decime cuántas unidades querés agregar al carrito. Ejemplo: "agregá 10 del 001".


Notas:

Los precios y el stock provienen de la API (/products/100).

El agente no inventa datos; solo los formatea para WhatsApp.

Paso 4 – Agregar al carrito (createCart)

Usuario
agrega 50 del 100

Agente (IA)
(el modelo interpreta “50” como cantidad y “100” como productId, y decide crear/actualizar carrito)

ToolCall interno (simplificado)

{
  "name": "createCart",
  "args": {
    "whatsappUserId": "5493815555648",
    "items": [
      { "productId": "100", "quantity": 50 }
    ]
  }
}


La API responde con el carrito creado:

{
  "id": "a5d13cd2-66c1-49df-9b30-1a98c41bd879",
  "items": [
    {
      "productId": 100,
      "productNameSnapshot": "Chaqueta XL Rojo",
      "quantity": 50,
      "subtotal": 28250
    }
  ],
  "currency": "ARS",
  "total": 28250
}


Respuesta al usuario

Listo, ya te armé un carrito nuevo con estos productos:

Resumen de tu carrito (a5d13cd2-66c1-49df-9b30-1a98c41bd879):

• Chaqueta XL Rojo (#100) x 50 = 28250 ARS

Total: 28250 ARS

Podés pedirme, por ejemplo:
- "cambiá a 5 unidades del 100"
- "eliminá el 100 del carrito"


Notas:

El carrito y el total se calculan en la API; el agente solo los muestra.

El mensaje sugiere próximas acciones que también se resuelven con tools (updateCart, getCart).

4. Cómo probar el agente por WhatsApp (guía rápida)

Con el número de WhatsApp ya configurado, se puede probar este flujo básico:

Escribir:
Hola
→ El agente se presenta y explica qué puede hacer.

Escribir:
mostrame el catalogo
→ El agente llama getProducts y muestra la primera página del catálogo.

Escribir:
ver 100
→ El agente llama getProductById(100) y muestra el detalle del producto (stock + precios por tramo).

Escribir:
agrega 50 del 100
→ El agente interpreta cantidad e ID, llama createCart y devuelve el resumen del carrito.

Opcional:

ver carrito → debería disparar getCart.

cambiá a 5 unidades del 100 → debería disparar updateCart.

eliminá el 100 del carrito → también via updateCart.

Con esto se puede comprobar que:

El modelo entiende lenguaje natural.

La IA decide qué herramienta usar según la intención.

Los resultados vienen de la API REST (productos + carritos), no de reglas estáticas.