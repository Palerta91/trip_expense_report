import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { createTrip } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const user = await requireUser();
  return (
    <AppShell userName={user.name}>
      <div className="page-heading"><div><h1>Новая командировка</h1><p className="lead">Создайте карточку и добавьте участников позже.</p></div></div>
      <form className="card form-card" action={createTrip}>
        <div className="form-grid">
          <div className="field full"><label htmlFor="title">Название</label><input id="title" name="title" placeholder="Переговоры с партнёром" required minLength={3} /></div>
          <div className="field full"><label htmlFor="destination">Город / страна</label><input id="destination" name="destination" placeholder="Казань, Россия" required minLength={2} /></div>
          <div className="field"><label htmlFor="startsOn">Начало</label><input id="startsOn" name="startsOn" type="date" required /></div>
          <div className="field"><label htmlFor="endsOn">Окончание</label><input id="endsOn" name="endsOn" type="date" required /></div>
          <div className="field full"><label htmlFor="purpose">Цель поездки</label><textarea id="purpose" name="purpose" placeholder="Необязательно, но попадёт в итоговый отчёт" /></div>
        </div>
        <div className="form-actions"><Link className="button secondary" href="/">Отмена</Link><button className="button" type="submit">Создать командировку</button></div>
      </form>
    </AppShell>
  );
}
