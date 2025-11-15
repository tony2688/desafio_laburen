import axios from "axios";

type ChatMessage = { role: string; content?: string; name?: string; tool_call_id?: string } & Record<string, any>;

export async function callChatModelWithTools(opts: {
  messages: ChatMessage[];
  tools: any[];
}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: "auto",
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  return res.data;
}