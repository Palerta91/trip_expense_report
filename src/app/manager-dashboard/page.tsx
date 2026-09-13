import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowUpRight, CircleAlert, CircleCheck, ClipboardList, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, expenses, tripBudgets, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

export default async function ManagerDashboardPage() {
  const user = await requireUser();
  if (user.role === "PARTICIPANT") redirect("/");
  const tripRows = user.role === "ADMIN"
    ? await db.select().from(trips).orderBy(desc(trips.startsOn))
    : await db.select().from(trips).where(eq(trips.managerId, user.id)).orderBy(desc(trips.startsOn));
  const tripIds = tripRows.map((trip) => trip.id);
  const [budgetRows, expenseRows] = tripIds.length ? await Promise.all([
    db.select({ tripId: tripBudgets.tripId, categoryId: tripBudgets.categoryId, categoryName: categories.name, amountRub: tripBudgets.amountRub }).from(tripBudgets).innerJoin(categories, eq(tripBudgets.categoryId, categories.id)).where(inArray(tripBudgets.tripId, tripIds)),
    db.select({ tripId: expenses.tripId, categoryId: expenses.categoryId, categoryName: categories.name, amountRub: expenses.amountRub }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).where(inArray(expenses.tripId, tripIds))
  ]) : [[], []];

  const planByCategory = new Map<string, { name: string; planRub: number; factRub: number }>();
  for (const row of budgetRows) {
    const current = planByCategory.get(row.categoryId) ?? { name: row.categoryName, planRub: 0, factRub: 0 };
    current.planRub += Number(row.amountRub);
    planByCategory.set(row.categoryId, current);
  }
  for (const row of expenseRows) {
    const categoryId = row.categoryId ?? "__uncategorized";
    const current = planByCategory.get(categoryId) ?? { name: row.categoryName ?? "Без категории", planRub: 0, factRub: 0 };
    current.factRub += Number(row.amountRub ?? 0);
    planByCategory.set(categoryId, current);
  }
  const chartLines = [...planByCategory.entries()].map(([id, line]) => ({ id, ...line })).sort((a, b) => b.planRub - a.planRub);
  const totalPlan = chartLines.reduce((sum, line) => sum + line.planRub, 0);
  const totalFact = chartLines.reduce((sum, line) => sum + line.factRub, 0);
  const maxValue = Math.max(1, ...chartLines.flatMap((line) => [line.planRub, line.factRub]));
  const remaining = totalPlan - totalFact;
  const factPercent = totalPlan ? Math.min((totalFact / totalPlan) * 100, 100) : 0;

  const factByTrip = new Map<string, number>();
  const planByTrip = new Map<string, number>();
  for (const row of budgetRows) planByTrip.set(row.tripId, (planByTrip.get(row.tripId) ?? 0) + Number(row.amountRub));
  for (const row of expenseRows) factByTrip.set(row.tripId, (factByTrip.get(row.tripId) ?? 0) + Number(row.amountRub ?? 0));

  return (
    <AppShell userName={user.name} userRole={user.role}>
      <section className="dashboard-hero">
        <div><span className="eyebrow">Контроль расходов</span><h1>Дашборд руководителя</h1><p className="lead">План и фактические траты по вашим командировкам.</p></div>
        <div className={`budget-health ${remaining < 0 ? "over" : ""}`}>{remaining < 0 ? <CircleAlert size={18} /> : <CircleCheck size={18} />}<span>{totalPlan ? remaining < 0 ? `Превышение ${money.format(Math.abs(remaining))}` : `Остаток ${money.format(remaining)}` : "Задайте целевые бюджеты"}</span></div>
      </section>

      <section className="manager-stat-grid" aria-label="Ключевые показатели">
        <div className="card manager-stat"><span className="stat-icon blue"><ClipboardList size={19} /></span><div><span>Целевой бюджет</span><strong>{money.format(totalPlan)}</strong></div></div>
        <div className="card manager-stat"><span className="stat-icon orange"><WalletCards size={19} /></span><div><span>Фактические расходы</span><strong>{money.format(totalFact)}</strong></div></div>
        <div className="card manager-stat"><span className="stat-icon violet"><CircleCheck size={19} /></span><div><span>Командировок в обзоре</span><strong>{tripRows.length}</strong></div></div>
      </section>

      <section className="card budget-chart-card" aria-labelledby="budget-chart-heading">
        <div className="chart-heading"><div><span className="eyebrow">План / факт</span><h2 id="budget-chart-heading">Целевой бюджет по статьям</h2></div><div className="chart-legend"><span><i className="plan-dot" />План</span><span><i className="fact-dot" />Факт</span></div></div>
        {chartLines.length === 0 ? <div className="empty compact-empty"><p>Бюджет ещё не задан.</p><p className="expense-sub">Откройте командировку и добавьте суммы по статьям расходов.</p></div> : <div className="budget-chart">
          {chartLines.map((line) => <div className="chart-row" key={line.id}>
            <div className="chart-label"><span>{line.name}</span><strong>{money.format(line.factRub)} <em>из {money.format(line.planRub)}</em></strong></div>
            <div className="bar-pair"><span className="bar plan-bar" style={{ width: `${Math.max((line.planRub / maxValue) * 100, 2)}%` }} /><span className={`bar fact-bar ${line.factRub > line.planRub ? "over" : ""}`} style={{ width: `${Math.max((line.factRub / maxValue) * 100, line.factRub ? 2 : 0)}%` }} /></div>
          </div>)}
        </div>}
        {totalPlan > 0 && <div className="overall-progress"><div><span>Освоение бюджета</span><strong>{Math.round((totalFact / totalPlan) * 100)}%</strong></div><div className="progress-track"><span className={totalFact > totalPlan ? "over" : ""} style={{ width: `${factPercent}%` }} /></div></div>}
      </section>

      <section className="trips-section manager-trip-section">
        <div className="section-heading"><div><span className="eyebrow">Детализация</span><h2>Командировки</h2></div></div>
        {tripRows.length === 0 ? <div className="card empty"><p>Здесь появится аналитика после создания первой командировки.</p></div> : <div className="trip-list">
          {tripRows.map((trip) => { const plan = planByTrip.get(trip.id) ?? 0; const fact = factByTrip.get(trip.id) ?? 0; return <Link className="card trip-row manager-trip-row" href={`/trips/${trip.id}`} key={trip.id}><span className="trip-icon"><ClipboardList size={18} /></span><div className="trip-row-content"><p className="trip-title">{trip.title}</p><p className="trip-meta">{trip.destination} · План {money.format(plan)} · Факт {money.format(fact)}</p></div><ArrowUpRight size={18} /></Link>; })}
        </div>}
      </section>
    </AppShell>
  );
}
