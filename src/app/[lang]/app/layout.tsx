"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChartNoAxesColumn, House, Layers, Trophy, User } from "lucide-react";
import { LangSwitch, Wordmark } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { useHydrated, useStore } from "@/lib/store";

const NAV = [
  { path: "/app", key: "nav.today", icon: House, exact: true },
  { path: "/app/metodo", key: "nav.method", icon: Layers },
  { path: "/app/progresso", key: "nav.progress", icon: ChartNoAxesColumn },
  { path: "/app/desafios", key: "nav.challenges", icon: Trophy },
  { path: "/app/perfil", key: "nav.profile", icon: User },
] as const;

export default function AppLayout({ children }: { children: ReactNode }) {
  const { t, href } = useI18n();
  const pathname = usePathname() ?? "";
  const hydrated = useHydrated();
  const assignment = useStore((s) => s.assignment);
  const isDemo = useStore((s) => s.isDemo);
  const loadDemo = useStore((s) => s.loadDemo);

  const inLesson = pathname.includes("/app/aula/");

  if (!hydrated) return <div className="theme-dark min-h-dvh" />;

  if (!assignment) {
    return (
      <div className="theme-dark flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Wordmark size="lg" stacked />
        <h1 className="font-display mt-12 text-4xl md:text-5xl">{t("gate.title")}</h1>
        <p className="mt-3 max-w-md text-muted">{t("gate.text")}</p>
        <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
          <Link href={href("/onboarding")} className="btn btn-primary">{t("gate.start")}</Link>
          <button type="button" className="btn btn-ghost" onClick={loadDemo}>{t("gate.demo")}</button>
        </div>
      </div>
    );
  }

  const isActive = (p: (typeof NAV)[number]) => {
    const full = href(p.path);
    return "exact" in p && p.exact ? pathname === full : pathname.startsWith(full);
  };

  return (
    <div className="theme-dark min-h-dvh md:pl-[88px]">
      {!inLesson && (
        <>
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center justify-between border-r-[0.5px] border-line py-7 md:flex">
            <Link href={href("/app")} aria-label="THE FULL SCULPT" className="wordmark text-[11px] leading-none">TFS</Link>
            <nav aria-label="Principal" className="flex flex-col gap-2">
              {NAV.map((n) => {
                const Icon = n.icon;
                const active = isActive(n);
                return (
                  <Link key={n.path} href={href(n.path)} aria-current={active ? "page" : undefined} className={`flex w-[64px] flex-col items-center gap-1 rounded-2xl py-3 text-[10px] tracking-wide transition-colors ${active ? "bg-surface2 text-fg" : "text-muted hover:text-fg"}`}>
                    <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                    {t(n.key)}
                  </Link>
                );
              })}
            </nav>
            <LangSwitch vertical />
          </aside>

          <header className="flex items-center justify-between px-5 pb-1 pt-5 md:hidden">
            <Wordmark size="sm" />
            <LangSwitch />
          </header>

          <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t-[0.5px] border-line bg-bg/90 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = isActive(n);
              return (
                <Link key={n.path} href={href(n.path)} aria-current={active ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] ${active ? "text-fg" : "text-muted"}`}>
                  <Icon size={21} strokeWidth={active ? 1.8 : 1.4} aria-hidden="true" />
                  {t(n.key)}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      {isDemo && !inLesson && (
        <p className="mx-auto mt-2 w-fit rounded-full border-[0.5px] border-line px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-bronze">{t("common.demo")}</p>
      )}

      <main className={inLesson ? "" : "pb-28 md:pb-12"}>{children}</main>
    </div>
  );
}
