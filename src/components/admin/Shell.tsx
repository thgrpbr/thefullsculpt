"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChartNoAxesColumn, ChevronRight, LogOut, Menu, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { api, ApiError, type ServerState } from "@/lib/api";
import { useHydrated, useStore } from "@/lib/store";
import { Segmented, Wordmark } from "@/components/ui";
import { AdminCtx, Toasts, useToasts, type DemoMode } from "./ui";
import { GROUPS, allowedFor, hasKids, type NavGroup, type NavLeaf, type NavParent } from "./nav";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** páginas em que o filtro "Dados reais / demo" faz diferença */
const DATA_PAGES = ["/admin", "/admin/alunos", "/admin/professores", "/admin/pagamentos", "/admin/consultas"];

interface Resolved { group: string; item: NavLeaf | NavParent; leaf: NavLeaf; parent: NavParent | null }

/** Casca do painel: confere a sessão no servidor, aplica permissões e organiza a navegação em grupos. */
export default function Shell({ children, role }: { children: ReactNode; role: "admin" | "teacher" }) {
  const { href } = useI18n();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const hydrated = useHydrated();
  const userRole = useStore((s) => s.role);
  const perms = useStore((s) => s.perms);
  const profile = useStore((s) => s.profile);
  const profileLabel = useStore((s) => s.profileLabel);
  const applyServer = useStore((s) => s.applyServer);
  const logout = useStore((s) => s.logout);
  const [checked, setChecked] = useState(false);
  const [demo, setDemo] = useState<DemoMode>("all");
  const [range, setRange] = useState(90);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setDrawer(false), 0);   // fecha o menu móvel ao navegar
    return () => clearTimeout(id);
  }, [pathname]);

  const q = (path: string, extra: Record<string, string | number | undefined> = {}) => {
    const p = new URLSearchParams();
    if (role === "admin") p.set("demo", demo);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
  };

  const staffRole = userRole === "admin" || userRole === "legal" || userRole === "staff";

  /** grupos já filtrados pelas permissões; itens com filhos só aparecem se algum filho for liberado */
  const groups: NavGroup[] = useMemo(() => {
    if (role !== "admin") return [];
    return GROUPS.map((g) => ({
      label: g.label,
      items: g.items.flatMap((it) => {
        if (hasKids(it)) {
          const kids = it.children.filter((k) => allowedFor(k.perm, userRole, perms));
          return kids.length ? [{ ...it, path: kids[0].path, children: kids } as NavParent] : [];
        }
        return allowedFor(it.perm, userRole, perms) ? [it] : [];
      }),
    })).filter((g) => g.items.length > 0);
  }, [role, userRole, perms]);

  const flat: Resolved[] = useMemo(() => groups.flatMap((g) => g.items.flatMap((it): Resolved[] => (hasKids(it)
    ? it.children.map((k) => ({ group: g.label, item: it, leaf: k, parent: it }))
    : [{ group: g.label, item: it, leaf: it as NavLeaf, parent: null }]))), [groups]);

  const strip = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);
  const here = useMemo(() => {
    const cur = strip(pathname);
    let best: Resolved | null = null;
    let bestLen = -1;
    for (const r of flat) {
      const paths = [r.leaf.path, ...(r.leaf.alias ?? []), ...(r.parent?.alias ?? [])];
      for (const p of paths) {
        const full = strip(href(p));
        const hit = r.leaf.exact && p === r.leaf.path ? cur === full : cur === full || cur.startsWith(full + "/");
        if (hit && full.length > bestLen) { best = r; bestLen = full.length; }
      }
    }
    return best;
  }, [flat, pathname, href]);

  const isLegalOnly = role === "admin" && userRole !== "admin" && flat.length > 0 && flat.every((r) => r.leaf.path === "/admin/juridico");
  const redirect = hydrated && checked && role === "admin" && staffRole && !here && flat[0] ? href(flat[0].leaf.path) : null;
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
        <p className="mt-3 max-w-sm text-[14px] text-muted">{userRole ? "Seu perfil não tem permissão para esta área." : "Entre com uma conta autorizada para continuar."}</p>
        <Link href={href(userRole ? "/app" : "/entrar")} className="btn btn-primary mt-8">{userRole ? "Voltar ao app" : "Entrar"}</Link>
      </div>
    );
  }

  const teacherGroups: NavGroup[] = [{ label: "Painel", items: [{ path: "/professor", label: "Meu painel", icon: ChartNoAxesColumn, perm: [], exact: true }] }];
  const navGroups = role === "admin" ? groups : teacherGroups;
  const activeItem = role === "admin" ? here?.item : null;
  const roleText = isLegalOnly ? "Advogado" : role === "teacher" ? "Professor" : userRole === "admin" ? "Administrador master" : (profileLabel ?? "Equipe");
  const showDemo = role === "admin" && !isLegalOnly && here && DATA_PAGES.includes(here.leaf.path);
  const initial = (profile?.name ?? "?").trim().charAt(0).toUpperCase();
  const settingsKids = here?.parent ? (navGroups.flatMap((g) => g.items).find((i) => i.path === here.parent!.path && hasKids(i)) as NavParent | undefined)?.children : undefined;

  const doLogout = async () => { await logout(); router.replace(href("/entrar")); };

  const sidebar = (
    <div className="flex h-full flex-col justify-between">
      <div className="min-h-0 overflow-y-auto pr-1">
        <Link href={href(role === "admin" ? "/admin" : "/professor")} className="block whitespace-nowrap px-2 [&_.wordmark]:!tracking-[0.2em]" aria-label="THE FULL SCULPT"><Wordmark size="sm" /></Link>
        <p className="eyebrow mt-1 px-2 !text-[9px]">{isLegalOnly ? "Área do advogado" : role === "admin" ? (userRole === "admin" ? "Gestão da plataforma" : "Painel da equipe") : "Painel do professor"}</p>
        <nav aria-label="Principal" className="mt-6 flex flex-col gap-5">
          {navGroups.map((g) => (
            <div key={g.label}>
              {navGroups.length > 1 && <p className="mb-1.5 px-3 text-[9px] uppercase tracking-[0.2em] text-muted/80">{g.label}</p>}
              <div className="flex flex-col gap-0.5">
                {g.items.map((n) => {
                  const Icon = n.icon;
                  const active = role === "admin" ? activeItem?.path === n.path : pathname.startsWith(href(n.path));
                  return (
                    <Link key={n.path} href={href(n.path)} aria-current={active ? "page" : undefined} className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors ${active ? "bg-surface text-fg shadow-[0_0_0_0.5px_var(--line),0_1px_2px_rgba(22,21,20,0.04)]" : "text-muted hover:bg-surface/60 hover:text-fg"}`}>
                      {active && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-fg" aria-hidden="true" />}
                      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <div className="mt-4 border-t-[0.5px] border-line pt-3">
        <div className="flex items-center gap-3 px-2 pb-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-[12px] text-bg" aria-hidden="true">{initial}</span>
          <div className="min-w-0">
            <p className="truncate text-[12px]">{profile?.name ?? "—"}</p>
            <p className="truncate text-[10px] text-muted">{roleText}</p>
          </div>
        </div>
        <Link href={href("/app")} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px] text-muted hover:text-fg"><ArrowUpRight size={13} aria-hidden="true" />Ver app do aluno</Link>
        <button type="button" onClick={doLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[12px] text-muted hover:text-fg"><LogOut size={13} aria-hidden="true" />Sair</button>
      </div>
    </div>
  );

  return (
    <AdminCtx.Provider value={{ demo, setDemo, range, setRange, toast, q }}>
      <div className="theme-light min-h-dvh text-[13px] lg:pl-[248px]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r-[0.5px] border-line bg-bg px-4 py-6 lg:block">{sidebar}</aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/35" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-[288px] max-w-[86vw] bg-bg px-4 py-6 shadow-2xl">
              <button type="button" onClick={() => setDrawer(false)} aria-label="Fechar menu" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-line"><X size={15} aria-hidden="true" /></button>
              {sidebar}
            </aside>
          </div>
        )}

        <header className="sticky top-0 z-20 flex items-center gap-3 border-b-[0.5px] border-line bg-bg/85 px-4 py-2.5 backdrop-blur-xl lg:px-8">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menu" className="flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-line lg:hidden"><Menu size={16} aria-hidden="true" /></button>
          <nav aria-label="Você está em" className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            {role === "admin" && here ? (
              <>
                <span className="hidden sm:inline">{here.group}</span>
                <ChevronRight size={12} className="hidden sm:block" aria-hidden="true" />
                {here.parent ? <><span className="hidden sm:inline">{here.parent.label}</span><ChevronRight size={12} className="hidden sm:block" aria-hidden="true" /></> : null}
                <span className="truncate text-fg">{here.leaf.label}</span>
              </>
            ) : <span className="text-fg">Meu painel</span>}
          </nav>
          <span className="flex-1" />
          {role === "admin" && (
            <button type="button" onClick={() => setPalette(true)} className="flex h-9 items-center gap-2 rounded-full border-[0.5px] border-line bg-surface px-3.5 text-[12px] text-muted hover:text-fg" aria-label="Buscar no painel (Ctrl+K)">
              <Search size={14} aria-hidden="true" /><span className="hidden sm:inline">Buscar no painel</span><kbd className="hidden rounded bg-surface2 px-1.5 py-0.5 font-sans text-[10px] sm:inline">Ctrl K</kbd>
            </button>
          )}
          {showDemo && (
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] uppercase tracking-[0.16em] text-muted md:block">Dados</span>
              <Segmented<DemoMode> label="Origem dos dados" value={demo} onChange={setDemo} options={[{ value: "all", label: "Todos" }, { value: "real", label: "Reais" }, { value: "only", label: "Demo" }]} />
            </div>
          )}
        </header>

        <main className="mx-auto max-w-[1280px] px-4 py-7 lg:px-8">
          {settingsKids ? (
            <div className="lg:grid lg:grid-cols-[216px_minmax(0,1fr)] lg:gap-10">
              <nav aria-label="Seções de configurações" className="mb-6 flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-[72px] lg:mb-0 lg:flex-col lg:self-start lg:overflow-visible">
                <p className="mb-2 hidden px-3 text-[9px] uppercase tracking-[0.2em] text-muted/80 lg:block">Configurações</p>
                {settingsKids.map((k) => {
                  const Icon = k.icon;
                  const active = here?.leaf.path === k.path;
                  return (
                    <Link key={k.path} href={href(k.path)} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-start gap-3 rounded-xl px-3 py-2 transition-colors ${active ? "bg-surface text-fg shadow-[0_0_0_0.5px_var(--line)]" : "text-muted hover:bg-surface/60 hover:text-fg"}`}>
                      <Icon size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span><span className="block whitespace-nowrap text-[13px]">{k.label}</span>{k.desc && <span className="mt-0.5 hidden text-[10px] leading-snug text-muted lg:block">{k.desc}</span>}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="min-w-0">{children}</div>
            </div>
          ) : children}
        </main>
        <Toasts items={items} />
        {palette && <Palette groups={navGroups} onClose={() => setPalette(false)} />}
      </div>
    </AdminCtx.Provider>
  );
}

/** Busca rápida (Ctrl+K): vai direto para qualquer área do painel. */
function Palette({ groups, onClose }: { groups: NavGroup[]; onClose: () => void }) {
  const { href } = useI18n();
  const router = useRouter();
  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => groups.flatMap((g) => g.items.flatMap((it) => (hasKids(it)
    ? it.children.map((k) => ({ group: `${g.label} › ${it.label}`, leaf: k }))
    : [{ group: g.label, leaf: it as NavLeaf }]))), [groups]);
  const list = useMemo(() => {
    const t = norm(text.trim());
    if (!t) return all;
    return all.filter((r) => norm(`${r.leaf.label} ${r.leaf.desc ?? ""} ${r.leaf.keywords ?? ""} ${r.group}`).includes(t));
  }, [all, text]);
  useEffect(() => { input.current?.focus(); }, []);
  const go = (i: number) => { const r = list[i]; if (r) { router.push(href(r.leaf.path)); onClose(); } };
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]" role="dialog" aria-modal="true" aria-label="Buscar no painel">
      <button type="button" aria-label="Fechar busca" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border-[0.5px] border-line bg-bg shadow-2xl">
        <div className="flex items-center gap-3 border-b-[0.5px] border-line px-4">
          <Search size={15} className="text-muted" aria-hidden="true" />
          <input ref={input} value={text} onChange={(e) => { setText(e.target.value); setSel(0); }} placeholder="Para onde você quer ir? (ex.: smtp, cupom, comissão)" aria-label="Buscar" className="!h-12 flex-1 !border-0 !bg-transparent !px-0 text-[14px] outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") go(sel);
            }} />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {list.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-muted">Nada encontrado.</li>}
          {list.map((r, i) => {
            const Icon = r.leaf.icon;
            return (
              <li key={r.leaf.path} role="option" aria-selected={i === sel}>
                <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === sel ? "bg-surface2" : ""}`}>
                  <Icon size={16} strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-[13px]">{r.leaf.label}</span><span className="block truncate text-[11px] text-muted">{r.leaf.desc ?? r.group}</span></span>
                  <span className="shrink-0 text-[10px] text-muted">{r.group}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
