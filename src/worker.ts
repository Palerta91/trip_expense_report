import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "./lib/db";
import { categories, expenses, recognitionJobs, receipts } from "./lib/db/schema";
import { createRecognitionProxyUrl } from "./lib/recognition-proxy";
import { recognizeReceipt } from "./lib/receipt-recognition";

const stalledJobTimeoutMs = 5 * 60_000;

async function recognize(receipt: { id: string; mimeType: string }, attempt: number) {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("MINIMAX_API_KEY не задан");
  if (!receipt.mimeType.startsWith("image/")) throw new Error("ИИ-распознавание доступно для изображений. Для PDF заполните расход вручную.");
  return recognizeReceipt({
    imageUrl: createRecognitionProxyUrl(receipt.id, attempt),
    apiKey: key,
    baseUrl: process.env.MINIMAX_API_BASE_URL,
    model: process.env.MINIMAX_MODEL
  });
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

async function recoverStalledJobs() {
  const staleBefore = new Date(Date.now() - stalledJobTimeoutMs);
  await db.update(recognitionJobs)
    .set({ status: "PENDING", errorMessage: "Задача была автоматически возвращена в очередь после перезапуска worker", processedAt: null })
    .where(and(eq(recognitionJobs.status, "PROCESSING"), lt(recognitionJobs.createdAt, staleBefore)));
}

async function processOne() {
  const [job] = await db.select().from(recognitionJobs).where(eq(recognitionJobs.status, "PENDING")).orderBy(asc(recognitionJobs.createdAt)).limit(1);
  if (!job) return false;
  const [claimedJob] = await db.update(recognitionJobs).set({ status: "PROCESSING", attempts: job.attempts + 1 }).where(and(eq(recognitionJobs.id, job.id), eq(recognitionJobs.status, "PENDING"))).returning();
  if (!claimedJob) return false;
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, claimedJob.receiptId)).limit(1);
  if (!receipt) return true;

  try {
    await db.execute(sql`
      update ${receipts}
      set status = 'PROCESSING', error_message = null
      where ${receipts.id} = ${receipt.id}
        and exists (
          select 1 from ${recognitionJobs}
          where ${recognitionJobs.id} = ${claimedJob.id}
            and ${recognitionJobs.status} = 'PROCESSING'
            and ${recognitionJobs.attempts} = ${claimedJob.attempts}
        )
    `);
    const extracted = await recognize(receipt, claimedJob.attempts);
    const categoryId = await resolveCategoryId(extracted.category);
    const rate = extracted.currency === "RUB" ? 1 : undefined;
    const merchant = extracted.merchantRussian || extracted.merchantOriginal || "Не определено";
    await db.transaction(async (tx) => {
      const [activeJob] = await tx.select({ id: recognitionJobs.id }).from(recognitionJobs).where(and(eq(recognitionJobs.id, claimedJob.id), eq(recognitionJobs.status, "PROCESSING"), eq(recognitionJobs.attempts, claimedJob.attempts))).limit(1);
      if (!activeJob) return;
      const values = {
        tripId: receipt.tripId,
        claimantId: receipt.uploadedBy,
        receiptId: receipt.id,
        source: "RECEIPT" as const,
        title: extracted.title || null,
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
      await tx.update(recognitionJobs).set({ status: "DONE", processedAt: new Date(), errorMessage: null }).where(and(eq(recognitionJobs.id, claimedJob.id), eq(recognitionJobs.status, "PROCESSING"), eq(recognitionJobs.attempts, claimedJob.attempts)));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1500) : "Неизвестная ошибка распознавания";
    await db.transaction(async (tx) => {
      const [activeJob] = await tx.select({ id: recognitionJobs.id }).from(recognitionJobs).where(and(eq(recognitionJobs.id, claimedJob.id), eq(recognitionJobs.status, "PROCESSING"), eq(recognitionJobs.attempts, claimedJob.attempts))).limit(1);
      if (!activeJob) return;
      await tx.update(receipts).set({ status: "FAILED", errorMessage: message }).where(eq(receipts.id, receipt.id));
      await tx.update(recognitionJobs).set({ status: "FAILED", processedAt: new Date(), errorMessage: message }).where(and(eq(recognitionJobs.id, claimedJob.id), eq(recognitionJobs.status, "PROCESSING"), eq(recognitionJobs.attempts, claimedJob.attempts)));
    });
    console.error("Recognition job failed", claimedJob.id, message);
  }
  return true;
}

async function loop() {
  await recoverStalledJobs();
  while (true) {
    if (process.env.ENABLE_MINIMAX_RECOGNITION === "true") {
      const worked = await processOne();
      if (worked) continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

void loop();
