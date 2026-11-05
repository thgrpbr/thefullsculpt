"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { formatBrl } from "@/lib/config";
import { INTERVAL_KEY, usePlans, type PublicPlan } from "@/lib/plans";

type Lang = "pt" | "en" | "es";

/** Texto do pacote no idioma atual; vazio => padrão do dicionário (plano de reserva). */
export function usePlanText() {
  const { t, lang } = useI18n();
  const l = lang as Lang;
  return {
    name: (p: PublicPlan) => p.name[l] || p.name.pt || t("pricing.name"),
    description: (p: PublicPlan) => p.description[l] || p.description.pt,
    features: (p: PublicPlan) => {
      const f = p.features[l]?.length ? p.features[l] : p.features.pt;
      return f && f.length ? f : ["p1", "p2", "p3", "p4"].map((k) => t(`pricing.${k}`));
    },
    per: (p: PublicPlan) => t(`pricing.interval.${INTERVAL_KEY[p.interval_months] ?? "month"}`),
  };
}

/** Preço com o valor de tabela riscado quando há promoção em andamento. */
export function Price({ plan, size = "text-6xl" }: { plan: PublicPlan; size?: string }) {
  const { lang } = useI18n();
  const x = usePlanText();
  const promo = plan.discount_cents > 0;
  return (
    <div>
      {promo && (
        <p className="flex items-center gap-2 text-[14px] text-muted">
          <span className="line-through">{formatBrl(plan.price_cents / 100, lang)}</span>
          <span className="rounded-full bg-ember px-2.5 py-0.5 text-[11px] text-white">{plan.promo_label || `-${plan.discount_pct}%`}</span>
        </p>
      )}
      <p className={`font-display mt-1 ${size}`}>{formatBrl(plan.final_cents / 100, lang)}<span className="text-xl text-muted"> {x.per(plan)}</span></p>
    </div>
  );
}

/** Vitrine de pacotes da página inicial. */
export function PlanCards() {
  const { t, href } = useI18n();
  const { plans } = usePlans();
  const x = usePlanText();
  return (
    <div className={`mt-10 grid gap-5 text-left ${plans.length === 1 ? "mx-auto max-w-lg" : plans.length === 2 ? "mx-auto max-w-3xl md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
      {plans.map((p) => (
        <div key={p.id} className={`card p-8 ${p.featured && plans.length > 1 ? "!border-fg" : ""}`}>
          <p className="eyebrow">{x.name(p)}</p>
          <div className="mt-3"><Price plan={p} /></div>
          {x.description(p) && <p className="mt-3 text-[14px] text-muted">{x.description(p)}</p>}
          <ul className="mt-6 flex flex-col gap-3 text-[15px]">
            {x.features(p).map((f) => (
              <li key={f} className="flex items-start gap-3"><Check size={17} className="mt-0.5 shrink-0 text-bronze" aria-hidden="true" />{f}</li>
            ))}
          </ul>
          <Link href={href("/onboarding")} className="btn btn-primary mt-8 w-full">{t("landing.cta")}</Link>
        </div>
      ))}
    </div>
  );
}
