// servicio de productos: aca hago las consultas a la db
import { prisma } from "../../infra/prisma/client";

export const ProductsService = {
  async search(q?: string, page: number = 1, pageSize: number = 10) {
    // normalizo el pageSize para que no se vaya de tema
    const limit = Math.max(1, Math.min(pageSize, 50));
    const normalize = (s: string) => s.trim().toLowerCase();
    const raw = normalize(q ?? '');
    const tokens = raw ? raw.split(/\s+/).filter(Boolean) : [];
    // sinónimos basicos para mejorar la busqueda
    const synonyms: Record<string, string[]> = {
      remera: ['camiseta'],
      buzo: ['sudadera', 'hoodie'],
      zapatilla: ['zapatillas', 'calzado'],
      negro: ['black'],
      blanco: ['white'],
      rojo: ['red'],
      azul: ['blue'],
      verde: ['green'],
    };
    const expandedTokens = tokens.flatMap((t) => [t, ...(synonyms[t] ?? [])]);

    const fields = ['type', 'size', 'color', 'category', 'description'] as const;

    const where = expandedTokens.length
      ? {
          // AND entre tokens, OR entre campos
          AND: expandedTokens.map((t) => ({
            OR: fields.map((f) => ({ [f]: { contains: t, mode: 'insensitive' } })),
          })),
          isAvailable: true,
          availableQuantity: { gt: 0 },
        }
      : { isAvailable: true, availableQuantity: { gt: 0 } };

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.product.count({ where }),
    ]);
    return { items, page, page_size: limit, total };
  },
  async getById(id: string) {
    // obtengo un producto por id
    return prisma.product.findUnique({ where: { id } });
  },
};