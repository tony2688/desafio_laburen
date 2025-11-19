// middleware para mapear errores a codigos http
import { Request, Response, NextFunction } from "express";

function mapError(e: unknown) {
  const msg = e instanceof Error ? e.message : "unknown_error";
  if (msg === "stock_insufficient") {
    return { status: 409, error: msg, message: "No hay stock suficiente para este producto." };
  }
  if (msg === "cart_not_open") {
    return { status: 409, error: msg, message: "El carrito no está abierto para edición." };
  }
  if (msg === "cart_not_found") {
    return { status: 404, error: msg, message: "Carrito no encontrado." };
  }
  if (msg === "product_not_found") {
    return { status: 404, error: msg, message: "Producto no encontrado." };
  }
  return { status: 500, error: "internal_error", message: "Error interno." };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, error, message } = mapError(err);
  res.status(status).json({ error, message });
}