import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReceiptUploader } from "@/components/receipt-uploader";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, expenses, receipts, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function EditReceiptExpensePage({ params }: { params: Promise<{ tripId: string; receiptId: string }> }) {
  const { tripId, receiptId } = await params;
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    const [membership] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!membership) notFound();
  }

  const [receiptRow] = await db
    .select({ id: receipts.id, uploadedBy: receipts.uploadedBy, source: expenses.source, tripTitle: trips.title })
    .from(receipts)
    .innerJoin(trips, eq(receipts.tripId, trips.id))
    .leftJoin(expenses, eq(expenses.receiptId, receipts.id))
    .where(and(eq(receipts.id, receiptId), eq(receipts.tripId, tripId)))
    .limit(1);
  if (!receiptRow || (user.role !== "ADMIN" && receiptRow.uploadedBy !== user.id)) notFound();

  const categoryRows = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name));
  const mode = receiptRow.source === "MANUAL" ? "manual" : "recognition";

  return <AppShell userName={user.name} userRole={user.role}>
    <div className="page-heading"><div><Link className="back-link" href={`/trips/${tripId}/receipts/${receiptId}`}><ArrowLeft size={16} />К чеку</Link><h1>Редактировать расход</h1><p className="lead">{receiptRow.tripTitle} · измените данные, связанные с этим чеком.</p></div></div>
    <ReceiptUploader tripId={tripId} categories={categoryRows} initialReceiptId={receiptId} mode={mode} showUploadForm={false} />
  </AppShell>;
}
