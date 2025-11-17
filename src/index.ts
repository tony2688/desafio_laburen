import dotenv from "dotenv";
dotenv.config();
import express from "express";
import pino from "pino";
import productsRouter from "./api/products/router";
import cartsRouter from "./api/carts/router";
import whatsappRouter from "./webhooks/whatsapp/router";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();
app.use(express.json());

const logger = pino();

app.use("/products", productsRouter);
app.use("/carts", cartsRouter);
app.use("/webhooks/whatsapp", whatsappRouter);
app.use(errorHandler);

app.get("/", (_req, res) => {
  res.send("ok");
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  logger.info({ port }, "server_started");
});