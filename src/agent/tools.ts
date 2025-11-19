// helpers que llaman a nuestra API usando axios
import axios from "axios";

const base =
  process.env.BASE_URL ||
  `http://localhost:${process.env.PORT ? String(process.env.PORT) : "3000"}`;

// listar productos con filtros
export async function getProducts(params: {
  q?: string;
  page?: number;
  page_size?: number;
}) {
  const res = await axios.get(base + "/products", { params });
  return res.data;
}

// detalle de producto por id
export async function getProductById(params: { id: string }) {
  const res = await axios.get(base + "/products/" + params.id);
  return res.data;
}

// obtener carrito por usuario
export async function getCart(params: { whatsappUserId: string; status?: string }) {
  const res = await axios.get(base + "/carts", {
    params: { whatsappUserId: params.whatsappUserId, status: params.status ?? "OPEN" },
  });
  return res.data;
}

// crear carrito y agregar items
export async function createCart(params: {
  whatsappUserId: string;
  items?: { productId: string; quantity: number }[];
}) {
  const res = await axios.post(base + "/carts", params);
  return res.data;
}

// actualizar cantidades o eliminar items
export async function updateCart(params: {
  cartId: string;
  addItems?: { productId: string; quantity: number }[];
  updateItems?: { productId: string; quantity: number }[];
  removeItems?: { productId: string }[];
}) {
  const res = await axios.patch(base + "/carts/" + params.cartId, {
    addItems: params.addItems,
    updateItems: params.updateItems,
    removeItems: params.removeItems,
  });
  return res.data;
}
