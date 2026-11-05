"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Download, ShieldCheck, Trash2 } from "lucide-react";
import { LangSwitch } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";

export default function Profile() {
  const { t, href, lang } = useI18n();
  const router = useRouter();
  const s = useStore();
  const [confirm, setConfirm] = useState(false);

  const fmt = (iso?: string) => (iso ? new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "–");

  function exportData() {
    const { profile, consents, answers, assignment, sub, xp, streak, log } = s;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, consents, answers, assignment, sub, xp, streak, log }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "the-full-sculpt-meus-dados.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function erase() {
    s.eraseAll();
    router.replace(href("/"));
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 md:px-10 md:pt-12">
      <p className="eyebrow">{t("profile.eyebrow")}</p>
      <h1 className="font-display mt-2 text-5xl md:text-6xl">{s.profile?.name}</h1>
      <p className="mt-1 text-muted">{s.profile?.email}</p>

      <section className="card mt-8 flex items-center justify-between gap-4 p-6" aria-label={t("profile.plan")}>
        <div>
          <p className="eyebrow">{t("profile.plan")}</p>
          <p className="font-display mt-1 text-3xl">{s.sub === "active" ? t("profile.planActive") : t("profile.planFree")}</p>
        </div>
        {s.sub !== "active" && <Link href={href("/assine")} className="btn btn-primary">{t("profile.subscribe")}</Link>}
      </section>

      {s.answers.coaching && (
        <section className="card mt-4 flex items-center justify-between gap-4 p-6" aria-label={t("profile.coach")}>
          <div className="flex items-start gap-4">
            <CalendarClock size={22} strokeWidth={1.4} className="mt-1 text-bronze" aria-hidden="true" />
            <div>
              <p className="font-display text-2xl">{t("profile.coach")}</p>
              <p className="text-[13px] text-muted">{t("profile.coachText")}</p>
            </div>
          </div>
          <span className="rounded-full border-[0.5px] border-line px-3 py-1 text-[11px] uppercase tracking-widest text-muted">{t("common.soon")}</span>
        </section>
      )}

      <section className="card mt-4 flex items-center justify-between p-6" aria-label={t("profile.language")}>
        <p className="font-display text-2xl">{t("profile.language")}</p>
        <LangSwitch />
      </section>

      <section className="card mt-4 p-6" aria-label={t("privacy.title")}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} strokeWidth={1.4} className="text-bronze" aria-hidden="true" />
          <h2 className="font-display text-3xl">{t("privacy.title")}</h2>
        </div>
        <p className="mt-2 text-[14px] text-muted">{t("privacy.text")}</p>
        <dl className="mt-5 divide-y divide-line text-[14px]">
          <div className="flex justify-between py-3"><dt>{t("privacy.health")}</dt><dd className="text-muted">{s.consents?.health ? `${t("common.yes")} · ${fmt(s.consents.at)}` : t("common.no")}</dd></div>
          <div className="flex justify-between py-3"><dt>{t("privacy.terms")}</dt><dd className="text-muted">{s.consents?.terms ? `${t("common.yes")} · ${fmt(s.consents.at)}` : t("common.no")}</dd></div>
          <div className="flex justify-between py-3"><dt>{t("privacy.marketing")}</dt><dd className="text-muted">{s.consents?.marketing ? t("common.yes") : t("common.no")}</dd></div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={exportData} className="btn btn-ghost"><Download size={16} aria-hidden="true" />{t("privacy.export")}</button>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-ember">{t("privacy.confirm")}</span>
              <button type="button" onClick={erase} className="btn btn-ember !h-11">{t("privacy.eraseNow")}</button>
              <button type="button" onClick={() => setConfirm(false)} className="btn btn-ghost !h-11">{t("common.cancel")}</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="btn btn-ghost"><Trash2 size={16} aria-hidden="true" />{t("privacy.erase")}</button>
          )}
        </div>
      </section>

      <button type="button" onClick={s.loadDemo} className="mt-6 text-[12px] text-muted underline underline-offset-4">{t("profile.reloadDemo")}</button>
    </div>
  );
}
