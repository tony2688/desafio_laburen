/**
 * Resultado del parser conversacional.
 *
 * Describe la intención detectada y los parámetros estructurados
 * necesarios para que el agente llame a la tool adecuada.
 *
 * Intents soportados:
 * - `list_products`: búsqueda/libre en catálogo.
 * - `view_product`: ver detalle de un producto por código.
 * - `numeric_input`: entrada numérica aislada (ID o cantidad contextual).
 * - `paginate`: navegar páginas del listado de productos.
 * - `show_cart`: mostrar el carrito activo del usuario.
 * - `add_to_cart`: agregar productos al carrito (por ID, cantidad o descripción).
 * - `update_cart_item`: actualizar la cantidad de un ítem existente.
 * - `remove_from_cart`: eliminar ítems por ID o por descripción.
 * - `clear_cart`: vaciar el carrito completo.
 * - `create_cart`: abrir un carrito nuevo.
 * - `pay_cart`: iniciar flujo de pago/checkout.
 * - `greet`: saludo básico.
 * - `set_name`: establecer nombre del usuario.
 * - `ask_name`: preguntar el nombre que recuerda el sistema.
 * - `unknown`: dejar que el modelo responda libremente.
 */
export type ParsedIntent = {
  intent:
    | "list_products"
    | "view_product"
    | "numeric_input"
    | "paginate"
    | "show_cart"
    | "add_to_cart"
    | "update_cart_item"
    | "remove_from_cart"
    | "clear_cart"
    | "create_cart"
    | "pay_cart"
    | "greet"
    | "set_name"
    | "ask_name"
    | "unknown";
  params: Record<string, any>;
};

/**
 * Normaliza texto de entrada para parsing robusto.
 *
 * - Recorta espacios y pasa a minúsculas.
 * - Elimina diacríticos (acentos) usando `NFD` y filtrando marcas.
 * - Colapsa repeticiones de vocales (p.ej. "holaaa" → "hola").
 *
 * @param s Texto original del usuario.
 * @returns Texto normalizado y libre de acentos, apto para regex.
 */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([aeiou])\1{1,}/g, "$1");
}

/**
 * Convierte números expresados en palabras en español a su valor numérico.
 *
 * Soporta formas simples ("uno", "veinte") y combinaciones con "y"
 * ("veintidos", "treinta y cinco"), además de centenas básicas
 * ("cien", "doscientos", ...).
 *
 * @param s Texto con número en palabras.
 * @returns Número entero o `null` si no se pudo interpretar.
 */
function wordToNumber(s: string): number | null {
  const t = s.trim().toLowerCase();
  const base: Record<string, number> = {
    cero: 0,
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
    trece: 13,
    catorce: 14,
    quince: 15,
    dieciseis: 16,
    diecisiete: 17,
    dieciocho: 18,
    diecinueve: 19,
    veinte: 20,
    veintiuno: 21,
    veintiun: 21,
    veintidos: 22,
    veintitres: 23,
    veinticuatro: 24,
    veinticinco: 25,
    veintiseis: 26,
    veintisiete: 27,
    veintiocho: 28,
    veintinueve: 29,
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50,
    sesenta: 60,
    setenta: 70,
    ochenta: 80,
    noventa: 90,
  };
  const hundreds: Record<string, number> = {
    cien: 100,
    ciento: 100,
    doscientos: 200,
    trescientos: 300,
    cuatrocientos: 400,
    quinientos: 500,
    seiscientos: 600,
    setecientos: 700,
    ochocientos: 800,
    novecientos: 900,
  };
  if (base[t] !== undefined) return base[t];
  if (hundreds[t] !== undefined) return hundreds[t];
  const tokens = t.split(/\s+/).filter(Boolean);
  let sum = 0;
  for (const tok of tokens) {
    if (tok === 'y') continue;
    if (hundreds[tok] !== undefined) {
      sum += hundreds[tok];
      continue;
    }
    if (base[tok] !== undefined) {
      sum += base[tok];
      continue;
    }
    return null;
  }
  return sum > 0 ? sum : null;
}

/**
 * Parser principal de lenguaje natural → intención estructurada.
 *
 * Recorre el texto normalizado y detecta patrones comunes de
 * conversación para el dominio de catálogo y carrito.
 *
 * Orden de evaluación:
 * 1. Nombre del usuario (set/ask).
 * 2. Saludos simples (greet).
 * 3. Intenciones vagas sobre carrito.
 * 4. Mostrar/vaciar/crear/pagar carrito.
 * 5. Paginación de catálogo.
 * 6. Ver producto por código.
 * 7. Agregar/actualizar/eliminar ítems (por ID, cantidad o descripción).
 * 8. Búsqueda general en catálogo.
 * 9. Fallback a `unknown`.
 *
 * Notas:
 * - Los códigos se normalizan con `padStart(3, "0")` para la API interna.
 * - La visualización al usuario elimina ceros a la izquierda en `index.ts`.
 *
 * @param text Texto libre ingresado por el usuario.
 * @returns `ParsedIntent` con `intent` y `params` listos para tools.
 */
