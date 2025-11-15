import { Router } from "express";
import { z } from "zod";
import { ProductsService } from "../../services/products/service";

const router = Router();

router.get("/", async (req, res) => {
  const schema = z.object({
    q: z.string().optional(),
    page: z.coerce.number().default(1),
    page_size: z.coerce.number().default(10),
  });
  const input = schema.parse(req.query);
  const data = await ProductsService.search(input.q, input.page, input.page_size);
  res.json(data);
});

router.get("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const product = await ProductsService.getById(id);
  if (!product) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(product);
});

export default router;