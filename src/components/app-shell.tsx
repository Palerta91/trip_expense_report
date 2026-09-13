import Link from "next/link";
import { BarChart3, Home, LogOut, PlusCircle, ReceiptText, UsersRound } from "lucide-react";
import { logout } from "@/app/login/actions";

type Role = "ADMIN" | "MANAGER" | "PARTICIPANT";

export function AppShell({ children, userName, userRole }: { children: React.ReactNode; userName: string; userRole?: Role }) {
  const canManageTrips = userRole === "ADMIN" || userRole === "MANAGER";
  const canSeeManagerDashboard = canManageTrips;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Командировочные расходы">
          <span className="brand-mark"><ReceiptText size={17} strokeWidth={2.4} /></span>
          <span>Командировки</span>
        </Link>
        <nav className="desktop-nav" aria-label="Разделы приложения">
          <Link href="/"><Home size={16} />Главная</Link>
          {canSeeManagerDashboard && <Link href="/manager-dashboard"><BarChart3 size={16} />Дашборд руководителя</Link>}
          {userRole === "ADMIN" && <Link href="/members"><UsersRound size={16} />Участники</Link>}
        </nav>
        <div className="user-menu">
          <span className="user-avatar" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span>
          <span className="user-name">{userName}</span>
          <form action={logout}><button className="icon-button logout-button" type="submit" aria-label="Выйти"><LogOut size={17} /><span>Выйти</span></button></form>
        </div>
      </header>
      <main className="page-content">{children}</main>
      {userRole && <nav className="mobile-nav" aria-label="Основная навигация">
        <Link href="/"><Home size={20} /><span>Главная</span></Link>
        {canSeeManagerDashboard && <Link href="/manager-dashboard"><BarChart3 size={20} /><span>Дашборд</span></Link>}
        {canManageTrips && <Link className="mobile-create" href="/trips/new"><PlusCircle size={22} /><span>Новая</span></Link>}
        {userRole === "ADMIN" && <Link href="/members"><UsersRound size={20} /><span>Люди</span></Link>}
      </nav>}
    </div>
  );
}
