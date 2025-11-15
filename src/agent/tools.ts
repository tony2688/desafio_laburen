import axios from "axios";

const base = process.env.BASE_URL || "http://localhost:3000";

export const tools = {
  async getProducts(params: {
    q?: string;
    page?: number;
    page_size?: number;
  }) {
    const res = await axios.get(base + "/products", { params });
    return res.data;
  },
  async getProductById(params: { id: string }) {
    const res = await axios.get(base + "/products/" + params.id);
    return res.data;
  },
  async getCart(params: { whatsappUserId: string }) {
    const res = await axios.get(base + "/carts", {
      params: { whatsappUserId: params.whatsappUserId, status: "OPEN" },
    });
    return res.data;
  },
  async createCart(params: {
    whatsappUserId: string;
    items?: { productId: string; quantity: number }[];
  }) {
    const res = await axios.post(base + "/carts", params);
    return res.data;
  },
  async updateCart(params: {
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
  },
};
