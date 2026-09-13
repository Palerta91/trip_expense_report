import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, tripMembers, trips } from "@/lib/db/schema";
import { createManualExpense } from "@/app/trips/actions";

export const dynamic = "force-dynamic";

export default async function NewExpensePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [trip] = await db.select({ id: trips.id, title: trips.title }).from(tripMembers).innerJoin(trips, eq(tripMembers.tripId, trips.id)).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
  if (!trip) notFound();
  const categoryRows = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name));
  const action = createManualExpense.bind(null, tripId);

  return (
    <AppShell userName={user.name}>
      <div className="page-heading"><div><h1>Добавить расход</h1><p className="lead">{trip.title} · ручной ввод без чека и распознавания.</p></div></div>
      <form className="card form-card" action={action}>
        <div className="form-grid">
          <div className="field"><label htmlFor="expenseDate">Дата расхода</label><input id="expenseDate" name="expenseDate" type="date" required /></div>
          <div className="field"><label htmlFor="categoryId">Категория</label><select id="categoryId" name="categoryId" defaultValue=""><option value="">Не выбрана</option>{categoryRows.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
          <div className="field full"><label htmlFor="merchant">Продавец / поставщик</label><input id="merchant" name="merchant" placeholder="Например: РЖД" required minLength={2} /></div>
          <div className="field"><label htmlFor="amount">Сумма</label><input id="amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></div>
          <div className="field"><label htmlFor="currency">Валюта</label><select id="currency" name="currency" defaultValue="RUB"><option value="RUB">RUB — российский рубль</option><option value="USD">USD — доллар США</option><option value="EUR">EUR — евро</option><option value="CNY">CNY — юань</option></select></div>
          <div className="field"><label htmlFor="exchangeRate">Курс к рублю</label><input id="exchangeRate" name="exchangeRate" type="number" min="0.000001" step="0.000001" placeholder="Для RUB заполнится сам" /></div>
          <div className="field"><label htmlFor="paymentMethod">Способ оплаты</label><input id="paymentMethod" name="paymentMethod" placeholder="Корпоративная карта" /></div>
          <div className="field full"><label htmlFor="description">Комментарий</label><textarea id="description" name="description" placeholder="Необязательно" /></div>
        </div>
        <div className="form-actions"><Link className="button secondary" href={`/trips/${tripId}`}>Отмена</Link><button className="button" type="submit">Сохранить расход</button></div>
      </form>
    </AppShell>
  );
}
