// cliente simple para usar gemini
import { GoogleGenAI } from '@google/genai';

// el modelo se puede cambiar por env, le hago trim por las dudas
const GEMINI_MODEL = (process.env.GEMINI_MODEL?.trim()) ?? 'gemini-2.5-flash';

// La key se valida en tiempo de llamada para no romper el servidor al inicio

// instancio el cliente con la api key del .env
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: any;
};

export type ToolCall = {
  name: string;
  args: Record<string, any>;
};

export async function callGeminiOnce(opts: {
  systemPrompt: string;
  userText: string;
  whatsappUserId: string;
  tools: ToolDefinition[];
}): Promise<{
  text: string;
  toolCall?: ToolCall;
  raw: any;
}> {
  const { systemPrompt, userText, whatsappUserId, tools } = opts;
  if (!process.env.GEMINI_API_KEY) {
    // si falta la key, devuelvo un texto para no romper
    return {
      text: 'Estoy teniendo un problema técnico. Probemos de nuevo en un rato.',
      raw: { error: 'missing_gemini_key' },
    } as any;
  }

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `Sistema:\n${systemPrompt}\n\nUsuario WhatsApp: ${whatsappUserId}\nMensaje: ${userText}`,
        },
      ],
    },
  ];

  const config = {
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ],
  };

  // llamo al modelo con el prompt y tools declaradas
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config,
  });

  const text = (response as any).text ?? '';
  const functionCalls: any[] = (response as any).functionCalls ?? [];

  const toolCall = functionCalls[0]
    ? {
        name: functionCalls[0].name,
        args: functionCalls[0].args ?? {},
      }
    : undefined;

  return { text, toolCall, raw: response };
}
