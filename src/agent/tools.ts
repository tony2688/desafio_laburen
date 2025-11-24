// src/agent/tools.ts
// Helpers que llaman a nuestra API usando axios

import axios from 'axios';

const base =
  process.env.BASE_URL ||
  `http://localhost:${process.env.PORT ? String(process.env.PORT) : '3000'}`;

/**
 * Lista productos con filtros de texto/paginación.
 *
 * @param params `{ q?, page?, page_size? }`.
 * @returns `{ items, page, page_size, total }`.
 */
export async function getProducts(params: {
  q?: string;
  page?: number;
  page_size?: number;
}) {
  const res = await axios.get(base + '/products', { params });
  return res.data;
}

/**
 * Obtiene detalle de producto por ID.
 *
 * @param params `{ id }`.
 * @returns Producto completo.
 */
export async function getProductById(params: { id: string }) {
  const res = await axios.get(base + '/products/' + params.id);
  return res.data;
}

/**
 * Obtiene carrito por usuario (status OPEN por defecto).
 *
 * @param params `{ whatsappUserId, status? }`.
 * @returns Carrito con items.
 */
export async function getCart(params: {
  whatsappUserId: string;
  status?: string;
}) {
  const res = await axios.get(base + '/carts', {
    params: {
      whatsappUserId: params.whatsappUserId,
      status: params.status ?? 'OPEN',
    },
  });
  return res.data;
}

/**
 * Crea carrito OPEN y opcionalmente agrega ítems iniciales.
 *
 * @param params `{ whatsappUserId, items? }`.
 * @returns Carrito creado/recuperado.
 */
export async function createCart(params: {
  whatsappUserId: string;
  items?: { productId: string; quantity: number }[];
}) {
  const res = await axios.post(base + '/carts', params);
  return res.data;
}

/**
 * Edita carrito: agregar, actualizar o eliminar ítems.
 *
 * @param params `{ cartId, addItems?, updateItems?, removeItems? }`.
 * @returns Carrito actualizado.
 */
export async function updateCart(params: {
  cartId: string;
  addItems?: { productId: string; quantity: number }[];
  updateItems?: { productId: string; quantity: number }[];
  removeItems?: { productId: string }[];
}) {
  const res = await axios.patch(base + '/carts/' + params.cartId, {
    addItems: params.addItems,
    updateItems: params.updateItems,
    removeItems: params.removeItems,
  });
  return res.data;
}
