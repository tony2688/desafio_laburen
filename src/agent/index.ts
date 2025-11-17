import {
  getProducts,
  getProductById,
  getCart,
  createCart,
  updateCart,
} from './tools';
import { callGeminiOnce, ToolDefinition, ToolCall } from './geminiClient';

// Prompt de sistema adaptado a Gemini
const systemPrompt = `
Sos el asistente de ventas de Laburen.

Objetivo:
- Ayudar al usuario de WhatsApp a explorar productos de indumentaria y armar su carrito.

Capacidades:
- Listar o buscar productos del catálogo (filtrando por texto).
- Mostrar el detalle de un producto puntual.
- Crear un carrito y agregar ítems.
- Editar un carrito existente: cambiar cantidades, eliminar ítems, ver resumen.

Reglas importantes:
- Siempre que necesites datos de catálogo o carritos, usá las herramientas disponibles.
- El contexto del usuario se identifica por "whatsappUserId".
- Si el usuario no tiene carrito aún y quiere comprar, creá uno nuevo.
- Respondé SIEMPRE en español, en tono profesional pero cercano.
- Sé breve pero útil; no devuelvas JSON ni estructuras técnicas al usuario final.
`;

// Definición de herramientas (mismas que nuestro backend)
const tools: ToolDefinition[] = [
  {
    name: 'getProducts',
    description: 'Buscar o listar productos por texto libre',
    parameters: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description:
            'Texto de búsqueda. Puede ser tipo de prenda, color, talle, etc.',
        },
        page: {
          type: 'number',
          description: 'Número de página (empezando en 1).',
        },
        page_size: {
          type: 'number',
          description: 'Cantidad de ítems por página (por defecto 5-10).',
        },
      },
    },
  },
  {
    name: 'getProductById',
    description: 'Obtener el detalle de un producto por su id',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID del producto (campo "id" de la base).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'getCart',
    description: 'Obtener el carrito abierto (OPEN) para un whatsappUserId',
    parameters: {
      type: 'object',
      properties: {
        whatsappUserId: {
          type: 'string',
          description: 'ID del usuario de WhatsApp (número de teléfono).',
        },
      },
      required: ['whatsappUserId'],
    },
  },
  {
    name: 'createCart',
    description:
      'Crear carrito para un whatsappUserId y opcionalmente agregar ítems iniciales',
    parameters: {
      type: 'object',
      properties: {
        whatsappUserId: {
          type: 'string',
          description: 'ID del usuario de WhatsApp (número de teléfono).',
        },
        items: {
          type: 'array',
          description: 'Ítems a agregar al carrito nuevo.',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['productId', 'quantity'],
          },
        },
      },
      required: ['whatsappUserId'],
    },
  },
  {
    name: 'updateCart',
    description:
      'Editar carrito existente: agregar, actualizar o eliminar ítems',
    parameters: {
      type: 'object',
      properties: {
        cartId: {
          type: 'string',
          description: 'ID del carrito a editar.',
        },
        addItems: {
          type: 'array',
          description: 'Ítems a agregar (o sumar cantidad).',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
            },
          },
        },
        updateItems: {
          type: 'array',
          description: 'Ítems existentes a actualizar cantidad.',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
            },
          },
        },
        removeItems: {
          type: 'array',
          description: 'Ítems a eliminar del carrito.',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
            },
          },
        },
      },
      required: ['cartId'],
    },
  },
];

// Helpers de formato para la respuesta al usuario

function formatProductsList(result: any): string {
  if (!result || !Array.isArray(result.items) || result.items.length === 0) {
    return 'No encontré productos con esa descripción. Probá con otro término o sé un poco más específico (tipo de prenda, color, talle...).';
  }

  const lines = result.items.slice(0, 5).map((p: any) => {
    const desc = p.description || `${p.type ?? ''} ${p.size ?? ''} ${p.color ?? ''}`.trim();
    return `• #${p.id} – ${desc} – ${p.price50} ${p.currency} (stock: ${p.availableQuantity})`;
  });

  return [
    `Encontré ${result.total} producto(s). Te muestro algunos:`,
    '',
    ...lines,
    '',
    'Si te interesa alguno, podés decirme por ejemplo:',
    '- "ver producto 100"',
    '- "agregá 10 del 100 al carrito"',
  ].join('\n');
}

