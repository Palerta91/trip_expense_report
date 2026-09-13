import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReceiptUploader } from "@/components/receipt-uploader";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, receipts, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [trip] = user.role === "ADMIN"
    ? await db.select({ id: trips.id, title: trips.title }).from(trips).where(eq(trips.id, tripId)).limit(1)
    : await db.select({ id: trips.id, title: trips.title }).from(tripMembers).innerJoin(trips, eq(tripMembers.tripId, trips.id)).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
  if (!trip) notFound();
  const [categoryRows, latestReceiptRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name)),
    db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.tripId, tripId), eq(receipts.uploadedBy, user.id))).orderBy(desc(receipts.createdAt)).limit(1)
  ]);
  const latestReceipt = latestReceiptRows[0];
  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><h1>Загрузить чек</h1><p className="lead">{trip.title} · распознаем данные и покажем заполняемый расход рядом с превью.</p></div></div>
      <ReceiptUploader tripId={tripId} categories={categoryRows} initialReceiptId={latestReceipt?.id} />
      <p className="lead">Нет чека или не хотите распознавать? <Link href={`/trips/${tripId}/expenses/new`} style={{ color: "var(--blue)", fontWeight: 650 }}>Внести расход вручную</Link>.</p>
    </AppShell>
  );
}
