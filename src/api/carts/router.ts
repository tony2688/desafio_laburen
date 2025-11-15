import { Router } from "express";
import { z } from "zod";
import { CartsService } from "../../services/carts/service";

const router = Router();

router.get("/", async (req, res) => {
  const schema = z.object({
    whatsappUserId: z.string(),
    status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
  });
  const input = schema.parse(req.query);
  const cart = await CartsService.getActiveCart(input.whatsappUserId);
  if (!cart) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(cart);
});

router.post("/", async (req, res) => {
  const schema = z.object({
    whatsappUserId: z.string(),
    items: z
      .array(
        z.object({ productId: z.string(), quantity: z.number().int().min(1) })
      )
      .optional(),
  });
  const input = schema.parse(req.body);
  const cart = await CartsService.getOrCreateOpenCart(input.whatsappUserId);
  if (input.items && input.items.length > 0) {
    const updated = await CartsService.addItems(cart.id, input.items);
    res.json(updated);
    return;
  }
  res.json(cart);
});

router.patch("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const schema = z.object({
    addItems: z
      .array(
        z.object({ productId: z.string(), quantity: z.number().int().min(1) })
      )
      .optional(),
    updateItems: z
      .array(
        z.object({ productId: z.string(), quantity: z.number().int().min(1) })
      )
      .optional(),
    removeItems: z.array(z.object({ productId: z.string() })).optional(),
  });
  const input = schema.parse(req.body);
  const updated = await CartsService.updateItems(id, input);
  res.json(updated);
});

export default router;