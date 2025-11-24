// servicio de carritos: toda la lógica de CRUD con prisma
import { prisma } from "../../infra/prisma/client";

// uso un tipo local mínimo para precios, evitando depender de tipos generados
type ProductPrice = { price50: any; price100: any; price200: any };

type ItemInput = { productId: string; quantity: number };

export const CartsService = {
  /**
   * Obtiene el carrito OPEN para un usuario (si existe).
   *
   * @param whatsappUserId ID de usuario de WhatsApp.
   * @returns Carrito con items o `null`.
   */
  async getActiveCart(whatsappUserId: string) {
    // busca el carrito OPEN para el usuario
    return prisma.cart.findFirst({
      where: { whatsappUserId, status: "OPEN" },
      include: { items: true },
    });
  },

  /**
   * Recupera el carrito OPEN o crea uno nuevo si no existe.
   *
   * @param whatsappUserId ID de usuario de WhatsApp.
   * @returns Carrito en estado OPEN.
   */
  async getOrCreateOpenCart(whatsappUserId: string) {
    // si ya tiene carrito OPEN lo devuelve, sino crea uno nuevo
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

  /**
   * Agrega o suma cantidades de items al carrito, recalculando precios.
   *
   * - Tolera IDs con ceros a la izquierda.
   * - Valida stock contra cantidad acumulada.
   * - Actualiza `unitPrice` por escalas (50/100/200) y `subtotal`.
   *
   * @param cartId ID del carrito.
   * @param items Lista de `{ productId, quantity }`.
   * @returns Carrito actualizado (totales recalculados).
   */
  async addItems(cartId: string, items: ItemInput[]) {
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true },
    });

    if (!cart || cart.status !== "OPEN") {
      // se mapea en el errorHandler a 409 cart_not_open
      throw new Error("cart_not_open");
    }

    // snapshot de items actuales del carrito
    const itemsInCart = cart.items as Array<{
      id: string;
      productId: string;
      quantity: number;
      subtotal: any;
      unitPrice: any;
    }>;

    for (const it of items) {
      const provided = String(it.productId);
      const pidNorm = provided.replace(/^0+/, "");
      const product =
        (await prisma.product.findUnique({ where: { id: provided } })) ||
        (await prisma.product.findUnique({ where: { id: pidNorm } }));

      // si no existe o no tiene stock lo tratamos como falta de stock
      if (!product || Number(product.availableQuantity) <= 0) {
        throw new Error("stock_insufficient");
      }

      // cantidad actual (si ya existe ese producto en el carrito)
      const existing = itemsInCart.find(
        (ci) => ci.productId === provided || ci.productId === pidNorm,
      );
      const newQuantity = (existing?.quantity || 0) + it.quantity;

      // validación de stock
      if (product.availableQuantity < newQuantity) {
        throw new Error("stock_insufficient");
      }

      const unitPrice = getUnitPriceForQuantity(product, newQuantity);
      const subtotal = Number(unitPrice) * newQuantity;

      if (existing) {
        // actualizo item existente
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            unitPrice,
            subtotal,
          },
        });
        // también actualizo el snapshot en memoria para que
        // otras iteraciones vean la cantidad actualizada
        existing.quantity = newQuantity;
        existing.unitPrice = unitPrice;
        existing.subtotal = subtotal;
      } else {
        // creo item nuevo
        const created = await prisma.cartItem.create({
          data: {
            cartId,
            productId: String(product.id),
            productNameSnapshot:
              product.type + " " + product.size + " " + product.color,
            unitPrice,
            quantity: newQuantity,
            subtotal,
          },
        });

        // lo agrego al snapshot local para usos posteriores en este mismo loop
        itemsInCart.push({
          id: created.id,
          productId: created.productId,
          quantity: created.quantity,
          unitPrice: created.unitPrice,
          subtotal: created.subtotal,
        });
      }
    }

    return this.recalcTotals(cartId);
  },

  /**
   * Aplica operaciones de actualización sobre items del carrito.
   *
   * - `addItems`: suma cantidades (delegado a `addItems`).
   * - `updateItems`: fija cantidad exacta, validando stock.
   * - `removeItems`: elimina por `productId` tolerando ceros.
   *
   * @param cartId ID del carrito.
   * @param ops Operaciones a realizar.
   * @returns Carrito actualizado (totales recalculados).
   */
  async updateItems(
    cartId: string,
    ops: {
      addItems?: ItemInput[];
      updateItems?: ItemInput[];
      removeItems?: { productId: string }[];
    },
  ) {
    const cart = await prisma.cart.findUnique({ where: { id: cartId } });

    if (!cart || cart.status !== "OPEN") {
      throw new Error("cart_not_open");
    }

    // sumar cantidades (misma lógica que addItems)
    if (ops.addItems && ops.addItems.length > 0) {
      await this.addItems(cartId, ops.addItems);
    }

    // actualizar cantidad exacta de ítems existentes
    if (ops.updateItems && ops.updateItems.length > 0) {
      for (const it of ops.updateItems) {
        const provided = String(it.productId);
        const pidNorm = provided.replace(/^0+/, "");
        const product =
          (await prisma.product.findUnique({ where: { id: provided } })) ||
          (await prisma.product.findUnique({ where: { id: pidNorm } }));

        if (!product || Number(product.availableQuantity) <= 0) {
          throw new Error("stock_insufficient");
        }

        if (product.availableQuantity < it.quantity) {
          throw new Error("stock_insufficient");
        }

        const ci = await prisma.cartItem.findFirst({
          where: {
            cartId,
            OR: [{ productId: provided }, { productId: pidNorm }],
          },
        });

        // si no existe el item en el carrito, simplemente lo ignoro
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

    // eliminar ítems por productId
    if (ops.removeItems && ops.removeItems.length > 0) {
      for (const r of ops.removeItems) {
        const provided = String(r.productId);
        const pidNorm = provided.replace(/^0+/, "");
        const ci = await prisma.cartItem.findFirst({
          where: {
            cartId,
            OR: [{ productId: provided }, { productId: pidNorm }],
          },
        });
        if (!ci) {
          continue;
        }
        await prisma.cartItem.delete({ where: { id: ci.id } });
      }
    }

    return this.recalcTotals(cartId);
  },

  /**
   * Recalcula `subtotal` y `total` del carrito a partir de sus items.
   *
   * Por ahora `total = subtotal` (sin envíos ni descuentos).
   *
   * @param cartId ID del carrito.
   * @returns Carrito con items y totales actualizados.
   */
  async recalcTotals(cartId: string) {
    const items = await prisma.cartItem.findMany({ where: { cartId } });

    const subtotal = items.reduce(
      (acc: number, it: { subtotal: any }) => acc + Number(it.subtotal),
      0,
    );

    const cart = await prisma.cart.update({
      where: { id: cartId },
      data: {
        subtotal,
        total: subtotal, // por ahora total = subtotal (sin envíos ni descuentos)
      },
      include: { items: true },
    });

    return cart;
  },

  /**
   * Vacía por completo el carrito en estado OPEN.
   *
   * @param cartId ID del carrito.
   * @returns Carrito con totales en cero y sin items.
   */
  async clearCart(cartId: string) {
    const cart = await prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart || cart.status !== "OPEN") {
      throw new Error("cart_not_open");
    }
    await prisma.cartItem.deleteMany({ where: { cartId } });
    const updated = await prisma.cart.update({
      where: { id: cartId },
      data: { subtotal: 0, total: 0 },
      include: { items: true },
    });
    return updated;
  },

  /**
   * Valida consistencia de carritos e items.
   *
   * - Moneda ARS en carritos OPEN.
   * - `total` coincide con suma de `subtotal`.
   * - `unitPrice` y `subtotal` alineados a regla de escalas.
   *
   * @returns Resumen de issues encontrados.
   */
  async validateCarts() {
    const carts = await prisma.cart.findMany({ include: { items: true } });
    const issues: { cartId: string; type: string; field?: string; value?: any; message: string }[] = [];
    for (const c of carts as any[]) {
      if (c.status === 'OPEN' && String(c.currency).toUpperCase() !== 'ARS') {
        issues.push({ cartId: c.id, type: 'cart', field: 'currency', value: c.currency, message: 'Moneda distinta de ARS' });
      }
      const sum = (c.items || []).reduce((acc: number, it: any) => acc + Number(it.subtotal || 0), 0);
      if (Math.abs(Number(c.total) - sum) > 0.0001) {
        issues.push({ cartId: c.id, type: 'cart', field: 'total', value: c.total, message: 'Total no coincide con suma de subtotales' });
      }
      for (const it of c.items || []) {
        const product = await prisma.product.findUnique({ where: { id: String(it.productId) } });
        if (!product) {
          issues.push({ cartId: c.id, type: 'cart_item', field: 'productId', value: it.productId, message: 'Item referencia producto inexistente' });
        } else {
          const unitPriceExpected = getUnitPriceForQuantity(product as any, Number(it.quantity));
          if (String(unitPriceExpected) !== String(it.unitPrice)) {
            issues.push({ cartId: c.id, type: 'cart_item', field: 'unitPrice', value: it.unitPrice, message: 'unitPrice no coincide con regla de escalas' });
          }
          const subtotalExpected = Number(unitPriceExpected) * Number(it.quantity);
          if (Math.abs(subtotalExpected - Number(it.subtotal)) > 0.0001) {
            issues.push({ cartId: c.id, type: 'cart_item', field: 'subtotal', value: it.subtotal, message: 'subtotal no coincide con unitPrice * quantity' });
          }
        }
      }
    }
    return { total: carts.length, issues };
  },
};

/**
 * Regla de precios por escala de cantidad.
 *
 * @param product Precios del producto.
 * @param quantity Cantidad deseada.
 * @returns Precio unitario correspondiente.
 */
function getUnitPriceForQuantity(product: ProductPrice, quantity: number) {
  if (quantity < 50) return product.price50;
  if (quantity < 100) return product.price100;
  return product.price200;
}
