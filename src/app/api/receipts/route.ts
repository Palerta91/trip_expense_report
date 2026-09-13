import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, recognitionJobs, receipts, tripMembers } from "@/lib/db/schema";
import { putReceipt } from "@/lib/storage";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxSize = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Требуется вход" }, { status: 401 });

  const formData = await request.formData();
  const parsed = z.object({ tripId: z.string().uuid() }).safeParse({ tripId: formData.get("tripId") });
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File)) return NextResponse.json({ message: "Передайте командировку и файл" }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Поддерживаются JPG, PNG, WEBP и PDF" }, { status: 400 });
  if (file.size === 0 || file.size > maxSize) return NextResponse.json({ message: "Размер файла должен быть не более 10 МБ" }, { status: 400 });

  if (user.role !== "ADMIN") {
    const [member] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, parsed.data.tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!member) return NextResponse.json({ message: "Нет доступа к этой командировке" }, { status: 403 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "receipt";
  const objectKey = `receipts/${parsed.data.tripId}/${randomUUID()}-${safeName}`;
  await putReceipt(objectKey, file);

  const recognitionEnabled = process.env.ENABLE_MINIMAX_RECOGNITION === "true" && Boolean(process.env.MINIMAX_API_KEY);
  const [receipt] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(receipts).values({
      tripId: parsed.data.tripId,
      uploadedBy: user.id,
      objectKey,
      originalName: file.name.slice(0, 255),
      mimeType: file.type,
      byteSize: file.size,
      status: recognitionEnabled ? "UPLOADED" : "READY_FOR_REVIEW"
    }).returning({ id: receipts.id });
    await tx.insert(expenses).values({
      tripId: parsed.data.tripId,
      claimantId: user.id,
      receiptId: created.id,
      source: "RECEIPT",
      expenseDate: new Date().toISOString().slice(0, 10),
      merchant: "Ожидается распознавание",
      amount: "0.00",
      currency: "RUB",
      exchangeRate: "1.000000",
      amountRub: "0.00"
    });
    if (recognitionEnabled) await tx.insert(recognitionJobs).values({ receiptId: created.id });
    return [created];
  });

  return NextResponse.json({
    receiptId: receipt.id,
    message: recognitionEnabled ? "Чек загружен. Распознаём данные — форма появится ниже." : "Чек загружен. Заполните поля расхода ниже вручную."
  }, { status: 201 });
}
