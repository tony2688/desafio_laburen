/**
 * Servidor principal Express: API REST + Webhook de WhatsApp.
 *
 * - Carga `.env`.
 * - Configura routers (`/products`, `/carts`, `/webhooks/whatsapp`).
 * - Exponde health checks (`/`, `/healthz`, `/healthz/gemini`).
 */
// cargo las variables de entorno desde .env
import dotenv from "dotenv";
dotenv.config();

// configuro express para el server http
import express, { Request, Response } from "express";
import pino from "pino";

import productsRouter from "./api/products/router";
import cartsRouter from "./api/carts/router";
import whatsappRouter from "./webhooks/whatsapp/router";
import { errorHandler } from "./middlewares/errorHandler";
import { callGeminiOnce } from "./agent/geminiClient";

const app = express(); // instancia de express
app.use(express.json());

const logger = pino(); // logger básico

// rutas de la API principal
app.use("/products", productsRouter);
app.use("/carts", cartsRouter);

// webhook de WhatsApp
app.use("/webhooks/whatsapp", whatsappRouter);

// middleware de errores (siempre al final de las rutas)
app.use(errorHandler);

/**
 * GET `/`
 * Endpoint simple para ver si el server está arriba.
 */
app.get("/", (_req: Request, res: Response) => {
  res.send("ok");
});

/**
 * GET `/healthz`
 * Healthcheck básico para el load balancer / monitor.
 */
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

/**
 * GET `/healthz/gemini`
 * Healthcheck que verifica que Gemini responda algo simple.
 */
app.get("/healthz/gemini", async (_req: Request, res: Response) => {
  try {
    const { text } = await callGeminiOnce({
      systemPrompt: "Respondé breve en español.",
      userText: "Decí Hola y nombrá 2 colores.",
      whatsappUserId: "healthz",
      tools: [],
    });

    res.status(200).json({
      status: "ok",
      model: process.env.GEMINI_MODEL?.trim() ?? "gemini-2.5-flash",
      text,
    });
  } catch (e) {
    res.status(500).json({
      status: "error",
      message: (e as any)?.message ?? "unknown",
    });
  }
});

// puerto configurable por env, default 3000
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

/**
 * Inicializa el servidor HTTP en `port`.
 */
app.listen(port, () => {
  logger.info({ port }, "server_started");
});
