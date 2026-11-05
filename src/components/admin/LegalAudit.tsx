"use client";

import { useMemo, useState } from "react";
import { Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { dateTimeBr, ERRORS, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, DataTable, Field, inputCls, Modal, Spinner, type Col, type Tone } from "./ui";

interface Edit { id: number; slug: string; title: string | null; version: number; user_name: string; user_role: string; action: string; note: string | null; chars_added: number; chars_removed: number; has_content: number; entry_hash: string; created_at: string }
interface Detail { id: number; slug: string; title: string | null; version: number; user_name: string; user_role: string; action: string; note: string | null; created_at: string; entry_hash: string; before: Record<string, string> | null; after: Record<string, string> | null }

const ACTION: Record<string, { label: string; tone: Tone }> = {
  created: { label: "Modelo criado", tone: "neutral" }, saved: { label: "Texto editado", tone: "info" }, submit: { label: "Enviado para revisão", tone: "warn" },
  approve: { label: "Aprovado", tone: "ok" }, reopen: { label: "Devolvido a rascunho", tone: "neutral" }, publish: { label: "Publicado no site", tone: "ok" },
  comment: { label: "Comentário", tone: "neutral" }, company: { label: "Dados da empresa", tone: "info" },
};
const ROLE: Record<string, string> = { admin: "Master", legal: "Advogado", staff: "Equipe" };
const LANG: Record<string, string> = { pt: "Português", en: "English", es: "Español", legal_name: "Razão social", trade_name: "Nome fantasia", cnpj: "CNPJ", address: "Endereço", support_email: "E-mail de suporte", dpo_name: "Encarregado (DPO)", dpo_email: "E-mail do DPO" };

type Op = { t: "same" | "add" | "del"; s: string };
/** Diff por linhas (LCS) — suficiente para textos de até alguns milhares de linhas. */
function lineDiff(a: string, b: string): Op[] {
  const A = a === "" ? [] : a.split("\n");
  const B = b === "" ? [] : b.split("\n");
  const n = A.length;
  const m = B.length;
  if (n * m > 4_000_000) return [...A.map((s) => ({ t: "del" as const, s })), ...B.map((s) => ({ t: "add" as const, s }))];
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: "same", s: A[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "del", s: A[i++] });
    else out.push({ t: "add", s: B[j++] });
  }
  while (i < n) out.push({ t: "del", s: A[i++] });
  while (j < m) out.push({ t: "add", s: B[j++] });
  return out;
}

