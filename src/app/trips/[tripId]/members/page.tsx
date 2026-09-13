import Link from "next/link";
import { asc, eq, notInArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tripMembers, trips, users } from "@/lib/db/schema";
import { addTripMember } from "@/app/members/actions";

export const dynamic = "force-dynamic";

export default async function TripMembersPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const current = await requireUser();
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip || (trip.managerId !== current.id && current.role !== "ADMIN")) notFound();
  const members = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(tripMembers).innerJoin(users, eq(tripMembers.userId, users.id)).where(eq(tripMembers.tripId, tripId)).orderBy(asc(users.name));
  const memberIds = members.map((member) => member.id);
  const candidates = memberIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(notInArray(users.id, memberIds)).orderBy(asc(users.name)) : await db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(asc(users.name));
  const action = addTripMember.bind(null, tripId);
  return (
    <AppShell userName={current.name}>
      <div className="page-heading"><div><h1>Участники командировки</h1><p className="lead">{trip.title}</p></div><Link href={`/trips/${tripId}`} className="button secondary">К расходам</Link></div>
      <section className="card form-card" style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 20 }}>Добавить участника</h2>
        {candidates.length === 0 ? <p className="lead">Все пользователи уже добавлены.</p> : <form action={action} className="form-grid"><div className="field full"><label htmlFor="userId">Пользователь</label><select id="userId" name="userId" required defaultValue=""><option value="" disabled>Выберите участника</option>{candidates.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></div><div className="form-actions field full"><button className="button" type="submit">Добавить</button></div></form>}
      </section>
      <div className="card expense-list">{members.map((member) => <div className="expense-row" key={member.id}><div><div className="expense-merchant">{member.name}</div><div className="expense-sub">{member.email}</div></div><div className="expense-sub">{member.role === "MANAGER" ? "Менеджер" : member.role === "ADMIN" ? "Администратор" : "Участник"}</div><div /><div /></div>)}</div>
    </AppShell>
  );
}