export function parseIntent(text: string): ParsedIntent {
  const raw = text || "";
  const t = normalize(raw);

  // ==============================
  // 1) MANEJO DE NOMBRE DEL USUARIO
  // ==============================

  // Ejemplos: "me llamo facundo", "mi nombre es facundo", "soy facundo"
  const nameMatch =
    t.match(/\bme llamo\s+([a-záéíóúñ ]+)/i) ||
    t.match(/\bmi nombre es\s+([a-záéíóúñ ]+)/i) ||
    t.match(/\bsoy\s+([a-záéíóúñ ]+)/i);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    return {
      intent: "set_name",
      params: { name },
    };
  }

  const nameOnly = t.replace(/[^a-záéíóúñ ]/g, "").trim();
  const isGreetingOnly = /^(hola+!?|buenas+!?|buen dia+!?|buenos dias+!?|buenas tardes+!?|buenas noches+!?)[\s!,.]*$/.test(
    nameOnly,
  );
  const isAskNameMsg = /\bcomo me llamo\b/.test(nameOnly.replace(/[¿?]/g, ""));
  if (
    nameOnly &&
    /^[a-záéíóúñ]{2,}(?: [a-záéíóúñ]{2,}){0,2}$/.test(nameOnly) &&
    !isGreetingOnly &&
    !isAskNameMsg
  ) {
    const hasProductWord = /\b(remera|remeras|camiseta|chomba|musculosa|buzo|buzos|hoodie|sudadera|campera|chaqueta|pantalon|pantalones|jogging|jogger|jean|jeans|short|shorts|bermuda|bermudas|zapatilla|zapatillas|calzado|sneakers|vestido|vestidos)\b/.test(
      nameOnly,
    );
    const hasSearchVerb = /\b(busco|buscar|necesito|quiero|mostra(?:me)?|muestra(?:me)?|mostrar(?:me)?|ver)\b/.test(
      nameOnly,
    );
    const hasActionVerb = /\b(elimin[aoá]|borr[aoá]|quit[aoá]|sac[aoá]|agreg[aoá]|agregar|sum[aoá]|sumar|pon[ei]|poner)\b/.test(
      nameOnly,
    );
    const hasCatalogWord = /\b(catalogo|cat[aá]logo|productos?|prendas?)\b/.test(
      nameOnly,
    );
    const hasCartWord = /\b(carrito|carro)\b/.test(nameOnly);
    if (!hasProductWord && !hasSearchVerb && !hasCatalogWord && !hasActionVerb && !hasCartWord) {
      return { intent: "set_name", params: { name: nameOnly } };
    }
  }

  // "como me llamo?"
  if (/\bcomo me llamo\b/.test(t.replace(/[¿?]/g, ""))) {
    return {
      intent: "ask_name",
      params: {},
    };
  }

  // ==============================
  // 2) SALUDOS BÁSICOS (DEJAR A GEMINI)
  // ==============================
  // Reconoce saludos sueltos y deriva a intent `greet`.
  const greetingRegex =
    /^(hola+!?|buenas+!?|buen dia+!?|buenos dias+!?|buenas tardes+!?|buenas noches+!?)[\s!,.]*$/;
  if (greetingRegex.test(t)) {
    return {
      intent: "greet",
      params: {},
    };
  }

  // ==============================
  // 3) INTENCIONES VAGAS DE CARRITO
  // ==============================
  // Frases tipo:
  //  - "quiero agregar más productos"
  //  - "quiero agregar más productos a mi carrito"
  //  - "quiero eliminar productos"
  // Sin ID/cantidad → devolvemos intents guía para que el agente oriente.

  const genericAddMoreRegex = /\b(agreg(?:ar|[aoá])|sum(?:ar|[aoá])|pon(?:er|[ei])|añad(?:ir|[aoá]))\b.*\b(nuevo|nueva|nuevos|nuevas)?\s+productos?\b/;
  const genericRemoveProductsRegex = /\b(elimin(?:ar|[aoá])|borr(?:ar|[aoá])|sac(?:ar|[aoá])|quit(?:ar|[aoá]))\b.*\bproductos?\b/;

  if (genericAddMoreRegex.test(t)) {
    return { intent: "list_products", params: {} };
  }
  if (genericRemoveProductsRegex.test(t)) {
    return { intent: "show_cart", params: {} };
  }

  // ==============================
  // 4) VER CARRO / CARRITO
  // ==============================
  // Variantes de verbo + objeto (carrito/carro/cesta/canasta).
  if (
    /\b(ver|mostra(?:me)?|muestra(?:me)?|mostrar(?:me)?)\b.*\b(mi\s+)?(carrito|carro|cesta|canasta)\b/.test(t) ||
    /^carrito$/.test(t) ||
    /\bcual es mi carrito\b/.test(t.replace(/[¿?]/g, ""))
  ) {
    return {
      intent: "show_cart",
      params: {},
    };
  }

  // ==============================
  // 5) VACIAR CARRITO COMPLETO
  // ==============================
  // Diferentes expresiones para vaciar todo el carrito.
  const clearCartDirect = /\b(vacia|vaciar)\b.*\b(carrito|carro)\b/.test(t);
  const clearCartAll = /\b(elimina|eliminar|borra|borrar|quita|quitar|saca|sacar)\b.*\b(todo(s)?|todo el|todo mi)\b.*\b(carrito|carro)\b/.test(t);
  const clearCartShort = /\b(borra|borrar|elimina|eliminar|quitar|quita|sacar|saca)\b\s+(mi\s+)?(carrito|carro)\b/.test(t);
  if (clearCartDirect || clearCartAll || clearCartShort) {
    return {
      intent: "clear_cart",
      params: {},
    };
  }

  // Crear nuevo carrito (abrir/armar/crear + "carrito nuevo")
  const createCartMatch =
    /\b(crear|armar|abrir)\b.*\b(carrito|carro)\b.*\b(nuevo)\b/.test(t) ||
    /\b(nuevo)\b\s+(carrito|carro)\b/.test(t) ||
    /\b(carrito|carro)\b\s+(nuevo)\b/.test(t) ||
    /\b(crear)\b\s+(carrito|carro)\b/.test(t);
  if (createCartMatch) {
    return { intent: "create_cart", params: {} };
  }

  // Pagar carrito (pagar/checkout/finalizar/completar)
  const payCartMatch = /\b(quiero|deseo|me\s+gustaria)\b.*\b(pagar|checkout|finalizar|completar)\b/.test(t) || /\b(pagar|checkout|finalizar|completar)\b/.test(t);
  if (payCartMatch) {
    return { intent: "pay_cart", params: {} };
  }

  const addNewProductGeneric = /(agreg[aoá]|sum[aoá]|pon[ei]|añad[aoá])\s+(nuevo|nueva|nuevos|nuevas)?\s+producto(s)?\b/.test(t);
  if (addNewProductGeneric) {
    return {
      intent: "list_products",
      params: {},
    };
  }

  // ==============================
  // 6) PAGINACIÓN: "ver página 2", "pág 3"
  // ==============================
  const pageMatch =
    t.match(/\bpagina\s+(\d+)\b/) || t.match(/\bp[aá]g\s+(\d+)\b/);
  if (pageMatch) {
    const page = parseInt(pageMatch[1], 10) || 1;
    return {
      intent: "paginate",
      params: { page },
    };
  }

  // ==============================
  // 7) VER DETALLE DE PRODUCTO: "ver 001", "mostrame el 23"
  // ==============================
  // Pad a 3 dígitos para consumo interno de la API.
  const viewMatch =
    t.match(/\bver\s+(?:el+|la+|los+|las+)?\s*(\d{1,4})\b/) ||
    t.match(/\bmostra(?:me)?\s+(?:el+|la+|los+|las+)\s+(\d{1,4})\b/) ||
    t.match(/\bmostrame\s+(?:el+|la+|los+|las+)?\s*(\d{1,4})\b/) ||
    t.match(/\bmuestra(?:me)?\s+(?:el+|la+|los+|las+)\s+(\d{1,4})\b/) ||
    t.match(/\bmuestr(?:a)?me\s+(?:el+|la+|los+|las+)\s+(\d{1,4})\b/) ||
    t.match(/\bmuestrame\s+(?:el+|la+|los+|las+)?\s*(\d{1,4})\b/);
  if (viewMatch) {
    const id = viewMatch[1].padStart(3, "0");
    return {
      intent: "view_product",
      params: { id },
    };
  }

  // Número solo: puede ser índice del listado actual o un ID
  const onlyNumber = t.match(/^\s*(\d{1,4})\s*$/);
  if (onlyNumber) {
    return { intent: "numeric_input", params: { number: onlyNumber[1] } };
  }

  // Número en palabras solo: cantidad sin unidades explícitas.
  const onlyWordsQty = t.match(/^\s*([a-záéíóúñ\s]+)\s*$/);
  if (onlyWordsQty) {
    const n = wordToNumber(onlyWordsQty[1]);
    if (n !== null) {
      return { intent: "numeric_input", params: { number: String(n) } };
    }
  }

  // ==============================
  // 8) AGREGAR AL CARRITO
  // ==============================
  // Soporta cantidad numérica o en palabras, con y sin ID explícito,
  // y agregar por descripción (tipo/color/talle).

  // Ejemplos: "agregá 10 del 023", "agrega 20 del 1", "sumame 5 del 100"
  const addMatch = t.match(
    /(agreg[aoá]|sum[aoá]|pon[ei]|añad(?:ir|[ei]))\s+(\d{1,4}|[a-záéíóúñ\s]+)\s+(del|de[l]?|codig[oa])\s*(\d{1,4})\b/,
  );
  if (addMatch) {
    const qToken = addMatch[2];
    const quantity = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    const id = addMatch[4].padStart(3, "0");
    return {
      intent: "add_to_cart",
      params: { id, quantity },
    };
  }

  // "agrega 20" sin ID explícito → se resuelve por contexto (último visto)
  const addNoIdMatch = t.match(
    /(agreg[aoá]|sum[aoá]|pon[ei]|añad(?:ir|[ei]))\s+(\d{1,4}|[a-záéíóúñ\s]+)\b(?!.*\b(del|de[l]?|codig[oa])\b)/,
  );
  if (addNoIdMatch) {
    const qToken = addNoIdMatch[2];
    const quantity = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    return {
      intent: "add_to_cart",
      params: { quantity }, // id se resuelve por contexto en index.ts
    };
  }

  // "agrega 20 de pantalón verde" → cantidad + descripción
  const addQtyDesc = t.match(
    /(agreg[aoá]|sum[aoá]|pon[ei]|añad(?:ir|[ei]))\s+(\d{1,4}|[a-záéíóúñ\s]+)\s+de\s+([a-záéíóúñ\s]+)$/,
  );
  if (addQtyDesc) {
    const qToken = addQtyDesc[2];
    const quantity = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    const q = addQtyDesc[3];
    if (quantity > 0) {
      return {
        intent: "add_to_cart",
        params: { quantity, q },
      };
    }
  }

  // "agrega la 17 a mi carrito" → ID sin cantidad
  const addIdOnlyMatch = t.match(
    /(agreg[aoá]|sum[aoá]|pon[ei]|añad(?:ir|[ei]))\s+(la|el)?\s*(\d{1,4})(\s+a\s+mi\s+(carrito|carro))?/
  );
  if (addIdOnlyMatch) {
    const id = addIdOnlyMatch[3].padStart(3, "0");
    return {
      intent: "add_to_cart",
      params: { id },
    };
  }

  // "20 unidades" → cantidad sola
  const hasRemoveVerbEarly = /(elimin[aoá]|borr[aoá]|quit[aoá]|sac[aoá])\b/.test(t);
  const qtyOnlyMatch = !hasRemoveVerbEarly && t.match(/\b(\d{1,4}|[a-záéíóúñ\s]+)\s+(unidades?|u)\b/);
  if (qtyOnlyMatch) {
  const qToken = qtyOnlyMatch[1];
  const quantity = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    return {
      intent: "add_to_cart",
      params: { quantity },
    };
  }

  // Agregar por descripción sin ID ni cantidad explícitos
  const addByDescription =
    /(agreg[aoá]|sum[aoá]|pon[ei])\b/.test(t) &&
    !/\b\d{1,4}\b/.test(t) &&
    /\b(remera|remeras|camiseta|chomba|musculosa|buzo|hoodie|sudadera|campera|chaqueta|pantalon|pantalones|jean|short|bermuda|color|talle|size|medida|m|s|l|xl|xxl)\b/.test(
      t,
    );
  if (addByDescription) {
    return {
      intent: "add_to_cart",
      params: { q: raw },
    };
  }

  // ==============================
  // 9) ACTUALIZAR CANTIDAD: "cambiá a 5 unidades del 092"
  // ==============================
  const updateMatch = t.match(
    /(cambi[aoá]|modific[aoá]|actualiz[aoá])\s+(a\s+)?(\d{1,4}|[a-záéíóúñ\s]+)\s+(unidades?|u)?\s*(del|de[l]?)\s*(\d{1,4})\b/,
  );
  if (updateMatch) {
  const qToken = updateMatch[3];
  const quantity = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    const id = updateMatch[6].padStart(3, "0");
    return {
      intent: "update_cart_item",
      params: { id, quantity },
    };
  }

  // ==============================
  // 10) ELIMINAR DEL CARRITO: por ID, cantidad e incluso descripción.
  // ==============================
  const removeVerbPresent = /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\b/.test(t);
  if (removeVerbPresent) {
    const nums = t.match(/\b\d{1,4}\b/g);
    if (nums && nums.length > 1) {
      return {
        intent: "remove_from_cart",
        params: { ids: nums.map((n) => n.padStart(3, "0")) },
      };
    }
  }
  const removeMatch = t.match(
    /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\s+(el\s+)?(\d{1,4})\s+(del|de[l] )?\s*(carrito|carro)?/
  );
  if (removeMatch) {
    const id = removeMatch[3].padStart(3, "0");
    return {
      intent: "remove_from_cart",
      params: { id },
    };
  }

  const removeMatchAlt = t.match(
    /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])(?:\s+(del|de[l]?))?\s*(carrito|carro)?\s*(\d{1,4})\b/
  );
  if (removeMatchAlt) {
    const id = removeMatchAlt[4].padStart(3, "0");
    return {
      intent: "remove_from_cart",
      params: { id },
    };
  }

  const removeQtyIdMatch = t.match(
    /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\s+(\d{1,4}|[a-záéíóúñ\s]+)\s+(del|de[l]?)\s*(\d{1,4})\b/
  );
  if (removeQtyIdMatch) {
  const qToken = removeQtyIdMatch[2];
  const qty = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    const id = removeQtyIdMatch[4].padStart(3, "0");
    return {
      intent: "remove_from_cart",
      params: { id, removeQty: qty },
    };
  }

  const removeByCode = t.match(
    /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\s+(el\s+)?(producto|prenda)?\s*(con\s+)?(c[oó]digo|id)\s*(\d{1,4})\b/
  );
  if (removeByCode) {
    const id = removeByCode[6].padStart(3, "0");
    return {
      intent: "remove_from_cart",
      params: { id },
    };
  }

  const removeIdThenVerb = t.match(
    /(?:el\s+)?(?:producto|prenda)?\s*(\d{1,4})\s*(?:del\s+(?:carrito|carro))?\s*(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\b/
  );
  if (removeIdThenVerb) {
    const id = removeIdThenVerb[1].padStart(3, "0");
    return {
      intent: "remove_from_cart",
      params: { id },
    };
  }

  const removeTextual = /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\b/.test(t) && !/\d{1,4}/.test(t);
  if (removeTextual) {
    return {
      intent: "remove_from_cart",
      params: { q: raw },
    };
  }

  const removeQtyTextual = t.match(
    /(elimin[aoá]|sac[aoá]|quit[aoá]|borr[aoá])\s+(\d{1,4}|[a-záéíóúñ\s]+)\b/
  );
  if (removeQtyTextual) {
  const qToken = removeQtyTextual[2];
  const qty = /\d/.test(qToken) ? parseInt(qToken, 10) || 0 : wordToNumber(qToken) || 0;
    return {
      intent: "remove_from_cart",
      params: { q: raw, removeQty: qty },
    };
  }

  // ==============================
  // 11) BÚSQUEDA EN CATÁLOGO (list_products)
  // ==============================
  // Detecta verbos de búsqueda y palabras típicas de prendas.
  const hasSearchVerb = /\b(busco|buscar|buscando|necesito|quiero|tene?s|tiene?s|mostra(?:me)?|muestra(?:me)?|mostrar(?:me)?|ver|ensenar|ensename)\b/.test(
    t,
  );

  const hasProductWord = /\b(remera|remeras|camiseta|chomba|musculosa|buzo|buzos|hoodie|sudadera|campera|chaqueta|pantalon|pantalones|jogging|jogger|jean|jeans|short|shorts|bermuda|bermudas|zapatilla|zapatillas|calzado|sneakers|vestido|vestidos|media|medias|soquete|soquetes|calcetin|calcetines|calceta|calcetas)\b/.test(
    t,
  );

  const hasCatalogWord =
    /\b(catalogo|cat[aá]logo|productos?|prendas?)\b/.test(t);

  if (hasSearchVerb || hasProductWord || hasCatalogWord) {
    return {
      intent: "list_products",
      params: { q: raw },
    };
  }

  // ==============================
  // 12) INTENT DESCONOCIDO → QUE CONTESTE GEMINI
  // ==============================
  return {
    intent: "unknown",
    params: {},
  };
}
