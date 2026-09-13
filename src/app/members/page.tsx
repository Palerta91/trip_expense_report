import Link from "next/link";
import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createMember } from "./actions";

export const dynamic = "force-dynamic";

const roleNames = { ADMIN: "Администратор", MANAGER: "Менеджер", PARTICIPANT: "Участник" };

export default async function MembersPage() {
  const current = await requireUser();
  if (current.role !== "ADMIN") redirect("/");
  const memberRows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).orderBy(asc(users.name));
  return (
    <AppShell userName={current.name}>
      <div className="page-heading"><div><h1>Участники</h1><p className="lead">Учётные записи и роли пользователей системы.</p></div><Link href="/" className="button secondary">К командировкам</Link></div>
      <section className="card form-card" style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 20 }}>Добавить пользователя</h2>
        <form action={createMember} className="form-grid">
          <div className="field"><label htmlFor="name">Имя и фамилия</label><input id="name" name="name" required minLength={2} /></div>
          <div className="field"><label htmlFor="role">Роль</label><select id="role" name="role" defaultValue="PARTICIPANT"><option value="PARTICIPANT">Участник</option><option value="MANAGER">Менеджер</option></select></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
          <div className="field"><label htmlFor="password">Временный пароль</label><input id="password" name="password" type="password" minLength={10} required /></div>
          <div className="form-actions field full"><button className="button" type="submit">Создать пользователя</button></div>
        </form>
      </section>
      <div className="card expense-list">
        {memberRows.map((member) => <div className="expense-row" key={member.id}><div><div className="expense-merchant">{member.name}</div><div className="expense-sub">{member.email}</div></div><div className="expense-sub">{roleNames[member.role]}</div><div className="expense-sub">Создан: {member.createdAt.toLocaleDateString("ru-RU")}</div><div /></div>)}
      </div>
    </AppShell>
  );
}
