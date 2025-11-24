// src/agent/contextStore.ts

/**
 * Contexto por usuario de WhatsApp mantenido en memoria (Map).
 *
 * Campos clave usados por el agente:
 * - `lastQuery`, `lastPage`, `lastPageSize`: estado de catálogo.
 * - `lastViewedProductId`: último producto consultado.
 * - `activeCartId`: carrito en edición.
 * - `userName`, `hasAskedName`, `lastGreetAt`: manejo de saludo/nombre.
 * - `pendingAddProductId`: flujo de agregado esperando cantidad.
 */
export type UserContext = {
  lastQuery?: string;
  lastPage?: number;
  lastPageSize?: number;
  lastViewedProductId?: string;
  activeCartId?: string;
  userName?: string;
  hasAskedName?: boolean;
  lastGreetAt?: number;
  pendingAddProductId?: string;
};

const store = new Map<string, UserContext>();

/**
 * Obtiene (o inicializa) el contexto del usuario.
 *
 * @param whatsappUserId Clave única de conversación.
 * @returns Contexto actual.
 */
export function getUserContext(whatsappUserId: string): UserContext {
  const key = String(whatsappUserId);
  const existing = store.get(key);
  if (existing) return existing;
  const ctx: UserContext = {};
  store.set(key, ctx);
  return ctx;
}

/**
 * Actualiza el contexto del usuario con un `partial`.
 *
 * @param whatsappUserId Clave de conversación.
 * @param partial Campos a fusionar.
 */
export function setUserContext(
  whatsappUserId: string,
  partial: Partial<UserContext>,
): void {
  const key = String(whatsappUserId);
  const prev = store.get(key) ?? {};
  const next: UserContext = { ...prev, ...partial };
  store.set(key, next);
}
