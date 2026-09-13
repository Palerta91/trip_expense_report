import Link from "next/link";
import { asc } from "drizzle-orm";
import { CircleCheck, Plus, Tags } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { createCategory } from "./actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/");
  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  return (
    <AppShell userName={user.name} userRole={user.role}>
      <div className="page-heading"><div><span className="eyebrow">Справочник</span><h1>Статьи расходов</h1><p className="lead">Общий список для целевых бюджетов и всех форм добавления расходов.</p></div><Link className="button secondary" href="/manager-dashboard">К дашборду</Link></div>
      <section className="category-layout">
        <form className="card category-create-card" action={createCategory}>
          <span className="category-card-icon"><Plus size={21} /></span><h2>Новая статья</h2><p className="expense-sub">Например, «Визовые сборы», «Представительские расходы» или «Аренда автомобиля».</p>
          <div className="field"><label htmlFor="name">Название статьи</label><input id="name" name="name" required minLength={2} maxLength={100} placeholder="Новая статья расходов" /></div>
          <div className="form-actions"><button className="button" type="submit"><Plus size={17} />Добавить статью</button></div>
        </form>
        <section className="card category-list-card" aria-labelledby="category-list-heading">
          <div className="category-list-heading"><div><span className="eyebrow">Активные статьи</span><h2 id="category-list-heading">{rows.filter((category) => category.active).length} в справочнике</h2></div><Tags size={20} /></div>
          <div className="category-list">{rows.map((category) => <div className={`category-row ${category.active ? "" : "inactive"}`} key={category.id}><span className="category-row-icon"><Tags size={16} /></span><span>{category.name}</span>{category.active && <CircleCheck size={17} />}</div>)}</div>
        </section>
      </section>
    </AppShell>
  );
}
