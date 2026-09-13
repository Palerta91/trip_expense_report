import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { setupAdmin } from "@/app/login/actions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (Number(total) > 0) redirect("/login");

  return (
    <main className="auth-page">
      <section className="auth-card card">
        <div className="brand"><span className="brand-mark">К</span><span>Командировки</span></div>
        <h1>Первичная настройка</h1>
        <p className="lead">Этот пользователь будет администратором и сможет создавать командировки.</p>
        <form action={setupAdmin} className="form-grid">
          <div className="field full"><label htmlFor="name">Имя и фамилия</label><input id="name" name="name" autoComplete="name" required minLength={2} /></div>
          <div className="field full"><label htmlFor="email">Рабочий email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field full"><label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div className="form-actions field full"><button className="button" type="submit">Создать администратора</button></div>
        </form>
      </section>
    </main>
  );
}
