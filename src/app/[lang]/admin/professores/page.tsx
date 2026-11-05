"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { brl, dateBr, ERRORS, num, phaseName, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, DataTable, Drawer, Field, inputCls, KV, Modal, PageHead, Spinner, Stat, Tabs, useAdmin, type Col } from "@/components/admin/ui";

interface TRow {
  id: number; name: string; email: string; user_status: string; created_at: string; last_login_at: string | null; is_demo: number;
  code: string | null; cref: string | null; status: string | null; tier_percent: number | null; percent: number;
  students: number; active_students: number; c_pending: number; c_approved: number; c_paid: number;
}
interface TDetail {
  teacher: { id: number; name: string; email: string; code: string; cref: string | null; bio: string | null; status: string; tier_percent: number | null; created_at: string };
  percent: number;
  students: { id: number; name: string; created_at: string; phase: number; xp: number; streak: number; sub_status: string; last_day: string | null }[];
  commissions: { id: number; student: string; amount_cents: number; percent: number; status: string; available_at: string; paid_at: string | null }[];
  payouts: { id: number; amount_cents: number; period: string; paid_at: string }[];
}

const STATUS_PT: Record<string, string> = { active: "ativo", pending: "pendente", suspended: "suspenso" };
const COM_TONE: Record<string, "ok" | "warn" | "neutral" | "bad" | "info"> = { pending: "warn", approved: "info", paid: "ok", void: "bad" };
const COM_PT: Record<string, string> = { pending: "em carência", approved: "aprovada", paid: "paga", void: "anulada" };

export default function Teachers() {
  const { q, toast } = useAdmin();
  const { data, loading, reload } = useApi<{ rows: TRow[] }>(q("/admin/teachers"));
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = data?.rows ?? [];
  const sum = (f: (r: TRow) => number) => rows.reduce((a, r) => a + f(r), 0);

  const copy = (t: string) => {
    void navigator.clipboard?.writeText(t);
    toast("Copiado.");
  };

  const cols: Col<TRow>[] = [
    { key: "n", head: "Professor", cell: (r) => <div><p className="flex items-center gap-2">{r.name}{r.is_demo ? <Badge>demo</Badge> : null}</p><p className="text-[11px] text-muted">{r.email}</p></div> },
    { key: "c", head: "Código", cell: (r) => r.code ? <button type="button" onClick={(e) => { e.stopPropagation(); copy(r.code!); }} className="inline-flex items-center gap-1.5 rounded-lg bg-surface2 px-2 py-1 font-mono text-[11px]" title="Copiar código">{r.code}<Copy size={11} aria-hidden="true" /></button> : "–" },
    { key: "s", head: "Situação", cell: (r) => <Badge tone={r.status === "active" ? "ok" : r.status === "pending" ? "warn" : "bad"}>{STATUS_PT[r.status ?? "active"]}</Badge> },
    { key: "a", head: "Alunos", align: "right", cell: (r) => <span>{r.active_students}<span className="text-muted"> / {r.students}</span></span> },
    { key: "p", head: "Comissão", align: "right", cell: (r) => <span title={r.tier_percent !== null ? "percentual individual" : "faixa automática"}>{r.percent}%{r.tier_percent !== null && <span className="text-bronze">*</span>}</span> },
    { key: "pe", head: "Carência", align: "right", cell: (r) => <span className="text-muted">{brl(r.c_pending)}</span> },
    { key: "ap", head: "A pagar", align: "right", cell: (r) => <b className={`font-medium ${r.c_approved > 0 ? "text-bronze" : "text-muted"}`}>{brl(r.c_approved)}</b> },
    { key: "pd", head: "Pago", align: "right", cell: (r) => brl(r.c_paid) },
  ];

  return (
    <div>
      <PageHead eyebrow="Gestão" title="Professores">
        {loading && <Spinner />}
        <Btn variant="primary" size="md" onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" />Novo professor</Btn>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Professores" value={rows.length} sub={`${rows.filter((r) => r.status === "active").length} ativos`} />
        <Stat label="Alunos indicados" value={num(sum((r) => r.students))} sub={`${num(sum((r) => r.active_students))} assinantes`} />
        <Stat label="Em carência" value={brl(sum((r) => r.c_pending))} sub="aguardando liberação" />
        <Stat label="Pronto para pagar" value={brl(sum((r) => r.c_approved))} sub="comissões aprovadas" />
        <Stat label="Já repassado" value={brl(sum((r) => r.c_paid))} sub="total histórico" />
      </div>

      <Card pad={false}>
        <DataTable cols={cols} rows={rows} onRow={(r) => setOpen(r.id)} loading={loading && !data} empty="Nenhum professor cadastrado. Crie o primeiro em “Novo professor”." />
      </Card>
      <p className="mt-3 text-[11px] text-muted">As faixas de comissão (por número de alunos ativos) e a carência são definidas em Configurações. Percentuais com <span className="text-bronze">*</span> foram fixados individualmente.</p>

      <NewTeacher open={creating} onClose={() => setCreating(false)} onDone={() => { reload(); }} />
      <Drawer open={open !== null} onClose={() => setOpen(null)} title="Professor" width={680}>
        {open !== null && <Detail id={open} onChanged={reload} />}
      </Drawer>
    </div>
  );
}

