import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

// La key se valida en tiempo de llamada para no romper el servidor al inicio

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
