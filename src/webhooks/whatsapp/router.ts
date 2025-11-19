// router para manejar los eventos de whatsapp
import { Router, Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { handleUserMessage } from "../../agent";

const router = Router();

// verificacion que pide meta para el webhook
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    res.status(200).send(challenge); // si todo ok, devolvemos el challenge
    return;
  }
  res.sendStatus(403);
});

// aca llegan los mensajes del usuario
router.post("/", async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    const from = message?.from;
    const text = message?.text?.body || "";
    if (!from || !text) {
      res.status(200).json({ status: "ignored" }); // si no hay datos, ignoro
      return;
    }
    console.log("whatsapp_incoming", { from: String(from), text: String(text) }); // log para debug
    const reply = await handleUserMessage({ text, whatsappUserId: from });
    const apiVersion = process.env.WHATSAPP_API_VERSION || "24.0";
    const url = `https://graph.facebook.com/v${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    try {
      const to = (process.env.WHATSAPP_OUTGOING_TO_OVERRIDE || String(from)).replace(/[^0-9]/g, ""); // destino
      console.log("whatsapp_outgoing_request", { to, replyText: String(reply), url }); // lo que mandamos
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      if (!token) {
        console.error("whatsapp_outgoing_error", {
          code: 104,
          message: "missing_access_token",
          details: "WHATSAPP_ACCESS_TOKEN env var not set",
        });
        res.status(200).json({ status: "missing_token", to }); // no hay token
        return;
      }
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
        }
      );
      console.log("whatsapp_outgoing_response", { status: response.status, data: response.data }); // respuesta de meta
    } catch (e) {
      const anyErr: any = e;
      const details = anyErr?.response?.data
        ? JSON.stringify(anyErr.response.data)
        : anyErr?.message ?? "send_failed";
      const code = anyErr?.response?.data?.error?.code;
      const messageText = anyErr?.response?.data?.error?.message;
      const errorSubcode = anyErr?.response?.data?.error?.error_subcode;
      console.error("whatsapp_outgoing_error", { code, message: messageText, error_subcode: errorSubcode, details }); // log de error
      let status = "sent_error";
      if (code === 190 && errorSubcode === 463) status = "token_expired";
      else if (code === 131030) status = "recipient_not_allowed";
      res.status(200).json({ status, error: details, to: String(from) }); // devolvemos info para debug
      return;
    }
    res.status(200).json({ status: "ok" });
  } catch (e) {
    res.status(200).json({ status: "error", error: (e as any)?.message ?? "unknown" }); // error general
  }
});

export default router;