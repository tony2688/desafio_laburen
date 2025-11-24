// router para manejar los eventos de WhatsApp
import { Router, Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { handleUserMessage } from "../../agent";

const router = Router();

/**
 * GET `/webhooks/whatsapp`
 *
 * Verificación que pide Meta para el webhook (modo `subscribe`).
 * Reenvía `hub.challenge` si `hub.verify_token` coincide.
 */
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    // si todo ok, devolvemos el challenge tal cual
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

/**
 * POST `/webhooks/whatsapp`
 *
 * Entrada de mensajes de WhatsApp.
 *
 * Flujo:
 * - Extrae `from` y `text` del payload.
 * - Llama al agente (`handleUserMessage`) para obtener la respuesta.
 * - Envía la respuesta a WhatsApp Cloud API.
 *
 * Errores comunes:
 * - `190/463` → `token_expired`.
 * - `131030` → `recipient_not_allowed`.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    const from = message?.from;
    const text = message?.text?.body || "";

    // Si no hay remitente o texto, ignoramos silenciosamente
    if (!from || !text) {
      res.status(200).json({ status: "ignored" });
      return;
    }

    console.log("whatsapp_incoming", {
      from: String(from),
      text: String(text),
    });

    // Obtenemos la respuesta del agente (Gemini + tools + backend)
    const reply = await handleUserMessage({
      text,
      whatsappUserId: from,
    });

    // Endpoint de Meta WhatsApp
    const apiVersion = process.env.WHATSAPP_API_VERSION || "24.0";
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    const url = `https://graph.facebook.com/v${apiVersion}/${phoneNumberId}/messages`;

    try {
      // Permite forzar destino con WHATSAPP_OUTGOING_TO_OVERRIDE para pruebas
      const to = (
        process.env.WHATSAPP_OUTGOING_TO_OVERRIDE || String(from)
      ).replace(/[^0-9]/g, "");

      console.log("whatsapp_outgoing_request", {
        to,
        replyText: String(reply),
        url,
      });

      if (!token) {
        console.error("whatsapp_outgoing_error", {
          code: 104,
          message: "missing_access_token",
          details: "WHATSAPP_ACCESS_TOKEN env var not set",
        });
        res.status(200).json({ status: "missing_token", to });
        return;
      }

      // Enviamos la respuesta al usuario vía WhatsApp Cloud API
      const response = await axios.post(
        url,
        {
          messaging_product: "whatsapp",
          to,
          text: { body: String(reply) },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      console.log("whatsapp_outgoing_response", {
        status: response.status,
        data: response.data,
      });
    } catch (e) {
      const anyErr: any = e;
      const details = anyErr?.response?.data
        ? JSON.stringify(anyErr.response.data)
        : anyErr?.message ?? "send_failed";

      const code = anyErr?.response?.data?.error?.code;
      const messageText = anyErr?.response?.data?.error?.message;
      const errorSubcode = anyErr?.response?.data?.error?.error_subcode;

      console.error("whatsapp_outgoing_error", {
        code,
        message: messageText,
        error_subcode: errorSubcode,
        details,
      });

      let status = "sent_error";
      if (code === 190 && errorSubcode === 463) status = "token_expired";
      else if (code === 131030) status = "recipient_not_allowed";

      res
        .status(200)
        .json({ status, error: details, to: String(from) });
      return;
    }

    res.status(200).json({ status: "ok" });
  } catch (e) {
    res.status(200).json({
      status: "error",
      error: (e as any)?.message ?? "unknown",
    });
  }
});

export default router;
