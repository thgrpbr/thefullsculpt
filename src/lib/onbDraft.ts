import type { Answers } from "./anamnese";

/**
 * Rascunho do cadastro: evita perder o que foi digitado se a página recarregar ou o botão voltar do navegador for usado.
 * NUNCA guarda a senha. Expira em 1 hora e é apagado ao concluir a anamnese.
 */
export interface Draft {
  step: string;
  name: string;
  email: string;
  terms: boolean;
  health: boolean;
  adult: boolean;
  marketing: boolean;
  birth: string;
  answers: Answers;
  at: number;
}
const KEY = "tfs-onb-draft";
const TTL = 60 * 60 * 1000;

export function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Draft | null;
    if (!d || typeof d.at !== "number" || Date.now() - d.at > TTL) {
      localStorage.removeItem(KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}
export function saveDraft(d: Omit<Draft, "at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, at: Date.now() }));
  } catch {
    /* armazenamento indisponível: segue sem rascunho */
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
