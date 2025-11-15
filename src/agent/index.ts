import { tools } from "./tools";
import { callChatModelWithTools } from "./openaiClient";

const systemPrompt =
  "Sos el asistente de ventas de Laburen. Explorás productos, mostrás detalles y gestionás el carrito. Siempre usás herramientas para catálogo y carritos. Mantenés contexto por whatsappUserId. Respondés en español, profesional y cercano.";

const toolSchemas = [
  {
    type: "function",
    function: {
      name: "getProducts",
      description: "Buscar o listar productos",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string" },
          page: { type: "number" },
          page_size: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProductById",
      description: "Obtener detalle de un producto por id",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCart",
      description: "Obtener carrito OPEN por whatsappUserId",
      parameters: {
        type: "object",
        properties: { whatsappUserId: { type: "string" } },
        required: ["whatsappUserId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createCart",
      description: "Crear carrito con whatsappUserId y opcionalmente items iniciales",
      parameters: {
        type: "object",
        properties: {
          whatsappUserId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["productId", "quantity"],
            },
          },
        },
        required: ["whatsappUserId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateCart",
      description: "Editar carrito: agregar, actualizar o eliminar items",
      parameters: {
        type: "object",
        properties: {
          cartId: { type: "string" },
          addItems: {
            type: "array",
            items: {
              type: "object",
              properties: { productId: { type: "string" }, quantity: { type: "number" } },
            },
          },
          updateItems: {
            type: "array",
            items: {
              type: "object",
              properties: { productId: { type: "string" }, quantity: { type: "number" } },
            },
          },
          removeItems: {
            type: "array",
            items: {
              type: "object",
              properties: { productId: { type: "string" } },
            },
          },
        },
        required: ["cartId"],
      },
    },
  },
];

export async function handleUserMessage(input: { text: string; whatsappUserId: string }): Promise<string> {
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: input.text },
  ];
  let loop = 0;
  while (loop < 5) {
    const resp = await callChatModelWithTools({ messages, tools: toolSchemas });
    const choice = resp.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const content = choice?.content || "";
      return content;
    }
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      const argsStr = tc.function?.arguments || "{}";
      let args: any = {};
      try {
        args = JSON.parse(argsStr);
      } catch {}
      let result: any;
      if (name === "getProducts") result = await tools.getProducts(args);
      else if (name === "getProductById") result = await tools.getProductById(args);
      else if (name === "getCart") result = await tools.getCart(args);
      else if (name === "createCart") result = await tools.createCart(args);
      else if (name === "updateCart") result = await tools.updateCart(args);
      messages.push({ role: "tool", content: JSON.stringify(result), name, tool_call_id: tc.id });
    }
    loop++;
  }
  return "No pude completar la acción en este momento.";
}

export { tools };