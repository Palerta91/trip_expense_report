"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTrip } from "@/app/trips/actions";

export function DeleteTripButton({ tripId, title }: { tripId: string; title: string }) {
  const [pending, startTransition] = useTransition();

  function removeTrip() {
    if (!window.confirm(`Удалить командировку «${title}»? Будут удалены все расходы и прикреплённые чеки. Это действие нельзя отменить.`)) return;
    startTransition(() => { void deleteTrip(tripId); });
  }

  return <button className="button danger" type="button" onClick={removeTrip} disabled={pending}><Trash2 size={17} />{pending ? "Удаление…" : "Удалить"}</button>;
}
