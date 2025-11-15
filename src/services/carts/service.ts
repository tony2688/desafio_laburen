import { prisma } from "../../infra/prisma/client";

type ItemInput = { productId: string; quantity: number };

export const CartsService = {
  async getActiveCart(whatsappUserId: string) {
    return prisma.cart.findFirst({
      where: { whatsappUserId, status: "OPEN" },
      include: { items: true },
    });
  },
  async getOrCreateOpenCart(whatsappUserId: string) {
    const existing = await prisma.cart.findFirst({
      where: { whatsappUserId, status: "OPEN" },
      include: { items: true },
    });
    if (existing) return existing;
    return prisma.cart.create({
      data: { whatsappUserId, status: "OPEN", currency: "ARS" },
      include: { items: true },
    });
  },
  async addItems(cartId: string, items: ItemInput[]) {
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });
    if (!cart || cart.status !== "OPEN") {
      throw new Error("cart_not_open");
    }
    for (const it of items) {
      const product = await prisma.product.findUnique({ where: { id: it.productId } });
      if (!product || !product.isAvailable || product.availableQuantity < it.quantity) {
        throw new Error("stock_insufficient");
      }
      const existing = cart.items.find((ci) => ci.productId === it.productId);
      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + it.quantity,
            subtotal: (existing.quantity + it.quantity) * Number(existing.unitPrice),
          },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId,
            productId: it.productId,
            productNameSnapshot: product.type + " " + product.size + " " + product.color,
            unitPrice: product.price50,
            quantity: it.quantity,
            subtotal: Number(product.price50) * it.quantity,
          },
        });
      }
    }
    return this.recalcTotals(cartId);
  },
  async updateItems(
    cartId: string,
    ops: {
      addItems?: ItemInput[];
      updateItems?: ItemInput[];
      removeItems?: { productId: string }[];
    }
  ) {
    const cart = await prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart || cart.status !== "OPEN") {
      throw new Error("cart_not_open");
    }
    if (ops.addItems) {
      await this.addItems(cartId, ops.addItems);
    }
    if (ops.updateItems) {
      for (const it of ops.updateItems) {
        const product = await prisma.product.findUnique({ where: { id: it.productId } });
        if (!product || product.availableQuantity < it.quantity) {
          throw new Error("stock_insufficient");
        }
        const ci = await prisma.cartItem.findFirst({ where: { cartId, productId: it.productId } });
        if (!ci) {
          continue;
        }
        await prisma.cartItem.update({
          where: { id: ci.id },
          data: { quantity: it.quantity, subtotal: Number(ci.unitPrice) * it.quantity },
        });
      }
    }
    if (ops.removeItems) {
      for (const r of ops.removeItems) {
        const ci = await prisma.cartItem.findFirst({ where: { cartId, productId: r.productId } });
        if (!ci) {
          continue;
        }
        await prisma.cartItem.delete({ where: { id: ci.id } });
      }
    }
    return this.recalcTotals(cartId);
  },
  async recalcTotals(cartId: string) {
    const items = await prisma.cartItem.findMany({ where: { cartId } });
    const subtotal = items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    const cart = await prisma.cart.update({
      where: { id: cartId },
      data: { subtotal, total: subtotal },
      include: { items: true },
    });
    return cart;
  },
};