function DiffView({ before, after }: { before: Record<string, string> | null; after: Record<string, string> | null }) {
  const keys = useMemo(() => Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])), [before, after]);
  const [showAll, setShowAll] = useState(false);
  if (!after) return <p className="py-6 text-center text-[13px] text-muted">Este registro não altera o texto.</p>;
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Mostrar também as linhas sem alteração</label>
      {keys.map((k) => {
        const ops = lineDiff(before?.[k] ?? "", after?.[k] ?? "");
        const changed = ops.some((o) => o.t !== "same");
        if (!changed && !showAll) return null;
        return (
          <div key={k}>
            <p className="eyebrow mb-1.5">{LANG[k] ?? k}</p>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border-[0.5px] border-line bg-surface p-3 font-mono text-[11.5px] leading-relaxed">
              {ops.filter((o) => showAll || o.t !== "same").map((o, i) => (
                <span key={i} className={`block ${o.t === "add" ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200" : o.t === "del" ? "bg-ember/10 text-ember line-through" : "text-muted"}`}>{o.t === "add" ? "+ " : o.t === "del" ? "− " : "  "}{o.s || " "}</span>
              ))}
              {!changed && <span className="text-muted">Sem alterações neste campo.</span>}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

/** Trilha de auditoria: quem fez o quê e quando; abre o antes/depois de cada edição. */
export function AuditTrail({ slug, title = "Auditoria das edições", limit = 100 }: { slug?: string; title?: string; limit?: number }) {
  const q = `/admin/legal/history?limit=${limit}${slug ? `&slug=${slug}` : ""}`;
  const { data, loading } = useApi<{ rows: Edit[]; chain_ok: boolean }>(q);
  const [open, setOpen] = useState<number | null>(null);
  const det = useApi<Detail>(open ? `/admin/legal/edits/${open}` : null);

  const cols: Col<Edit & { id: number }>[] = [
    { key: "d", head: "Quando", cell: (r) => <span className="whitespace-nowrap text-muted">{dateTimeBr(r.created_at)}</span> },
    { key: "u", head: "Quem", cell: (r) => <div><p>{r.user_name}</p><p className="text-[10px] text-muted">{ROLE[r.user_role] ?? r.user_role}</p></div> },
    ...(slug ? [] : [{ key: "t", head: "Documento", cell: (r: Edit) => <span>{r.title ?? r.slug}</span> } as Col<Edit & { id: number }>]),
    { key: "a", head: "O que fez", cell: (r) => <Badge tone={ACTION[r.action]?.tone ?? "neutral"}>{ACTION[r.action]?.label ?? r.action}{r.version ? ` · v${r.version}` : ""}</Badge> },
    { key: "c", head: "Mudança", align: "right", cell: (r) => (r.action === "saved" || r.action === "created") ? <span className="whitespace-nowrap font-mono text-[11px]"><span className="text-emerald-700">+{r.chars_added}</span> <span className="text-ember">−{r.chars_removed}</span></span> : <span className="text-muted">–</span> },
    { key: "n", head: "Nota", cell: (r) => <span className="line-clamp-2 max-w-[280px] text-muted">{r.note ?? "–"}</span> },
  ];

  return (
    <Card pad={false} title={title} sub="Registro imutável e encadeado por hash: cada linha guarda autor, data/hora e o texto antes e depois."
      action={<div className="flex items-center gap-2">
        {loading && <Spinner />}
        {data && (data.chain_ok
          ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><ShieldCheck size={13} aria-hidden="true" />cadeia íntegra</span>
          : <span className="inline-flex items-center gap-1 text-[11px] text-ember"><ShieldAlert size={13} aria-hidden="true" />registro adulterado</span>)}
        <a href={`/api/admin/legal/history.csv${slug ? `?slug=${slug}` : ""}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border-[0.5px] border-line px-3.5 text-[12px] hover:bg-surface2"><Download size={13} aria-hidden="true" />CSV</a>
      </div>}>
      <DataTable cols={cols} rows={(data?.rows ?? []).map((r) => ({ ...r }))} onRow={(r) => setOpen(r.id)} empty="Nenhuma edição registrada." />
      <Modal open={open !== null} onClose={() => setOpen(null)} title={det.data ? `${det.data.title ?? det.data.slug} · ${ACTION[det.data.action]?.label ?? det.data.action}` : "Edição"} width={820}>
        {!det.data ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <div className="space-y-4 text-[13px]">
            <p className="text-muted">{det.data.user_name} ({ROLE[det.data.user_role] ?? det.data.user_role}) · {dateTimeBr(det.data.created_at)} · versão {det.data.version}{det.data.note ? ` · “${det.data.note}”` : ""}</p>
            <DiffView before={det.data.before} after={det.data.action === "saved" || det.data.action === "created" || det.data.action === "company" ? det.data.after : null} />
            <p className="break-all font-mono text-[10px] text-muted">hash {det.data.entry_hash}</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/** Identificação do controlador de dados (aparece no rodapé público e nos documentos). */
export function CompanyCard({ company, canEdit, onSaved, toast }: { company: Record<string, string>; canEdit: boolean; onSaved: () => void; toast: (m: string, t?: "ok" | "bad") => void }) {
  const [f, setF] = useState(company);
  const [err, setErr] = useState("");
  const fields: [string, string, string?][] = [["legal_name", "Razão social"], ["trade_name", "Nome fantasia"], ["cnpj", "CNPJ"], ["address", "Endereço"], ["support_email", "E-mail de suporte", "email"], ["dpo_name", "Encarregado (DPO)"], ["dpo_email", "E-mail do encarregado", "email"]];
  async function save() {
    setErr("");
    const r = await send("PUT", "/admin/legal/company", f);
    if (r.ok) { toast("Dados da empresa salvos."); onSaved(); } else setErr(ERRORS[r.code] ?? ERRORS.generic);
  }
  return (
    <Card title="Dados da empresa (rodapé legal)" sub="Identificação do controlador exigida pela LGPD. Aparece no rodapé do site e nas páginas legais.">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {fields.map(([k, label, type]) => (
          <Field key={k} label={label}><input className={inputCls} type={type ?? "text"} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} readOnly={!canEdit} /></Field>
        ))}
        {err && <p role="alert" className="text-[12px] text-ember sm:col-span-2">{err}</p>}
        {canEdit && <div className="sm:col-span-2"><Btn type="submit" variant="primary" size="md">Salvar dados da empresa</Btn></div>}
      </form>
    </Card>
  );
}
