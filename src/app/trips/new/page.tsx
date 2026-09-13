import Link from "next/link";
import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, users } from "@/lib/db/schema";
import { createTrip } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const user = await requireUser();
  if (user.role === "PARTICIPANT") redirect("/");
  const [categoryRows, userRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.name))
  ]);
  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><span className="eyebrow">Новая поездка</span><h1>Создайте командировку</h1><p className="lead">Сразу задайте план расходов: это станет ориентиром для руководителя.</p></div></div>
      <form className="card form-card" action={createTrip}>
        <div className="form-grid">
          <div className="field full"><label htmlFor="title">Название</label><input id="title" name="title" placeholder="Переговоры с партнёром" required minLength={3} /></div>
          <div className="field full"><label htmlFor="destination">Город / страна</label><input id="destination" name="destination" placeholder="Казань, Россия" required minLength={2} /></div>
          <div className="field"><label htmlFor="startsOn">Начало</label><input id="startsOn" name="startsOn" type="date" required /></div>
          <div className="field"><label htmlFor="endsOn">Окончание</label><input id="endsOn" name="endsOn" type="date" required /></div>
          <div className="field full"><label htmlFor="purpose">Цель поездки</label><textarea id="purpose" name="purpose" placeholder="Необязательно, но попадёт в итоговый отчёт" /></div>
          <div className="field full"><label htmlFor="budgetEditorId">Ответственный за бюджет</label><select id="budgetEditorId" name="budgetEditorId" defaultValue={user.id}>{userRows.map((member) => <option key={member.id} value={member.id}>{member.name}{member.id === user.id ? " — вы" : ""} · {member.email}</option>)}</select><span className="expense-sub">Его автоматически добавим в командировку. Он сможет корректировать бюджет по категориям.</span></div>
        </div>
        <section className="budget-editor" aria-labelledby="budget-heading">
          <div className="budget-editor-heading"><div><span className="eyebrow">План</span><h2 id="budget-heading">Целевой бюджет, ₽</h2></div><p className="expense-sub">Заполните только нужные статьи. Бюджет можно изменить позднее.</p></div>
          <div className="budget-field-grid">
            {categoryRows.map((category) => <div className="budget-field" key={category.id}><label htmlFor={`budget_${category.id}`}>{category.name}</label><div className="money-input"><input id={`budget_${category.id}`} name={`budget_${category.id}`} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" /><span>₽</span></div></div>)}
          </div>
        </section>
        <div className="form-actions"><Link className="button secondary" href="/">Отмена</Link><button className="button" type="submit">Создать командировку</button></div>
      </form>
    </AppShell>
  );
}
