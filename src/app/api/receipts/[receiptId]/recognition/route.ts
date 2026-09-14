import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, recognitionJobs, receipts, tripMembers } from "@/lib/db/schema";

export const runtime = "nodejs";

const minuteMs = 60_000;

async function getEditableReceipt(receiptId: string) {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ message: "Требуется вход" }, { status: 401 }) } as const;
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId)).limit(1);
  if (!receipt) return { response: NextResponse.json({ message: "Чек не найден" }, { status: 404 }) } as const;
  if (user.role !== "ADMIN") {
    const [membership] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, receipt.tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!membership) return { response: NextResponse.json({ message: "Нет доступа к этому чеку" }, { status: 403 }) } as const;
  }
  if (user.role !== "ADMIN" && receipt.uploadedBy !== user.id) return { response: NextResponse.json({ message: "Управлять распознаванием может автор загрузки или администратор" }, { status: 403 }) } as const;
  const [[expense], [job]] = await Promise.all([
    db.select({ id: expenses.id, source: expenses.source }).from(expenses).where(eq(expenses.receiptId, receipt.id)).limit(1),
    db.select().from(recognitionJobs).where(eq(recognitionJobs.receiptId, receipt.id)).limit(1)
  ]);
  if (!expense || expense.source !== "RECEIPT" || !job) return { response: NextResponse.json({ message: "Для этого чека распознавание не используется" }, { status: 409 }) } as const;
  return { receipt, expense, job } as const;
}

async function readId(params: Promise<{ receiptId: string }>) {
  const { receiptId } = await params;
  return z.string().uuid().safeParse(receiptId);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const parsedId = await readId(params);
  if (!parsedId.success) return NextResponse.json({ message: "Некорректный идентификатор чека" }, { status: 400 });
  const result = await getEditableReceipt(parsedId.data);
  if ("response" in result) return result.response;
  if (result.job.status !== "PENDING" && result.job.status !== "PROCESSING") return NextResponse.json({ message: "Распознавание уже завершено" }, { status: 409 });

  await db.transaction(async (tx) => {
    await tx.update(recognitionJobs).set({ status: "FAILED", processedAt: new Date(), errorMessage: "Распознавание остановлено пользователем" }).where(and(eq(recognitionJobs.id, result.job.id), eq(recognitionJobs.status, result.job.status)));
    await tx.update(receipts).set({ status: "READY_FOR_REVIEW", errorMessage: null }).where(eq(receipts.id, result.receipt.id));
  });
  return NextResponse.json({ message: "Распознавание остановлено. Заполните расход вручную." });
}

export async function POST(_: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const parsedId = await readId(params);
  if (!parsedId.success) return NextResponse.json({ message: "Некорректный идентификатор чека" }, { status: 400 });
  const result = await getEditableReceipt(parsedId.data);
  if ("response" in result) return result.response;
  const availableAt = result.job.createdAt.getTime() + minuteMs;
  if (Date.now() < availableAt) return NextResponse.json({ message: "Перезапуск станет доступен через минуту после запуска распознавания" }, { status: 409 });
  if (result.receipt.status === "READY_FOR_REVIEW") return NextResponse.json({ message: "Этот расход уже заполнен вручную или успешно обработан" }, { status: 409 });

  const restartedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(recognitionJobs).set({ status: "PENDING", errorMessage: null, processedAt: null, createdAt: restartedAt }).where(eq(recognitionJobs.id, result.job.id));
    await tx.update(receipts).set({ status: "UPLOADED", extracted: null, errorMessage: null }).where(eq(receipts.id, result.receipt.id));
    await tx.update(expenses).set({ title: null, merchant: "Ожидается распознавание", merchantOriginal: null, categoryId: null, description: null, amount: "0.00", currency: "RUB", exchangeRate: "1.000000", amountRub: "0.00", paymentMethod: null, expenseDate: new Date().toISOString().slice(0, 10), updatedAt: restartedAt }).where(eq(expenses.id, result.expense.id));
  });
  return NextResponse.json({ message: "Распознавание перезапущено" });
}
