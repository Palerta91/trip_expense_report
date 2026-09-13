import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReceiptUploader } from "@/components/receipt-uploader";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function NewExpensePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [trip] = user.role === "ADMIN"
    ? await db.select({ id: trips.id, title: trips.title }).from(trips).where(eq(trips.id, tripId)).limit(1)
    : await db.select({ id: trips.id, title: trips.title }).from(tripMembers).innerJoin(trips, eq(tripMembers.tripId, trips.id)).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
  if (!trip) notFound();
  const categoryRows = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name));

  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><h1>Добавить расход</h1><p className="lead">{trip.title} · приложите чек или скриншот и заполните данные вручную — без распознавания ИИ.</p></div></div>
      <ReceiptUploader tripId={tripId} categories={categoryRows} mode="manual" />
    </AppShell>
  );
}
