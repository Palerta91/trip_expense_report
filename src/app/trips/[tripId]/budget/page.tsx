import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getTripBudgetOverview } from "@/lib/budgets";
import { db } from "@/lib/db";
import { categories, trips, users } from "@/lib/db/schema";
import { updateTripBudget } from "@/app/trips/actions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

export default async function TripBudgetPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) notFound();
  const canManage = user.role === "ADMIN" || trip.managerId === user.id || trip.budgetEditorId === user.id;
  if (!canManage) notFound();
  const canAssignEditor = user.role === "ADMIN" || trip.managerId === user.id;
  const [categoryRows, userRows, overview] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.name)),
    getTripBudgetOverview(tripId)
  ]);
  const plans = new Map(overview.lines.map((line) => [line.categoryId, line.planRub]));
  const action = updateTripBudget.bind(null, tripId);

  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><span className="eyebrow">Планирование</span><h1>Бюджет командировки</h1><p className="lead">{trip.title} · план {money.format(overview.totalPlanRub)}, факт {money.format(overview.totalFactRub)}</p></div><Link href={`/trips/${tripId}`} className="button secondary">К командировке</Link></div>
      <form className="card form-card budget-form" action={action}>
        <section className="budget-editor" aria-labelledby="budget-heading">
          <div className="budget-editor-heading"><div><span className="eyebrow">План / факт</span><h2 id="budget-heading">Целевой бюджет, ₽</h2></div><p className="expense-sub">Факт считается по сохранённым расходам в рублях.</p></div>
          {canAssignEditor ? <div className="field budget-owner"><label htmlFor="budgetEditorId">Ответственный за бюджет</label><select id="budgetEditorId" name="budgetEditorId" defaultValue={trip.budgetEditorId ?? trip.managerId}>{userRows.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select></div> : <input type="hidden" name="budgetEditorId" value={trip.budgetEditorId ?? trip.managerId} />}
          <div className="budget-field-grid">
            {categoryRows.map((category) => {
              const line = overview.lines.find((item) => item.categoryId === category.id);
              return <div className="budget-field" key={category.id}><label htmlFor={`budget_${category.id}`}>{category.name}</label><div className="money-input"><input id={`budget_${category.id}`} name={`budget_${category.id}`} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" defaultValue={plans.get(category.id) || ""} /><span>₽</span></div>{line && <span className={`budget-fact ${line.factRub > line.planRub ? "over" : ""}`}>Факт: {money.format(line.factRub)}</span>}</div>;
            })}
          </div>
        </section>
        <div className="form-actions"><Link className="button secondary" href={`/trips/${tripId}`}>Отмена</Link><button className="button" type="submit">Сохранить бюджет</button></div>
      </form>
    </AppShell>
  );
}
