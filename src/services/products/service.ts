// servicio de productos: aca hago las consultas a la db
import { prisma } from "../../infra/prisma/client";

/**
 * Normaliza texto a minúsculas, sin tildes, sin espacios extras.
 *
 * @param s Texto libre.
 * @returns Texto normalizado para búsqueda.
 */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // elimina tildes
}

// Stopwords básicas en español/arg para búsquedas de ropa
const STOPWORDS = new Set<string>([
  "si",
  "sí",
  "hola",
  "holaa",
  "buenas",
  "buen",
  "dia",
  "dias",
  "diaa",
  "tarde",
  "tardes",
  "noche",
  "noches",

  "por",
  "favor",
  "porfa",
  "pf",

  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",

  "me",
  "mi",
  "mis",
  "tu",
  "tus",
  "vos",
  "a",
  "de",
  "del",
  "al",
  "y",
  "o",
  "u",
  "que",
  "para",

  "mas",
  "más",

  // verbos genéricos de intención
  "quiero",
  "necesito",
  "busco",
  "buscar",
  "buscando",
  "mostrame",
  "mostra",
  "mostrar",
  "ver",
  "muestrame",
  "muestreme",
  "estoy",
  "tengo",

  // palabras genéricas de catálogo / carrito
  "producto",
  "productos",
  "prenda",
  "prendas",
  "catalogo",
  "catálogo",
  "catalog",
  "catlogo",
  "carrito",
  "carro",

  // verbos de carrito sin info de producto
  "agregar",
  "agrega",
  "agrego",
  "sumar",
  "sumo",
  "añadir",
  "anadir",
  "eliminar",
  "elimino",
  "quitar",
  "sacar",
  "borrar",

  // palabras muy genéricas en consultas
  "modelo",
  "modelos",
  "tenes",
  "tenes?",
  "tenes?",
  "tenes",
  "tiene",
  "tienen",
  "tiene?",
  "tienen?",
  "talle",
  "talles",
  "tienes",
  "tienes?",
  "como",
  "cómo",
  "puedo",
  "ayudar",
  "ayuda",
  "nuevo",
  "nueva",
  "nuevos",
  "nuevas",
]);

/**
 * Sinónimos reales usados en indumentaria (AR) por token.
 *
 * Nota: Se expanden por token, no como términos adicionales en AND;
 * esto mantiene consultas compactas y con buena recall.
 */
const SYNONYMS: Record<string, string[]> = {
  camiseta: ["remera"],
  camisetas: ["remeras","camiseta"],
  remera: ["camiseta"],
  remeras: ["camisetas","remera"],

  chaqueta: ["campera"],
  chaquetas: ["camperas","chaqueta"],
  campera: ["chaqueta"],
  camperas: ["chaquetas","campera"],

  falda: ["pollera"],
  faldas: ["polleras","falda"],
  pollera: ["falda"],
  polleras: ["faldas","pollera"],

  pantalon: ["jean","jogging","babucha"],
  pantalones: ["pantalon","jeans","jogging","babuchas"],
  jean: ["pantalon"],
  jeans: ["jean","pantalones"],
  jogging: ["pantalon"],
  babucha: ["pantalon"],
  babuchas: ["babucha","pantalones"],

  sudadera: ["buzo","hoodie","sueter","jersey"],
  sudaderas: ["sudadera","buzos","hoodies","sueteres","jerseys"],
  buzo: ["sudadera","sueter","jersey"],
  buzos: ["buzo","sudaderas","sueteres","jerseys"],
  hoodie: ["sudadera"],
  hoodies: ["hoodie","sudaderas"],
  sueter: ["sudadera","buzo","jersey"],
  sueteres: ["sueter","sudaderas","buzos","jerseys"],
  playera: ["camiseta","remera"],
  playeras: ["playera","camisetas","remeras"],
  jersey: ["sueter","sudadera","buzo","camiseta","remera"],
  jerseys: ["jersey","sueteres","sudaderas","buzos","camisetas","remeras"],
  abrigo: ["campera","chaqueta"],
  abrigos: ["abrigo","camperas","chaquetas"],

  camisa: [],
  camisas: [],

  // ---- ESTILOS ----
  deportivo: ["sport", "training"],
  sport: ["deportivo"],
  urbano: ["casual", "street"],
  street: ["urbano"],
  casual: ["urbano"],
  oversize: ["holgado"],
  holgado: ["oversize"],

  // ---- COLORES ----
  negro: ["black"],
  negros: ["negro", "black"],
  blanco: ["white"],
  blancos: ["blanco", "white"],
  rojo: ["red"],
  rojos: ["rojo", "red"],
  azul: ["blue"],
  azules: ["azul", "blue"],
  verde: ["green"],
  verdes: ["verde", "green"],
  gris: ["gray"],
  grises: ["gris", "gray"],
  amarillo: ["yellow"],
  amarillos: ["amarillo", "yellow"],
  violeta: ["morado", "purple"],
  violetas: ["violeta", "morado", "purple"],
  naranja: ["orange"],
  naranjas: ["naranja", "orange"],
  rosa: ["pink"],
  rosas: ["rosa", "pink"],
  beige: ["crema", "arena"],
  bordo: ["rojo", "red", "burdeos", "granate"],
  bordó: ["bordo", "rojo", "red", "burdeos", "granate"],
  celeste: ["azul", "blue"],
  fucsia: ["rosa", "pink"],
  plomo: ["gris", "gray"],

  // ---- MATERIALES ----
  algodon: ["algodonpeinado", "cotton"],
  algodón: ["algodon", "cotton"],
  gabardina: ["denim"],
  denim: ["jean"],
};

