import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { expenses, recognitionJobs, receipts } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

const extractedSchema = z.object({
  merchant: z.string().min(1).max(180).catch("Не определено"),
  expenseDate: z.string().date().catch(new Date().toISOString().slice(0, 10)),
  amount: z.coerce.number().positive(),
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
        { role: "system", content: "Извлеки данные из кассового чека. Верни только JSON: merchant, expenseDate (YYYY-MM-DD), amount (number), currency (ISO 4217), category, paymentMethod, comment. Если поле не видно, не выдумывай." },
        { role: "user", content: [{ type: "text", text: "Распознай этот чек." }, { type: "image_url", image_url: { url: image } }] }
      ]
    })
  });
  if (!response.ok) throw new Error(`MiniMax вернул HTTP ${response.status}`);
  const answer = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const raw = contentToText(answer.choices?.[0]?.message?.content).replace(/^```json\s*|\s*```$/g, "");
  return extractedSchema.parse(JSON.parse(raw));
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
    const rate = extracted.currency === "RUB" ? 1 : undefined;
    await db.transaction(async (tx) => {
      await tx.insert(expenses).values({
        tripId: receipt.tripId,
        claimantId: receipt.uploadedBy,
        receiptId: receipt.id,
        source: "RECEIPT",
        expenseDate: extracted.expenseDate,
        merchant: extracted.merchant,
        description: extracted.comment,
        amount: extracted.amount.toFixed(2),
        currency: extracted.currency,
        exchangeRate: rate?.toFixed(6),
        amountRub: rate ? extracted.amount.toFixed(2) : null,
        paymentMethod: extracted.paymentMethod
      });
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
