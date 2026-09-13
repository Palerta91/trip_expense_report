import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, expenses, recognitionJobs, receipts } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

const extractedSchema = z.object({
  merchantOriginal: z.string().trim().max(180).optional().catch(undefined),
  merchantRussian: z.string().trim().max(180).optional().catch(undefined),
  expenseDate: z.string().date().catch(new Date().toISOString().slice(0, 10)),
  amount: z.coerce.number().nonnegative().catch(0),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).catch("RUB"),
  category: z.string().max(100).optional(),
  paymentMethod: z.string().max(80).optional(),
  comment: z.string().max(2000).optional()
});

async function getBuffer(key: string) {
  const { client, bucket } = getStorage();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("Файл чека не найден в хранилище");
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n");
  return "";
}

async function recognize(file: Buffer, mimeType: string) {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("MINIMAX_API_KEY не задан");
  const baseUrl = (process.env.MINIMAX_API_BASE_URL ?? "https://api.minimax.io/v1").replace(/\/$/, "");
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-M3";
  const image = `data:${mimeType};base64,${file.toString("base64")}`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "Извлеки данные из чека или подтверждения оплаты. Верни только JSON: merchantOriginal, merchantRussian, expenseDate (YYYY-MM-DD), amount (number), currency (ISO 4217), category, paymentMethod, comment. Для китайского чека merchantOriginal — точное название или имя получателя на китайском, merchantRussian — его перевод на русский. Для русского чека merchantRussian — название как в чеке, merchantOriginal можно не передавать. category выбери из типовых: Проживание, Проезд, Питание, Такси, Связь, Прочее. Если поле не видно, верни пустую строку, не выдумывай. Сумму возвращай числом без разделителей." },
        { role: "user", content: [{ type: "text", text: "Распознай этот чек." }, { type: "image_url", image_url: { url: image } }] }
      ]
    })
  });
  if (!response.ok) throw new Error(`MiniMax вернул HTTP ${response.status}`);
  const answer = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const raw = contentToText(answer.choices?.[0]?.message?.content).replace(/^```json\s*|\s*```$/g, "");
  return extractedSchema.parse(JSON.parse(raw));
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

async function resolveCategoryId(name: string | undefined) {
  if (!name?.trim()) return undefined;
  const rows = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.active, true));
  const target = normalize(name);
  return rows.find((row) => normalize(row.name) === target || normalize(row.name).includes(target) || target.includes(normalize(row.name)))?.id;
}

async function processOne() {
  const [job] = await db.select().from(recognitionJobs).where(eq(recognitionJobs.status, "PENDING")).orderBy(asc(recognitionJobs.createdAt)).limit(1);
  if (!job) return false;
  await db.update(recognitionJobs).set({ status: "PROCESSING", attempts: job.attempts + 1 }).where(and(eq(recognitionJobs.id, job.id), eq(recognitionJobs.status, "PENDING")));
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, job.receiptId)).limit(1);
  if (!receipt) return true;

  try {
    await db.update(receipts).set({ status: "PROCESSING", errorMessage: null }).where(eq(receipts.id, receipt.id));
    const extracted = await recognize(await getBuffer(receipt.objectKey), receipt.mimeType);
    const categoryId = await resolveCategoryId(extracted.category);
    const rate = extracted.currency === "RUB" ? 1 : undefined;
    const merchant = extracted.merchantRussian || extracted.merchantOriginal || "Не определено";
    await db.transaction(async (tx) => {
      const values = {
        tripId: receipt.tripId,
        claimantId: receipt.uploadedBy,
        receiptId: receipt.id,
        source: "RECEIPT" as const,
        expenseDate: extracted.expenseDate,
        merchant,
        merchantOriginal: extracted.merchantOriginal || null,
        categoryId,
        description: extracted.comment,
        amount: extracted.amount.toFixed(2),
        currency: extracted.currency,
        exchangeRate: rate?.toFixed(6),
        amountRub: rate ? extracted.amount.toFixed(2) : null,
        paymentMethod: extracted.paymentMethod
      };
      const [existingExpense] = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.receiptId, receipt.id)).limit(1);
      if (existingExpense) await tx.update(expenses).set({ ...values, updatedAt: new Date() }).where(eq(expenses.id, existingExpense.id));
      else await tx.insert(expenses).values(values);
      await tx.update(receipts).set({ status: "READY_FOR_REVIEW", extracted }).where(eq(receipts.id, receipt.id));
      await tx.update(recognitionJobs).set({ status: "DONE", processedAt: new Date(), errorMessage: null }).where(eq(recognitionJobs.id, job.id));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1500) : "Неизвестная ошибка распознавания";
    await db.transaction(async (tx) => {
      await tx.update(receipts).set({ status: "FAILED", errorMessage: message }).where(eq(receipts.id, receipt.id));
      await tx.update(recognitionJobs).set({ status: "FAILED", processedAt: new Date(), errorMessage: message }).where(eq(recognitionJobs.id, job.id));
    });
    console.error("Recognition job failed", job.id, message);
  }
  return true;
}

async function loop() {
  while (true) {
    if (process.env.ENABLE_MINIMAX_RECOGNITION === "true") {
      const worked = await processOne();
      if (worked) continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

void loop();
