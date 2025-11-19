// src/agent/index.ts
import {
  getProducts,
  getProductById,
  getCart,
  createCart,
  updateCart,
} from './tools';
import { callGeminiOnce, ToolDefinition, ToolCall } from './geminiClient';

// =====================
// Prompt de sistema
// =====================

const systemPrompt = `
Sos el asistente de ventas de Laburen que atiende a clientes por WhatsApp.

Objetivo:
- Ayudar al usuario a explorar el catálogo, buscar productos (por tipo, categoría, color, talle o ID) y armar/editar su carrito.
- Siempre usar las tools (getProducts, getProductById, getCart, createCart, updateCart) para leer o modificar datos reales. No inventes productos, precios, stock ni disponibilidad.

Estilo:
- Respondé siempre en español, usando "vos", tono profesional y cercano.
- Sé claro y relativamente breve. Usá listas con viñetas y saltos de línea para que se lea fácil en WhatsApp.

Uso de herramientas:

1) Búsqueda y catálogo (getProducts):
- Usá getProducts para:
  - "ver catálogo", "mostrar todo", "ver productos", etc. (q vacío o genérico).
  - búsquedas como "pantalón verde", "pantalón xxl", "falda formal negra", etc. (q = texto completo del usuario).
- No obligues al usuario a decir primero "tipo y categoría". Si ya dijo algo (por ejemplo "pantalón verde"), intentá buscar directo con getProducts(q = texto).

2) Detalle por ID (getProductById):
- Si el usuario dice "ver 001", "ver producto 16", "mostrar el 007", etc., interpretá el número como ID y usá getProductById con ese ID.

3) Carrito (getCart, createCart, updateCart):
- Usá getCart sobre todo cuando el usuario diga cosas como:
  - "ver carrito", "mostrame mi carrito", "qué tengo en el carrito".
- Cuando el usuario diga cosas como:
  - "agregá 50 del 100", "sumá 10 del 001 al carrito", "poné 20 del 016"
  NO llames a getCart.
  En esos casos:
    - Llamá directamente a createCart con ese ítem si asumís que puede ser su primer carrito.
    - O a updateCart si el orquestador ya te pasó un cartId en el contexto.
- El backend se encarga de crear o reutilizar el carrito según el whatsappUserId.

Formato de LISTADO de productos (respuesta de getProducts):
- Cada producto debe mostrarse en una línea con el siguiente formato EXACTO:

  • {ID_3_DIGITOS} - {type} – {category} - {description} - Talle {size} - Color {color}

- El ID debe ir siempre con 3 dígitos (1 → 001, 16 → 016, 100 → 100).
- Ejemplos:
  • 001 - Pantalón – Deportivo - Ideal para uso diario - Talle XXL - Color Verde
  • 007 - Pantalón – Deportivo - Diseño moderno y elegante. - Talle L - Color Gris

- Al final del listado, explicá qué puede hacer el usuario, por ejemplo:
  - "Si te interesa alguno, decime: 'ver 001' o 'agregá 10 del 001 al carrito'."
  - "Para ver más resultados, pedime 'ver página 2' o decime un filtro más específico (tipo, color, talle)."

- Si getProducts devuelve EXACTAMENTE un producto y el usuario usó una búsqueda por texto (por ejemplo "pantalón verde"), podés mostrar directamente el DETALLE de ese producto en vez de la lista.

Formato de DETALLE de producto (respuesta de getProductById):
- Cuando mostrás un producto específico, usá este formato:

  Producto {ID_3_DIGITOS} - {type} – {category} - {description}
  Talle {size} - Color {color}

  Cantidad disponible: {availableQuantity}
  Precio 50u: {price50} {currency}
  Precio 100u: {price100} {currency}
  Precio 200u: {price200} {currency}

- Si el campo isAvailable es false:
  - Agregá la línea:
    ⚠️ Este producto no está disponible por el momento.

- Después del detalle, indicá algo como:
  - "Si querés, decime cuántas unidades querés agregar al carrito. Ejemplo: 'agregá 10 del 001'."

Disponibilidad y stock:
- Nunca asumas que un producto se puede agregar al carrito si:
  - isAvailable === false, o
  - la API de carrito devuelve un error de disponibilidad/stock.
- En esos casos, explicá en lenguaje natural que el producto no está disponible o que no hay stock suficiente.
- No mientas ni digas que algo se agregó al carrito si la operación falló.

Intenciones básicas que debés manejar:
- Explorar catálogo:
  - "ver catálogo", "mostrar todos los productos", "ver productos", "quiero ver todo"
  - → getProducts(q vacío o genérico) + listado paginado.

- Buscar productos:
  - "pantalón verde", "pantalón xxl", "falda formal", "remera deportiva negra", etc.
  - → getProducts(q = texto usuario) + listado.
  - Si hay un solo resultado, podés mostrar directamente el DETALLE.

- Ver detalle:
  - "ver 001", "mostrar producto 16", "quiero el 007"
  - → getProductById(id).

- Agregar al carrito:
  - "agregá 10 del 001 al carrito", "sumá 5 del 016", etc.
  - → usá el ID para crear/actualizar carrito usando las tools.

Recordá siempre: usá las tools, no inventes datos, y respetá el formato de salida para listados y detalles.
`;

