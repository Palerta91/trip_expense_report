import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { BarChart3, FileDown, FileUp, PencilLine, Plus, ReceiptText, UsersRound, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DeleteTripButton } from "@/components/delete-trip-button";
import { requireUser } from "@/lib/auth";
import { getTripBudgetOverview } from "@/lib/budgets";
import { db } from "@/lib/db";
import { categories, expenses, tripMembers, trips } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatMoney = (amount: string | number, currency: string) => new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const [result] = user.role === "ADMIN"
    ? await db.select({ trip: trips }).from(trips).where(eq(trips.id, tripId)).limit(1)
    : await db
      .select({ trip: trips })
      .from(tripMembers)
      .innerJoin(trips, eq(tripMembers.tripId, trips.id))
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
      .limit(1);
  if (!result) notFound();

  const [expenseRows, budget] = await Promise.all([
    db
      .select({ expense: expenses, categoryName: categories.name })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(eq(expenses.tripId, tripId))
      .orderBy(desc(expenses.expenseDate), asc(expenses.createdAt)),
    getTripBudgetOverview(tripId)
  ]);
  const totalRub = expenseRows.reduce((sum, row) => sum + Number(row.expense.amountRub ?? 0), 0);
  const canManageBudget = user.role === "ADMIN" || result.trip.managerId === user.id || result.trip.budgetEditorId === user.id;
  const canManageMembers = user.role === "ADMIN" || result.trip.managerId === user.id;
  const progress = budget.totalPlanRub ? Math.min((budget.totalFactRub / budget.totalPlanRub) * 100, 100) : 0;

  return (
    <AppShell userName={user.name} userRole={user.role}>
      <section className="card trip-hero">
        <div className="trip-hero-copy"><span className={`status-pill ${result.trip.status === "OPEN" ? "open" : ""}`}>{result.trip.status === "OPEN" ? "Открыта" : "Черновик"}</span><h1>{result.trip.title}</h1><p className="trip-dates">{result.trip.destination} · {result.trip.startsOn} — {result.trip.endsOn}</p>{result.trip.purpose && <p className="trip-purpose">{result.trip.purpose}</p>}</div>
        <div className="trip-actions">
          <Link className="button secondary icon-only" href={`/api/trips/${tripId}/report?format=xlsx`} aria-label="Скачать Excel"><FileDown size={17} /><span>Excel</span></Link>
          <Link className="button secondary icon-only" href={`/api/trips/${tripId}/report?format=docx`} aria-label="Скачать Word"><FileDown size={17} /><span>Word</span></Link>
          {canManageMembers && <Link className="button secondary" href={`/trips/${tripId}/members`}><UsersRound size={17} /><span>Участники</span></Link>}
          {user.role === "ADMIN" && <DeleteTripButton tripId={tripId} title={result.trip.title} />}
        </div>
      </section>

      <section className="trip-workbench" aria-label="Действия с командировкой">
        <Link className="workbench-action receipt-action" href={`/trips/${tripId}/receipts/new`}><span><ReceiptText size={21} /></span><div><strong>Подгрузить чек</strong><small>Фото, файл или скан</small></div><FileUp size={18} /></Link>
        <Link className="workbench-action expense-action" href={`/trips/${tripId}/expenses/new`}><span><WalletCards size={21} /></span><div><strong>Добавить расход</strong><small>Ручной ввод без чека</small></div><Plus size={18} /></Link>
      </section>

      <section className="card trip-budget-summary">
        <div className="budget-summary-head"><div><span className="eyebrow">План / факт</span><h2>Целевой бюджет</h2></div>{canManageBudget && <Link href={`/trips/${tripId}/budget`} className="button secondary"><BarChart3 size={17} />{budget.totalPlanRub ? "Изменить бюджет" : "Задать бюджет"}</Link>}</div>
        {budget.totalPlanRub ? <><div className="budget-totals"><div><span>План</span><strong>{formatMoney(budget.totalPlanRub, "RUB")}</strong></div><div><span>Факт</span><strong className={budget.totalFactRub > budget.totalPlanRub ? "amount-over" : ""}>{formatMoney(budget.totalFactRub, "RUB")}</strong></div><div><span>Остаток</span><strong className={budget.totalFactRub > budget.totalPlanRub ? "amount-over" : ""}>{formatMoney(budget.totalPlanRub - budget.totalFactRub, "RUB")}</strong></div></div><div className="progress-track large"><span className={budget.totalFactRub > budget.totalPlanRub ? "over" : ""} style={{ width: `${progress}%` }} /></div><div className="budget-summary-caption">Освоено {Math.round((budget.totalFactRub / budget.totalPlanRub) * 100)}% бюджета · подробности в дашборде руководителя</div></> : <div className="budget-empty"><BarChart3 size={20} /><span>Целевой бюджет пока не задан. Добавьте лимиты по статьям, чтобы видеть план и факт.</span></div>}
      </section>

      <section className="expenses-section">
        <div className="section-heading"><div><span className="eyebrow">Расходы</span><h2>Статьи расходов</h2><p className="lead">{expenseRows.length} поз. · Всего {formatMoney(totalRub, "RUB")}</p></div><Link className="section-link" href={`/trips/${tripId}/expenses/new`}>Добавить <Plus size={16} /></Link></div>
        {expenseRows.length === 0 ? <div className="card empty"><p>Расходов пока нет.</p><p className="expense-sub">Загрузите чек или внесите данные вручную — распознавание не обязательно.</p></div> : <div className="card expense-list">
          {expenseRows.map(({ expense, categoryName }) => <div className="expense-row" key={expense.id}>
            <span className="expense-category-icon"><WalletCards size={17} /></span>
            <div><div className="expense-merchant">{expense.merchant}</div><div className="expense-sub">{categoryName ?? "Без категории"} · {expense.expenseDate} · {expense.source === "MANUAL" ? "Вручную" : "Из чека"}</div></div>
            <div className="expense-payment">{expense.paymentMethod ?? "Способ оплаты не указан"}</div>
            <div className="expense-amount"><div className="amount">{formatMoney(expense.amount, expense.currency)}</div><div className="amount-rub">{expense.amountRub ? `≈ ${formatMoney(expense.amountRub, "RUB")}` : "Курс не указан"}</div></div>
            {expense.claimantId === user.id && <Link aria-label="Редактировать расход" href={`/expenses/${expense.id}/edit`} className="edit-expense"><PencilLine size={16} /></Link>}
          </div>)}
        </div>}
      </section>
    </AppShell>
  );
}
