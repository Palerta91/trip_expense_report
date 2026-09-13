import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, FileText, ScanLine } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReceiptActions } from "@/components/receipt-actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, expenses, receipts, tripMembers, trips, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const money = (amount: string | null, currency = "RUB") => amount ? new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(Number(amount)) : "Не указана";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ tripId: string; receiptId: string }> }) {
  const { tripId, receiptId } = await params;
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    const [membership] = await db.select({ tripId: tripMembers.tripId }).from(tripMembers).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id))).limit(1);
    if (!membership) notFound();
  }
  const [result] = await db
    .select({ receipt: receipts, expense: expenses, categoryName: categories.name, uploaderName: users.name, tripTitle: trips.title })
    .from(receipts)
    .innerJoin(trips, eq(receipts.tripId, trips.id))
    .leftJoin(expenses, eq(expenses.receiptId, receipts.id))
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(users, eq(receipts.uploadedBy, users.id))
    .where(and(eq(receipts.id, receiptId), eq(receipts.tripId, tripId)))
    .limit(1);
  if (!result) notFound();
  const canManage = user.role === "ADMIN" || result.receipt.uploadedBy === user.id;
  const previewUrl = `/api/receipts/${result.receipt.id}/file`;
  const isImage = result.receipt.mimeType.startsWith("image/");
  const expense = result.expense;

  return <AppShell userName={user.name} userRole={user.role}>
    <div className="page-heading receipt-detail-heading"><div><Link className="back-link" href={`/trips/${tripId}`}><ArrowLeft size={16} />К командировке</Link><span className="eyebrow">Чек</span><h1>{expense?.title || expense?.merchant || result.receipt.originalName}</h1><p className="lead">{result.tripTitle} · добавил(а) {result.uploaderName}</p></div>{canManage && <ReceiptActions receiptId={receiptId} tripId={tripId} editHref={`/trips/${tripId}/receipts/${receiptId}/edit`} />}</div>
    <section className="receipt-detail-layout">
      <div className="card receipt-detail-preview">{isImage ? <img src={previewUrl} alt={`Чек: ${result.receipt.originalName}`} /> : <div className="file-preview"><FileText size={30} /><span>{result.receipt.originalName}</span><a href={previewUrl} target="_blank">Открыть PDF</a></div>}</div>
      <section className="card receipt-details" aria-labelledby="receipt-fields-heading"><div className="receipt-details-heading"><div><span className="eyebrow">Извлечённые данные</span><h2 id="receipt-fields-heading">Поля расхода</h2></div><ScanLine size={20} /></div>
        {result.receipt.status === "UPLOADED" || result.receipt.status === "PROCESSING" ? <div className="receipt-detail-pending"><ScanLine size={19} /><span>Чек ещё обрабатывается. Обновите страницу через несколько секунд.</span></div> : <dl className="readonly-fields">
          <div><dt>Название</dt><dd>{expense?.title || "Не указано"}</dd></div>
          <div><dt>На языке чека</dt><dd>{expense?.merchantOriginal || "Не указано"}</dd></div>
          <div><dt>Название / получатель на русском</dt><dd>{expense?.merchant || "Не указано"}</dd></div>
          <div><dt>Дата операции</dt><dd>{expense?.expenseDate || "Не указана"}</dd></div>
          <div><dt>Сумма в валюте</dt><dd>{money(expense?.amount ?? null, expense?.currency ?? "RUB")}</dd></div>
          <div><dt>Валюта</dt><dd>{expense?.currency || "Не указана"}</dd></div>
          <div><dt>Курс к рублю</dt><dd>{expense?.exchangeRate ?? "Не указан"}</dd></div>
          <div><dt>Сумма в рублях</dt><dd>{money(expense?.amountRub ?? null)}</dd></div>
          <div><dt>Статья расходов</dt><dd>{result.categoryName || "Не выбрана"}</dd></div>
          <div><dt>Способ оплаты</dt><dd>{expense?.paymentMethod || "Не указан"}</dd></div>
          <div className="full"><dt>Примечание</dt><dd>{expense?.description || "Нет"}</dd></div>
        </dl>}
      </section>
    </section>
  </AppShell>;
}
