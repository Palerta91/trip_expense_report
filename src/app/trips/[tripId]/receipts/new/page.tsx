import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReceiptUploader } from "@/components/receipt-uploader";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [trip] = user.role === "ADMIN"
    ? await db.select({ id: trips.id, title: trips.title }).from(trips).where(eq(trips.id, tripId)).limit(1)
    : await db.select({ id: trips.id, title: trips.title }).from(tripMembers).innerJoin(trips, eq(tripMembers.tripId, trips.id)).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
  if (!trip) notFound();
  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><h1>Загрузить чек</h1><p className="lead">{trip.title} · распознавание заполнит лишь черновик, его нужно проверить.</p></div></div>
      <ReceiptUploader tripId={tripId} />
      <p className="lead">Нет чека или не хотите распознавать? <Link href={`/trips/${tripId}/expenses/new`} style={{ color: "var(--blue)", fontWeight: 650 }}>Внести расход вручную</Link>.</p>
    </AppShell>
  );
}
