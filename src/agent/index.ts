// src/agent/index.ts
import {
  getProducts,
  getProductById,
  getCart,
  createCart,
  updateCart,
} from './tools';
import axios from 'axios';
import { callGeminiOnce, ToolDefinition, ToolCall } from './geminiClient';
import { getUserContext, setUserContext, UserContext } from './contextStore';
import { parseIntent } from './parser';

/**
 * Normaliza texto para búsquedas y parsing consistente.
 *
 * - Minúsculas + eliminación de acentos (NFD).
 * - Colapso de vocales repetidas ("holaaa" → "hola").
 * - Colapso de espacios.
 *
 * @param s Texto de entrada.
 * @returns Texto normalizado.
 */
function normalizeText(s: string): string {
  const t = s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return collapseRepeatedVowels(t).replace(/\s+/g, ' ');
}

/**
 * Colapsa secuencias de vocales repetidas.
 *
 * @param s Texto a procesar.
 * @returns Texto con repeticiones de vocales reducidas.
 */
function collapseRepeatedVowels(s: string): string {
  return String(s || '').replace(/([aeiou])\1+/g, '$1');
}

/**
 * Normaliza código de moneda a formato ISO 4217 de 3 letras.
 *
 * @param cur Código de moneda libre.
 * @returns Código ISO de 3 letras (por defecto `ARS`).
 */
function normalizeCurrency(cur?: string): string {
  const c = String(cur || 'ARS').trim().toUpperCase();
  if (c === 'AR') return 'ARS';
  return /^[A-Z]{3}$/.test(c) ? c : 'ARS';
}

const REMOVE_STOPWORDS = new Set<string>([
  'el','la','los','las','un','una','unos','unas','de','del','al','y','o','u','mi','mis','tu','tus','su','sus','carrito','carro','todo','todos','toda','todas','las','los','del','de','al','en','por','favor',
  'producto','productos','prenda','prendas',
  'agregar','agrega','agrego','sumar','sumo','añadir','anadir','poner','pone','poné',
  'eliminar','elimina','eliminá','elimino','quitar','quita','sacar','saca','borrar','borra'
]);

const REMOVE_SYNONYMS: Record<string, string[]> = {
  camisa: [],
  camisas: [],
  camiseta: ['remera'],
  camisetas: ['remeras'],
  remera: ['camiseta'],
  remeras: ['camisetas'],
  chaqueta: ['campera'],
  chaquetas: ['camperas'],
  campera: ['chaqueta'],
  camperas: ['chaquetas'],
  falda: ['pollera'],
  faldas: ['polleras'],
  pollera: ['falda'],
  polleras: ['faldas'],
  pantalon: ['jean','jogging','babucha'],
  pantalones: ['jeans','jogging','babuchas'],
  jean: ['pantalon'],
  jeans: ['pantalones'],
  jogging: ['pantalon'],
  babucha: ['pantalon'],
  babuchas: ['pantalones'],
  sudadera: ['buzo','hoodie','sueter','playera','jersey'],
  sudaderas: ['buzos','hoodies','sueteres','playeras','jerseys'],
  buzo: ['sudadera','sueter','jersey'],
  buzos: ['sudaderas','sueteres','jerseys'],
  hoodie: ['sudadera'],
  hoodies: ['sudaderas'],
  sueter: ['sudadera','buzo'],
  sueteres: ['sudaderas','buzos'],
  playera: ['camiseta','remera'],
  playeras: ['camisetas','remeras'],
  jersey: ['sudadera','buzo','sueter','camiseta','remera'],
  jerseys: ['sudaderas','buzos','sueteres','camisetas','remeras'],
  abrigo: ['campera','chaqueta'],
  abrigos: ['camperas','chaquetas'],
  negro: ['black'],
  negra: ['negro','black'],
  negros: ['black'],
  blanco: ['white'],
  blanca: ['blanco','white'],
  blancos: ['white'],
  rojo: ['red'],
  roja: ['rojo','red'],
  rojos: ['red'],
  azul: ['blue'],
  azules: ['blue'],
  verde: ['green'],
  verdes: ['green'],
  gris: ['gray'],
  grises: ['gray'],
  amarillo: ['yellow'],
  amarilla: ['amarillo','yellow'],
  amarillos: ['yellow'],
  violeta: ['morado','purple'],
  violetas: ['morado','purple'],
  naranja: ['orange'],
  naranjas: ['orange'],
  rosa: ['pink'],
  rosas: ['pink'],
  beige: ['crema','arena'],
};

const COLOR_TOKENS = new Set<string>([
  'negro','blanco','rojo','roja','azul','verde','gris','amarillo','amarilla','violeta','morado','naranja','rosa','beige','bordo','celeste','fucsia','plomo','negra','blanca',
  'black','white','red','blue','green','gray','brown','pink','purple','orange','marron','cafe'
]);
const SIZE_TOKENS = new Set<string>(['s','m','l','xl','xxl']);
const SIZE_SYNONYMS: Record<string,string> = {
  chico: 's',
  pequena: 's',
  pequeño: 's',
  small: 's',
  mediano: 'm',
  medium: 'm',
  grande: 'l',
  large: 'l',
  extragrande: 'xl',
  extra: 'xl',
  'extra grande': 'xl',
};
const PRODUCT_TOKENS = new Set<string>([
  'camisa','camisas','camiseta','camisetas','remera','remeras','playera','playeras','chaqueta','chaquetas','campera','camperas','abrigo','abrigos','falda','faldas','pollera','polleras','pantalon','pantalones','jean','jeans','jogging','babucha','babuchas','sudadera','sudaderas','buzo','buzos','hoodie','hoodies','sueter','sueteres'
]);

/**
 * Detecta si una consulta contiene solo facetas (color/talle) sin producto.
 *
 * @param q Consulta libre del usuario.
 * @returns `true` si hay color/talle sin palabra de producto.
 */
function isFacetOnlyQuery(q: string): boolean {
  const t = normalizeText(String(q || ''));
  const toks = t.split(/\s+/).filter(Boolean);
  const hasColor = toks.some((tk) => COLOR_TOKENS.has(tk));
  const hasSize = toks.some((tk) => SIZE_TOKENS.has(tk) || /\b(talle|talla)\b/.test(t));
  const hasProduct = toks.some((tk) => PRODUCT_TOKENS.has(tk));
  const hasFacetKeyword = hasColor || hasSize || /\b(color|talle)\b/.test(t);
  return hasFacetKeyword && !hasProduct;
}

/**
 * Enriquece una consulta con facetas conocidas (color/talle) y último producto.
 *
 * - Filtra stopwords y mapea sinónimos de producto.
 * - Si no hay producto explícito, usa `lastQuery` como base.
 *
 * @param rawQ Texto original de búsqueda.
 * @param context Contexto del usuario (última búsqueda, etc.).
 * @returns Consulta combinada lista para `getProducts`.
 */
function augmentQueryWithFacets(rawQ: string, context: UserContext): string {
  const t = normalizeText(String(rawQ || ''));
  const toks = t.split(/\s+/).filter(Boolean);
  const fillers = new Set<string>([
    'cual','cuales','cuales?','cual?','tenes','tienes','en','de','del','la','el','los','las','me','que','qué','mostrar','mostra','mostrame','muestra','muestrame','quiero','ver'
  ]);
  const ftoks = toks.filter((tk) => tk && !fillers.has(tk));
  let productRaw = ftoks.find((tk) => PRODUCT_TOKENS.has(tk));
  if (!productRaw) {
    for (const tk of ftoks) {
      for (const [canon, syns] of Object.entries(REMOVE_SYNONYMS)) {
        if (PRODUCT_TOKENS.has(canon) && syns.includes(tk)) {
          productRaw = canon;
          break;
        }
      }
      if (productRaw) break;
    }
  }
  const colors = ftoks.filter((tk) => COLOR_TOKENS.has(tk));
  const sizes = ftoks.filter((tk) => SIZE_TOKENS.has(tk));
  const base = normalizeText(String(context.lastQuery || ''));
  const productPart = productRaw || base;
  const parts = [productPart, ...colors, ...sizes].filter(Boolean);
  const result = parts.join(' ').trim();
  return result || String(rawQ || '');
}

/**
 * Detecta frases que implican abrir/navegar el catálogo sin filtro.
 *
 * @param rawQ Texto del usuario.
 * @returns `true` si pide ver/abrir catálogo.
 */
