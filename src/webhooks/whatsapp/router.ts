import { Router } from "express";
import { z } from "zod";
import axios from "axios";
import { handleUserMessage } from "../../agent";

const router = Router();

router.get("/", (req, res) => {
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

router.post("/", async (req, res) => {
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
  const reply = await handleUserMessage({ text, whatsappUserId: from });
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: reply },
    },
    {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
    }
  );
  res.status(200).json({ status: "ok" });
});

export default router;