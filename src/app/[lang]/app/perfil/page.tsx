"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { ChevronRight, Download, LogOut, Trash2 } from "lucide-react";
import { Group, PaymentsTab, ProfileTab, Row, SecurityTab } from "@/components/account/tabs";
import ConsultCard from "@/components/ConsultCard";
import { LangSwitch } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";

type Tab = "account" | "billing" | "security" | "consult" | "privacy";

export default function Profile() {
  const { t, href, lang } = useI18n();
  const router = useRouter();
  const s = useStore();
  const [tab, setTab] = useState<Tab>("account");
  const [confirm, setConfirm] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const isUser = s.mode === "user";
  const loc = lang === "pt" ? "pt-BR" : lang;
  const fmt = (iso?: string) => (iso ? new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "–");
  const initials = (s.profile?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  async function exportData() {
    const { profile, consents, answers, assignment, sub, xp, streak, log } = s;
    let payload: unknown = { exportedAt: new Date().toISOString(), profile, consents, answers, assignment, sub, xp, streak, log };
    if (isUser) {
      try {
        payload = await api<unknown>("GET", "/privacy/export");
      } catch {
        setErr(t("privacy.error"));
        return;
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "the-full-sculpt-meus-dados.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function erase() {
    setErr("");
    if (isUser) {
      try {
        await api("DELETE", "/privacy/account", { password: pw });
      } catch (e) {
        setErr(e instanceof ApiError && e.status === 401 ? t("privacy.wrongPassword") : t("privacy.error"));
        return;
      }
    }
    s.eraseAll();
    router.replace(href("/"));
  }

  async function signOut() {
    await s.logout();
    router.replace(href("/"));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "account", label: t("acct.tabs.account") },
    { id: "billing", label: t("acct.tabs.billing") },
    { id: "security", label: t("acct.tabs.security") },
    { id: "consult", label: t("acct.tabs.consult") },
    { id: "privacy", label: t("acct.tabs.privacy") },
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 pb-6 pt-8 md:px-8 md:pt-12">
      <header className="flex items-center gap-5">
        <span className="font-display flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-surface2 text-[28px] text-bronze" aria-hidden="true">{initials}</span>
        <div className="min-w-0">
          <p className="eyebrow">{t("acct.eyebrow")}</p>
          <h1 className="font-display truncate text-4xl leading-tight md:text-5xl">{s.profile?.name}</h1>
          <p className="truncate text-[14px] text-muted">{s.profile?.email}</p>
        </div>
      </header>

      {s.role && s.role !== "student" && (
        <Link href={href(s.role === "admin" ? "/admin" : "/professor")} className="mt-6 flex items-center justify-between gap-4 rounded-[20px] border-[0.5px] border-line bg-surface px-5 py-4 transition-colors hover:bg-surface2">
          <span><span className="font-display block text-2xl">{t("consult.manage")}</span><span className="text-[13px] text-muted">{t("consult.manageText")}</span></span>
          <ChevronRight size={18} className="text-muted" aria-hidden="true" />
        </Link>
      )}

      <nav className="-mx-5 mt-8 overflow-x-auto px-5 md:mx-0 md:px-0" aria-label={t("acct.title")}>
        <div role="tablist" className="inline-flex rounded-full border-[0.5px] border-line bg-surface p-1">
          {tabs.map((x) => (
            <button key={x.id} role="tab" type="button" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] transition-colors ${tab === x.id ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>{x.label}</button>
          ))}
        </div>
      </nav>

      {!isUser && tab !== "privacy" ? (
        <Group><p className="px-5 py-10 text-center text-[14px] text-muted">{t("consult.realOnly")}</p></Group>
      ) : (
        <>
          {tab === "account" && <ProfileTab />}
          {tab === "billing" && <PaymentsTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "consult" && <ConsultCard />}
        </>
      )}

      {tab === "privacy" && (
        <div>
          <Group title={t("privacy.title")} footer={t("privacy.text")}>
            <Row label={t("privacy.health")}>{s.consents?.health ? `${t("common.yes")} · ${fmt(s.consents.at)}` : t("common.no")}</Row>
            <Row label={t("privacy.terms")}>{s.consents?.terms ? `${t("common.yes")} · ${fmt(s.consents.at)}` : t("common.no")}</Row>
            <Row label={t("privacy.marketing")}>{s.consents?.marketing ? t("common.yes") : t("common.no")}</Row>
          </Group>
          <Group>
            <button type="button" onClick={exportData} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] transition-colors hover:bg-surface2/60"><Download size={17} strokeWidth={1.4} className="text-muted" aria-hidden="true" />{t("privacy.export")}</button>
            {confirm ? (
              <div className="space-y-3 px-5 py-4">
                <p className="text-[13px] text-ember">{t("privacy.confirm")}</p>
                {isUser && <PasswordField meter={false} value={pw} onChange={setPw} placeholder={t("auth.password")} autoComplete="current-password" />}
                <div className="flex gap-3">
                  <button type="button" onClick={erase} className="btn btn-ember !h-11">{t("privacy.eraseNow")}</button>
                  <button type="button" onClick={() => setConfirm(false)} className="btn btn-ghost !h-11">{t("common.cancel")}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] text-ember transition-colors hover:bg-surface2/60"><Trash2 size={17} strokeWidth={1.4} aria-hidden="true" />{t("privacy.erase")}</button>
            )}
          </Group>
          {err && <p role="alert" className="mt-4 px-2 text-[14px] text-ember">{err}</p>}
        </div>
      )}

      <Group>
        <div className="flex items-center justify-between px-5 py-3.5"><span className="text-[15px]">{t("profile.language")}</span><LangSwitch /></div>
        {isUser ? (
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] transition-colors hover:bg-surface2/60"><LogOut size={17} strokeWidth={1.4} className="text-muted" aria-hidden="true" />{t("profile.logout")}</button>
        ) : (
          <button type="button" onClick={s.loadDemo} className="w-full px-5 py-3.5 text-left text-[13px] text-muted">{t("profile.reloadDemo")}</button>
        )}
      </Group>
    </div>
  );
}
