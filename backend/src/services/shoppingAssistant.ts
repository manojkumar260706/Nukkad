import { z } from 'zod';

const item = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[^,;\n\r]+$/),
  quantity: z.number().int().min(1).max(999)
});
export const assistantInput = z.object({
  message: z.string().trim().min(1).max(1000),
  language: z.enum(['auto', 'en-IN', 'hi-IN', 'kn-IN', 'ta-IN', 'te-IN', 'ml-IN']),
  previous: z.array(item).max(25).default([]),
  lastTurn: z.object({ request: z.string().max(1000), reply: z.string().max(3000) }).optional()
});
const reply = z.object({
  items: z.array(item).max(25),
  question: z.string().trim().max(400)
});

async function providerRequest(url: string, headers: Record<string, string>, body: object, provider: string) {
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } catch {
    throw new Error(`${provider} is unavailable. Try again in a moment.`);
  }
}

const translation = z.object({
  translated_text: z.string().trim().min(1).max(4000),
  source_language_code: z.string().optional()
});
const supportedLanguages = new Set(['en-IN', 'bn-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN']);

async function translate(text: string, source: string, target: string, key: string) {
  return translation.parse(await providerRequest('https://api.sarvam.ai/translate', { 'api-subscription-key': key }, {
    input: text, source_language_code: source, target_language_code: target,
    model: 'mayura:v1', numerals_format: 'international'
  }, 'Sarvam AI'));
}

export async function interpretShoppingRequest(input: z.infer<typeof assistantInput>) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!geminiKey || (input.language !== 'en-IN' && !sarvamKey)) {
    throw new Error('The shopping assistant is missing its provider configuration.');
  }
  const incoming = input.language === 'en-IN' ? undefined
    : await translate(input.message, input.language, 'en-IN', sarvamKey!);
  const message = incoming?.translated_text ?? input.message;
  const detected = incoming?.source_language_code;
  const replyLanguage = input.language === 'auto'
    ? detected && supportedLanguages.has(detected) ? detected : 'en-IN'
    : input.language;

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const result = await providerRequest(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': geminiKey },
    {
      systemInstruction: { parts: [{ text: 'You extract shopping items for a grocery planner. Return a JSON object with items (an array of at most 25 objects with name and integer quantity) and question (an English string, empty when ready). Interpret the latest message as edits to the previous list when applicable. Use concise English catalog product names with no quantities or delimiters in the name. Use 1 when a quantity is omitted. For a clear meal request suggest ingredients. For unclear or non-shopping requests ask a brief clarifying question and preserve the previous items. Never invent stores, prices or stock, and never claim to buy anything.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({
        previous: input.previous, lastTurn: input.lastTurn, message
      }) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array', maxItems: 25,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1, maximum: 999 }
                },
                required: ['name', 'quantity']
              }
            },
            question: { type: 'string' }
          },
          required: ['items', 'question']
        }
      }
    },
    'Gemini'
  );

  let parsed: z.infer<typeof reply>;
  try {
    const response = z.object({ candidates: z.array(z.object({
      content: z.object({ parts: z.array(z.object({ text: z.string(), thought: z.boolean().optional() })) })
    })).min(1) }).parse(result);
    const json = response.candidates[0].content.parts.filter(part => !part.thought).map(part => part.text).join('');
    parsed = reply.parse(JSON.parse(json));
  } catch {
    throw new Error('The shopping assistant returned an unreadable list. Try rephrasing your message.');
  }
  const englishReply = parsed.question || (parsed.items.length
    ? 'I’ve put together your shopping request. Here’s the basket comparison.'
    : 'Tell me which products you would like to buy.');
  const replyText = replyLanguage === 'en-IN' ? englishReply
    : (await translate(englishReply, 'en-IN', replyLanguage, sarvamKey!)).translated_text;
  return { ...parsed, replyText, replyLanguage };
}
