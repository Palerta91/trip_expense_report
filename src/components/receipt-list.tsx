"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Filter, Pencil, ReceiptText, SlidersHorizontal } from "lucide-react";

export type ReceiptListItem = {
  id: string;
  title: string | null;
  merchant: string | null;
  expenseDate: string | null;
  currency: string | null;
  amount: string | null;
  createdAt: string;
  status: "UPLOADED" | "PROCESSING" | "READY_FOR_REVIEW" | "FAILED";
  canEdit: boolean;
};

const money = (amount: string | null, currency: string | null) => amount && currency ? new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount)) : "Сумма не заполнена";

export function ReceiptList({ tripId, receipts }: { tripId: string; receipts: ReceiptListItem[] }) {
  const [currency, setCurrency] = useState("ALL");
  const [order, setOrder] = useState("operation-asc");
  const currencies = [...new Set(receipts.map((receipt) => receipt.currency).filter((value): value is string => Boolean(value)))].sort();
  const visibleReceipts = useMemo(() => receipts
    .filter((receipt) => currency === "ALL" || receipt.currency === currency)
    .sort((left, right) => {
      if (order === "added-desc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (order === "added-asc") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return new Date(left.expenseDate ?? left.createdAt).getTime() - new Date(right.expenseDate ?? right.createdAt).getTime();
    }), [currency, order, receipts]);

  return <>
    <div className="receipt-list-controls">
      <label><Filter size={15} /><span>Исходная валюта</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="ALL">Все валюты</option>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
      <label><SlidersHorizontal size={15} /><span>Сортировка</span><select value={order} onChange={(event) => setOrder(event.target.value)}><option value="operation-asc">По дате операции</option><option value="added-desc">По дате добавления: новые</option><option value="added-asc">По дате добавления: ранние</option></select></label>
    </div>
    {visibleReceipts.length === 0 ? <div className="card empty compact-empty"><p>По выбранной валюте чеков нет.</p></div> : <div className="receipt-list">
      {visibleReceipts.map((receipt) => <article className="card receipt-row" key={receipt.id}><Link className="receipt-row-detail" href={`/trips/${tripId}/receipts/${receipt.id}`}><span className="receipt-row-icon"><ReceiptText size={18} /></span><div className="receipt-row-main"><strong>{receipt.title || receipt.merchant || "Чек без названия"}</strong><span>{receipt.expenseDate ?? "Дата операции не определена"} · {receipt.currency ?? "Валюта не определена"}</span></div><div className="receipt-row-amount"><strong>{money(receipt.amount, receipt.currency)}</strong><span className={`receipt-row-status ${receipt.status.toLowerCase()}`}>{receipt.status === "READY_FOR_REVIEW" ? "Обработан" : receipt.status === "FAILED" ? "Нужна проверка" : "Обрабатывается"}</span></div><ArrowUpRight size={18} /></Link>{receipt.canEdit && <Link className="icon-button receipt-row-edit" href={`/trips/${tripId}/receipts/${receipt.id}/edit`} aria-label="Редактировать расход" title="Редактировать расход"><Pencil size={17} /></Link>}</article>)}
    </div>}
  </>;
}
