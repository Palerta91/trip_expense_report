"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, Save, ScanLine, UploadCloud } from "lucide-react";

type Category = { id: string; name: string };
type ReceiptStatus = "UPLOADED" | "PROCESSING" | "READY_FOR_REVIEW" | "FAILED";
type Receipt = { id: string; originalName: string; mimeType: string; status: ReceiptStatus; errorMessage: string | null };
type Expense = { id: string; title: string | null; merchant: string; merchantOriginal: string | null; expenseDate: string; categoryId: string | null; amount: string; currency: string; exchangeRate: string | null; amountRub: string | null; paymentMethod: string | null; description: string | null };
type Draft = { title: string; merchantOriginal: string; merchant: string; expenseDate: string; categoryId: string; amount: string; currency: string; exchangeRate: string; paymentMethod: string; description: string };

const currencyOptions = [
  ["RUB", "RUB — российский рубль"],
  ["CNY", "CNY — китайский юань"],
  ["USD", "USD — доллар США"],
  ["EUR", "EUR — евро"],
  ["HKD", "HKD — гонконгский доллар"]
] as const;

function toDraft(expense: Expense): Draft {
  return {
    title: expense.title ?? "",
    merchantOriginal: expense.merchantOriginal ?? "",
    merchant: expense.merchant === "Ожидается распознавание" || expense.merchant === "Заполните данные вручную" || expense.merchant === "Не определено" ? "" : expense.merchant,
    expenseDate: expense.expenseDate,
    categoryId: expense.categoryId ?? "",
    amount: Number(expense.amount) > 0 ? expense.amount : "",
    currency: expense.currency || "RUB",
    exchangeRate: expense.currency === "RUB" ? "1" : expense.exchangeRate ?? "",
    paymentMethod: expense.paymentMethod ?? "",
    description: expense.description ?? ""
  };
}

function messageForStatus(status: ReceiptStatus) {
  if (status === "UPLOADED") return "Чек сохранён. Ожидаем запуск распознавания…";
  if (status === "PROCESSING") return "Распознаём чек и готовим черновик расхода…";
  return null;
}

