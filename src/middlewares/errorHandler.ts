// middleware para mapear errores a códigos HTTP
import { Request, Response, NextFunction } from "express";

/**
 * Mapea errores de dominio a respuestas HTTP.
 *
 * `Error.message` esperado:
 * - `stock_insufficient` → `409`.
 * - `cart_not_open` → `409`.
 * - `cart_not_found` → `404`.
 * - `product_not_found` → `404`.
 * - cualquier otro → `500` `internal_error`.
 */
function mapError(e: unknown) {
  const msg = e instanceof Error ? e.message : "unknown_error";

  // errores de dominio (se lanzan con new Error("..."))
  if (msg === "stock_insufficient") {
    return {
      status: 409,
      error: msg,
      message: "No hay stock suficiente para este producto.",
    };
  }

  if (msg === "cart_not_open") {
    return {
      status: 409,
      error: msg,
      message: "El carrito no está abierto para edición.",
    };
  }

  if (msg === "cart_not_found") {
    return {
      status: 404,
      error: msg,
      message: "Carrito no encontrado.",
    };
  }

  if (msg === "product_not_found") {
    return {
      status: 404,
      error: msg,
      message: "Producto no encontrado.",
    };
  }

  // fallback genérico
  return {
    status: 500,
    error: "internal_error",
    message: "Error interno.",
  };
}

/**
 * Middleware Express para manejo uniforme de errores.
 *
 * Loguea el error y responde con `{ error, message }` y status apropiado.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // log para debug en servidor
  console.error("api_error", err);

  const { status, error, message } = mapError(err);
  res.status(status).json({ error, message });
}
