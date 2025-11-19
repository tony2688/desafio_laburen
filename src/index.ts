// cargo las variables de entorno desde .env (creo que es necesario)
import dotenv from "dotenv";
dotenv.config();
// aca configuro express para el server http
import express, { Request, Response } from "express";
import pino from "pino";
import productsRouter from "./api/products/router";
import cartsRouter from "./api/carts/router";
import whatsappRouter from "./webhooks/whatsapp/router";
import { errorHandler } from "./middlewares/errorHandler";
import { callGeminiOnce } from "./agent/geminiClient";

const app = express(); // instancia de express
app.use(express.json());

const logger = pino(); // logger basico, despues se puede mejorar

app.use("/products", productsRouter);
app.use("/carts", cartsRouter);
app.use("/webhooks/whatsapp", whatsappRouter);
app.use(errorHandler);

app.get("/", (_req: Request, res: Response) => {
  // endpoint simple para ver si prende
  res.send("ok");
});

app.get("/healthz", (_req: Request, res: Response) => {
  // health basico
  res.status(200).json({ status: "ok" });
});

// pruebo que gemini responda algo rapido
app.get("/healthz/gemini", async (_req: Request, res: Response) => {
  try {
    const { text } = await callGeminiOnce({
      systemPrompt: "Respondé breve en español.",
      userText: "Decí Hola y nombrá 2 colores.",
      whatsappUserId: "healthz",
      tools: [],
    });
    res.status(200).json({ status: "ok", model: process.env.GEMINI_MODEL?.trim() ?? "gemini-2.5-flash", text });
  } catch (e) {
    res.status(500).json({ status: "error", message: (e as any)?.message ?? "unknown" });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000; // puerto por defecto
app.listen(port, () => {
  logger.info({ port }, "server_started"); // aviso en consola
});