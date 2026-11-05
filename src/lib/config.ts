/**
 * Valores de negócio. Hoje fixos para a demo; serão lidos do banco e editados no painel Admin.
 */
export const PLAN = {
  priceBrl: 79.9, // PLACEHOLDER — definir o preço real no Admin
  currency: "BRL",
  interval: "month",
} as const;

export const COMMISSION_DEFAULT_TIERS = [
  { id: "bronze", minActive: 1, percent: 20 },
  { id: "silver", minActive: 15, percent: 25 },
  { id: "gold", minActive: 40, percent: 30 },
] as const;

export const formatBrl = (v: number, lang: string) =>
  new Intl.NumberFormat(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US", {
    style: "currency",
    currency: "BRL",
  }).format(v);
