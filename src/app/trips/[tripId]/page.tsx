import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { FileDown, FileUp, PencilLine, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, expenses, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatMoney = (amount: string, currency: string) => new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(Number(amount));

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [result] = await db
    .select({ trip: trips })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);
  if (!result) notFound();

  const expenseRows = await db
    .select({ expense: expenses, categoryName: categories.name })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(eq(expenses.tripId, tripId))
    .orderBy(desc(expenses.expenseDate), asc(expenses.createdAt));
  const totalRub = expenseRows.reduce((sum, row) => sum + Number(row.expense.amountRub ?? 0), 0);

  return (
    <AppShell userName={user.name}>
      <section className="card trip-hero">
        <div><span className="badge">{result.trip.status === "OPEN" ? "Открыта" : "Черновик"}</span><h1 style={{ marginTop: 12 }}>{result.trip.title}</h1><p className="trip-dates">{result.trip.destination} · {result.trip.startsOn} — {result.trip.endsOn}</p></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="button secondary" href={`/api/trips/${tripId}/report?format=xlsx`}><FileDown size={17} />Excel</Link><Link className="button secondary" href={`/api/trips/${tripId}/report?format=docx`}><FileDown size={17} />Word</Link><Link className="button secondary" href={`/trips/${tripId}/receipts/new`}><FileUp size={17} />Загрузить чек</Link><Link className="button" href={`/trips/${tripId}/expenses/new`}><Plus size={17} />Добавить расход</Link></div>
      </section>
      <div className="section-heading"><div><h2>Расходы</h2><p className="lead">{expenseRows.length} поз. · Всего: {new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(totalRub)}</p></div></div>
      {expenseRows.length === 0 ? <div className="card empty"><p>Расходов пока нет.</p><p>Можно вручную внести данные или загрузить чек для создания черновика.</p></div> : <div className="card expense-list">
        {expenseRows.map(({ expense, categoryName }) => <div className="expense-row" key={expense.id}>
          <div><div className="expense-merchant">{expense.merchant}</div><div className="expense-sub">{categoryName ?? "Без категории"} · {expense.expenseDate} · {expense.source === "MANUAL" ? "Вручную" : "Из чека"}</div></div>
          <div className="expense-sub">{expense.paymentMethod ?? "Способ оплаты не указан"}</div>
          <div><div className="amount">{formatMoney(expense.amount, expense.currency)}</div><div className="amount-rub">{expense.amountRub ? `≈ ${formatMoney(expense.amountRub, "RUB")}` : "Курс не указан"}</div></div>
          <Link aria-label="Редактировать расход" href={`/expenses/${expense.id}/edit`} className="button secondary" style={{ minHeight: 36, padding: "0 10px" }}><PencilLine size={16} /></Link>
        </div>)}
      </div>}
    </AppShell>
  );
}