// =====================
// Definición de tools
// =====================

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

// =====================
// Helpers para formato
// =====================

function formatProductsList(result: any): string {
  if (!result || !Array.isArray(result.items) || result.items.length === 0) {
    return 'No encontré productos con esa descripción. Probá con otro término o sé un poco más específico (tipo de prenda, color, talle...).';
  }

  const lines = result.items.map((p: any) => {
    const id3 = String(p.id).padStart(3, '0');
    const tipo = p.type ?? '';
    const categoria = p.category ?? '';
    const desc = p.description ?? '';
    const talla = p.size ?? '-';
    const color = p.color ?? '-';

    // • 001 - Pantalón – Deportivo - Ideal para uso diario - Talle XXL - Color Verde
    return `• ${id3} - ${tipo} – ${categoria} - ${desc} - Talle ${talla} - Color ${color}`;
  });

  const page = result.page ?? 1;
  const pageSize = result.page_size || result.items.length || 10;
  const total = result.total ?? result.items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return [
    `Encontré ${total} producto(s). Página ${page} de ${totalPages}:`,
    '',
    ...lines,
    '',
    'Si te interesa alguno, decime por ejemplo:',
    '- "ver 001"',
    '- "agregá 10 del 001 al carrito"',
    '',
    `Para ver más resultados, pedime "ver página ${Math.min(
      page + 1,
      totalPages,
    )}" o decime un filtro más específico (tipo, color, talle).`,
  ].join('\n');
}

function formatProductDetail(product: any): string {
  if (!product) {
    return 'No encontré ese producto. Verificá el ID y probemos de nuevo.';
  }

  const id3 = String(product.id).padStart(3, '0');
  const titulo = `Producto ${id3} - ${product.type ?? ''} – ${
    product.category ?? ''
  }${product.description ? ' - ' + product.description : ''}`.trim();
  const variantes = `Talle ${product.size ?? '-'} - Color ${product.color ?? '-'}`;

  const lines: string[] = [
    titulo,
    variantes,
    '',
    `Cantidad disponible: ${product.availableQuantity}`,
    `Precio 50u: ${product.price50} ${product.currency}`,
    `Precio 100u: ${product.price100} ${product.currency}`,
    `Precio 200u: ${product.price200} ${product.currency}`,
    '',
  ];

  if (product.isAvailable === false) {
    lines.push('⚠️ Este producto no está disponible por el momento.');
    lines.push('');
  }

  lines.push(
    'Si querés, decime cuántas unidades querés agregar al carrito. Ejemplo: "agregá 10 del 001".',
  );

  return lines.join('\n');
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

// =====================
// Ejecución de tools
// =====================

async function executeToolCall(
  toolCall: ToolCall,
  whatsappUserId: string,
): Promise<string> {
  const { name, args } = toolCall;

  switch (name) {
    case 'getProducts': {
      const result = await getProducts({
        q: args.q ?? '',
        page: args.page ?? 1,
        page_size: args.page_size ?? 5,
      });

      // Si la búsqueda de texto devuelve un único producto, mostrar detalle directo
      if (
        args.q &&
        result &&
        Array.isArray(result.items) &&
        result.items.length === 1
      ) {
        const only = result.items[0];
        const detail = await getProductById({ id: String(only.id) });
        return formatProductDetail(detail);
      }

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

// =====================
// Entrada principal (webhook)
// =====================

export async function handleUserMessage(params: {
  text: string;
  whatsappUserId: string;
}): Promise<string> {
  const { text, whatsappUserId } = params;

  try {
    console.log('gemini_input', {
      whatsappUserId: String(whatsappUserId),
      text: String(text),
    });

    const { text: modelText, toolCall } = await callGeminiOnce({
      systemPrompt,
      userText: text,
      whatsappUserId,
      tools,
    });

    console.log('gemini_output', {
      whatsappUserId: String(whatsappUserId),
      hasToolCall: !!toolCall,
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
    console.log('gemini_tool_answer', {
      whatsappUserId: String(whatsappUserId),
    });
    return toolAnswer;
  } catch (err) {
    console.error('Error en handleUserMessage (Gemini):', err);
    return 'Tuve un problema técnico al consultar el catálogo. Probá de nuevo en un ratito, por favor.';
  }
}
