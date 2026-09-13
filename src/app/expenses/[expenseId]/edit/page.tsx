import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, expenses, trips } from "@/lib/db/schema";
import { updateExpense } from "@/app/trips/actions";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params;
  const user = await requireUser();
  const [result] = await db.select({ expense: expenses, tripTitle: trips.title }).from(expenses).innerJoin(trips, eq(expenses.tripId, trips.id)).where(eq(expenses.id, expenseId)).limit(1);
  if (!result || result.expense.claimantId !== user.id) notFound();
  const categoryRows = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name));
  const action = updateExpense.bind(null, expenseId);
  const expense = result.expense;
  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><h1>Проверить расход</h1><p className="lead">{result.tripTitle} · данные из чека всегда нужно подтвердить вручную.</p></div></div>
      <form className="card form-card" action={action}>
        <div className="form-grid">
          <div className="field"><label htmlFor="expenseDate">Дата расхода</label><input id="expenseDate" name="expenseDate" type="date" required defaultValue={expense.expenseDate} /></div>
          <div className="field"><label htmlFor="categoryId">Категория</label><select id="categoryId" name="categoryId" defaultValue={expense.categoryId ?? ""}><option value="">Не выбрана</option>{categoryRows.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
          <div className="field full"><label htmlFor="merchant">Продавец / поставщик</label><input id="merchant" name="merchant" required defaultValue={expense.merchant} /></div>
          <div className="field"><label htmlFor="amount">Сумма</label><input id="amount" name="amount" type="number" min="0.01" step="0.01" required defaultValue={expense.amount} /></div>
          <div className="field"><label htmlFor="currency">Валюта</label><input id="currency" name="currency" maxLength={3} required defaultValue={expense.currency} /></div>
          <div className="field"><label htmlFor="exchangeRate">Курс к рублю</label><input id="exchangeRate" name="exchangeRate" type="number" min="0.000001" step="0.000001" defaultValue={expense.exchangeRate ?? ""} /></div>
          <div className="field"><label htmlFor="paymentMethod">Способ оплаты</label><input id="paymentMethod" name="paymentMethod" defaultValue={expense.paymentMethod ?? ""} /></div>
          <div className="field full"><label htmlFor="description">Комментарий</label><textarea id="description" name="description" defaultValue={expense.description ?? ""} /></div>
        </div>
        <div className="form-actions"><Link className="button secondary" href={`/trips/${expense.tripId}`}>Отмена</Link><button className="button" type="submit">Подтвердить данные</button></div>
      </form>
    </AppShell>
  );
}
