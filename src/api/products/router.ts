// router de productos (listar y detalle)
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductsService } from "../../services/products/service";

const router = Router();

/**
 * GET `/products`
 *
 * Lista productos con filtros básicos de texto y paginación.
 *
 * Query params:
 * - `q`: término opcional (tipo/color/talle/categoría/descripción).
 * - `page`: número de página (default `1`).
 * - `page_size`: tamaño de página (default `10`, máx `50` en service).
 *
 * Respuesta: `{ items, page, page_size, total }`
 */
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    const schema = z.object({
      q: z.string().optional(),
      page: z.coerce.number().default(1),
      page_size: z.coerce.number().default(10),
    });

    try {
      const input = schema.parse(req.query);
      const data = await ProductsService.search(
        input.q,
        input.page,
        input.page_size,
      );
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

/**
 * GET `/products/:id`
 *
 * Devuelve el detalle de un producto por ID (tolerando ceros a la izquierda).
 *
 * Respuestas:
 * - `200`: Producto.
 * - `404 product_not_found`: si el ID no existe.
 */
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.string().parse(req.params.id);

      const product = await ProductsService.getById(id);
      if (!product) {
        // se mapea en el errorHandler a 404 product_not_found
        throw new Error("product_not_found");
      }

      res.json(product);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