function isCatalogOpenQuery(rawQ: string): boolean {
  const t = normalizeText(String(rawQ || ''));
  if (!t) return false;
  const hasCatalogWord = /(catalogo|catalog|productos|prendas)/.test(t);
  const hasVerb = /(ver|mostrar|mostra|mostrame|volver|regresar|abrir|navegar|ir)/.test(t);
  return hasCatalogWord && hasVerb;
}

/**
 * Extrae facetas (color/talle) desde una consulta libre.
 *
 * @param rawQ Consulta original.
 * @returns Listas de colores y talles normalizados.
 */
function extractFacetsFromQuery(rawQ: string): { colors: string[]; sizes: string[] } {
  const t = normalizeText(String(rawQ || ''));
  const toks = t.split(/\s+/).filter(Boolean);
  const colors = toks.filter((tk) => COLOR_TOKENS.has(tk));
  const sizesRaw = toks.filter((tk) => SIZE_TOKENS.has(tk) || SIZE_SYNONYMS[tk] !== undefined);
  const sizes = sizesRaw.map((tk) => SIZE_TOKENS.has(tk) ? tk : String(SIZE_SYNONYMS[tk]));
  return { colors, sizes };
}

/**
 * Aplica filtrado por facetas sobre resultados del catálogo.
 *
 * - Filtra por talles y colores presentes en `rawQ`.
 *
 * @param rawQ Consulta libre.
 * @param items Items (productos) devueltos por la API.
 * @returns Items filtrados.
 */
function applyFacetFilter(rawQ: string, items: any[]): any[] {
  const { colors, sizes } = extractFacetsFromQuery(rawQ);
  let filtered = items.slice();
  if (sizes.length > 0) {
    const want = new Set(sizes.map((s) => s.toUpperCase()));
    filtered = filtered.filter((p: any) => want.has(String(p.size || '').toUpperCase()));
  }
  if (colors.length > 0) {
    const want = new Set(colors.map((c) => c.toLowerCase()));
    filtered = filtered.filter((p: any) => want.has(normalizeText(String(p.color || ''))));
  }
  return filtered;
}

// =====================
// Prompt de sistema
// =====================

const systemPrompt = `
Sos el asistente de ventas de Laburen que atiende a clientes por WhatsApp.

Objetivo:
- Ayudar al usuario a explorar el catálogo, buscar productos (por tipo, categoría, color, talle o ID) y armar/editar su carrito.
- Usar siempre datos reales de la API. No inventes productos, precios, stock ni disponibilidad.

Estilo:
- Respondé siempre en español, usando "vos", con un tono profesional y cercano.
- No menciones nombres de herramientas ni detalles técnicos al usuario.
- Mostrá listados cortos (ideal 4–6 ítems) con código, tipo, categoría, talle y color.
- Terminá cada mensaje con una sugerencia o pregunta útil.
 - No agregues sugerencias ni preguntas finales automáticas.
- Si conocés el nombre del usuario, usalo naturalmente.
- Mantené lenguaje natural de persona: frases cortas, amables y variadas.
- Evitá muletillas robóticas; preferí "¿Te interesa...?" en lugar de "Si te interesa...".
- Pedí aclaraciones cuando falte información (color, talle, cantidad) de forma simple.
- No re-saludes si ya saludaste antes.
- Usá emojis sutiles solo para mejorar la lectura.

Uso de herramientas (instrucciones internas):

1) Búsqueda y catálogo:
- Usá getProducts para listar o buscar productos con texto libre.
- Si el usuario dice "ver catálogo", podés buscar sin filtro.

2) Detalle por ID:
- Si el usuario dice "ver 001" o "ver producto 1", interpretá el número como ID y pedí el detalle.

3) Carrito:
- "ver carrito" muestra el carrito abierto del usuario.
- Para frases tipo "agregá 10 del 001", "cambiá a 5 del 023", "eliminá el 023", usá las tools de carrito.
- Nunca confirmes un agregado o cambio si la API devuelve error.

Formato LISTADO de productos:
- Cada línea:
  • {ID_3_DIGITOS} - {type} – {category} - {description} - Talle {size} - Color {color}
- Al cierre, ofrecé ver detalle o pasar a la siguiente página.

Formato DETALLE de producto:
- Encabezado con ID y descripción.
- Variantes (talle, color), disponibilidad y precios por tramo (50u, 100u, 200u).
- Si no está disponible, avisá claramente.
- Cerrá ofreciendo agregar al carrito.

Tácticas de estructura:
- Delimitá claramente la entrada con bloques:
  INICIO DE CONTEXTO
  {contexto}
  FIN DE CONTEXTO
  INICIO DE ENTRADA
  {input}
  FIN DE ENTRADA
 - Si el usuario pide productos específicos o comparaciones, respondé en formato:
  Resumen
  Características clave
  Relevancia (productos relacionados)
 - Envolvé siempre la salida entre:
   INICIO DE SALIDA
   {respuesta}
   FIN DE SALIDA

Idioma:
- Si el usuario se expresa en otro idioma, traducí la respuesta al idioma relevante manteniendo precisión y claridad.

Abstención:
- Si no hay contexto relevante, ni datos de API, ni resultados en URLs externas, reconocé la consulta y evitá generar contenido adicional.

Recordá:
- No asumas disponibilidad si la API indica lo contrario.
- No inventes productos ni modifiques datos que no vengan del backend.
`;

// =====================
// Definición de tools para Gemini
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
          description: 'Cantidad de ítems por página (por defecto 5–10).',
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
  {
    name: 'searchUrls',
    description: 'Buscar información en URLs externas cuando el catálogo no tiene datos relevantes',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        urls: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['query'],
    },
  },
];

// =====================
// Helpers de formato
// =====================

/**
 * Formatea un listado breve de productos para WhatsApp.
 *
 * - Muestra hasta 6 ítems con atributos clave.
 * - Usa códigos sin ceros a la izquierda en la visualización.
 *
 * @param result Objeto de resultados (`items`, `page`, `total`).
 * @param qText Texto de búsqueda para sugerencias.
 * @returns Mensaje listo para enviar.
 */
function formatProductsList(result: any, qText?: string): string {
  if (!result || !Array.isArray(result.items) || result.items.length === 0) {
    return 'No encontré productos con esa descripción. Probá con otro término o sé un poco más específico (tipo de prenda, color, talle...).';
  }

  const cards = result.items.slice(0, 6).map((p: any) => {
    const idDisplay = String(p.id).replace(/^0+/, '') || String(p.id);
    const tipo = p.type ?? '';
    const categoria = p.category ?? '';
    const desc = p.description ?? '';
    const talla = p.size ?? '-';
    const color = p.color ?? '-';

    const stock = Number(p.availableQuantity);
    const stockText = Number.isFinite(stock) ? `📦 Stock: ${stock}u` : '';
    const statusText = Number.isFinite(stock)
      ? stock >= 200
        ? ' · ✅ stock alto'
        : stock > 0 && stock < 50
          ? ' · ⚠️ stock bajo'
          : ''
      : '';
    const avail = p.isAvailable === false || stock <= 0 ? ' · 🔴 sin stock' : ' · 🟢 disponible';
    const prices = [Number(p.price50), Number(p.price100), Number(p.price200)].filter((n) => Number.isFinite(n) && n > 0);
    const minPrice = prices.length ? Math.min(...prices) : undefined;
    const currency = normalizeCurrency(p.currency);
    const priceText = minPrice !== undefined ? ` · 💵 desde $ ${minPrice} ${currency}` : '';
    const descText = desc ? ` • ${desc}` : '';

    const header = `• ${idDisplay} · ${tipo} – ${categoria} · Talle ${talla} · Color ${color}${descText}`;
    const line3 = [stockText, statusText, avail, priceText].filter(Boolean).join('');
    return [header, line3].filter(Boolean).join('\n');
  });

  const page = result.page ?? 1;
  const pageSize = result.page_size || result.items.length || 10;
  const total = result.total ?? result.items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const qn = qText ? normalizeText(String(qText)) : '';
  const toks: string[] = qn ? qn.split(/\s+/).filter(Boolean) : ([] as string[]);
  const colorsWanted = toks.filter((t) => (
    ['negro','blanco','rojo','azul','verde','gris','amarillo','violeta','morado','naranja','rosa','beige'].includes(t)
  ));
  const sizesWanted = toks.filter((t) => (
    ['s','m','l','xl','xxl'].includes(t)
  ));
  const colorsAvail = Array.from(new Set(result.items.map((p: any) => String(p.color).trim()).filter(Boolean)))
    .slice(0,6) as string[];
  const sizesAvail = Array.from(new Set(result.items.map((p: any) => String(p.size).trim()).filter(Boolean)))
    .slice(0,6) as string[];
  const typesAvail = Array.from(new Set(result.items.map((p: any) => String(p.type).trim()).filter(Boolean)))
    .slice(0,6) as string[];
  const stockHi = result.items.filter((p: any) => Number(p.availableQuantity) >= 200).length;
  const stockLo = result.items.filter((p: any) => Number(p.availableQuantity) < 50).length;
  const missColor = colorsWanted.length > 0 && !colorsWanted.some((c) => colorsAvail.map((x) => normalizeText(x)).includes(normalizeText(c)));
  const sugg: string[] = [];
  if (missColor && colorsAvail.length) {
    sugg.push(`No tengo ese color exacto en stock ahora. Colores disponibles: ${colorsAvail.join(', ')}`);
  }
  if (colorsAvail.length) {
    sugg.push(`Colores disponibles: ${colorsAvail.join(', ')}`);
  }
  if (sizesAvail.length) {
    sugg.push(`Talles disponibles: ${sizesAvail.join(', ')}`);
  }
  if (typesAvail.length) {
    sugg.push(`Categorías en stock: ${typesAvail.join(', ')}`);
  }
  const disp = `Disponibilidad: ${result.items.length} productos con stock` + (stockHi ? `, ${stockHi} con stock alto (≥200u)` : '') + (stockLo ? `, ${stockLo} con stock bajo (<50u)` : '');
  sugg.push(disp);

  return [
    `🛍️ Resultados (${total}) • Página ${page}/${totalPages}:`,
    '',
    ...cards.join('\n\n').split('\n'),
    '',
    '— — —',
    '',
    '📌 Acciones rápidas',
    '🔎 Detalle: "ver 1" · 🎯 Filtro: color/talle',
    `➡️ Más resultados: "ver página ${Math.min(page + 1, totalPages)}" (total ${totalPages} páginas)`,
    '',
    ...sugg,
  ].join('\n');
}

