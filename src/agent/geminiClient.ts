// src/agent/geminiClient.ts

// Cliente simple para usar Gemini
import { GoogleGenAI } from '@google/genai';

// El modelo se puede cambiar por env, le hago trim por las dudas
const GEMINI_MODEL = (process.env.GEMINI_MODEL?.trim()) ?? 'gemini-2.5-flash';

// Instancio el cliente con la API key del .env
/**
 * Cliente de Google GenAI inicializado con API key desde `.env`.
 */
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

/**
 * Realiza una llamada única al modelo Gemini con tools declaradas.
 *
 * Construye `contents` con `systemPrompt` y entrada enriquecida
 * (incluye `whatsappUserId` y contexto), y declara las `tools`.
 *
 * Si falta la API key, retorna un mensaje de error tolerable.
 *
 * @param opts `{ systemPrompt, userText, whatsappUserId, tools }`.
 * @returns `{ text, toolCall?, raw }`.
 */
export async function callGeminiOnce(opts: {
  systemPrompt: string;
  userText: string; // texto ya enriquecido con contexto desde index.ts
  whatsappUserId: string;
  tools: ToolDefinition[];
}): Promise<{
  text: string;
  toolCall?: ToolCall;
  raw: any;
}> {
  const { systemPrompt, userText, whatsappUserId, tools } = opts;

  if (!process.env.GEMINI_API_KEY) {
    // Si falta la key, devuelvo un texto para no romper
    return {
      text: 'Estoy teniendo un problema técnico. Probemos de nuevo en un rato.',
      toolCall: undefined,
      raw: { error: 'missing_gemini_key' },
    };
  }

  // Armamos los contenidos para Gemini.
  // - Inyectamos el systemPrompt como instrucciones claras.
  // - Incluimos el whatsappUserId y el userText enriquecido que viene desde index.ts.
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `Instrucciones del sistema:\n${systemPrompt.trim()}`,
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          text: `Usuario WhatsApp: ${whatsappUserId}\n\n${userText}`,
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

  // Llamo al modelo con el prompt y tools declaradas
  const response = await (ai as any).models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config,
  });

  // La SDK agrega helpers .text y .functionCalls en la respuesta
  const text = (response as any).text ?? '';
  const functionCalls: any[] = (response as any).functionCalls ?? [];

  const toolCall: ToolCall | undefined = functionCalls[0]
    ? {
        name: functionCalls[0].name,
        args: functionCalls[0].args ?? {},
      }
    : undefined;

  return { text, toolCall, raw: response };
}
