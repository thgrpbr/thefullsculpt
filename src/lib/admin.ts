"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

/** GET com cache simples por chave. Mantém o dado anterior enquanto recarrega (sem piscar). */
export function useApi<T>(path: string | null) {
  const [res, setRes] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const [tick, setTick] = useState(0);
  const key = path ? `${path}#${tick}` : null;

  useEffect(() => {
    if (!key || !path) return;
    let alive = true;
    api<T>("GET", path)
      .then((data) => alive && setRes({ key, data }))
      .catch((e) => alive && setRes({ key, error: e instanceof ApiError ? e.code : "generic" }));
    return () => {
      alive = false;
    };
  }, [key, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    data: res?.data ?? null,
    error: res && res.key === key ? (res.error ?? null) : null,
    loading: key !== null && res?.key !== key,
    reload,
  };
}

export async function send<T = unknown>(method: string, path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  try {
    return { ok: true, data: await api<T>(method, path, body) };
  } catch (e) {
    return { ok: false, code: e instanceof ApiError ? e.code : "generic" };
  }
}

export const ERRORS: Record<string, string> = {
  invalid_input: "Dados inválidos. Revise os campos.",
  email_taken: "Esse e-mail já está em uso.",
  slug_taken: "Já existe um exercício com esse identificador.",
  in_use: "Está em uso em aulas. Remova das aulas antes de excluir.",
  name_required: "Informe o nome em português.",
  invalid_price: "Preço inválido (entre R$ 5,00 e R$ 1.000,00).",
  invalid_tiers: "Faixas inválidas (mínimo ≥ 1, percentual 0–60%).",
  invalid_availability: "Disponibilidade inválida.",
  nothing_to_pay: "Não há comissões aprovadas para pagar.",
  not_refundable: "Pagamento não pode ser reembolsado.",
  not_cancelable: "Assinatura não está ativa.",
  confirm_required: "Confirmação necessária.",
  forbidden: "Sem permissão.",
  generic: "Não foi possível concluir. Tente novamente.",
};

/* ---------- formatação ---------- */

export const brl = (cents: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
export const brlShort = (cents: number) => {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1).replace(".", ",")}k`;
  return `R$ ${Math.round(v)}`;
};
export const num = (n: number | null | undefined) => new Intl.NumberFormat("pt-BR").format(n ?? 0);
export const pctText = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "–" : `${n.toFixed(digits).replace(".", ",")}%`);

const utc = (s: string) => new Date(s.replace(" ", "T") + "Z");
export const dateBr = (s: string | null | undefined) => (s ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(utc(s)) : "–");
export const dateTimeBr = (s: string | null | undefined) =>
  s ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(utc(s)) : "–";
export const timeBr = (s: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(utc(s));
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(y, m - 1, 1)).replace(".", "");
};
export const ago = (s: string | null | undefined) => {
  if (!s) return "nunca";
  const d = Math.floor((Date.now() - utc(s).getTime()) / 86400000);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};

export const FOCUS_PT: Record<string, string> = { legs: "Pernas", upper: "Parte superior", posterior: "Cadeia posterior", full: "Corpo inteiro", balance: "Equilíbrio e controle" };
export const LEVEL_PT = ["Básico", "Intermediário", "Avançado"];
export const INTENSITY_PT = ["Leves", "Moderados", "Intensos"];
export const phaseName = (p: number) => `${p} · ${LEVEL_PT[Math.floor((p - 1) / 3)]} ${INTENSITY_PT[(p - 1) % 3].toLowerCase()}`;
export const MUSCLE_PT: Record<string, string> = {
  quads: "Quadríceps", hamstrings: "Posteriores", glutes: "Glúteos", calves: "Panturrilhas", abs: "Abdômen", erector: "Eretores",
  lats: "Dorsais", pecs: "Peitorais", traps: "Trapézio", deltoids: "Deltoides", biceps: "Bíceps", triceps: "Tríceps",
};
export const MOTION_PT: Record<string, string> = { squat: "Agachamento (pernas)", hinge: "Dobradiça de quadril", press: "Empurrar acima da cabeça", raise: "Elevação de braços" };
export const ACTION_PT: Record<string, string> = {
  register: "Cadastro", login_ok: "Login", login_fail: "Login falhou", login_blocked: "Login bloqueado (suspenso)", anamnese_saved: "Anamnese salva",
  export: "Exportou os próprios dados", account_deleted: "Conta excluída pelo titular", subscription_test_activate: "Assinatura de teste",
  consent_marketing: "Consentimento de marketing", appointment_requested: "Consulta solicitada", appointment_canceled: "Consulta cancelada",
  admin_view_anamnese: "Admin leu anamnese", admin_student_status: "Admin: status do aluno", admin_student_phase: "Admin: fase do aluno",
  admin_student_teacher: "Admin: professor do aluno", admin_student_sub: "Admin: plano do aluno", admin_student_deleted: "Admin: aluno excluído",
  admin_teacher_created: "Admin: professor criado", admin_teacher_update: "Admin: professor editado", admin_exercise_created: "Admin: exercício criado",
  admin_exercise_updated: "Admin: exercício editado", admin_exercise_deleted: "Admin: exercício excluído", admin_lesson_updated: "Admin: aula editada",
  admin_import_default_method: "Admin: importou método padrão", admin_refund: "Admin: reembolso", admin_sub_cancel: "Admin: cancelou assinatura",
  admin_commissions_approve: "Admin: aprovou comissões", admin_payout: "Admin: repasse pago", admin_export: "Admin: exportou dados",
  admin_appointment_created: "Admin: consulta criada", admin_appointment_update: "Admin: consulta editada", admin_settings: "Admin: configurações",
  admin_demo_seed: "Admin: gerou dados demo", admin_smtp_updated: "Admin: SMTP alterado", admin_smtp_test: "Admin: teste de SMTP", admin_database_changed: "Admin: credenciais do banco alteradas",
  admin_gateway_created: "Admin: gateway conectado", admin_gateway_updated: "Admin: gateway editado", admin_gateway_test: "Admin: teste de gateway", admin_gateway_default: "Admin: gateway padrão", admin_gateway_deleted: "Admin: gateway removido",
  legal_seed: "Jurídico: modelos criados", legal_draft_saved: "Jurídico: rascunho salvo", legal_submit: "Jurídico: enviado para revisão", legal_approve: "Jurídico: aprovado", legal_reopen: "Jurídico: devolvido", legal_publish: "Jurídico: publicado", legal_comment: "Jurídico: comentário", legal_export: "Jurídico: dossiê exportado", legal_user_invited: "Jurídico: advogado convidado",
  password_changed: "Senha alterada", password_reset: "Senha redefinida", password_reset_requested: "Redefinição de senha solicitada", profile_updated: "Dados atualizados", payment_method_changed: "Meio de pagamento alterado", subscription_canceled_by_user: "Assinatura cancelada pelo aluno", session_revoked: "Sessão encerrada", admin_demo_purge: "Admin: apagou dados demo", teacher_appointment_update: "Professor: consulta",
};
