import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, recognitionJobs, receipts, tripMembers } from "@/lib/db/schema";
import { deleteReceiptObjects } from "@/lib/storage";

export const runtime = "nodejs";

const expensePayload = z.object({
  title: z.string().trim().max(180).optional(),
  merchantOriginal: z.string().trim().max(180).optional(),
  merchant: z.string().trim().min(2, "Укажите название или получателя на русском").max(180),
  expenseDate: z.string().date(),
  categoryId: z.string().uuid().optional(),
  amount: z.coerce.number().positive("Сумма должна быть больше нуля").max(999999999),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  exchangeRate: z.union([z.literal(""), z.coerce.number().positive("Курс должен быть больше нуля")]).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional()
});

async function getAccessibleReceipt(receiptId: string) {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ message: "Требуется вход" }, { status: 401 }) } as const;
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId)).limit(1);
  if (!receipt) return { response: NextResponse.json({ message: "Чек не найден" }, { status: 404 }) } as const;
  if (user.role !== "ADMIN") {
    const [membership] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, receipt.tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!membership) return { response: NextResponse.json({ message: "Нет доступа к этому чеку" }, { status: 403 }) } as const;
  }
  return { user, receipt } as const;
}

export async function GET(_: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const parsedId = z.string().uuid().safeParse(receiptId);
  if (!parsedId.success) return NextResponse.json({ message: "Некорректный идентификатор чека" }, { status: 400 });
  const result = await getAccessibleReceipt(parsedId.data);
  if ("response" in result) return result.response;
  const [[expense], [job]] = await Promise.all([
    db.select().from(expenses).where(eq(expenses.receiptId, result.receipt.id)).limit(1),
    db.select().from(recognitionJobs).where(eq(recognitionJobs.receiptId, result.receipt.id)).limit(1)
  ]);
  const canEdit = result.user.role === "ADMIN" || result.receipt.uploadedBy === result.user.id;
  const restartAt = job ? new Date(job.createdAt.getTime() + 60_000) : null;
  const canRestart = Boolean(canEdit && job && expense?.source === "RECEIPT" && result.receipt.status !== "READY_FOR_REVIEW" && restartAt && restartAt.getTime() <= Date.now());
  return NextResponse.json({
    receipt: {
      id: result.receipt.id,
      originalName: result.receipt.originalName,
      mimeType: result.receipt.mimeType,
      status: result.receipt.status,
      errorMessage: result.receipt.errorMessage
    },
    expense: expense ?? null,
    canEdit,
    recognition: job && expense?.source === "RECEIPT" ? {
      status: job.status,
      startedAt: job.createdAt.toISOString(),
      canCancel: canEdit && (job.status === "PENDING" || job.status === "PROCESSING"),
      canRestart,
      restartAt: restartAt?.toISOString() ?? null
    } : null
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const parsedId = z.string().uuid().safeParse(receiptId);
  if (!parsedId.success) return NextResponse.json({ message: "Некорректный идентификатор чека" }, { status: 400 });
  const result = await getAccessibleReceipt(parsedId.data);
  if ("response" in result) return result.response;
  if (result.user.role !== "ADMIN" && result.receipt.uploadedBy !== result.user.id) return NextResponse.json({ message: "Редактировать результат может автор загрузки или администратор" }, { status: 403 });

  const parsed = expensePayload.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Проверьте поля расхода" }, { status: 400 });
  const { amount, currency, exchangeRate, ...rest } = parsed.data;
  const rate = currency === "RUB" ? 1 : exchangeRate === "" || exchangeRate === undefined ? undefined : exchangeRate;
  const values = {
    ...rest,
    merchantOriginal: rest.merchantOriginal || null,
    amount: amount.toFixed(2),
    currency,
    exchangeRate: rate?.toFixed(6),
    amountRub: rate ? (amount * rate).toFixed(2) : null,
    updatedAt: new Date()
  };
  const [expense] = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.receiptId, result.receipt.id)).limit(1);
  if (expense) await db.update(expenses).set(values).where(eq(expenses.id, expense.id));
  else await db.insert(expenses).values({ ...values, tripId: result.receipt.tripId, claimantId: result.receipt.uploadedBy, receiptId: result.receipt.id, source: "RECEIPT" });
  await db.update(receipts).set({ status: "READY_FOR_REVIEW", errorMessage: null }).where(eq(receipts.id, result.receipt.id));
  const [updated] = await db.select().from(expenses).where(eq(expenses.receiptId, result.receipt.id)).limit(1);
  return NextResponse.json({ expense: updated, message: "Расход сохранён" });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const parsedId = z.string().uuid().safeParse(receiptId);
  if (!parsedId.success) return NextResponse.json({ message: "Некорректный идентификатор чека" }, { status: 400 });
  const result = await getAccessibleReceipt(parsedId.data);
  if ("response" in result) return result.response;
  if (result.user.role !== "ADMIN" && result.receipt.uploadedBy !== result.user.id) return NextResponse.json({ message: "Удалить чек может автор загрузки или администратор" }, { status: 403 });
  await deleteReceiptObjects([result.receipt.objectKey]);
  await db.transaction(async (tx) => {
    await tx.delete(expenses).where(eq(expenses.receiptId, result.receipt.id));
    await tx.delete(receipts).where(eq(receipts.id, result.receipt.id));
  });
  return NextResponse.json({ message: "Чек и связанный расход удалены" });
}
