"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ERRORS, num, send } from "@/lib/admin";
import { Badge, Btn, Card, Field, inputCls, useAdmin } from "@/components/admin/ui";

export interface Settings {
  price_cents: number;
  commission_tiers: { id: string; min: number; percent: number }[];
  commission_hold_days: number;
  consult_enabled: boolean;
  consult_capacity: number;
  free_lessons: number;
  availability: { weekdays: number[]; start: string; end: string; slot_min: number };
}
export interface System { php: string; db: string; schema: number; time: string; counts: Record<string, number> }

export const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];


export function useSave(onSaved: () => void) {
  const { toast } = useAdmin();
  const [err, setErr] = useState("");
  return {
    err,
    async save(body: Record<string, unknown>) {
      setErr("");
      const r = await send("PUT", "/admin/settings", body);
      if (r.ok) {
        toast("Configurações salvas.");
        onSaved();
      } else setErr(ERRORS[r.code] ?? ERRORS.generic);
    },
  };
}

export function Commissions({ s, onSaved }: { s: Settings; onSaved: () => void }) {
  const [tiers, setTiers] = useState(s.commission_tiers);
  const [hold, setHold] = useState(s.commission_hold_days);
  const { err, save } = useSave(onSaved);
  const set = (i: number, k: "min" | "percent", v: number) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Comissões de professores" sub="Percentual recorrente sobre cada mensalidade paga, por faixa de alunos ativos">
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 text-[10px] uppercase tracking-[0.14em] text-muted"><span>Faixa</span><span>A partir de (alunos)</span><span>Comissão %</span><span /></div>
        {tiers.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-2">
            <input className={inputCls} value={t.id} onChange={(e) => setTiers((l) => l.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} aria-label="Nome da faixa" />
            <input className={inputCls} type="number" min={1} value={t.min} onChange={(e) => set(i, "min", Number(e.target.value))} aria-label="Mínimo de alunos" />
            <input className={inputCls} type="number" min={0} max={60} value={t.percent} onChange={(e) => set(i, "percent", Number(e.target.value))} aria-label="Percentual" />
            <button type="button" aria-label="Remover faixa" disabled={tiers.length <= 1} onClick={() => setTiers((l) => l.filter((_, j) => j !== i))} className="text-muted hover:text-ember disabled:opacity-30"><X size={15} /></button>
          </div>
        ))}
        <Btn onClick={() => setTiers((l) => [...l, { id: `faixa${l.length + 1}`, min: (l.at(-1)?.min ?? 0) + 10, percent: Math.min(60, (l.at(-1)?.percent ?? 20) + 5) }])} disabled={tiers.length >= 6}><Plus size={13} aria-hidden="true" />Adicionar faixa</Btn>
      </div>
      <div className="mt-4 max-w-[240px]"><Field label="Carência (dias até liberar a comissão)" hint="Protege contra reembolsos e estornos."><input className={inputCls} type="number" min={0} max={90} value={hold} onChange={(e) => setHold(Number(e.target.value))} /></Field></div>
      {err && <p role="alert" className="mt-3 text-[12px] text-ember">{err}</p>}
      <div className="mt-4"><Btn variant="primary" onClick={() => save({ commission_tiers: tiers, commission_hold_days: hold })}>Salvar comissões</Btn></div>
      <p className="mt-3 text-[11px] text-muted">Comissão de um professor pode ser fixada individualmente na ficha dele. Mudanças valem para pagamentos futuros; as comissões já geradas não são alteradas.</p>
    </Card>
  );
}

export function Consults({ s, onSaved }: { s: Settings; onSaved: () => void }) {
  const [on, setOn] = useState(s.consult_enabled);
  const [cap, setCap] = useState(s.consult_capacity);
  const [av, setAv] = useState(s.availability);
  const { err, save } = useSave(onSaved);
  return (
    <Card title="Consultas online" sub="Horários que o aluno pode escolher ao pedir uma consulta (horário de Brasília)">
      <label className="mb-4 flex items-center gap-2 text-[12px]"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-[#161514]" />Aceitar novos pedidos de consulta</label>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Dias de atendimento">
        {WD.map((d, i) => {
          const sel = av.weekdays.includes(i);
          return <button key={d} type="button" aria-pressed={sel} onClick={() => setAv({ ...av, weekdays: sel ? av.weekdays.filter((x) => x !== i) : [...av.weekdays, i].sort() })} className={`h-9 w-12 rounded-full border-[0.5px] text-[12px] ${sel ? "border-fg bg-fg text-bg" : "border-line text-muted"}`}>{d}</button>;
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Início"><input className={inputCls} type="time" value={av.start} onChange={(e) => setAv({ ...av, start: e.target.value })} /></Field>
        <Field label="Fim"><input className={inputCls} type="time" value={av.end} onChange={(e) => setAv({ ...av, end: e.target.value })} /></Field>
        <Field label="Duração (min)"><input className={inputCls} type="number" min={15} max={120} step={5} value={av.slot_min} onChange={(e) => setAv({ ...av, slot_min: Number(e.target.value) })} /></Field>
        <Field label="Simultâneas" hint="professores em paralelo"><input className={inputCls} type="number" min={1} max={20} value={cap} onChange={(e) => setCap(Number(e.target.value))} /></Field>
      </div>
      {err && <p role="alert" className="mt-3 text-[12px] text-ember">{err}</p>}
      <div className="mt-4"><Btn variant="primary" onClick={() => save({ consult_enabled: on, consult_capacity: cap, availability: av })}>Salvar consultas</Btn></div>
    </Card>
  );
}

export function DemoData({ sys, onChanged }: { sys: System; onChanged: () => void }) {
  const { toast } = useAdmin();
  const [busy, setBusy] = useState(false);
  const demo = sys.counts.demoUsers;
  async function run(kind: "seed" | "purge") {
    if (kind === "purge" && !window.confirm("Apagar todos os dados de demonstração? Os dados reais não são afetados.")) return;
    setBusy(true);
    const r = await send<Record<string, number>>("POST", `/admin/demo/${kind}`, kind === "seed" ? { students: 400 } : undefined);
    setBusy(false);
    if (r.ok) {
      toast(kind === "seed" ? "Dados de demonstração gerados." : `${r.data.removed} registros de demonstração removidos.`);
      onChanged();
    } else toast(ERRORS.generic, "bad");
  }
  return (
    <Card title="Dados de demonstração" sub="Base fictícia para validar as telas antes de ter alunos reais">
      <p className="text-[12px] text-muted">Gera 400 alunos, 8 professores, 12 meses de pagamentos, comissões, repasses, aulas concluídas e consultas. Todos os registros são marcados como <Badge>demo</Badge>, usam e-mails <span className="font-mono">@exemplo.invalid</span> e <b className="font-medium text-fg">não têm senha utilizável</b>. Use o seletor “Dados” no topo para filtrar.</p>
      <p className="mt-3 text-[13px]">Hoje: <b className="font-medium">{num(demo)}</b> usuários de demonstração.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn variant="primary" disabled={busy} onClick={() => run("seed")}>{demo ? "Regenerar dados" : "Gerar dados"}</Btn>
        <Btn variant="danger" disabled={busy || demo === 0} onClick={() => run("purge")}>Apagar dados de demonstração</Btn>
      </div>
    </Card>
  );
}
