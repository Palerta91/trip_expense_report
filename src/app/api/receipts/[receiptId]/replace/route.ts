import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, recognitionJobs, receipts, tripMembers } from "@/lib/db/schema";
import { deleteReceiptObjects, putReceipt } from "@/lib/storage";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxSize = 10 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const parsedId = z.string().uuid().safeParse(receiptId);
  if (!parsedId.success) return NextResponse.json({ message: "Некорректный идентификатор чека" }, { status: 400 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Требуется вход" }, { status: 401 });
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, parsedId.data)).limit(1);
  if (!receipt) return NextResponse.json({ message: "Чек не найден" }, { status: 404 });
  if (user.role !== "ADMIN") {
    const [membership] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, receipt.tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!membership) return NextResponse.json({ message: "Нет доступа к этому чеку" }, { status: 403 });
  }
  if (user.role !== "ADMIN" && receipt.uploadedBy !== user.id) return NextResponse.json({ message: "Заменить чек может автор загрузки или администратор" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Выберите новый файл чека" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Поддерживаются JPG, PNG, WEBP и PDF" }, { status: 400 });
  if (file.size === 0 || file.size > maxSize) return NextResponse.json({ message: "Размер файла должен быть не более 10 МБ" }, { status: 400 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "receipt";
  const objectKey = `receipts/${receipt.tripId}/${randomUUID()}-${safeName}`;
  await putReceipt(objectKey, file);
  const [linkedExpense] = await db.select({ source: expenses.source }).from(expenses).where(eq(expenses.receiptId, receipt.id)).limit(1);
  const shouldRecognize = linkedExpense?.source !== "MANUAL";
  const recognitionEnabled = shouldRecognize && process.env.ENABLE_MINIMAX_RECOGNITION === "true" && Boolean(process.env.MINIMAX_API_KEY);
  await db.transaction(async (tx) => {
    await tx.update(receipts).set({ objectKey, originalName: file.name.slice(0, 255), mimeType: file.type, byteSize: file.size, status: recognitionEnabled ? "UPLOADED" : "READY_FOR_REVIEW", extracted: null, errorMessage: null }).where(eq(receipts.id, receipt.id));
    await tx.update(expenses).set({ title: null, merchant: recognitionEnabled ? "Ожидается распознавание" : "Заполните данные вручную", merchantOriginal: null, categoryId: null, description: null, amount: "0.00", currency: "RUB", exchangeRate: "1.000000", amountRub: "0.00", paymentMethod: null, expenseDate: new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(expenses.receiptId, receipt.id));
    if (recognitionEnabled) await tx.insert(recognitionJobs).values({ receiptId: receipt.id, status: "PENDING", attempts: 0, errorMessage: null, processedAt: null }).onConflictDoUpdate({ target: recognitionJobs.receiptId, set: { status: "PENDING", attempts: 0, errorMessage: null, processedAt: null, createdAt: new Date() } });
  });
  await deleteReceiptObjects([receipt.objectKey]);
  return NextResponse.json({ message: recognitionEnabled ? "Чек заменён и отправлен на распознавание" : "Чек заменён. Заполните данные вручную." });
}
