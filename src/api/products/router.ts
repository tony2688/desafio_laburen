import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductsService } from "../../services/products/service";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const schema = z.object({
    q: z.string().optional(),
    page: z.coerce.number().default(1),
    page_size: z.coerce.number().default(10),
  });
  try {
    const input = schema.parse(req.query);
    const data = await ProductsService.search(input.q, input.page, input.page_size);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().parse(req.params.id);
    const product = await ProductsService.getById(id);
    if (!product) {
      throw new Error("product_not_found");
    }
    res.json(product);
  } catch (e) {
    next(e);
  }
});

export default router;