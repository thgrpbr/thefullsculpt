"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarClock, ChartNoAxesColumn, CreditCard, Dumbbell, LogOut, Settings, ShieldCheck, UsersRound, UserRoundCheck, ArrowUpRight,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { api, ApiError, type ServerState } from "@/lib/api";
import { useHydrated, useStore } from "@/lib/store";
import { Segmented, Wordmark } from "@/components/ui";
import { AdminCtx, Toasts, useToasts, type DemoMode } from "./ui";

const NAV = [
  { path: "/admin", label: "Visão geral", icon: ChartNoAxesColumn, exact: true },
  { path: "/admin/alunos", label: "Alunos", icon: UsersRound },
  { path: "/admin/professores", label: "Professores", icon: UserRoundCheck },
  { path: "/admin/metodo", label: "Método e exercícios", icon: Dumbbell },
  { path: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard },
  { path: "/admin/consultas", label: "Consultas", icon: CalendarClock },
  { path: "/admin/configuracoes", label: "Configurações", icon: Settings },
  { path: "/admin/auditoria", label: "Auditoria e LGPD", icon: ShieldCheck },
] as const;

/** Casca do painel: confere a sessão no servidor e o papel exigido. */
export default function Shell({ children, role }: { children: ReactNode; role: "admin" | "teacher" }) {
  const { href } = useI18n();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const hydrated = useHydrated();
  const userRole = useStore((s) => s.role);
  const name = useStore((s) => s.profile?.name);
  const applyServer = useStore((s) => s.applyServer);
  const logout = useStore((s) => s.logout);
  const [checked, setChecked] = useState(false);
  const [demo, setDemo] = useState<DemoMode>("all");
  const [range, setRange] = useState(90);
  const { items, toast } = useToasts();

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    api<ServerState>("GET", "/me")
      .then((s) => alive && applyServer(s))
      .catch((e) => {
        if (alive && e instanceof ApiError && e.status === 401) useStore.getState().eraseAll();
      })
      .finally(() => alive && setChecked(true));
    return () => {
      alive = false;
    };
  }, [hydrated, applyServer]);

  const q = (path: string, extra: Record<string, string | number | undefined> = {}) => {
    const p = new URLSearchParams();
    if (role === "admin") p.set("demo", demo);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
  };

  if (!hydrated || !checked) return <div className="theme-light min-h-dvh" />;

  if (userRole !== role) {
    return (
      <div className="theme-light flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Wordmark size="md" stacked />
        <h1 className="font-display mt-10 text-4xl">Acesso restrito</h1>
        <p className="mt-3 max-w-sm text-[14px] text-muted">
          {userRole ? "Seu perfil não tem permissão para esta área." : "Entre com uma conta autorizada para continuar."}
        </p>
        <Link href={href(userRole ? "/app" : "/entrar")} className="btn btn-primary mt-8">{userRole ? "Voltar ao app" : "Entrar"}</Link>
      </div>
    );
  }

  const nav = role === "admin" ? NAV : [{ path: "/professor", label: "Meu painel", icon: ChartNoAxesColumn, exact: true }];

  return (
    <AdminCtx.Provider value={{ demo, setDemo, range, setRange, toast, q }}>
      <div className="theme-light min-h-dvh text-[13px] lg:pl-[224px]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col justify-between border-r-[0.5px] border-line bg-bg px-4 py-6 lg:flex">
          <div>
            <Link href={href(role === "admin" ? "/admin" : "/professor")} className="block whitespace-nowrap px-2 [&_.wordmark]:!tracking-[0.2em]" aria-label="THE FULL SCULPT"><Wordmark size="sm" /></Link>
            <p className="eyebrow mt-1 px-2 !text-[9px]">{role === "admin" ? "Gestão da plataforma" : "Painel do professor"}</p>
            <nav aria-label="Principal" className="mt-8 flex flex-col gap-0.5">
              {nav.map((n) => {
                const Icon = n.icon;
                const active = "exact" in n && n.exact ? pathname === href(n.path) || pathname === href(n.path) + "/" : pathname.startsWith(href(n.path));
                return (
                  <Link key={n.path} href={href(n.path)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${active ? "bg-surface text-fg shadow-[0_0_0_0.5px_var(--line)]" : "text-muted hover:text-fg"}`}>
                    <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="space-y-1 text-[12px]">
            <Link href={href("/app")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted hover:text-fg"><ArrowUpRight size={14} aria-hidden="true" />Ver app do aluno</Link>
            <button type="button" onClick={async () => { await logout(); router.replace(href("/entrar")); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted hover:text-fg"><LogOut size={14} aria-hidden="true" />Sair{name ? ` · ${name.split(" ")[0]}` : ""}</button>
          </div>
        </aside>

        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-[0.5px] border-line bg-bg/85 px-5 py-3 backdrop-blur-xl lg:px-8">
          <nav aria-label="Principal (mobile)" className="flex gap-1 overflow-x-auto lg:hidden">
            {nav.map((n) => (
              <Link key={n.path} href={href(n.path)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] ${pathname.startsWith(href(n.path)) && (n.path !== "/admin" || pathname === href("/admin") || pathname === href("/admin") + "/") ? "bg-fg text-bg" : "text-muted"}`}>{n.label}</Link>
            ))}
          </nav>
          <span className="hidden text-[11px] text-muted lg:block">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date())}</span>
          {role === "admin" && (
            <div className="flex items-center gap-3">
              <span className="hidden text-[10px] uppercase tracking-[0.16em] text-muted sm:block">Dados</span>
              <Segmented<DemoMode>
                label="Origem dos dados"
                value={demo}
                onChange={setDemo}
                options={[{ value: "all", label: "Todos" }, { value: "real", label: "Reais" }, { value: "only", label: "Demo" }]}
              />
            </div>
          )}
        </header>

        <main className="mx-auto max-w-[1280px] px-5 py-8 lg:px-8">{children}</main>
        <Toasts items={items} />
      </div>
    </AdminCtx.Provider>
  );
}