// Variantes con acento para tokens comunes del dominio
const ACCENT_MAP: Record<string, string> = {
  pantalon: "pantalón",
  pantalones: "pantalones",
  marron: "marrón",
  bordo: "bordó",
  sueter: "suéter",
  sueteres: "suéteres",
};

let ACCENT_DYNAMIC: Record<string, Set<string>> = {};
let ACCENT_LAST_BUILD = 0;

/**
 * Tokeniza preservando acentos y caracteres no normalizados.
 *
 * @param s Texto crudo.
 * @returns Tokens en minúsculas.
 */
function tokenizeRaw(s: string): string[] {
  return String(s || "")
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/)
    .filter(Boolean);
}
/**
 * Tokeniza sobre texto normalizado (sin acentos).
 *
 * @param s Texto crudo.
 * @returns Tokens normalizados.
 */
function tokenizeNorm(s: string): string[] {
  return normalize(String(s || ""))
    .split(/\s+/)
    .filter(Boolean);
}
/**
 * Construye mapa dinámico de variantes con acento desde la base.
 *
 * Recorre campos de productos y relaciona tokens normalizados con
 * sus apariciones crudas (con acento), para ampliar el recall.
 */
async function ensureAccentDynamic() {
  if (ACCENT_LAST_BUILD > 0) return;
  const rows = await prisma.product.findMany({
    select: { type: true, size: true, color: true, category: true, description: true },
  });
  const map: Record<string, Set<string>> = {};
  for (const r of rows as any[]) {
    const fields = [r.type, r.size, r.color, r.category, r.description]
      .map((x: any) => String(x || ""))
      .filter(Boolean);
    for (const f of fields) {
      const normTokens = tokenizeNorm(f);
      const rawTokens = tokenizeRaw(f);
      for (const nt of normTokens) {
        if (!map[nt]) map[nt] = new Set<string>();
        for (const rt of rawTokens) {
          map[nt].add(rt);
        }
      }
    }
  }
  ACCENT_DYNAMIC = map;
  ACCENT_LAST_BUILD = Date.now();
}
/**
 * Obtiene variantes con acento para un token dado.
 *
 * Combina mapa estático (`ACCENT_MAP`) y dinámico (`ACCENT_DYNAMIC`).
 *
 * @param token Token normalizado.
 * @returns Variantes únicas con acento.
 */
function accentVariantsFor(token: string): string[] {
  const out: string[] = [];
  const stat = ACCENT_MAP[token];
  if (stat) out.push(stat);
  const dyn = ACCENT_DYNAMIC[token];
  if (dyn && dyn.size > 0) out.push(...Array.from(dyn));
  return Array.from(new Set(out));
}