function NewTeacher({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", cref: "", tier: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ code: string; tempPassword: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    const r = await send<{ code: string; tempPassword: string }>("POST", "/admin/teachers", { name: f.name, email: f.email, cref: f.cref || undefined, tier_percent: f.tier ? Number(f.tier) : null });
    setBusy(false);
    if (r.ok) {
      setDone(r.data);
      onDone();
    } else setErr(ERRORS[r.code] ?? ERRORS.generic);
  }
  const close = () => {
    setDone(null);
    setF({ name: "", email: "", cref: "", tier: "" });
    setErr("");
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={done ? "Professor criado" : "Novo professor"}>
      {done ? (
        <div className="space-y-4 text-[13px]">
          <p>Envie estes dados ao professor por um canal seguro. A senha temporária <b className="font-medium">não será mostrada novamente</b>.</p>
          <div className="rounded-xl bg-surface2 p-4 font-mono text-[12px]">
            <p>E-mail: {f.email}</p>
            <p>Senha temporária: {done.tempPassword}</p>
            <p>Código de indicação: {done.code}</p>
          </div>
          <Btn variant="primary" size="md" onClick={close}>Concluir</Btn>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Nome completo"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="E-mail (será o login)"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CREF (opcional)"><input className={inputCls} value={f.cref} onChange={(e) => setF({ ...f, cref: e.target.value })} /></Field>
            <Field label="Comissão fixa % (opcional)" hint="Vazio = faixas automáticas"><input className={inputCls} type="number" min={0} max={60} value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} /></Field>
          </div>
          {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
          <Btn type="submit" variant="primary" size="md" disabled={busy}>{busy ? "Criando…" : "Criar professor"}</Btn>
        </form>
      )}
    </Modal>
  );
}