/**
 * Formatea el detalle de un producto individual.
 *
 * @param product Producto obtenido desde la API.
 * @returns Mensaje con stock, precios y variantes.
 */
function formatProductDetail(product: any): string {
  if (!product) {
    return 'No encontré ese producto. Verificá el ID y probemos de nuevo.';
  }

  const idShort = String(product.id).replace(/^0+/, '') || String(product.id);
  const titulo = `🔎 Producto ${idShort} • ${product.type ?? ''} – ${
    product.category ?? ''
  }${product.description ? ' • ' + product.description : ''}`.trim();
  const variantes = `Talle ${product.size ?? '-'} - Color ${
    product.color ?? '-'
  }`;

  const lines: string[] = [
    titulo,
    `📦 ${variantes}`,
    '',
    '— — —',
    '',
    `📦 Stock: ${product.availableQuantity}u`,
    `💵 Precio 50u: $ ${product.price50} ${normalizeCurrency(product.currency)}`,
    `💵 Precio 100u: $ ${product.price100} ${normalizeCurrency(product.currency)}`,
    `💵 Precio 200u: $ ${product.price200} ${normalizeCurrency(product.currency)}`,
    '',
    '— — —',
    '',
  ];

  if (product.isAvailable === false) {
    lines.push('⚠️ Este producto no está disponible por el momento.');
    lines.push('');
  }

  lines.push('Para agregar, indicá la cantidad y el código.');
  return lines.join('\n');
}

/**
 * Busca productos relacionados por tipo/categoría.
 *
 * @param product Producto base.
 * @returns Lista de hasta 3 productos distintos.
 */
async function getRelatedForProduct(product: any): Promise<any[]> {
  const q = String(product?.type || product?.category || '').trim();
  if (!q) return [];
  const res = await getProducts({ q, page: 1, page_size: 5 });
  const items = Array.isArray(res?.items) ? res.items : [];
  return items.filter((p: any) => String(p.id) !== String(product.id)).slice(0, 3);
}

/**
 * Formato estructurado con secciones: Resumen, Características, Relacionados.
 *
 * @param product Producto principal.
 * @param related Productos relacionados.
 * @returns Bloque con `INICIO/FIN DE SALIDA` para extracción posterior.
 */
function formatProductDetailStructured(product: any, related: any[]): string {
  const idRaw = String(product?.id || '');
  const idShort = idRaw.replace(/^0+/, '') || idRaw;
  const tipo = product?.type ?? '';
  const categoria = product?.category ?? '';
  const talla = product?.size ?? '-';
  const color = product?.color ?? '-';
  const disponible = product?.isAvailable === false ? 'No disponible' : 'Disponible';
  const resumen = `Producto #${idShort} • ${tipo} – ${categoria} • Talle ${talla} • Color ${color} • ${disponible}`;
  const k = [
    `📦 Stock: ${product?.availableQuantity}u`,
    `💵 Precio 50u: $ ${product?.price50} ${product?.currency}`,
    `💵 Precio 100u: $ ${product?.price100} ${product?.currency}`,
    `💵 Precio 200u: $ ${product?.price200} ${product?.currency}`,
  ];
  const r = related.map((p: any) => {
    const pidRaw = String(p.id);
    const pid = pidRaw.replace(/^0+/, '') || pidRaw;
    const tt = p.type ?? '';
    const cc = p.category ?? '';
    const sz = p.size ?? '-';
    const cl = p.color ?? '-';
    return `• ${pid} - ${tt} – ${cc} - Talle ${sz} - Color ${cl}`;
  });
  const lines = [
    'INICIO DE SALIDA',
    'Resumen',
    resumen,
    '',
    'Características clave',
    ...k.map((x) => `- ${x}`),
    '',
    'Relevancia (productos relacionados)',
    ...(r.length ? r : ['No encontré relacionados cercanos.']),
    '',
    '📌 Acciones rápidas',
    `➕ Agregar: "agregá 10 del ${idShort}"`,
    `🔄 Cambiar cantidad: "cambiá a 5 del ${idShort}"`,
    `➖ Eliminar: "eliminá el ${idShort}" o "eliminá 5 del ${idShort}"`,
    'FIN DE SALIDA',
  ];
  return lines.join('\n');
}

/**
 * Realiza una búsqueda superficial en URLs externas preconfiguradas.
 *
 * @param query Texto de consulta.
 * @param urls Lista de URLs a consultar (opcional, usa env si falta).
 * @returns Mensaje estructurado o `undefined` si no hay fuentes.
 */
async function performExternalSearch(query: string, urls?: string[]): Promise<string | undefined> {
  const raw = Array.isArray(urls) && urls.length > 0 ? urls : String(process.env.EXTERNAL_SEARCH_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw || raw.length === 0) return undefined;
  const hosts: string[] = [];
  for (const u of raw.slice(0, 3)) {
    try {
      const resp = await axios.get(u, { timeout: 3000 });
      const titleMatch = String(resp.data || '').match(/<title>([^<]+)<\/title>/i);
      const host = (() => { try { return new URL(u).host; } catch { return u; } })();
      hosts.push(titleMatch ? `${host} – ${titleMatch[1]}` : host);
    } catch {
      const host = (() => { try { return new URL(u).host; } catch { return u; } })();
      hosts.push(host);
    }
  }
  const resumen = `No encontré resultados en el catálogo para "${query}". Consulté fuentes externas.`;
  const lines = [
    'INICIO DE SALIDA',
    'Resumen',
    resumen,
    '',
    'Características clave',
    `- Consulta: ${query}`,
    `- Sitios consultados: ${hosts.join(', ')}`,
    '',
    'Relevancia (productos relacionados)',
    'No se identificaron productos relacionados en las URLs.',
    'FIN DE SALIDA',
  ];
  return lines.join('\n');
}

/**
 * Formatea el resumen del carrito para WhatsApp.
 *
 * - Visualiza códigos sin ceros a la izquierda.
 * - Incluye línea con códigos presentes y total.
 *
 * @param cart Carrito retornado por la API.
 * @returns Mensaje listo para enviar.
 */