export const ProductsService = {
  /**
   * Busca productos por texto libre, tolerante a acentos y sinónimos.
   *
   * Pipeline:
   * - Normaliza y tokeniza consulta.
   * - Remueve stopwords del dominio.
   * - Expande sinónimos y variantes con acento.
   * - Aplica `AND` sobre campos buscables y `availableQuantity > 0`.
   * - Si no hay tokens, lista productos disponibles paginados.
   *
   * @param q Consulta libre.
   * @param page Número de página (1-based).
   * @param pageSize Tamaño de página (máx 50).
   * @returns `{ items, page, page_size, total }`.
   */
  async search(q?: string, page: number = 1, pageSize: number = 10) {
    // normalizo el pageSize para que no se vaya de tema
    const limit = Math.max(1, Math.min(pageSize, 50));

    const raw = normalize(q ?? "");
    let tokens = raw ? raw.split(/\s+/).filter(Boolean) : [];
    tokens = tokens.map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean);

    // saco stopwords (hola, si, busco, mostrar, el, la, catálogo, productos, carrito, etc.)
    tokens = tokens.filter((t) => !STOPWORDS.has(t));

    // campos buscables
    const fields = ["type", "size", "color", "category", "description"] as const;

    // Si no quedaron tokens relevantes → devolvemos todo lo disponible
    if (tokens.length === 0) {
      const skip = (page - 1) * limit;
      const baseWhere = {
        availableQuantity: { gt: 0 },
      };

      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where: baseWhere,
          skip,
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),
        prisma.product.count({ where: baseWhere }),
      ]);

      return { items, page, page_size: limit, total };
    }

    await ensureAccentDynamic();
    const andClauses = tokens.map((token) => {
      const baseVariants = [token, ...(SYNONYMS[token] ?? [])];
      const variants = Array.from(
        new Set(
          baseVariants.flatMap((v) => [v, ...accentVariantsFor(v)])
        )
      );

      return {
        OR: variants.flatMap((v) =>
          fields.map((f) => ({
            [f]: { contains: v, mode: "insensitive" as const },
          })),
        ),
      };
    });

    const where = {
      AND: andClauses,
      availableQuantity: { gt: 0 },
    };

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.product.count({ where }),
    ]);
    if (total === 0 && tokens.length > 0) {
      const typeTokensSet = new Set<string>([
        "camisa","camisas","camiseta","camisetas","remera","remeras",
        "chaqueta","chaquetas","campera","camperas",
        "falda","faldas","pollera","polleras",
        "pantalon","pantalones","jean","jeans","jogging","babucha","babuchas",
        "sudadera","sudaderas","buzo","buzos","hoodie","hoodies",
      ]);
      const typeTokens = tokens.filter((t) => typeTokensSet.has(t));
      const typeVariants = Array.from(
        new Set(
          typeTokens
            .flatMap((t) => [t, ...(SYNONYMS[t] ?? [])])
            .flatMap((v) => [v, ...accentVariantsFor(v)])
        )
      );
      const where2 = {
        OR: tokens
          .map((token) => [token, ...(SYNONYMS[token] ?? [])])
          .flat()
          .flatMap((v) => [v, ...accentVariantsFor(v)])
          .flatMap((v) =>
            fields.map((f) => ({ [f]: { contains: v, mode: "insensitive" as const } })),
          ),
        AND:
          typeVariants.length > 0
            ? [
                {
                  OR: typeVariants.map((v) => ({
                    type: { contains: v, mode: "insensitive" as const },
                  })),
                },
              ]
            : [],
        availableQuantity: { gt: 0 },
      };
      const [items2, total2] = await Promise.all([
        prisma.product.findMany({
          where: where2,
          skip,
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),
        prisma.product.count({ where: where2 }),
      ]);
      return { items: items2, page, page_size: limit, total: total2 };
    }

    return { items, page, page_size: limit, total };
  },

  /**
   * Obtiene producto por ID, tolerando ceros a la izquierda.
   *
   * @param id ID provisto (1–4 dígitos, con o sin ceros).
   * @returns Producto o `null`.
   */
  async getById(id: string) {
    const raw = String(id);
    const norm = raw.replace(/^0+/, "");
    const p1 = await prisma.product.findUnique({ where: { id: raw } });
    if (p1) return p1;
    return prisma.product.findUnique({ where: { id: norm } });
  },

  /**
   * Valida consistencia básica del dataset de productos.
   *
   * - ID numérico 1–4 dígitos.
   * - Stock y precios no negativos/NaN.
   * - Moneda ISO-4217.
   * - Coherencia `isAvailable` vs `availableQuantity`.
   *
   * @returns Resumen de issues encontrados.
   */
  async validateDataset() {
    const products = await prisma.product.findMany();
    const issues: { type: string; id: string; field: string; value: any; message: string }[] = [];
    const isThreeDigitId = (s: string) => /^(\d{1,4})$/.test(s);
    for (const p of products as any[]) {
      const id = String(p.id);
      if (!isThreeDigitId(id)) {
        issues.push({ type: 'product', id, field: 'id', value: id, message: 'ID no numérico de 1-4 dígitos' });
      }
      const qty = Number(p.availableQuantity);
      if (!Number.isFinite(qty) || qty < 0) {
        issues.push({ type: 'product', id, field: 'availableQuantity', value: qty, message: 'Cantidad no válida (negativa o NaN)' });
      }
      const cur = String(p.currency || '');
      if (!/^([A-Z]{3})$/.test(cur)) {
        issues.push({ type: 'product', id, field: 'currency', value: cur, message: 'Moneda no ISO-4217 (3 letras)' });
      }
      const prices = ['price50','price100','price200'] as const;
      for (const f of prices) {
        const val = Number(p[f]);
        if (!Number.isFinite(val) || val < 0) {
          issues.push({ type: 'product', id, field: f, value: p[f], message: 'Precio inválido (negativo o NaN)' });
        }
      }
      if (p.isAvailable && qty <= 0) {
        issues.push({ type: 'product', id, field: 'isAvailable', value: p.isAvailable, message: 'Marcado disponible pero sin stock' });
      }
      if (!p.isAvailable && qty > 0) {
        issues.push({ type: 'product', id, field: 'isAvailable', value: p.isAvailable, message: 'Marcado NO disponible con stock positivo' });
      }
    }
    return { total: products.length, issues };
  },
};
