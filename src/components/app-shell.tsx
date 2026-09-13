import Link from "next/link";
import { ClipboardList, Home, PlusCircle } from "lucide-react";
import { logout } from "@/app/login/actions";

export function AppShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Командировочные расходы">
          <span className="brand-mark">К</span>
          <span>Командировки</span>
        </Link>
        <div className="user-menu">
          <span className="user-name">{userName}</span>
          <form action={logout}><button className="text-button" type="submit">Выйти</button></form>
        </div>
      </header>
      <main className="page-content">{children}</main>
      <nav className="mobile-nav" aria-label="Основная навигация">
        <Link href="/"><Home size={19} /><span>Главная</span></Link>
        <Link href="/trips/new"><PlusCircle size={20} /><span>Создать</span></Link>
        <Link href="/"><ClipboardList size={19} /><span>Отчёты</span></Link>
      </nav>
    </div>
  );
}
