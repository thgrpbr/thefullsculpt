"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { PLAN } from "./config";

type L<T> = { pt: T; en: T; es: T };
export interface PublicPlan {
  id: number;
  slug: string;
  name: L<string>;
  description: L<string>;
  features: L<string[]>;
  interval_months: number;
  price_cents: number;
  featured: boolean;
  final_cents: number;
  discount_cents: number;
  discount_pct: number;
  promo_label: string | null;
}

export interface Quote {
  plan_id: number;
  base_cents: number;
  promo: { name: string; label: string | null; discount_cents: number } | null;
  code: { code: string; discount_cents: number } | null;
  code_error: string | null;
  discount_cents: number;
  total_cents: number;
  discount_pct: number;
  stacked: boolean;
  capped: boolean;
}

/** Plano de reserva quando a API ainda não está instalada (modo demonstração/local). */
export const FALLBACK_PLAN: PublicPlan = {
  id: 0,
  slug: "mensal",
  name: { pt: "", en: "", es: "" }, // vazio => usa os textos padrão do dicionário
  description: { pt: "", en: "", es: "" },
  features: { pt: [], en: [], es: [] },
  interval_months: 1,
  price_cents: Math.round(PLAN.priceBrl * 100),
  featured: true,
  final_cents: Math.round(PLAN.priceBrl * 100),
  discount_cents: 0,
  discount_pct: 0,
  promo_label: null,
};

/** Pacotes à venda, editados em Admin > Planos e Preços. */
export function usePlans(): { plans: PublicPlan[]; loaded: boolean } {
  const [state, setState] = useState<{ plans: PublicPlan[]; loaded: boolean }>({ plans: [FALLBACK_PLAN], loaded: false });
  useEffect(() => {
    let alive = true;
    api<{ plans: PublicPlan[] }>("GET", "/plans")
      .then((r) => alive && r.plans.length > 0 && setState({ plans: r.plans, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export const INTERVAL_KEY: Record<number, string> = { 1: "month", 3: "quarter", 6: "semester", 12: "year" };
