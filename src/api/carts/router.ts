// router de carritos (crear, ver y editar)
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CartsService } from "../../services/carts/service";

const router = Router();

/**
 * GET `/carts`
 *
 * Obtiene el carrito activo (`OPEN`) por `whatsappUserId`.
 * Ejemplo: `GET /carts?whatsappUserId=549381xxxxxxx`.
 *
 * Respuestas:
 * - `200`: Carrito con `items`.
 * - `404 cart_not_found`: si no tiene carrito abierto.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const schema = z.object({
    whatsappUserId: z.string(),
    // por ahora el servicio siempre busca OPEN,
    // pero dejamos el campo por si se extiende a futuro
    status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
  });

  try {
    const input = schema.parse(req.query);

    const cart = await CartsService.getActiveCart(input.whatsappUserId);
    if (!cart) {
      // se mapea en el errorHandler a 404 cart_not_found
      throw new Error("cart_not_found");
    }

    res.json(cart);
  } catch (e) {
    next(e);
  }
});

/**
 * POST `/carts`
 *
 * Crea (o devuelve) un carrito `OPEN` para `whatsappUserId` y
 * opcionalmente agrega ítems iniciales.
 *
 * Body: `{ whatsappUserId, items?: [{ productId, quantity }] }`
 * Respuesta: Carrito con totales recalculados.
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const schema = z.object({
    whatsappUserId: z.string(),
    items: z
      .array(
        z.object({
          productId: z.string(),
          quantity: z.number().int().min(1),
        }),
      )
      .optional(),
  });

  try {
    const input = schema.parse(req.body);

    // si ya tiene carrito OPEN lo devuelve, si no lo crea
    const cart = await CartsService.getOrCreateOpenCart(input.whatsappUserId);

    // si vienen ítems iniciales, los agregamos y devolvemos el carrito recalculado
    if (input.items && input.items.length > 0) {
      const updated = await CartsService.addItems(cart.id, input.items);
      res.json(updated);
      return;
    }

    res.json(cart);
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH `/carts/:id`
 *
 * Edita cantidades o elimina ítems de un carrito existente (`OPEN`).
 * - `addItems`: suma cantidades (o crea el item).
 * - `updateItems`: fija cantidad exacta.
 * - `removeItems`: elimina productos.
 *
 * Respuestas:
 * - `200`: Carrito actualizado.
 * - `409 cart_not_open` o `stock_insufficient`.
 */
router.patch(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().parse(req.params.id);

      const schema = z.object({
        addItems: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().min(1),
            }),
          )
          .optional(),
        updateItems: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().min(1),
            }),
          )
          .optional(),
        removeItems: z
          .array(
            z.object({
              productId: z.string(),
            }),
          )
          .optional(),
      });

      const input = schema.parse(req.body);

      const updated = await CartsService.updateItems(id, input);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
