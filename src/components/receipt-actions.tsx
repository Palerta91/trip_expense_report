"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Replace, Trash2 } from "lucide-react";

export function ReceiptActions({ receiptId, tripId }: { receiptId: string; tripId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"delete" | "replace" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Удалить чек и связанный с ним расход? Это действие нельзя отменить.")) return;
    setPending("delete"); setMessage(null);
    try {
      const response = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Не удалось удалить чек");
      router.push(`/trips/${tripId}`); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить чек"); setPending(null);
    }
  }

  async function replace(file: File) {
    setPending("replace"); setMessage(null);
    const data = new FormData(); data.set("file", file);
    try {
      const response = await fetch(`/api/receipts/${receiptId}/replace`, { method: "POST", body: data });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Не удалось заменить чек");
      router.refresh();
      setMessage(result.message ?? "Чек заменён");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось заменить чек");
    } finally {
      setPending(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <div className="receipt-actions"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void replace(file); }} /><button className="button secondary" type="button" disabled={pending !== null} onClick={() => inputRef.current?.click()}>{pending === "replace" ? <LoaderCircle size={16} className="spin" /> : <Replace size={16} />}Заменить</button><button className="button danger" type="button" disabled={pending !== null} onClick={remove}>{pending === "delete" ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}Удалить</button>{message && <p className="inline-message error">{message}</p>}</div>;
}
