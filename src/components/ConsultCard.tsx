"use client";

import { useState } from "react";
import { CalendarClock, Video } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/admin";
import { useI18n } from "@/i18n/provider";

interface Slot { starts_at: string; local: string; free: number }
interface Appt { id: number; starts_at: string; duration_min: number; status: string; link: string | null; teacher: string | null }

/** Agendamento de consulta online (aluno com conta real). */
export default function ConsultCard() {
  const { t, lang } = useI18n();
  const slots = useApi<{ slots: Slot[]; enabled: boolean }>("/appointments/slots");
  const mine = useApi<{ rows: Appt[] }>("/appointments");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const loc = lang === "pt" ? "pt-BR" : lang;
  const fmt = (utc: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { ...o, timeZone: "America/Sao_Paulo" }).format(new Date(utc.replace(" ", "T") + "Z"));

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      slots.reload();
      mine.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "generic";
      setErr(t(`consult.errors.${["already_booked", "slot_unavailable", "rate_limited"].includes(code) ? code : "generic"}`));
    }
    setBusy(false);
  }

  const days = new Map<string, Slot[]>();
  for (const s of slots.data?.slots ?? []) days.set(s.local.slice(0, 10), [...(days.get(s.local.slice(0, 10)) ?? []), s]);
  const open = (mine.data?.rows ?? []).some((a) => (a.status === "requested" || a.status === "confirmed") && new Date(a.starts_at.replace(" ", "T") + "Z") > new Date());

  return (
    <section className="card mt-4 p-6" aria-label={t("consult.title")}>
      <div className="flex items-start gap-4">
        <CalendarClock size={22} strokeWidth={1.4} className="mt-1 shrink-0 text-bronze" aria-hidden="true" />
        <div>
          <h2 className="font-display text-3xl leading-tight">{t("consult.title")}</h2>
          <p className="mt-1 text-[13px] text-muted">{t("consult.text")}</p>
        </div>
      </div>

      {(mine.data?.rows.length ?? 0) > 0 && (
        <div className="mt-5">
          <h3 className="eyebrow mb-2">{t("consult.mine")}</h3>
          <ul className="divide-y divide-line text-[14px]">
            {mine.data!.rows.slice(0, 5).map((a) => {
              const future = new Date(a.starts_at.replace(" ", "T") + "Z") > new Date();
              const cancelable = future && (a.status === "requested" || a.status === "confirmed");
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    {fmt(a.starts_at, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    <span className="ml-2 text-[12px] text-muted">{a.teacher ?? t("consult.noTeacher")}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${a.status === "confirmed" ? "bg-[#6f8a6b]/15 text-[#4f6a4b]" : a.status === "requested" ? "bg-bronze/15 text-bronze" : "bg-surface2 text-muted"}`}>{t(`consult.status.${a.status}`)}</span>
                    {a.status === "confirmed" && a.link && future && <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-bronze"><Video size={13} aria-hidden="true" />{t("consult.join")}</a>}
                    {cancelable && <button type="button" disabled={busy} onClick={() => act(() => api("DELETE", `/appointments/${a.id}`))} className="text-[12px] text-muted underline underline-offset-4">{t("consult.cancel")}</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!open && (
        <div className="mt-5">
          {slots.data && !slots.data.enabled ? (
            <p className="text-[13px] text-muted">{t("consult.paused")}</p>
          ) : days.size === 0 ? (
            <p className="text-[13px] text-muted">{slots.data ? t("consult.none") : t("common.loading")}</p>
          ) : (
            <div className="space-y-4">
              {[...days.entries()].slice(0, 5).map(([day, list]) => (
                <div key={day}>
                  <p className="mb-2 text-[12px] capitalize text-muted">{fmt(list[0].starts_at, { weekday: "long", day: "2-digit", month: "long" })}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <button key={s.starts_at} type="button" disabled={busy} className="chip !h-9 !px-4 text-[13px]" onClick={() => act(() => api("POST", "/appointments", { starts_at: s.starts_at }))} aria-label={`${t("consult.book")} ${fmt(s.starts_at, { hour: "2-digit", minute: "2-digit" })}`}>
                        {fmt(s.starts_at, { hour: "2-digit", minute: "2-digit" })}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-4 text-[13px] text-ember">{err}</p>}
    </section>
  );
}
