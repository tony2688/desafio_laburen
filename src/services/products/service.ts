import { prisma } from "../../infra/prisma/client";

export const ProductsService = {
  async search(q?: string, page: number = 1, pageSize: number = 10) {
    const where = q
      ? {
          OR: [
            { type: { contains: q } },
            { size: { contains: q } },
            { color: { contains: q } },
            { category: { contains: q } },
            { description: { contains: q } },
          ],
          isAvailable: true,
          availableQuantity: { gt: 0 },
        }
      : { isAvailable: true, availableQuantity: { gt: 0 } };
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.product.count({ where }),
    ]);
    return { items, page, page_size: pageSize, total };
  },
  async getById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },
};