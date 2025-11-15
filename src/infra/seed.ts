import dotenv from "dotenv";
dotenv.config();
import { prisma } from "./prisma/client";
import xlsx from "xlsx";

function toBool(v: any) {
  const s = String(v).toLowerCase();
  return s === "sí" || s === "si" || s === "true" || s === "1";
}

async function main() {
  const wb = xlsx.readFile("products.xlsx");
  const sheetName = wb.SheetNames[0];
  const rows: any[] = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  for (const r of rows) {
    const id = String(r["ID"]);
    const type = String(r["TIPO_PRENDA"]);
    const size = String(r["TALLA"]);
    const color = String(r["COLOR"]);
    const availableQuantity = Number(r["CANTIDAD_DISPONIBLE"] || 0);
    const price50 = String(r["PRECIO_50_U"] ?? 0);
    const price100 = String(r["PRECIO_100_U"] ?? 0);
    const price200 = String(r["PRECIO_200_U"] ?? 0);
    const isAvailable = toBool(r["DISPONIBLE"]);
    const category = String(r["CATEGORÍA"] || r["CATEGORIA"] || "");
    const description = String(r["DESCRIPCIÓN"] || r["DESCRIPCION"] || "");
    await prisma.product.upsert({
      where: { id },
      update: {
        type,
        size,
        color,
        availableQuantity,
        price50,
        price100,
        price200,
        currency: "ARS",
        category,
        description,
        isAvailable,
      },
      create: {
        id,
        type,
        size,
        color,
        availableQuantity,
        price50,
        price100,
        price200,
        currency: "ARS",
        category,
        description,
        isAvailable,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async () => {
    await prisma.$disconnect();
    process.exit(1);
  });