import { Router, Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { handleUserMessage } from "../../agent";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    const from = message?.from;
    const text = message?.text?.body || "";
    if (!from || !text) {
      res.status(200).json({ status: "ignored" });
      return;
    }
    console.log("whatsapp_incoming", { from: String(from), text: String(text) });
    const reply = await handleUserMessage({ text, whatsappUserId: from });
    const apiVersion = process.env.WHATSAPP_API_VERSION || "24.0";
    const url = `https://graph.facebook.com/v${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    try {
      const to = String(from).replace(/[^0-9]/g, "");
      console.log("whatsapp_outgoing_request", { to, replyText: String(reply), url });
      const response = await axios.post(
        url,
        {
          messaging_product: "whatsapp",
          to,
          text: { body: String(reply) },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("whatsapp_outgoing_response", { status: response.status, data: response.data });
    } catch (e) {
      const anyErr: any = e;
      const details = anyErr?.response?.data
        ? JSON.stringify(anyErr.response.data)
        : anyErr?.message ?? "send_failed";
      const code = anyErr?.response?.data?.error?.code;
      const messageText = anyErr?.response?.data?.error?.message;
      console.error("whatsapp_outgoing_error", { code, message: messageText, details });
      res.status(200).json({ status: "sent_error", error: details, to: String(from) });
      return;
    }
    res.status(200).json({ status: "ok" });
  } catch (e) {
    res.status(200).json({ status: "error", error: (e as any)?.message ?? "unknown" });
  }
});

export default router;