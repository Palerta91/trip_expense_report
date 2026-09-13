import Link from "next/link";
import { count } from "drizzle-orm";
import { login } from "./actions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [{ total }] = await db.select({ total: count() }).from(users);
  const needsSetup = Number(total) === 0;

  return (
    <main className="auth-page">
      <section className="auth-card card">
        <div className="brand"><span className="brand-mark">К</span><span>Командировки</span></div>
        <h1>Вход в систему</h1>
        <p className="lead">Вносите расходы и собирайте отчёт по командировке в одном месте.</p>
        {needsSetup && <p className="callout">Система ещё не настроена. Сначала создайте первого администратора.</p>}
        <form action={login} className="form-grid">
          <div className="field full"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field full"><label htmlFor="password">Пароль</label><input id="password" name="password" type="password" autoComplete="current-password" minLength={10} required /></div>
          <div className="form-actions field full"><button className="button" type="submit">Войти</button></div>
        </form>
        {needsSetup && <p className="lead">Первый запуск? <Link href="/setup" style={{ color: "var(--blue)", fontWeight: 650 }}>Создать администратора</Link></p>}
      </section>
    </main>
  );
}
