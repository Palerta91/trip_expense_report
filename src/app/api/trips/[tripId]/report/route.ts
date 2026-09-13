import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tripMembers } from "@/lib/db/schema";
import { createDocxReport, createXlsxReport } from "@/lib/reports";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Требуется вход" }, { status: 401 });
  if (user.role !== "ADMIN") {
    const [membership] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!membership) return NextResponse.json({ message: "Нет доступа к этой командировке" }, { status: 403 });
  }
  const format = new URL(request.url).searchParams.get("format");
  if (format === "xlsx") {
    const file = await createXlsxReport(tripId);
    return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=trip-expenses.xlsx" } });
  }
  if (format === "docx") {
    const file = await createDocxReport(tripId);
    return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": "attachment; filename=trip-expenses.docx" } });
  }
  return NextResponse.json({ message: "Укажите format=xlsx или format=docx" }, { status: 400 });
}
