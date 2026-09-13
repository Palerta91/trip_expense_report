import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const user = await requireUser();
  const tripRows = await db
    .select({ id: trips.id, title: trips.title, destination: trips.destination, startsOn: trips.startsOn, endsOn: trips.endsOn, status: trips.status })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, user.id))
    .orderBy(desc(trips.startsOn));

  const ids = tripRows.map((trip) => trip.id);
  const expenseRows = ids.length ? await db.select({ amountRub: expenses.amountRub }).from(expenses).where(inArray(expenses.tripId, ids)) : [];
  const totalRub = expenseRows.reduce((sum, item) => sum + Number(item.amountRub ?? 0), 0);
  const openTrips = tripRows.filter((trip) => trip.status === "OPEN" || trip.status === "DRAFT").length;

  return (
    <AppShell userName={user.name}>
      <div className="page-heading">
        <div><h1>Мои командировки</h1><p className="lead">Расходы, чеки и итоговые отчёты — в одном месте.</p></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{user.role === "ADMIN" && <Link className="button secondary" href="/members">Участники</Link>}{(user.role === "ADMIN" || user.role === "MANAGER") && <Link className="button" href="/trips/new"><Plus size={18} />Создать командировку</Link>}</div>
      </div>
      <section className="stat-grid" aria-label="Сводка">
        <div className="card stat"><div className="stat-label">Всего командировок</div><div className="stat-value">{tripRows.length}</div></div>
        <div className="card stat"><div className="stat-label">Открыты сейчас</div><div className="stat-value">{openTrips}</div></div>
        <div className="card stat"><div className="stat-label">Расходы в рублях</div><div className="stat-value">{money.format(totalRub)}</div></div>
      </section>
      <div className="section-heading"><h2>Последние</h2>{tripRows.length > 0 && <span className="lead">{tripRows.length} всего</span>}</div>
      {tripRows.length === 0 ? (
        <div className="card empty"><p>Командировок пока нет.</p>{(user.role === "ADMIN" || user.role === "MANAGER") && <Link className="button" href="/trips/new">Создать первую</Link>}</div>
      ) : (
        <div className="trip-list">
          {tripRows.map((trip) => <Link key={trip.id} className="card trip-row" href={`/trips/${trip.id}`}>
            <div><p className="trip-title">{trip.title}</p><p className="trip-meta">{trip.destination} · {trip.startsOn} — {trip.endsOn}</p></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="badge">{trip.status === "OPEN" ? "Открыта" : "Черновик"}</span><ArrowRight size={18} color="#64748b" /></div>
          </Link>)}
        </div>
      )}
    </AppShell>
  );
}