export function ReceiptUploader({ tripId, categories, initialReceiptId, mode = "recognition", showUploadForm = true }: { tripId: string; categories: Category[]; initialReceiptId?: string; mode?: "recognition" | "manual"; showUploadForm?: boolean }) {
  const isManual = mode === "manual";
  const [file, setFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(initialReceiptId ?? null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [pending, setPending] = useState(false);
  const [ratePending, setRatePending] = useState(false);
  const [rateMessage, setRateMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!receiptId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadResult() {
      try {
        const response = await fetch(`/api/receipts/${receiptId}`, { cache: "no-store" });
        const result = await response.json() as { receipt?: Receipt; expense?: Expense | null; canEdit?: boolean; message?: string };
        if (!response.ok) throw new Error(result.message ?? "Не удалось получить результат обработки");
        if (disposed || !result.receipt) return;
        setReceipt(result.receipt);
        setCanEdit(Boolean(result.canEdit));
        if (result.expense) setDraft(toDraft(result.expense));
        if (result.receipt.status === "UPLOADED" || result.receipt.status === "PROCESSING") timer = setTimeout(loadResult, 1500);
      } catch (error) {
        if (!disposed) setUploadMessage(error instanceof Error ? error.message : "Не удалось получить результат обработки");
      }
    }
    void loadResult();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [receiptId]);

  const amountRub = useMemo(() => {
    if (!draft) return null;
    const amount = Number(draft.amount.replace(",", "."));
    const rate = draft.currency === "RUB" ? 1 : Number(draft.exchangeRate.replace(",", "."));
    return Number.isFinite(amount) && amount > 0 && Number.isFinite(rate) && rate > 0 ? amount * rate : null;
  }, [draft]);

  function change<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((previous) => previous ? { ...previous, [field]: value } : previous);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    const uploadedFile = file;
    setPending(true);
    setUploadMessage(null);
    setReceipt(null);
    setDraft(null);
    setRateMessage(null);
    setSaveMessage(null);
    const data = new FormData();
    data.set("tripId", tripId);
    data.set("file", uploadedFile);
    if (isManual) data.set("recognize", "false");
    try {
      const response = await fetch("/api/receipts", { method: "POST", body: data });
      const result = await response.json() as { receiptId?: string; message?: string };
      if (!response.ok || !result.receiptId) throw new Error(result.message ?? "Не удалось загрузить файл");
      setReceiptId(result.receiptId);
      setUploadMessage(result.message ?? "Чек загружен");
      setFile(null);
      form.reset();
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Не удалось загрузить файл");
    } finally {
      setPending(false);
    }
  }

  async function refreshRate() {
    if (!draft) return;
    if (!draft.expenseDate) { setRateMessage({ kind: "error", text: "Сначала укажите дату оплаты." }); return; }
    if (draft.currency === "RUB") { change("exchangeRate", "1"); setRateMessage({ kind: "success", text: "Для рублей курс равен 1." }); return; }
    setRatePending(true);
    setRateMessage(null);
    try {
      const response = await fetch(`/api/exchange-rate?currency=${encodeURIComponent(draft.currency)}&date=${encodeURIComponent(draft.expenseDate)}`, { cache: "no-store" });
      const result = await response.json() as { rate?: number; rateDate?: string; message?: string };
      if (!response.ok || !result.rate) throw new Error(result.message ?? "Не удалось обновить курс");
      change("exchangeRate", result.rate.toFixed(6));
      setRateMessage({ kind: "success", text: `Курс ЦБ обновлён (${result.rate.toFixed(6)} ₽ за 1 ${draft.currency}, дата: ${result.rateDate}).` });
    } catch (error) {
      setRateMessage({ kind: "error", text: error instanceof Error ? error.message : "Не удалось обновить курс" });
    } finally {
      setRatePending(false);
    }
  }

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !receiptId) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/receipts/${receiptId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, categoryId: draft.categoryId || undefined, exchangeRate: draft.currency === "RUB" ? "1" : draft.exchangeRate, merchantOriginal: draft.merchantOriginal || undefined, paymentMethod: draft.paymentMethod || undefined, description: draft.description || undefined }) });
      const result = await response.json() as { message?: string; expense?: Expense };
      if (!response.ok) throw new Error(result.message ?? "Не удалось сохранить расход");
      if (result.expense) setDraft(toDraft(result.expense));
      setSaveMessage({ kind: "success", text: result.message ?? "Расход сохранён" });
    } catch (error) {
      setSaveMessage({ kind: "error", text: error instanceof Error ? error.message : "Не удалось сохранить расход" });
    } finally {
      setSaving(false);
    }
  }

  const processingMessage = receipt ? messageForStatus(receipt.status) : null;
  const previewUrl = receiptId ? `/api/receipts/${receiptId}/file` : null;
  const isImage = receipt?.mimeType.startsWith("image/") ?? file?.type.startsWith("image/") ?? false;

  return <>
    {showUploadForm && <form className="card form-card receipt-upload-form" onSubmit={upload}>
      <div className="form-grid"><div className="field full"><label htmlFor="receipt">Файл чека</label><input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="expense-sub">JPG, PNG, WEBP или PDF — до 10 МБ. Оригинал хранится в MinIO на вашем сервере.</span></div></div>
      {isManual && <p className="callout">Чек или скриншот обязателен: он попадёт в реестр чеков, но не будет отправлен на распознавание ИИ.</p>}
      {uploadMessage && <p className="callout">{uploadMessage}</p>}
      <div className="form-actions"><button className="button" type="submit" disabled={!file || pending}>{pending ? <><LoaderCircle size={17} className="spin" />Загрузка…</> : <><UploadCloud size={17} />{isManual ? "Загрузить чек" : "Загрузить и распознать"}</>}</button></div>
    </form>
    }

    {receipt && <section className="receipt-result" aria-live="polite">
      <div className="receipt-preview card">{isImage && previewUrl ? <img src={previewUrl} alt={`Превью: ${receipt.originalName}`} /> : <div className="file-preview"><ScanLine size={28} /><span>{receipt.originalName}</span><a href={previewUrl ?? "#"} target="_blank">Открыть файл</a></div>}</div>
      <div className="receipt-result-content">
        {processingMessage ? <div className="card receipt-processing"><LoaderCircle size={21} className="spin" /><div><strong>{processingMessage}</strong><p>Поля расхода появятся автоматически. Можно не закрывать страницу.</p></div></div> : draft && <form className="card recognition-form" onSubmit={saveExpense}>
          <div className="recognition-form-heading"><div><span className="eyebrow">{isManual ? "Ручной ввод" : "Результат обработки"}</span><h2>{isManual ? "Заполните расход" : "Проверьте расход"}</h2><p className="expense-sub">Данные можно исправить перед сохранением.</p></div>{receipt.status === "FAILED" && <span className="recognition-status failed"><CircleAlert size={15} />Распознавание не завершилось</span>}{receipt.status === "READY_FOR_REVIEW" && <span className="recognition-status ready"><CheckCircle2 size={15} />{isManual ? "Чек сохранён" : "Готово к проверке"}</span>}</div>
          {receipt.status === "FAILED" && <p className="callout error-callout">{receipt.errorMessage ? `Не удалось извлечь все данные: ${receipt.errorMessage}` : "Не удалось извлечь все данные. Заполните форму вручную."}</p>}
          <div className="form-grid recognition-grid">
            <div className="field full"><label htmlFor="title">Название</label><input id="title" value={draft.title} onChange={(event) => change("title", event.target.value)} placeholder="Для билета маршрут появится автоматически" maxLength={180} disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="merchantOriginal">Название / получатель на языке чека</label><input id="merchantOriginal" value={draft.merchantOriginal} onChange={(event) => change("merchantOriginal", event.target.value)} placeholder="Например, 支付宝" disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="merchant">Название / получатель на русском</label><input id="merchant" value={draft.merchant} onChange={(event) => change("merchant", event.target.value)} placeholder="Перевод или название на русском" required disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="expenseDate">Дата оплаты</label><input id="expenseDate" type="date" value={draft.expenseDate} onChange={(event) => change("expenseDate", event.target.value)} required disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="categoryId">Статья расходов</label><select id="categoryId" value={draft.categoryId} onChange={(event) => change("categoryId", event.target.value)} disabled={!canEdit}><option value="">Не выбрана</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="field"><label htmlFor="amount">Сумма в валюте</label><input id="amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.amount} onChange={(event) => change("amount", event.target.value)} required disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="currency">Валюта</label><select id="currency" value={draft.currency} onChange={(event) => { const currency = event.target.value; setDraft((previous) => previous ? { ...previous, currency, exchangeRate: currency === "RUB" ? "1" : previous.currency === "RUB" ? "" : previous.exchangeRate } : previous); setRateMessage(null); }} disabled={!canEdit}>{currencyOptions.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></div>
            <div className="field"><label htmlFor="exchangeRate">Курс к рублю</label><div className="rate-input"><input id="exchangeRate" type="number" min="0.000001" step="0.000001" inputMode="decimal" value={draft.exchangeRate} onChange={(event) => change("exchangeRate", event.target.value)} placeholder={draft.currency === "RUB" ? "1" : "Введите вручную или обновите"} disabled={!canEdit || draft.currency === "RUB"} /><button className="button secondary rate-button" type="button" onClick={refreshRate} disabled={!canEdit || ratePending}>{ratePending ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}<span>ЦБ</span></button></div><span className="expense-sub">Можно ввести курс вручную.</span></div>
            <div className="field"><label htmlFor="amountRub">Сумма в рублях на дату оплаты</label><input id="amountRub" value={amountRub === null ? "Курс не указан" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(amountRub)} readOnly /></div>
            <div className="field full"><label htmlFor="paymentMethod">Способ оплаты</label><input id="paymentMethod" value={draft.paymentMethod} onChange={(event) => change("paymentMethod", event.target.value)} placeholder="Например, Alipay или корпоративная карта" disabled={!canEdit} /></div>
            <div className="field full"><label htmlFor="description">Примечание</label><textarea id="description" value={draft.description} onChange={(event) => change("description", event.target.value)} placeholder="Дополнительные сведения по расходу" disabled={!canEdit} /></div>
          </div>
          {rateMessage && <p className={`inline-message ${rateMessage.kind}`} aria-live="polite">{rateMessage.kind === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}{rateMessage.text}</p>}
          {saveMessage && <p className={`inline-message ${saveMessage.kind}`} aria-live="polite">{saveMessage.kind === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}{saveMessage.text}</p>}
          {canEdit && <div className="form-actions"><button className="button" type="submit" disabled={saving}>{saving ? <><LoaderCircle size={17} className="spin" />Сохраняем…</> : <><Save size={17} />Сохранить расход</>}</button></div>}
        </form>}
      </div>
    </section>}
  </>;
}