function formatProductDetail(product: any): string {
  if (!product) {
    return 'No encontré ese producto. Verificá el ID y probemos de nuevo.';
  }

  const base = product.description || `${product.type ?? ''} ${product.size ?? ''} ${product.color ?? ''}`.trim();

  return [
    `Detalle del producto #${product.id}:`,
    base,
    '',
    `Precios por tramo (moneda: ${product.currency}):`,
    `- Hasta 49 unidades: ${product.price50}`,
    `- 50 a 99 unidades: ${product.price100}`,
    `- 100+ unidades: ${product.price200}`,
    '',
    `Stock disponible: ${product.availableQuantity}`,
    '',
    'Si querés, decime cuántas unidades y lo agregamos al carrito.',
  ].join('\n');
}

function formatCart(cart: any): string {
  if (!cart) {
    return 'Por ahora no tenés ningún carrito abierto. Podés decirme qué producto y cuántas unidades querés y armamos uno nuevo.';
  }

  const items = cart.items ?? [];
  if (!items.length) {
    return `Tu carrito (${cart.id}) está vacío.\nPodés pedirme algo como "agregá 10 del producto 100 al carrito".`;
  }

  const lines = items.map((i: any) => {
    const name = i.productNameSnapshot ?? `Producto ${i.productId}`;
    return `• ${name} (#${i.productId}) x ${i.quantity} = ${i.subtotal} ${cart.currency}`;
  });

  return [
    `Resumen de tu carrito (${cart.id}):`,
    '',
    ...lines,
    '',
    `Total: ${cart.total} ${cart.currency}`,
    '',
    'Podés pedirme, por ejemplo:',
    '- "cambiá a 5 unidades del 100"',
    '- "eliminá el 100 del carrito"',
  ].join('\n');
}

// Ejecutar la tool pedida por Gemini

async function executeToolCall(toolCall: ToolCall, whatsappUserId: string): Promise<string> {
  const { name, args } = toolCall;

  switch (name) {
    case 'getProducts': {
      const result = await getProducts({
        q: args.q,
        page: args.page ?? 1,
        page_size: args.page_size ?? 5,
      });
      return formatProductsList(result);
    }
    case 'getProductById': {
      const result = await getProductById({ id: String(args.id) });
      return formatProductDetail(result);
    }
    case 'getCart': {
      const result = await getCart({
        whatsappUserId: String(args.whatsappUserId ?? whatsappUserId),
        status: 'OPEN',
      });
      return formatCart(result);
    }
    case 'createCart': {
      const result = await createCart({
        whatsappUserId,
        items: Array.isArray(args.items) ? args.items : [],
      });
      return (
        'Listo, ya te armé un carrito nuevo con estos productos:\n\n' +
        formatCart(result)
      );
    }
    case 'updateCart': {
      const result = await updateCart({
        cartId: String(args.cartId),
        addItems: args.addItems,
        updateItems: args.updateItems,
        removeItems: args.removeItems,
      });
      return 'Actualicé tu carrito:\n\n' + formatCart(result);
    }
    default:
      // Si Gemini inventa una tool o algo raro, devolvemos un fallback simple
      return 'Puedo ayudarte a buscar productos y armar tu carrito. Contame qué estás buscando (tipo de prenda, color, talle...).';
  }
}

// Punto de entrada usado por el webhook de WhatsApp
export async function handleUserMessage(params: {
  text: string;
  whatsappUserId: string;
}): Promise<string> {
  const { text, whatsappUserId } = params;

  try {
    const { text: modelText, toolCall } = await callGeminiOnce({
      systemPrompt,
      userText: text,
      whatsappUserId,
      tools,
    });

    // Si Gemini no pidió ninguna tool, respondemos con su texto directo
    if (!toolCall) {
      return (
        modelText ||
        'Puedo ayudarte a buscar productos, ver detalles y armar un carrito. Contame qué necesitás.'
      );
    }

    // Si pidió tool, ejecutamos contra nuestra API y formateamos respuesta
    const toolAnswer = await executeToolCall(toolCall, whatsappUserId);
    return toolAnswer;
  } catch (err) {
    console.error('Error en handleUserMessage (Gemini):', err);
    return 'Tuve un problema técnico al consultar el catálogo. Probá de nuevo en un ratito, por favor.';
  }
}