function formatCart(cart: any): string {
  if (!cart) {
    return '🛒 Por ahora no tenés ningún carrito abierto. Podés decirme qué producto y cuántas unidades querés y armamos uno nuevo.';
  }

  const items = cart.items ?? [];
  if (!items.length) {
    return `🛒 Tu carrito (${cart.id}) está vacío.\nPodés pedirme algo como "agregá 10 del producto 100 al carrito".`;
  }

  const lines = items.map((i: any) => {
    const idShort = String(i.productId).replace(/^0+/, '') || String(i.productId);
    const name = i.productNameSnapshot ?? `Producto ${idShort}`;
    return `• 🧺 ${name} (#${idShort}) × ${i.quantity} = $ ${i.subtotal} ${cart.currency}`;
  });

  const codesLine = items.length
    ? `🔢 Códigos en tu carrito: ${items
        .map((i: any) => {
          const idShort = String(i.productId).replace(/^0+/, '') || String(i.productId);
          const nm = i.productNameSnapshot ?? `Producto ${idShort}`;
          return `#${idShort} ${nm}`;
        })
        .join(' · ')}`
    : '';

  return [
    `🛒 Resumen de tu carrito (${cart.id}):`,
    '',
    ...lines,
    '',
    codesLine,
    codesLine ? '' : '',
    '— — —',
    '',
    `💰 Total: $ ${cart.total} ${normalizeCurrency(cart.currency)}`,
    '',
    '— — —',
    '',
    '🧭 Podés pedirme, por ejemplo:',
    '- ➖ "eliminá \"pantalón rojo\" y \"remera azul\" del carrito"',
    '- ➕ "agregá 10 del 44 al carrito"',
    '- 🛍️ "agregar nuevo producto"',
    '- 💳 "pagar carrito"',
  ].join('\n');
}

// =====================
// Contexto → texto enriquecido para Gemini
// =====================

/**
 * Construye texto enriquecido con contexto para enviar al modelo.
 *
 * Incluye nombre conocido, última búsqueda, último producto visto y si
 * hay carrito activo, con delimitadores `INICIO/FIN DE CONTEXTO`.
 *
 * @param rawText Entrada original del usuario.
 * @param context Contexto del usuario.
 * @returns Texto enriquecido para prompt.
 */
function buildUserTextWithContext(
  rawText: string,
  context: UserContext,
): string {
  const ctxParts: string[] = [];
  const lang = detectLanguage(rawText);
  if (context.userName) {
    ctxParts.push(`Nombre conocido del usuario: ${context.userName}.`);
  }
  if (context.lastViewedProductId) {
    ctxParts.push(`Último producto consultado: código ${context.lastViewedProductId}.`);
  }
  if (context.lastQuery) {
    ctxParts.push(`Última búsqueda en catálogo: "${context.lastQuery}" (página ${context.lastPage ?? 1}).`);
  }
  if (context.activeCartId) {
    ctxParts.push('El usuario tiene un carrito activo.');
  }
  const ctxText = ctxParts.length > 0 ? `- ${ctxParts.join('\n- ')}` : '';
  return `INICIO DE CONTEXTO\n${ctxText}\nIdioma del usuario: ${lang}\nFIN DE CONTEXTO\nINICIO DE ENTRADA\n${rawText}\nFIN DE ENTRADA`;
}

/**
 * Detección heurística de idioma (es/en/pt) según tokens comunes.
 *
 * @param s Texto a evaluar.
 * @returns Código de idioma (`es` por defecto).
 */
function detectLanguage(s: string): string {
  const t = String(s || '').toLowerCase();
  const es = /(hola|buenas|producto|carrito|ver|color|talle|catalogo|catálogo)/.test(t);
  const en = /(hello|hi|product|cart|catalog|size|color|show)/.test(t);
  const pt = /(olá|ola|produto|carrinho|catálogo|cor|tamanho)/.test(t);
  if (es && !en && !pt) return 'es';
  if (en && !es && !pt) return 'en';
  if (pt && !es && !en) return 'pt';
  return es ? 'es' : 'es';
}

/**
 * Extrae el contenido entre `INICIO DE SALIDA` y `FIN DE SALIDA`.
 *
 * @param s Texto potencialmente estructurado.
 * @returns Cuerpo interno o el texto original si no hay delimitadores.
 */
function extractStructuredOutput(s: string): string {
  const re = /INICIO\s+DE\s+SALIDA[\s\n\r]+([\s\S]*?)\s*FIN\s+DE\s+SALIDA/i;
  const m = re.exec(String(s || ''));
  return m ? String(m[1]).trim() : String(s || '').trim();
}

// =====================
// Manejo de errores de negocio
// =====================

/**
 * Mapea errores de API a mensajes de negocio amigables.
 *
 * @param e Error HTTP/axios.
 * @returns Mensaje para el usuario.
 */
function mapApiErrorToBusinessMessage(e: any): string {
  const status = e?.response?.status;
  const errCode = e?.response?.data?.error;

  if (status === 409 && errCode === 'stock_insufficient') {
    return 'No hay stock suficiente para este producto.';
  }
  if (status === 409 && errCode === 'cart_not_open') {
    return 'El carrito no está abierto para edición.';
  }
  if (status === 404 && errCode === 'product_not_found') {
    return 'Producto no encontrado.';
  }
  if (status === 404 && errCode === 'cart_not_found') {
    return 'Por ahora no tenés ningún carrito abierto.';
  }

  return 'Tuve un problema técnico al procesar la operación. Probá de nuevo en un rato.';
}

// =====================
// Ejecución de tools desde Gemini
// =====================

/**
 * Ejecuta una llamada a tool solicitada por el modelo.
 *
 * Maneja cada tool con su formateo específico y actualiza el contexto.
 *
 * @param toolCall Tool a ejecutar (nombre y args).
 * @param whatsappUserId Identificador del usuario.
 * @param context Contexto del usuario.
 * @returns Mensaje formateado.
 */
async function executeToolCall(
  toolCall: ToolCall,
  whatsappUserId: string,
  context: UserContext,
): Promise<string> {
  const { name, args } = toolCall;

  try {
    switch (name) {
      case 'getProducts': {
        const providedQ = Object.prototype.hasOwnProperty.call(args, 'q');
        const qUsed = providedQ ? String(args.q ?? '').trim() : (context.lastQuery ?? '');
        const pageUsed = args.page ?? (context.lastPage ?? 1);
        const pageSizeUsed = args.page_size ?? (context.lastPageSize ?? 5);

        const result = await getProducts({
          q: qUsed,
          page: pageUsed,
          page_size: pageSizeUsed,
        });

        if (qUsed) {
          const filteredItems = applyFacetFilter(qUsed, Array.isArray(result.items) ? result.items : []);
          if (filteredItems.length !== (Array.isArray(result.items) ? result.items.length : 0)) {
            result.items = filteredItems;
            result.total = filteredItems.length;
          }
        }

        if (
          qUsed &&
          result &&
          Array.isArray(result.items) &&
          result.items.length === 0
        ) {
          const extMsg = await performExternalSearch(qUsed, undefined);
          if (extMsg) return extMsg;
          const base = await getProducts({ page: 1, page_size: pageSizeUsed });
          setUserContext(whatsappUserId, {
            lastQuery: qUsed,
            lastPage: base.page ?? 1,
            lastPageSize: base.page_size ?? pageSizeUsed,
          });
          const catalogText = formatProductsList(base, '');
          return (
            'No tenemos disponible ese producto. Te muestro nuestro catálogo disponible:\n\n' +
            catalogText
          );
        }

        // Si la búsqueda de texto devuelve un solo producto, mostrar detalle directo
        if (
          qUsed &&
          result &&
          Array.isArray(result.items) &&
          result.items.length === 1
        ) {
          const only = result.items[0];
          const detail = await getProductById({ id: String(only.id) });
          setUserContext(whatsappUserId, {
            lastQuery: qUsed,
            lastPage: result.page ?? pageUsed,
            lastPageSize: result.page_size ?? pageSizeUsed,
            lastViewedProductId: String(only.id),
          });
          const related = await getRelatedForProduct(detail);
          return formatProductDetailStructured(detail, related);
        }

        setUserContext(whatsappUserId, {
          lastQuery: qUsed,
          lastPage: result.page ?? pageUsed,
          lastPageSize: result.page_size ?? pageSizeUsed,
        });
        return formatProductsList(result, qUsed);
      }

      case 'getProductById': {
        try {
          const result = await getProductById({ id: String(args.id) });
          setUserContext(whatsappUserId, { lastViewedProductId: String(args.id) });
          const related = await getRelatedForProduct(result);
          return formatProductDetailStructured(result, related);
        } catch (e: any) {
          const status = e?.response?.status;
          const code = e?.response?.data?.error;
          if (status === 404 && code === 'product_not_found') {
            const pageSize = context.lastPageSize ?? 6;
            const base = await getProducts({ page: 1, page_size: pageSize });
            setUserContext(whatsappUserId, { lastQuery: '', lastPage: base.page ?? 1, lastPageSize: base.page_size ?? pageSize });
            return 'No encontré ese producto. Te muestro nuestro catálogo disponible:\n\n' + formatProductsList(base, '');
          }
          throw e;
        }
      }

      case 'searchUrls': {
        const q = String(args.query || '').trim();
        const urlsArg = Array.isArray(args.urls) ? args.urls : undefined;
        const msg = await performExternalSearch(q, urlsArg);
        return msg || 'No encontré información relevante en las URLs provistas.';
      }

      case 'getCart': {
        const result = await getCart({
          whatsappUserId: String(args.whatsappUserId ?? whatsappUserId),
          status: 'OPEN',
        });
        if (result && result.id) {
          setUserContext(whatsappUserId, { activeCartId: String(result.id) });
        }
        return formatCart(result);
      }

      case 'createCart': {
        const result = await createCart({
          whatsappUserId,
          items: Array.isArray(args.items) ? args.items : [],
        });
        if (result && result.id) {
          setUserContext(whatsappUserId, { activeCartId: String(result.id) });
        }
        return (
          'Listo, ya te armé un carrito nuevo con estos productos:\n\n' +
          formatCart(result)
        );
      }

      case 'updateCart': {
        const resolvedCartId =
          args.cartId ?? context.activeCartId ?? undefined;
        if (!resolvedCartId) {
          return 'Por ahora no tenés ningún carrito abierto.';
        }
        const result = await updateCart({
          cartId: String(resolvedCartId),
          addItems: args.addItems,
          updateItems: args.updateItems,
          removeItems: args.removeItems,
        });
        if (result && result.id) {
          setUserContext(whatsappUserId, { activeCartId: String(result.id) });
        }
        return 'Actualicé tu carrito:\n\n' + formatCart(result);
      }

      default:
        return 'Puedo ayudarte a buscar productos y armar tu carrito. Contame qué estás buscando (tipo de prenda, color, talle...).';
    }
  } catch (e) {
    return mapApiErrorToBusinessMessage(e);
  }
}

// =====================
// Intents deterministas (parser + tools)
// =====================

/**
 * Router de intents deterministas (parser + tools).
 *
 * Recibe el intent parseado y decide qué tool ejecutar,
 * controlando mensajes y actualizaciones de contexto.
 *
 * @param parsed Intent y parámetros.
 * @param whatsappUserId Usuario.
 * @param context Contexto actual.
 * @returns Mensaje formateado o cadena vacía.
 */
async function executeToolCalls(
  parsed: { intent: string; params: Record<string, any> },
  whatsappUserId: string,
  context: UserContext,
): Promise<string> {
  const intent = parsed.intent;
  const p = parsed.params || {};

  // Listar / buscar productos
  if (intent === 'list_products') {
    const rawQ = String(p.q ?? '');
    const combinedQ = isCatalogOpenQuery(rawQ) ? '' : augmentQueryWithFacets(rawQ, context);
    return executeToolCall(
      {
        name: 'getProducts',
        args: { q: combinedQ, page: p.page, page_size: p.page_size },
      },
      whatsappUserId,
      context,
    );
  }

  // Ver detalle de un producto
  if (intent === 'view_product') {
    const id3 = String(p.id).padStart(3, '0');
    return executeToolCall(
      {
        name: 'getProductById',
        args: { id: id3 },
      },
      whatsappUserId,
      context,
    );
  }

  // Número solo: índice del listado actual o ID
  if (intent === 'numeric_input') {
    const numStr = String(p.number ?? '').trim();
    if (!numStr) {
      return 'No entendí el número. Podés decir "ver 1" o "ver 090".';
    }
    const num = Number(numStr);
    const id3 = numStr.padStart(3, '0');

    // Si hay una operación pendiente de agregado, interpretamos el número como cantidad
    if (context.pendingAddProductId) {
      const productId = String(context.pendingAddProductId).padStart(3, '0');
      const quantity = Number.isFinite(num) && num > 0 ? num : 0;
      if (quantity <= 0) {
        const idShort = String(productId).replace(/^0+/, '') || String(productId);
        return `Indicá una cantidad válida para el #${idShort}.`;
      }
      const item = { productId, quantity };
      try {
        if (context.activeCartId) {
          let preQty = 0;
          try {
            const preCart = await getCart({ whatsappUserId, status: 'OPEN' });
            const preItem = Array.isArray(preCart?.items) ? preCart.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
            preQty = Number(preItem?.quantity || 0);
          } catch {}
          const result = await updateCart({ cartId: String(context.activeCartId), addItems: [item] });
          const postItem = Array.isArray(result?.items) ? result.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
          const postQty = Number(postItem?.quantity || 0);
          const expected = preQty + quantity;
          const idShort = String(item.productId).replace(/^0+/, '') || String(item.productId);
          const note = `Agregué ${quantity} al #${idShort}. Total ahora: ${postQty}${postQty !== expected ? ` (esperado ${expected})` : ''}.`;
          setUserContext(whatsappUserId, { pendingAddProductId: undefined, lastViewedProductId: String(productId) });
          return note + '\n\n' + 'Actualicé tu carrito:\n\n' + formatCart(result);
        }
        // Intentar carrito OPEN o crear nuevo
        try {
          const cart = await getCart({ whatsappUserId, status: 'OPEN' });
          if (cart && cart.id) {
            setUserContext(whatsappUserId, { activeCartId: String(cart.id) });
          }
          let preQty = 0;
          const preItem = Array.isArray(cart?.items) ? cart.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
          preQty = Number(preItem?.quantity || 0);
          const result = await updateCart({ cartId: String(cart.id), addItems: [item] });
          const postItem = Array.isArray(result?.items) ? result.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
          const postQty = Number(postItem?.quantity || 0);
          const expected = preQty + quantity;
          const idShort = String(item.productId).replace(/^0+/, '') || String(item.productId);
          const note = `Agregué ${quantity} al #${idShort}. Total ahora: ${postQty}${postQty !== expected ? ` (esperado ${expected})` : ''}.`;
          setUserContext(whatsappUserId, { pendingAddProductId: undefined, lastViewedProductId: String(productId) });
          return note + '\n\n' + 'Actualicé tu carrito:\n\n' + formatCart(result);
        } catch (e: any) {
          const status = e?.response?.status;
          const code = e?.response?.data?.error;
          if (status === 404 && code === 'cart_not_found') {
            const created = await createCart({ whatsappUserId, items: [item] });
            if (created && created.id) {
              setUserContext(whatsappUserId, { activeCartId: String(created.id) });
            }
            const postItem = Array.isArray(created?.items) ? created.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
            const postQty = Number(postItem?.quantity || 0);
            const idShort = String(item.productId).replace(/^0+/, '') || String(item.productId);
            const note = `Agregué ${quantity} al #${idShort}. Total ahora: ${postQty}.`;
            setUserContext(whatsappUserId, { pendingAddProductId: undefined, lastViewedProductId: String(productId) });
            return note + '\n\n' + 'Listo, ya te armé un carrito nuevo con estos productos:\n\n' + formatCart(created);
          }
          throw e;
        }
      } catch (e) {
        return mapApiErrorToBusinessMessage(e);
      }
    }
    try {
      // Si hay una búsqueda activa, intentamos resolver contra el listado actual
      if (context.lastQuery) {
        const current = await getProducts({ q: context.lastQuery, page: context.lastPage ?? 1, page_size: context.lastPageSize ?? 5 });
        const items = Array.isArray(current?.items) ? current.items : [];
        // Si el número es un índice dentro del listado
        if (num >= 1 && num <= items.length) {
          const item = items[num - 1];
          const detail = await getProductById({ id: String(item.id) });
          setUserContext(whatsappUserId, { lastViewedProductId: String(item.id) });
          const related = await getRelatedForProduct(detail);
          return formatProductDetailStructured(detail, related);
        }
        // Si es un ID, verificar si está en el listado
        const foundInList = items.find((it: any) => String(it.id).padStart(3, '0') === id3);
        if (!foundInList) {
          return `En la lista actual no encontré el producto #${id3}. Podés decir "ver 1" para ver el primero, o pedirme filtrar por color/talle.`;
        }
        const detail = await getProductById({ id: id3 });
        setUserContext(whatsappUserId, { lastViewedProductId: id3 });
        const related = await getRelatedForProduct(detail);
        return formatProductDetailStructured(detail, related);
      }
      // Sin búsqueda activa, tratar como ID directo
      const detail = await getProductById({ id: id3 });
      setUserContext(whatsappUserId, { lastViewedProductId: id3 });
      const related = await getRelatedForProduct(detail);
      return formatProductDetailStructured(detail, related);
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  // Paginación: "ver página N"
  if (intent === 'paginate') {
    return executeToolCall(
      {
        name: 'getProducts',
        args: { page: p.page },
      },
      whatsappUserId,
      context,
    );
  }

  // Ver carrito
  if (intent === 'show_cart') {
    return executeToolCall(
      { name: 'getCart', args: { whatsappUserId } },
      whatsappUserId,
      context,
    );
  }

  // Crear nuevo carrito
  if (intent === 'create_cart') {
    try {
      let cart: any | undefined;
      try {
        cart = await getCart({ whatsappUserId, status: 'OPEN' });
      } catch (_e) {
        cart = undefined;
      }
      if (cart && cart.id) {
        return `Debés completar tu compra del carrito "${cart.id}" para armar uno nuevo.`;
      }
      const created = await createCart({ whatsappUserId });
      if (created && created.id) {
        setUserContext(whatsappUserId, { activeCartId: String(created.id) });
      }
      return 'Listo, ya te armé un carrito nuevo. Está vacío por ahora; decime qué producto y cuántas unidades querés agregar.';
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  // Pagar carrito
  if (intent === 'pay_cart') {
    try {
      let cart: any | undefined;
      try {
        cart = await getCart({ whatsappUserId, status: 'OPEN' });
      } catch (_e) {
        cart = undefined;
      }
      if (!cart || !cart.id) {
        return 'Por ahora no tenés ningún carrito abierto.';
      }
      return `Para pagar tu carrito (${cart.id}), te comparto el resumen y te guío con el siguiente paso. Cuando estés listo, confirmame y lo cerramos.`;
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  // Vaciar carrito
  if (intent === 'clear_cart') {
    try {
      let cartId = context.activeCartId;
      let cart: any | undefined;
      if (!cartId) {
        try {
          cart = await getCart({ whatsappUserId, status: 'OPEN' });
          cartId = cart?.id ? String(cart.id) : undefined;
          if (cartId) {
            setUserContext(whatsappUserId, { activeCartId: cartId });
          }
        } catch (e) {
          return mapApiErrorToBusinessMessage(e);
        }
      }
      if (!cartId) {
        return 'Por ahora no tenés ningún carrito abierto.';
      }
      if (!cart) {
        try {
          cart = await getCart({ whatsappUserId, status: 'OPEN' });
        } catch (e) {
          return mapApiErrorToBusinessMessage(e);
        }
      }
      const items = Array.isArray(cart?.items) ? cart.items : [];
      if (items.length === 0) {
        return 'Tu carrito ya está vacío.';
      }
      const removeItems = items.map((i: any) => ({ productId: String(i.productId) }));
      await updateCart({ cartId: String(cartId), removeItems });
      return 'Listo, vacié tu carrito. Si querés, podemos empezar de nuevo con el catálogo.';
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  // Agregar al carrito
  if (intent === 'add_to_cart') {
    const quantity = Number(p.quantity);
    let productId: string | undefined = p.id ? String(p.id).padStart(3, '0') : undefined;

    if (!productId && quantity > 0 && p.q) {
      const combinedQ = context.lastQuery ? `${context.lastQuery} ${String(p.q)}` : String(p.q);
      const result = await getProducts({ q: combinedQ, page: 1, page_size: 6 });
      if (!result.items || result.items.length === 0) {
        setUserContext(whatsappUserId, { lastQuery: combinedQ, lastPage: 1, lastPageSize: 6 });
        return formatProductsList(result, combinedQ) + '\n\nDecime el código exacto y la cantidad para agregarlo.';
      }
      if (result.items.length === 1) {
        const only = result.items[0];
        if (only.isAvailable === false || Number(only.availableQuantity) <= 0) {
          return 'Ese producto no está disponible por el momento.';
        }
        const id3 = String(only.id).padStart(3, '0');
        const item = { productId: id3, quantity };
        try {
          let cart = await getCart({ whatsappUserId, status: 'OPEN' }).catch(() => undefined);
          if (!cart || !cart.id) {
            const created = await createCart({ whatsappUserId, items: [item] });
            setUserContext(whatsappUserId, { activeCartId: String(created.id), lastViewedProductId: String(only.id), pendingAddProductId: undefined });
            return 'Agregué ' + quantity + ' al #' + id3 + '.\n\n' + 'Listo, ya te armé un carrito nuevo con estos productos:\n\n' + formatCart(created);
          }
          const preItem = Array.isArray(cart.items) ? cart.items.find((i: any) => String(i.productId) === id3) : undefined;
          const preQty = Number(preItem?.quantity || 0);
          const updated = await updateCart({ cartId: String(cart.id), addItems: [item] });
          const postItem = Array.isArray(updated.items) ? updated.items.find((i: any) => String(i.productId) === id3) : undefined;
          const postQty = Number(postItem?.quantity || 0);
          const expected = preQty + quantity;
          setUserContext(whatsappUserId, { activeCartId: String(cart.id), lastViewedProductId: String(only.id), pendingAddProductId: undefined });
          const idShortMsg = String(only.id).replace(/^0+/, '') || String(only.id);
          return `Agregué ${quantity} al #${idShortMsg}. Total ahora: ${postQty}${postQty !== expected ? ` (esperado ${expected})` : ''}.\n\nActualicé tu carrito:\n\n` + formatCart(updated);
        } catch (e) {
          return mapApiErrorToBusinessMessage(e);
        }
      }
      setUserContext(whatsappUserId, { lastQuery: combinedQ, lastPage: result.page ?? 1, lastPageSize: result.page_size ?? 6 });
      const base = formatProductsList(result, combinedQ);
      return base + '\n\nPara agregar, decime el código y la cantidad. Ejemplo: "agregá 20 del 099".';
    }

    // Agregar por descripción: buscar y pedir cantidad/ID
    if (!productId && !quantity && p.q) {
      const combinedQ = context.lastQuery ? `${context.lastQuery} ${String(p.q)}` : String(p.q);
      const result = await getProducts({ q: combinedQ, page: 1, page_size: 6 });
      setUserContext(whatsappUserId, {
        lastQuery: combinedQ,
        lastPage: result.page ?? 1,
        lastPageSize: result.page_size ?? 6,
      });

      if (!result.items || result.items.length === 0) {
        return formatProductsList(result, combinedQ);
      }
      if (result.items.length === 1) {
        const only = result.items[0];
        setUserContext(whatsappUserId, { lastViewedProductId: String(only.id) });
        if (only.isAvailable === false || Number(only.availableQuantity) <= 0) {
          return 'Ese producto no está disponible por el momento.';
        }
        const id3 = String(only.id).padStart(3, '0');
        const tipo = only.type ?? '';
        const talla = only.size ?? '-';
        const color = only.color ?? '-';
        return `Encontré ${tipo} #${id3} - Talle ${talla} - Color ${color}. ¿Cuántas unidades querés agregar?`;
      }
      const base = formatProductsList(result, combinedQ);
      return (
        base +
        '\n\nPara agregar, decime el código y la cantidad. Ejemplo: "agregá 20 del 099".'
      );
    }

    if (!quantity || quantity <= 0) {
      if (productId) {
        setUserContext(whatsappUserId, { lastViewedProductId: String(productId), pendingAddProductId: String(productId) });
        const idShort = String(productId).replace(/^0+/, '') || String(productId);
        return `¿Cuántas unidades querés agregar del #${idShort}?`;
      }
      // Si no vino id pero hay pendiente de agregar, usarlo
      if (!productId) {
        const pending = context.pendingAddProductId;
        if (pending) {
          productId = String(pending);
        }
      }
      if (!productId) {
        return 'Decime el código del producto que querés agregar (por ejemplo: "agregá 10 del 023").';
      }
      setUserContext(whatsappUserId, { lastViewedProductId: String(productId), pendingAddProductId: String(productId) });
      const idShort = String(productId).replace(/^0+/, '') || String(productId);
      return `¿Cuántas unidades querés agregar del #${idShort}?`;
    }

    // Si no vino id explícito, usamos el último producto visto del contexto
    if (!productId) {
      if (context.lastViewedProductId) {
        productId = context.lastViewedProductId;
      } else {
        return 'Decime el código del producto que querés agregar (por ejemplo: "agregá 10 del 023").';
      }
    }

    const item = { productId: String(productId).padStart(3, '0'), quantity };

    try {
      // Si ya tenemos un carrito activo, lo usamos directo
      if (context.activeCartId) {
        let preQty = 0;
        try {
          const preCart = await getCart({ whatsappUserId, status: 'OPEN' });
          const preItem = Array.isArray(preCart?.items) ? preCart.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
          preQty = Number(preItem?.quantity || 0);
        } catch {}
        const result = await updateCart({
          cartId: String(context.activeCartId),
          addItems: [item],
        });
        const postItem = Array.isArray(result?.items) ? result.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
        const postQty = Number(postItem?.quantity || 0);
        const expected = preQty + quantity;
        const idShort = String(item.productId).replace(/^0+/, '') || String(item.productId);
        const note = `Agregué ${quantity} al #${idShort}. Total ahora: ${postQty}${postQty !== expected ? ` (esperado ${expected})` : ''}.`;
        setUserContext(whatsappUserId, { pendingAddProductId: undefined });
        return note + '\n\n' + 'Actualicé tu carrito:\n\n' + formatCart(result);
      }

      // Intentar recuperar carrito OPEN
      try {
        const cart = await getCart({ whatsappUserId, status: 'OPEN' });
        if (cart && cart.id) {
          setUserContext(whatsappUserId, { activeCartId: String(cart.id) });
        }
        let preQty = 0;
        const preItem = Array.isArray(cart?.items) ? cart.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
        preQty = Number(preItem?.quantity || 0);
        const result = await updateCart({
          cartId: String(cart.id),
          addItems: [item],
        });
        const postItem = Array.isArray(result?.items) ? result.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
        const postQty = Number(postItem?.quantity || 0);
        const expected = preQty + quantity;
        const idShort = String(item.productId).replace(/^0+/, '') || String(item.productId);
        const note = `Agregué ${quantity} al #${idShort}. Total ahora: ${postQty}${postQty !== expected ? ` (esperado ${expected})` : ''}.`;
        setUserContext(whatsappUserId, { pendingAddProductId: undefined });
        return note + '\n\n' + 'Actualicé tu carrito:\n\n' + formatCart(result);
      } catch (e: any) {
        const status = e?.response?.status;
        const code = e?.response?.data?.error;
        if (status === 404 && code === 'cart_not_found') {
          const created = await createCart({
            whatsappUserId,
            items: [item],
          });
          if (created && created.id) {
            setUserContext(whatsappUserId, {
              activeCartId: String(created.id),
            });
          }
          const postItem = Array.isArray(created?.items) ? created.items.find((i: any) => String(i.productId) === String(item.productId)) : undefined;
          const postQty = Number(postItem?.quantity || 0);
          const idShort = String(item.productId).replace(/^0+/, '') || String(item.productId);
          const note = `Agregué ${quantity} al #${idShort}. Total ahora: ${postQty}.`;
          setUserContext(whatsappUserId, { pendingAddProductId: undefined });
          return note + '\n\n' + 'Listo, ya te armé un carrito nuevo con estos productos:\n\n' + formatCart(created);
        }
        throw e;
      }
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  // Actualizar cantidad de un ítem en el carrito
  if (intent === 'update_cart_item') {
    const item = { productId: String(p.id).padStart(3, '0'), quantity: Number(p.quantity) };
    try {
      let cartId = context.activeCartId;
      if (!cartId) {
        try {
          const cart = await getCart({ whatsappUserId, status: 'OPEN' });
          cartId = cart?.id ? String(cart.id) : undefined;
          if (cartId) {
            setUserContext(whatsappUserId, { activeCartId: cartId });
          }
        } catch (e) {
          return mapApiErrorToBusinessMessage(e);
        }
      }
      if (!cartId) {
        return 'Por ahora no tenés ningún carrito abierto.';
      }
      const result = await updateCart({
        cartId: String(cartId),
        updateItems: [item],
      });
      return 'Actualicé tu carrito:\n\n' + formatCart(result);
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  // Eliminar un ítem del carrito
  if (intent === 'remove_from_cart') {
    try {
      let cartId = context.activeCartId;
      let cart: any | undefined;
      if (!cartId) {
        try {
          cart = await getCart({ whatsappUserId, status: 'OPEN' });
          cartId = cart?.id ? String(cart.id) : undefined;
          if (cartId) {
            setUserContext(whatsappUserId, { activeCartId: cartId });
          }
        } catch (e) {
          return mapApiErrorToBusinessMessage(e);
        }
      }
      if (!cartId) {
        return 'Por ahora no tenés ningún carrito abierto.';
      }

      if (p.id) {
        const pid = String(p.id).padStart(3, '0');
        if (p.removeQty && Number(p.removeQty) > 0) {
          if (!cart) {
            try {
              cart = await getCart({ whatsappUserId, status: 'OPEN' });
            } catch (e) {
              return mapApiErrorToBusinessMessage(e);
            }
          }
          const item = Array.isArray(cart?.items) ? cart.items.find((i: any) => String(i.productId) === pid) : undefined;
          if (!item) {
            return `No encontré el producto ${pid} en tu carrito.`;
          }
          const currentQty = Number(item.quantity) || 0;
          const removeQty = Math.min(currentQty, Number(p.removeQty));
          const newQty = currentQty - removeQty;
          const ops = newQty > 0
            ? { updateItems: [{ productId: pid, quantity: newQty }] }
            : { removeItems: [{ productId: pid }] };
          const result = await updateCart({ cartId: String(cartId), ...ops });
          return 'Actualicé tu carrito:\n\n' + formatCart(result);
        } else {
          const result = await updateCart({
            cartId: String(cartId),
            removeItems: [{ productId: pid }],
          });
          return 'Actualicé tu carrito:\n\n' + formatCart(result);
        }
      }

      if (Array.isArray(p.ids) && p.ids.length > 0) {
        const removeItems = p.ids.map((pid: any) => ({ productId: String(pid).padStart(3, '0') }));
        const result = await updateCart({ cartId: String(cartId), removeItems });
        return 'Actualicé tu carrito:\n\n' + formatCart(result);
      }

      const qRaw = String(p.q || '');
      const qn = normalizeText(qRaw).replace(/["'“”‘’]+/g, '');
      const parts = qn
        .split(/[,;]|\b y \b/)
        .map((s) => s.trim())
        .filter(Boolean);
      const partTokens = parts.map((part) =>
        part
          .split(/\s+/)
          .filter(Boolean)
          .map((tk) => collapseRepeatedVowels(tk))
          .filter((tk) => !REMOVE_STOPWORDS.has(tk)),
      );
      const nonEmptyParts = partTokens.filter((pt) => pt.length > 0);
      if (nonEmptyParts.length === 0) {
        if (!cart) {
          try {
            cart = await getCart({ whatsappUserId, status: 'OPEN' });
          } catch (e) {
            return mapApiErrorToBusinessMessage(e);
          }
        }
        const items0 = Array.isArray(cart?.items) ? cart.items : [];
        if (items0.length === 0) {
          return 'Tu carrito ya está vacío.';
        }
        const rq = Number(p.removeQty || 0);
        let targetId: string | undefined = undefined;
        if (context.lastViewedProductId && items0.some((i: any) => String(i.productId) === String(context.lastViewedProductId))) {
          targetId = String(context.lastViewedProductId);
        } else if (items0.length === 1) {
          targetId = String(items0[0].productId);
        }
        if (targetId) {
          const item0 = items0.find((i: any) => String(i.productId) === targetId);
          const curr = Number(item0?.quantity || 0);
          const take = rq > 0 ? Math.min(curr, rq) : curr;
          const newQ = curr - take;
          const ops = newQ > 0
            ? { updateItems: [{ productId: String(targetId), quantity: newQ }] }
            : { removeItems: [{ productId: String(targetId) }] };
          const result = await updateCart({ cartId: String(cartId), ...ops });
          return 'Actualicé tu carrito:\n\n' + formatCart(result);
        }
        const options = items0.slice(0, 5).map((i: any) => {
          const pid = String(i.productId).replace(/^0+/, '') || String(i.productId);
          const name = String(i.productNameSnapshot ?? `Producto ${pid}`);
          const qty = Number(i.quantity) || 0;
          return `- #${pid} · ${name} × ${qty}`;
        }).join('\n');
        const baseMsg = `Decime el código del producto a eliminar (por ejemplo: "eliminá el 023"${rq ? ` o "eliminá ${rq} del 023"` : ''}).`;
        return `${baseMsg}\n\n${options}`;
      }
      if (!cart) {
        try {
          cart = await getCart({ whatsappUserId, status: 'OPEN' });
        } catch (e) {
          return mapApiErrorToBusinessMessage(e);
        }
      }
      const items = Array.isArray(cart?.items) ? cart.items : [];
      const matchedIdsSet = new Set<string>();
      for (const pt of nonEmptyParts) {
        for (const i of items) {
          const s = normalizeText(i.productNameSnapshot ?? String(i.productId));
          const matchAll = pt.every((tk) => {
            const variants = [tk, ...(REMOVE_SYNONYMS[tk] ?? [])];
            return variants.some((v) => s.includes(v));
          });
          if (matchAll) {
            matchedIdsSet.add(String(i.productId));
          }
        }
      }
      const matchedIds = Array.from(matchedIdsSet);
      if (matchedIds.length === 0) {
        return `No encontré productos en tu carrito que coincidan con "${qRaw}".`;
      }
      const colorTokens = new Set<string>(['negro','negra','blanco','blanca','rojo','roja','azul','verde','gris','amarillo','amarilla','violeta','morado','naranja','rosa','beige','bordo','celeste','fucsia','plomo']);
      const sizeTokens = new Set<string>(['s','m','l','xl','xxl']);
      const singleSegment = nonEmptyParts.length === 1;
      const firstPart = singleSegment ? nonEmptyParts[0] : [];
      const hasColorOrSize = firstPart.some((tk) => colorTokens.has(tk) || sizeTokens.has(tk));
      if (singleSegment && !hasColorOrSize && matchedIds.length > 1) {
        const pt = firstPart;
        const matchedItems = items.filter((i: any) => {
          const s = normalizeText(i.productNameSnapshot ?? String(i.productId));
          return pt.every((tk) => {
            const variants = [tk, ...(REMOVE_SYNONYMS[tk] ?? [])];
            return variants.some((v) => s.includes(v));
          });
        });
        const options = matchedItems.slice(0, 5).map((i: any) => {
          const pid = String(i.productId).replace(/^0+/, '') || String(i.productId);
          const name = String(i.productNameSnapshot ?? `Producto ${pid}`);
          const qty = Number(i.quantity) || 0;
          return `- #${pid} · ${name} × ${qty}`;
        }).join('\n');
        const baseMsg = `Encontré varias coincidencias. Elegí uno indicando el código (por ejemplo: "eliminá el 023"${p.removeQty ? ` o "eliminá ${Number(p.removeQty)} del 023"` : ''}).`;
        return `${baseMsg}\n\n${options}`;
      }
      const removeQty = Number(p.removeQty || 0);
      if (removeQty > 0) {
        // Asignar eliminación de unidades total entre los items coincidentes (mayor cantidad primero)
        const matchedItems = items.filter((i: any) => matchedIds.includes(String(i.productId)));
        matchedItems.sort((a: any, b: any) => Number(b.quantity) - Number(a.quantity));
        let remaining = removeQty;
        const opsUpdate: { productId: string; quantity: number }[] = [];
        const opsRemove: { productId: string }[] = [];
        for (const it of matchedItems) {
          if (remaining <= 0) break;
          const curr = Number(it.quantity) || 0;
          if (curr <= 0) continue;
          const take = Math.min(curr, remaining);
          const newQ = curr - take;
          if (newQ > 0) {
            opsUpdate.push({ productId: String(it.productId), quantity: newQ });
          } else {
            opsRemove.push({ productId: String(it.productId) });
          }
          remaining -= take;
        }
        const result = await updateCart({ cartId: String(cartId), updateItems: opsUpdate, removeItems: opsRemove });
        return 'Actualicé tu carrito:\n\n' + formatCart(result);
      } else {
        const removeItems = matchedIds.map((pid: string) => ({ productId: String(pid) }));
        const result = await updateCart({ cartId: String(cartId), removeItems });
        return 'Actualicé tu carrito:\n\n' + formatCart(result);
      }
    } catch (e) {
      return mapApiErrorToBusinessMessage(e);
    }
  }

  return '';
}

// =====================
// Entrada principal (webhook)
// =====================

/**
 * Entrada principal del agente (desde webhook de WhatsApp).
 *
 * - Loguea entrada y salida.
 * - Aplica parser determinista y fallback con contexto a Gemini.
 * - Garantiza respuestas coherentes con tools y mensajes de negocio.
 *
 * @param params Texto y `whatsappUserId`.
 * @returns Mensaje para enviar por WhatsApp.
 */
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

    const context = getUserContext(whatsappUserId);
    const parsed = parseIntent(text);

    // === Manejo de nombre del usuario ===
  if (parsed.intent === 'set_name') {
    const name = String(parsed.params.name || '').trim();
    if (name) {
      const titledName = name
        .split(/\s+/)
        .map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s))
        .join(' ');
      setUserContext(whatsappUserId, { userName: titledName, hasAskedName: true, lastGreetAt: Date.now() });
      return `Hola ${titledName}. ¿En qué te ayudo hoy?`;
    }
    return 'Perfecto, ¿me repetís tu nombre?';
  }

  if (parsed.intent === 'ask_name') {
    if (context.userName) {
      return `Me dijiste que te llamás ${context.userName}.`;
    }
    return 'Todavía no me contaste tu nombre 😊. Podés decirme, por ejemplo: "me llamo Antonio".';
  }

  if (parsed.intent === 'greet') {
    const now = Date.now();
    const recently = context.lastGreetAt && now - Number(context.lastGreetAt) < 300000; // 5 minutos

    if (!context.userName) {
      setUserContext(whatsappUserId, { lastGreetAt: now, hasAskedName: true });
      if (context.hasAskedName && recently) {
        return '¿Me decís tu nombre?';
      }
      return '¡Hola! Soy tu asistente de ventas de Laburen. ¿Cuál es tu nombre?';
    }

    setUserContext(whatsappUserId, { lastGreetAt: now });
    if (recently) {
      if (context.lastQuery) {
        return `Hola ${context.userName}. La última vez buscaste "${context.lastQuery}". ¿Querés ver más resultados o tu carrito?`;
      }
      if (context.activeCartId) {
        return `Hola ${context.userName}. Tenés un carrito activo. ¿Querés verlo o seguir buscando productos?`;
      }
      return `Hola ${context.userName}. ¿En qué te ayudo hoy?`;
    }
    return `Hola ${context.userName}. ¿En qué te ayudo hoy?`;
  }

    // === Intents deterministas (parser + tools) ===
    if (parsed.intent !== 'unknown') {
      const deterministic = await executeToolCalls(
        parsed,
        whatsappUserId,
        context,
      );
      if (deterministic) {
        return extractStructuredOutput(deterministic);
      }
    }

    // === Fallback: Llamar a Gemini con contexto enriquecido ===
    const enrichedText = buildUserTextWithContext(text, context);

    const { text: modelText, toolCall } = await callGeminiOnce({
      systemPrompt,
      userText: enrichedText,
      whatsappUserId,
      tools,
    });

    console.log('gemini_output', {
      whatsappUserId: String(whatsappUserId),
      hasToolCall: !!toolCall,
    });

    // Si Gemini no pidió ninguna tool, respondemos con su texto directo
  if (!toolCall) {
      const stripLeadingSalutation = (s: string) => {
        const re = /^(\s*(?:¡)?\s*(?:hola+|buenas|buen dia|buenos dias|buenas tardes|buenas noches)(?:\s*,?\s+[a-záéíóúñ]+)?[!¡.,\s]*)/i;
        return String(s || '').replace(re, '').trim();
      };
      const naturalize = (s: string, _ctx: UserContext) => {
        let t = String(s || '').trim();
        t = t.replace(/\bsi te interesa\b/gi, '¿Te interesa');
        t = t.replace(/\bsi queres\b/gi, '¿Querés');
        return t;
      };
      const modelBody = extractStructuredOutput(modelText);
      const cleaned = stripLeadingSalutation(modelBody);
      const friendly = naturalize(cleaned, context);
      const minimal = String(friendly || '').trim();
      return minimal || 'Especificá producto, color/talle o código para avanzar.';
  }

    // Si pidió tool, ejecutamos contra nuestra API y formateamos respuesta
    const toolAnswer = await executeToolCall(toolCall, whatsappUserId, context);
    console.log('gemini_tool_answer', {
      whatsappUserId: String(whatsappUserId),
    });
    return extractStructuredOutput(toolAnswer);
  } catch (err) {
    const msg = mapApiErrorToBusinessMessage(err);
    return msg;
  }
}
