import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { receipts, tripMembers } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ receiptId: string }> }) {
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
  const { client, bucket } = getStorage();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: receipt.objectKey }));
  if (!object.Body) return NextResponse.json({ message: "Файл чека не найден в хранилище" }, { status: 404 });
  const data = await object.Body.transformToByteArray();
  return new NextResponse(Buffer.from(data), { headers: { "Content-Type": receipt.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=300" } });
}
