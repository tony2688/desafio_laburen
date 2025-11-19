// cargo las variables del .env (por las dudas si usa la db remota)
import dotenv from "dotenv";
dotenv.config();
// cliente de prisma para escribir en postgres
import { prisma } from "./prisma/client";
// libreria para leer archivos xlsx
import xlsx from "xlsx";

// funcion simple para convertir "sí/si/true/1" a boolean
function toBool(v: any) {
  const s = String(v).toLowerCase();
  return s === "sí" || s === "si" || s === "true" || s === "1";
}

// rutina principal: lee el excel y hace upsert de productos
async function main() {
  const wb = xlsx.readFile("products.xlsx");
  const sheetName = wb.SheetNames[0];
  const rows: any[] = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  for (const r of rows) {
    // mapeo columnas del excel a campos de la db
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
    // si existe actualiza, sino crea (upsert)
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

// ejecuto la semilla y cierro prisma pase lo que pase
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async () => {
    await prisma.$disconnect();
    process.exit(1);
  });