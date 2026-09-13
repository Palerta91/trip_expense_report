"use client";

import { useState } from "react";
import { LoaderCircle, UploadCloud } from "lucide-react";

export function ReceiptUploader({ tripId }: { tripId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setMessage(null);
    const data = new FormData();
    data.set("tripId", tripId);
    data.set("file", file);
    try {
      const response = await fetch("/api/receipts", { method: "POST", body: data });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Не удалось загрузить файл");
      setMessage(result.message ?? "Чек загружен");
      setFile(null);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить файл");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={upload}>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="receipt">Файл чека</label>
          <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <span className="expense-sub">JPG, PNG, WEBP или PDF — до 10 МБ. Оригинал хранится в MinIO на вашем сервере.</span>
        </div>
      </div>
      {message && <p className="callout">{message}</p>}
      <div className="form-actions"><button className="button" type="submit" disabled={!file || pending}>{pending ? <><LoaderCircle size={17} className="spin" />Загрузка…</> : <><UploadCloud size={17} />Загрузить и создать черновик</>}</button></div>
    </form>
  );
}
