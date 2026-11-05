"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, Laptop, Smartphone } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/admin";
import { formatBrl } from "@/lib/config";
import { useStore } from "@/lib/store";
import { useI18n } from "@/i18n/provider";

/* ---------- kit minimalista (listas agrupadas, estilo ajustes do iOS) ---------- */

export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      {title && <h2 className="eyebrow mb-2.5 px-2">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[20px] border-[0.5px] border-line bg-surface">{children}</div>
      {footer && <p className="mt-2 px-2 text-[12px] leading-relaxed text-muted">{footer}</p>}
    </section>
  );
}

export function Row({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-[15px]">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

const bare = "!h-auto !rounded-none !border-0 !bg-transparent !p-0 !text-[15px] flex-1 text-right outline-none focus:!ring-0";

function Field({ label, value, onChange, type = "text", disabled, placeholder, autoComplete, inputMode, max }: { label: string; value: string; onChange?: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string; autoComplete?: string; inputMode?: "numeric" | "tel" | "text"; max?: number }) {
  return (
    <label className="flex items-center gap-4 px-5 py-3.5">
      <span className="w-[34%] max-w-[150px] shrink-0 text-[14px] text-muted">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} maxLength={max} className={`${bare} ${disabled ? "text-muted" : ""}`} />
    </label>
  );
}

function Msg({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return <p role={ok ? "status" : "alert"} className={`mt-4 flex items-center gap-2 px-2 text-[14px] ${ok ? "text-[#4f6a4b]" : "text-ember"}`}>{ok && <Check size={15} aria-hidden="true" />}{children}</p>;
}

const useFmt = () => {
  const { lang } = useI18n();
  const loc = lang === "pt" ? "pt-BR" : lang;
  const utc = (s: string) => new Date(s.length === 10 ? s + "T00:00:00Z" : s.replace(" ", "T") + "Z");
  return {
    date: (s?: string | null) => (s ? new Intl.DateTimeFormat(loc, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(utc(s)) : "–"),
    dateTime: (s: string) => new Intl.DateTimeFormat(loc, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(utc(s)),
    rel: (s: string) => {
      const mins = Math.round((utc(s).getTime() - Date.now()) / 60000);
      const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
      if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
      if (Math.abs(mins) < 1440) return rtf.format(Math.round(mins / 60), "hour");
      return rtf.format(Math.round(mins / 1440), "day");
    },
  };
};

const errText = (t: (k: string) => string, e: unknown, map: string[] = []) => {
  const code = e instanceof ApiError ? e.code : "generic";
  return t(`acct.errors.${[...map, "rate_limited"].includes(code) ? code : "generic"}`);
};

/* ---------- Conta ---------- */

interface Profile { name: string; email: string; phone: string | null; locale: string; createdAt: string; address: Record<string, string> }
const COUNTRIES = ["BR", "PT", "US", "ES", "AR", "CL", "CO", "MX", "UY", "PE", "GB", "FR", "DE", "IT"];

export function ProfileTab() {
  const { data } = useApi<Profile>("/me/profile");
  if (!data) return <p className="mt-10 text-center text-muted">…</p>;
  return <ProfileForm p={data} />;
}

function ProfileForm({ p }: { p: Profile }) {
  const { t } = useI18n();
  const f = useFmt();
  const refresh = useStore((s) => s.refresh);
  const [name, setName] = useState(p.name);
  const [phone, setPhone] = useState(p.phone ?? "");
  const [locale, setLocale] = useState(p.locale);
  const [a, setA] = useState(p.address);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setA((x) => ({ ...x, [k]: v }));
  const lookupZip = async (zip: string) => {
    // CEP brasileiro: preenche rua/bairro/cidade/UF automaticamente (ViaCEP, só o CEP é enviado)
    const digits = zip.replace(/\D/g, "");
    if (a.country !== "BR" || digits.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!j.erro) setA((x) => ({ ...x, street: x.street || j.logradouro || "", district: x.district || j.bairro || "", city: j.localidade || x.city, state: j.uf || x.state }));
    } catch {
      /* preenchimento manual */
    }
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("PUT", "/me/profile", { name, phone, locale, address: a });
      await refresh();
      setMsg({ ok: true, text: t("acct.profile.saved") });
    } catch (e) {
      setMsg({ ok: false, text: errText(t, e, ["invalid_name", "invalid_phone", "invalid_address"]) });
    }
    setBusy(false);
  }

  return (
    <div>
      <Group title={t("acct.profile.title")} footer={`${t("acct.profile.since", { date: f.date(p.createdAt) })} · ${t("acct.profile.emailNote")}`}>
        <Field label={t("acct.profile.name")} value={name} onChange={setName} autoComplete="name" max={120} />
        <Field label={t("acct.profile.email")} value={p.email} disabled />
        <Field label={t("acct.profile.phone")} value={phone} onChange={setPhone} type="tel" autoComplete="tel" inputMode="tel" max={30} />
        <label className="flex items-center gap-4 px-5 py-3.5">
          <span className="w-[34%] max-w-[150px] shrink-0 text-[14px] text-muted">{t("acct.profile.language")}</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className="flex-1 bg-transparent text-right text-[15px] outline-none">
            <option value="pt">Português</option><option value="en">English</option><option value="es">Español</option>
          </select>
        </label>
      </Group>

      <Group title={t("acct.profile.address")} footer={t("acct.profile.sensitive")}>
        <label className="flex items-center gap-4 px-5 py-3.5">
          <span className="w-[34%] max-w-[150px] shrink-0 text-[14px] text-muted">{t("acct.profile.country")}</span>
          <select value={a.country || "BR"} onChange={(e) => set("country", e.target.value)} className="flex-1 bg-transparent text-right text-[15px] outline-none">
            {COUNTRIES.map((c) => <option key={c} value={c}>{new Intl.DisplayNames([p.locale === "pt" ? "pt-BR" : p.locale], { type: "region" }).of(c)}</option>)}
          </select>
        </label>
        <Field label={t("acct.profile.zip")} value={a.zip} onChange={(v) => { set("zip", v); void lookupZip(v); }} autoComplete="postal-code" max={10} />
        <Field label={t("acct.profile.street")} value={a.street} onChange={(v) => set("street", v)} autoComplete="address-line1" max={120} />
        <Field label={t("acct.profile.number")} value={a.number} onChange={(v) => set("number", v)} max={12} />
        <Field label={t("acct.profile.complement")} value={a.complement} onChange={(v) => set("complement", v)} autoComplete="address-line2" max={60} />
        <Field label={t("acct.profile.district")} value={a.district} onChange={(v) => set("district", v)} max={60} />
        <Field label={t("acct.profile.city")} value={a.city} onChange={(v) => set("city", v)} autoComplete="address-level2" max={80} />
        <Field label={t("acct.profile.state")} value={a.state} onChange={(v) => set("state", v.toUpperCase())} autoComplete="address-level1" max={2} />
      </Group>

      <div className="mt-6 px-2"><button type="button" onClick={save} disabled={busy} className="btn btn-primary w-full disabled:opacity-50 sm:w-auto">{t("acct.profile.save")}</button></div>
      {msg && <Msg ok={msg.ok}>{msg.text}</Msg>}
    </div>
  );
}

/* ---------- Pagamentos ---------- */

interface Pay {
  subscription: { status: string; price_cents: number; started_at: string; canceled_at: string | null; next_charge: string | null } | null;
  price_cents: number;
  method: { type: "card" | "pix"; brand: string | null; last4: string | null };
  payments: { id: number; amount_cents: number; status: string; method: string; at: string }[];
  total_paid_cents: number;
}

export function PaymentsTab() {
  const { t, href, lang } = useI18n();
  const f = useFmt();
  const refresh = useStore((s) => s.refresh);
  const { data, reload } = useApi<Pay>("/me/payments");
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!data) return <p className="mt-10 text-center text-muted">…</p>;
  const sub = data.subscription;
  const active = sub?.status === "active";

  async function setMethod(m: "card" | "pix") {
    try {
      await api("PUT", "/me/payment-method", { method: m });
      reload();
      setMsg({ ok: true, text: t("acct.billing.methodSaved") });
    } catch (e) {
      setMsg({ ok: false, text: errText(t, e) });
    }
  }
  async function cancel() {
    try {
      await api("POST", "/me/subscription/cancel", { confirm: true });
      setAsk(false);
      await refresh();
      reload();
      setMsg({ ok: true, text: t("acct.billing.canceledOk") });
    } catch (e) {
      setMsg({ ok: false, text: errText(t, e) });
    }
  }
  const STATUS: Record<string, string> = { paid: "paid", refunded: "refunded", failed: "failed", pending: "pending" };

  return (
    <div>
      <Group title={t("acct.billing.plan")} footer={t("acct.billing.testNote")}>
        <Row label={t("acct.billing.plan")}>
          <span className="flex items-center justify-end gap-2">{t("pricing.name")}<span className={`rounded-full px-2.5 py-0.5 text-[11px] ${active ? "bg-[#6f8a6b]/15 text-[#4f6a4b]" : "bg-surface2 text-muted"}`}>{active ? t("acct.billing.active") : sub ? t("acct.billing.canceled") : t("acct.billing.none")}</span></span>
        </Row>
        <Row label={t("acct.billing.perMonth", { price: formatBrl((sub?.price_cents ?? data.price_cents) / 100, lang) })} />
        {sub && <Row label={t("acct.billing.started")}>{f.date(sub.started_at)}</Row>}
        {active && sub?.next_charge && <Row label={t("acct.billing.next")}>{f.date(sub.next_charge)}</Row>}
        <div className="px-5 py-4">
          {active ? (
            ask ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-ember">{t("acct.billing.cancelAsk")}</span>
                <button type="button" onClick={cancel} className="btn btn-ember !h-10">{t("acct.billing.cancelYes")}</button>
                <button type="button" onClick={() => setAsk(false)} className="btn btn-ghost !h-10">{t("acct.billing.keep")}</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAsk(true)} className="text-[14px] text-ember">{t("acct.billing.cancel")}</button>
            )
          ) : (
            <Link href={href("/assine")} className="btn btn-primary !h-10">{t("acct.billing.subscribe")}</Link>
          )}
        </div>
      </Group>

      <Group title={t("acct.billing.method")} footer={t("acct.billing.cardNote")}>
        {(["card", "pix"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={data.method.type === m} className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left text-[15px] transition-colors hover:bg-surface2/60">
            <span>
              {t(`acct.billing.${m}`)}
              {m === "card" && <span className="ml-2 text-[13px] text-muted">{data.method.brand && data.method.last4 ? `${data.method.brand} •••• ${data.method.last4}` : t("acct.billing.noCard")}</span>}
            </span>
            {data.method.type === m && <Check size={17} className="text-bronze" aria-label="selected" />}
          </button>
        ))}
      </Group>

      <Group title={t("acct.billing.history")} footer={data.payments.length ? `${t("acct.billing.total")}: ${formatBrl(data.total_paid_cents / 100, lang)}` : undefined}>
        {data.payments.length === 0 && <p className="px-5 py-8 text-center text-[14px] text-muted">{t("acct.billing.noHistory")}</p>}
        {data.payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5 text-[14px]">
            <span>{f.date(p.at)}<span className="ml-2 text-[12px] text-muted">{p.method === "pix" ? "Pix" : t("acct.billing.card")}</span></span>
            <span className="flex items-center gap-3">
              <span className={`text-[12px] ${p.status === "paid" ? "text-[#4f6a4b]" : p.status === "refunded" ? "text-bronze" : "text-ember"}`}>{t(`acct.billing.${STATUS[p.status] ?? "pending"}`)}</span>
              <span className="tabular-nums">{formatBrl(p.amount_cents / 100, lang)}</span>
            </span>
          </div>
        ))}
      </Group>
      {msg && <Msg ok={msg.ok}>{msg.text}</Msg>}
    </div>
  );
}

