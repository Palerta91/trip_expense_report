import { z } from "zod";

const extractedSchema = z.object({
  title: z.string().trim().max(180).optional().catch(undefined),
  merchantOriginal: z.string().trim().max(180).optional().catch(undefined),
  merchantRussian: z.string().trim().max(180).optional().catch(undefined),
  expenseDate: z.string().date().catch(new Date().toISOString().slice(0, 10)),
  amount: z.coerce.number().nonnegative().catch(0),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).catch("RUB"),
  category: z.string().max(100).optional(),
  paymentMethod: z.string().max(80).optional(),
  comment: z.string().max(2000).optional()
});

export type ExtractedReceipt = z.infer<typeof extractedSchema>;

type MiniMaxResponse = { choices?: Array<{ message?: { content?: unknown } }> };

export const receiptRecognitionPrompt = "Извлеки данные из чека или подтверждения оплаты. Верни только JSON: title, merchantOriginal, merchantRussian, expenseDate (YYYY-MM-DD), amount (number), currency (ISO 4217), category, paymentMethod, comment. title: если это билет, автоматически укажи направление движения в формате «Откуда — Куда»; если это покупка в магазине или иной обычный чек, верни пустую строку. Для китайского чека merchantOriginal — точное название или имя получателя на китайском, merchantRussian — его перевод на русский. Для русского чека merchantRussian — название как в чеке, merchantOriginal можно не передавать. category выбери из типовых: Проживание, Проезд, Питание, Такси, Связь, Прочее. Если поле не видно, верни пустую строку, не выдумывай. Сумму возвращай числом без разделителей.";

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n");
  return "";
}

export function parseReceiptRecognition(content: unknown): ExtractedReceipt {
  const raw = contentToText(content)
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
    .replace(/^```json\s*|^```\s*|\s*```$/g, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("MiniMax вернул ответ без JSON с данными чека");
  return extractedSchema.parse(JSON.parse(raw.slice(start, end + 1)));
}

export function createReceiptRecognitionRequest(imageUrl: string, model: string) {
  return {
    model,
    temperature: 0,
    reasoning_split: true,
    max_completion_tokens: 1000,
    messages: [
      { role: "system" as const, content: receiptRecognitionPrompt },
      { role: "user" as const, content: [{ type: "text", text: "Распознай этот чек." }, { type: "image_url", image_url: { url: imageUrl } }] }
    ]
  };
}

export async function recognizeReceipt({
  imageUrl,
  apiKey,
  baseUrl = "https://api.minimax.io/v1",
  model = "MiniMax-M3",
  fetcher = fetch
}: {
  imageUrl: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetcher?: typeof fetch;
}): Promise<ExtractedReceipt> {
  if (!apiKey) throw new Error("MINIMAX_API_KEY не задан");
  const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(createReceiptRecognitionRequest(imageUrl, model))
  });
  if (!response.ok) {
    const details = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`MiniMax вернул HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }
  const answer = await response.json() as MiniMaxResponse;
  return parseReceiptRecognition(answer.choices?.[0]?.message?.content);
}
