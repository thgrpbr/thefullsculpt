"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarClock, ChartNoAxesColumn, CreditCard, Dumbbell, KeyRound, Landmark, LogOut, Scale, Settings, ShieldCheck, UsersRound, UserRoundCheck, ArrowUpRight,
} from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { api, ApiError, type ServerState } from "@/lib/api";
import { useHydrated, useStore } from "@/lib/store";
import { Segmented, Wordmark } from "@/components/ui";
import { AdminCtx, Toasts, useToasts, type DemoMode } from "./ui";

/** `perm`: permissões que liberam o item (qualquer uma); "master" = só o administrador master. */
const NAV = [
  { path: "/admin", label: "Visão geral", icon: ChartNoAxesColumn, exact: true, perm: ["overview.view"] },
  { path: "/admin/alunos", label: "Alunos", icon: UsersRound, perm: ["students.view"] },
  { path: "/admin/professores", label: "Professores", icon: UserRoundCheck, perm: ["teachers.view"] },
  { path: "/admin/metodo", label: "Método e exercícios", icon: Dumbbell, perm: ["method.view"] },
  { path: "/admin/pagamentos", label: "Pagamentos", icon: CreditCard, perm: ["payments.view", "commissions.view"] },
  { path: "/admin/gateways", label: "Gateways", icon: Landmark, perm: ["gateways.manage"] },
  { path: "/admin/consultas", label: "Consultas", icon: CalendarClock, perm: ["appointments.view"] },
  { path: "/admin/configuracoes", label: "Configurações", icon: Settings, perm: ["settings.manage", "system.manage"] },
  { path: "/admin/juridico", label: "Jurídico", icon: Scale, perm: ["legal.view"] },
  { path: "/admin/auditoria", label: "Auditoria e LGPD", icon: ShieldCheck, perm: ["audit.view"] },
  { path: "/admin/usuarios", label: "Equipe e permissões", icon: KeyRound, perm: "master" },
] as const;
type NavItem = (typeof NAV)[number];

/** Casca do painel: confere a sessão no servidor e o papel exigido. */
export default function Shell({ children, role }: { children: ReactNode; role: "admin" | "teacher" }) {
  const { href } = useI18n();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const hydrated = useHydrated();
  const userRole = useStore((s) => s.role);
  const perms = useStore((s) => s.perms);
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

  const staffRole = userRole === "admin" || userRole === "legal" || userRole === "staff";
  const allowed: readonly NavItem[] = role === "admin"
    ? NAV.filter((n) => (n.perm === "master" ? userRole === "admin" : userRole === "admin" || n.perm.some((p) => perms.includes(p))))
    : [];
  const isLegalOnly = role === "admin" && userRole !== "admin" && allowed.length > 0 && allowed.every((n) => n.path === "/admin/juridico");
  const here = allowed.find((n) => ("exact" in n && n.exact ? pathname === href(n.path) || pathname === href(n.path) + "/" : pathname.startsWith(href(n.path))));
  const home = allowed[0];

  const redirect = hydrated && checked && role === "admin" && staffRole && !here && home ? href(home.path) : null;
  useEffect(() => {
    // acesso a uma área sem permissão: leva para a primeira área liberada
    if (redirect) router.replace(redirect);
  }, [redirect, router]);
  if (!hydrated || !checked || redirect) return <div className="theme-light min-h-dvh" />;
  if ((role === "admin" && !(staffRole && here)) || (role === "teacher" && userRole !== "teacher")) {
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

  const nav: readonly { path: string; label: string; icon: typeof ChartNoAxesColumn; exact?: boolean }[] = role === "admin" ? allowed : [{ path: "/professor", label: "Meu painel", icon: ChartNoAxesColumn, exact: true }];

  return (
    <AdminCtx.Provider value={{ demo, setDemo, range, setRange, toast, q }}>
      <div className="theme-light min-h-dvh text-[13px] lg:pl-[224px]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col justify-between border-r-[0.5px] border-line bg-bg px-4 py-6 lg:flex">
          <div>
            <Link href={href(role === "admin" ? "/admin" : "/professor")} className="block whitespace-nowrap px-2 [&_.wordmark]:!tracking-[0.2em]" aria-label="THE FULL SCULPT"><Wordmark size="sm" /></Link>
            <p className="eyebrow mt-1 px-2 !text-[9px]">{isLegalOnly ? "Área do advogado" : role === "admin" ? (userRole === "admin" ? "Gestão da plataforma" : "Painel da equipe") : "Painel do professor"}</p>
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
          {role === "admin" && !isLegalOnly && (
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