/* ---------- Segurança ---------- */

interface Access {
  sessions: { id: number; device: string; created_at: string; last_seen_at: string; current: boolean }[];
  events: { action: string; meta: string; created_at: string }[];
}

export function SecurityTab() {
  const { t, href } = useI18n();
  const f = useFmt();
  const { data, reload } = useApi<Access>("/me/access");
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    setMsg(null);
    if (nw.length < 10) return setMsg({ ok: false, text: t("acct.security.weak") });
    if (nw !== cf) return setMsg({ ok: false, text: t("acct.security.mismatch") });
    setBusy(true);
    try {
      await api("PUT", "/me/password", { current: cur, new: nw });
      setCur("");
      setNw("");
      setCf("");
      setMsg({ ok: true, text: t("acct.security.changed") });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError && e.status === 401 ? t("acct.security.wrong") : e instanceof ApiError && e.code === "weak_password" ? t("acct.security.weak") : errText(t, e) });
    }
    setBusy(false);
  }
  async function revoke(id: number) {
    try {
      await api("DELETE", `/me/sessions/${id}`);
      setMsg({ ok: true, text: t("acct.security.revoked") });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: errText(t, e) });
    }
  }
  async function revokeOthers() {
    try {
      await api("POST", "/me/sessions/revoke-others");
      setMsg({ ok: true, text: t("acct.security.revoked") });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: errText(t, e) });
    }
  }
  const others = data?.sessions.filter((s) => !s.current).length ?? 0;
  const known = (a: string) => ["login_ok", "login_fail", "register", "password_changed", "password_reset", "profile_updated", "export", "anamnese_saved", "payment_method_changed", "subscription_canceled_by_user", "session_revoked", "appointment_requested", "appointment_canceled"].includes(a);

  return (
    <div>
      <Group title={t("acct.security.password")}>
        <Field label={t("acct.security.current")} value={cur} onChange={setCur} type="password" autoComplete="current-password" />
        <Field label={t("acct.security.next")} value={nw} onChange={setNw} type="password" autoComplete="new-password" />
        <Field label={t("acct.security.confirm")} value={cf} onChange={setCf} type="password" autoComplete="new-password" />
      </Group>
      <div className="mt-4 flex flex-wrap items-center gap-5 px-2">
        <button type="button" onClick={change} disabled={busy || !cur || !nw} className="btn btn-primary !h-11 disabled:opacity-40">{t("acct.security.change")}</button>
        <Link href={href("/esqueci")} className="text-[13px] text-muted underline underline-offset-4">{t("acct.security.forgot")}</Link>
      </div>
      {msg && <Msg ok={msg.ok}>{msg.text}</Msg>}

      <Group title={t("acct.security.devices")} footer={others > 0 ? undefined : undefined}>
        {(data?.sessions ?? []).map((s) => {
          const mobile = /iOS|Android/.test(s.device);
          const Icon = mobile ? Smartphone : Laptop;
          return (
            <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
              <Icon size={20} strokeWidth={1.3} className="shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{s.device}{s.current && <span className="ml-2 rounded-full bg-[#6f8a6b]/15 px-2 py-0.5 text-[11px] text-[#4f6a4b]">{t("acct.security.thisDevice")}</span>}</p>
                <p className="text-[12px] text-muted">{t("acct.security.lastSeen", { when: f.rel(s.last_seen_at) })}</p>
              </div>
              {!s.current && <button type="button" onClick={() => revoke(s.id)} className="text-[13px] text-ember">{t("acct.security.revoke")}</button>}
            </div>
          );
        })}
        {others > 0 && <div className="px-5 py-3.5"><button type="button" onClick={revokeOthers} className="text-[14px] text-ember">{t("acct.security.revokeOthers")}</button></div>}
      </Group>

      <Group title={t("acct.security.activity")} footer={t("acct.security.ipNote")}>
        {(data?.events.length ?? 0) === 0 && <p className="px-5 py-8 text-center text-[14px] text-muted">{t("acct.security.noActivity")}</p>}
        {data?.events.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-[14px]">
            <span>{known(e.action) ? t(`acct.security.events.${e.action}`) : e.action}{e.meta && e.action.startsWith("login") && <span className="ml-2 text-[12px] text-muted">{e.meta}</span>}</span>
            <span className="shrink-0 text-[12px] text-muted">{f.dateTime(e.created_at)}</span>
          </div>
        ))}
      </Group>
    </div>
  );
}
