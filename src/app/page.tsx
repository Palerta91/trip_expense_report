import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowUpRight, BarChart3, Plus, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const user = await requireUser();
  const tripRows = user.role === "ADMIN"
    ? await db.select({ id: trips.id, title: trips.title, destination: trips.destination, startsOn: trips.startsOn, endsOn: trips.endsOn, status: trips.status }).from(trips).orderBy(desc(trips.startsOn))
    : await db
      .select({ id: trips.id, title: trips.title, destination: trips.destination, startsOn: trips.startsOn, endsOn: trips.endsOn, status: trips.status })
      .from(tripMembers)
      .innerJoin(trips, eq(tripMembers.tripId, trips.id))
      .where(eq(tripMembers.userId, user.id))
      .orderBy(desc(trips.startsOn));

  const ids = tripRows.map((trip) => trip.id);
  const expenseRows = ids.length ? await db.select({ amountRub: expenses.amountRub }).from(expenses).where(inArray(expenses.tripId, ids)) : [];
  const totalRub = expenseRows.reduce((sum, item) => sum + Number(item.amountRub ?? 0), 0);
  const openTrips = tripRows.filter((trip) => trip.status === "OPEN" || trip.status === "DRAFT").length;
  const activeTrip = tripRows.find((trip) => trip.status === "OPEN" || trip.status === "DRAFT");
  const canManageTrips = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <AppShell userName={user.name} userRole={user.role}>
      <section className="home-hero">
        <div><span className="eyebrow">Рабочее пространство</span><h1>Здравствуйте, {user.name.split(" ")[0]}</h1><p className="lead">Добавляйте расходы и держите командировку под контролем.</p></div>
        <div className="hero-actions">{user.role === "ADMIN" && <Link className="button secondary" href="/members">Участники</Link>}{canManageTrips && <Link className="button" href="/trips/new"><Plus size={18} />Новая командировка</Link>}</div>
      </section>

      <section className="quick-actions-section" aria-labelledby="quick-actions-heading">
        <div className="section-heading compact"><div><span className="eyebrow">Быстрое действие</span><h2 id="quick-actions-heading">Добавить в командировку</h2></div>{activeTrip ? <Link className="active-trip-link" href={`/trips/${activeTrip.id}`}>{activeTrip.title}<ArrowUpRight size={15} /></Link> : <span className="expense-sub">Нет активной командировки</span>}</div>
        <div className="quick-actions">
          {activeTrip ? <Link className="quick-action receipt-action" href={`/trips/${activeTrip.id}/receipts/new`}><span className="quick-action-icon"><ReceiptText size={25} /></span><span><strong>Подгрузить чек</strong><small>Фото или файл — создадим черновик расхода</small></span><ArrowUpRight size={20} /></Link> : <div className="quick-action disabled"><span className="quick-action-icon"><ReceiptText size={25} /></span><span><strong>Подгрузить чек</strong><small>Сначала откройте командировку</small></span></div>}
          {activeTrip ? <Link className="quick-action expense-action" href={`/trips/${activeTrip.id}/expenses/new`}><span className="quick-action-icon"><WalletCards size={25} /></span><span><strong>Добавить статью расхода</strong><small>Чек обязателен; данные вводятся вручную, без ИИ</small></span><ArrowUpRight size={20} /></Link> : <div className="quick-action disabled"><span className="quick-action-icon"><WalletCards size={25} /></span><span><strong>Добавить статью расхода</strong><small>Сначала откройте командировку</small></span></div>}
        </div>
      </section>

      <section className="stat-grid" aria-label="Сводка по командировкам">
        <div className="card stat"><div className="stat-icon blue"><ReceiptText size={18} /></div><div><div className="stat-label">Командировок</div><div className="stat-value">{tripRows.length}</div></div></div>
        <div className="card stat"><div className="stat-icon violet"><BarChart3 size={18} /></div><div><div className="stat-label">Открыты сейчас</div><div className="stat-value">{openTrips}</div></div></div>
        <div className="card stat"><div className="stat-icon orange"><WalletCards size={18} /></div><div><div className="stat-label">Расходы в рублях</div><div className="stat-value money-value">{money.format(totalRub)}</div></div></div>
      </section>

      <section className="trips-section">
        <div className="section-heading"><div><span className="eyebrow">Поездки</span><h2>Мои командировки</h2></div>{canManageTrips && <Link className="section-link" href="/trips/new">Создать <Plus size={16} /></Link>}</div>
        {tripRows.length === 0 ? (
          <div className="card empty"><p>Командировок пока нет.</p>{canManageTrips ? <Link className="button" href="/trips/new">Создать первую</Link> : <p className="expense-sub">Попросите руководителя добавить вас в командировку.</p>}</div>
        ) : (
          <div className="trip-list">
            {tripRows.map((trip) => <Link key={trip.id} className="card trip-row" href={`/trips/${trip.id}`}>
              <span className="trip-icon"><ReceiptText size={18} /></span>
              <div className="trip-row-content"><p className="trip-title">{trip.title}</p><p className="trip-meta">{trip.destination} · {trip.startsOn} — {trip.endsOn}</p></div>
              <div className="trip-row-side"><span className={`status-pill ${trip.status === "OPEN" ? "open" : ""}`}>{trip.status === "OPEN" ? "Открыта" : "Черновик"}</span><ArrowUpRight size={18} /></div>
            </Link>)}
          </div>
        )}
      </section>
    </AppShell>
  );
}