function Detail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const { toast } = useAdmin();
  const { data, reload } = useApi<TDetail>(`/admin/teachers/${id}`);
  const [tab, setTab] = useState<"alunos" | "comissoes" | "repasses" | "ajustes">("alunos");
  const [tier, setTier] = useState<string | null>(null);
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const t = data.teacher;
  const approved = data.commissions.filter((c) => c.status === "approved").reduce((a, c) => a + c.amount_cents, 0);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/pt/onboarding/?ref=${t.code}`;

  async function act(fn: Promise<{ ok: boolean; code?: string }>, ok: string) {
    const r = await fn;
    if (r.ok) {
      toast(ok);
      reload();
      onChanged();
    } else toast(ERRORS[r.code ?? "generic"] ?? ERRORS.generic, "bad");
  }

  return (
    <div>
      <div className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-3xl leading-tight">{t.name}</h2><Badge tone={t.status === "active" ? "ok" : "warn"}>{STATUS_PT[t.status]}</Badge></div>
        <p className="mt-1 text-[12px] text-muted">{t.email}{t.cref ? ` · CREF ${t.cref}` : ""} · desde {dateBr(t.created_at)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface2 py-2.5"><p className="font-display text-2xl leading-none">{data.percent}%</p><p className="eyebrow mt-1 !text-[9px]">comissão atual</p></div>
          <div className="rounded-xl bg-surface2 py-2.5"><p className="font-display text-2xl leading-none">{data.students.filter((s) => s.sub_status === "active").length}</p><p className="eyebrow mt-1 !text-[9px]">alunos ativos</p></div>
          <div className="rounded-xl bg-surface2 py-2.5"><p className="font-display text-2xl leading-none">{brl(approved)}</p><p className="eyebrow mt-1 !text-[9px]">a pagar</p></div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border-[0.5px] border-line px-3 py-2 text-[11px]"><span className="min-w-0 flex-1 truncate text-muted">{link}</span><button type="button" onClick={() => { void navigator.clipboard?.writeText(link); toast("Link copiado."); }} className="flex items-center gap-1 text-bronze"><Copy size={12} aria-hidden="true" />copiar link</button></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => act(send("POST", "/admin/commissions/approve", { teacher_id: id }), "Comissões liberadas aprovadas.")}>Aprovar comissões liberadas</Btn>
          <Btn variant="primary" disabled={approved <= 0} onClick={() => act(send("POST", "/admin/payouts", { teacher_id: id }), "Repasse registrado.")}>Pagar repasse {approved > 0 ? brl(approved) : ""}</Btn>
        </div>
      </div>
      <div className="px-5"><Tabs value={tab} onChange={setTab} items={[{ value: "alunos", label: "Alunos", count: data.students.length }, { value: "comissoes", label: "Comissões", count: data.commissions.length }, { value: "repasses", label: "Repasses", count: data.payouts.length }, { value: "ajustes", label: "Ajustes" }]} /></div>
      <div className="p-5">
        {tab === "alunos" && (
          <ul className="divide-y divide-line text-[12px]">
            {data.students.length === 0 && <li className="py-8 text-center text-muted">Nenhum aluno indicado ainda.</li>}
            {data.students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5"><span className="min-w-0 flex-1 truncate">{s.name}</span><span className="text-muted">{phaseName(s.phase ?? 1)}</span><Badge tone={s.sub_status === "active" ? "ok" : "neutral"}>{s.sub_status === "active" ? "assinante" : "grátis"}</Badge></li>
            ))}
          </ul>
        )}
        {tab === "comissoes" && (
          <ul className="divide-y divide-line text-[12px]">
            {data.commissions.length === 0 && <li className="py-8 text-center text-muted">Sem comissões.</li>}
            {data.commissions.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5"><span className="min-w-0 flex-1 truncate">{c.student}<span className="block text-[10px] text-muted">libera em {dateBr(c.available_at)}</span></span><span className="text-muted">{c.percent}%</span><b className="font-medium">{brl(c.amount_cents)}</b><Badge tone={COM_TONE[c.status]}>{COM_PT[c.status]}</Badge></li>
            ))}
          </ul>
        )}
        {tab === "repasses" && (
          <ul className="divide-y divide-line text-[12px]">
            {data.payouts.length === 0 && <li className="py-8 text-center text-muted">Nenhum repasse realizado.</li>}
            {data.payouts.map((p) => <li key={p.id} className="flex items-center justify-between py-2.5"><span>{p.period} · pago em {dateBr(p.paid_at)}</span><b className="font-medium">{brl(p.amount_cents)}</b></li>)}
          </ul>
        )}
        {tab === "ajustes" && (
          <div className="space-y-4">
            <Field label="Situação do professor">
              <select className={inputCls} value={t.status} onChange={(e) => act(send("PATCH", `/admin/teachers/${id}`, { status: e.target.value }), "Situação atualizada.")}>
                <option value="active">Ativo (recebe indicações)</option><option value="pending">Pendente de aprovação</option><option value="suspended">Suspenso</option>
              </select>
            </Field>
            <Field label="Comissão fixa individual (%)" hint="Vazio = usa as faixas automáticas por número de alunos ativos.">
              <div className="flex gap-2">
                <input className={inputCls} type="number" min={0} max={60} value={tier ?? (t.tier_percent ?? "")} onChange={(e) => setTier(e.target.value)} />
                <Btn variant="primary" onClick={() => act(send("PATCH", `/admin/teachers/${id}`, { tier_percent: (tier ?? String(t.tier_percent ?? "")) === "" ? null : Number(tier ?? t.tier_percent) }), "Percentual atualizado.")}>Salvar</Btn>
              </div>
            </Field>
            <KV k="Código de indicação" v={<span className="font-mono">{t.code}</span>} />
            <KV k="Último acesso" v={t.created_at ? dateBr(t.created_at) : "–"} />
          </div>
        )}
      </div>
    </div>
  );
}
