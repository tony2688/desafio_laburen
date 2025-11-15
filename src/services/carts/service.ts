import { prisma } from "../../infra/prisma/client";
import type { Product } from "@prisma/client";

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
      if (!product || !product.isAvailable) {
        throw new Error("stock_insufficient");
      }
      const existing = cart.items.find((ci) => ci.productId === it.productId);
      const newQuantity = (existing?.quantity || 0) + it.quantity;
      if (product.availableQuantity < newQuantity) {
        throw new Error("stock_insufficient");
      }
      const unitPrice = getUnitPriceForQuantity(product, newQuantity);
      const subtotal = Number(unitPrice) * newQuantity;
      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            unitPrice,
            subtotal,
          },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId,
            productId: it.productId,
            productNameSnapshot: product.type + " " + product.size + " " + product.color,
            unitPrice,
            quantity: newQuantity,
            subtotal,
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
        if (!product) {
          throw new Error("stock_insufficient");
        }
        if (product.availableQuantity < it.quantity) {
          throw new Error("stock_insufficient");
        }
        const ci = await prisma.cartItem.findFirst({ where: { cartId, productId: it.productId } });
        if (!ci) {
          continue;
        }
        const unitPrice = getUnitPriceForQuantity(product, it.quantity);
        await prisma.cartItem.update({
          where: { id: ci.id },
          data: {
            quantity: it.quantity,
            unitPrice,
            subtotal: Number(unitPrice) * it.quantity,
          },
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

function getUnitPriceForQuantity(product: Product, quantity: number) {
  if (quantity < 50) return product.price50;
  if (quantity < 100) return product.price100;
  return product.price200;
}