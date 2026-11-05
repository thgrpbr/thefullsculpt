"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { brl, brlShort, dateBr, dateTimeBr, ERRORS, monthLabel, num, phaseName, send, useApi } from "@/lib/admin";
import { BarChart, C, LineChart } from "@/components/admin/charts";
import { Badge, Btn, Card, DataTable, PageHead, Pager, Spinner, Stat, Tabs, useAdmin, type Col, type Tone } from "@/components/admin/ui";

interface Overview {
  profile: { name: string; email: string; code: string; cref: string | null; status: string };
  stats: {
    students: number; active: number; mrr: number; percent: number; avgStreak: number;
    nextTier: { id: string; min: number; percent: number; missing: number } | null;
    commissions: Record<string, { cents: number; n: number }>;
    series: { month: string; commission: number; newStudents: number }[];
    risk: { id: number; name: string; days: number }[];
  };
  upcoming: { id: number; starts_at: string; status: string; duration_min: number; link: string | null; student: string }[];
}
interface SRow { id: number; name: string; created_at: string; phase: number; xp: number; streak: number; best_streak: number; sub_status: string; last_day: string | null; lessons: number }
interface CRow { id: number; student: string; amount_cents: number; percent: number; status: string; available_at: string; paid_at: string | null }
interface Pg<T> { total: number; page: number; size: number; rows: T[] }

const COM_TONE: Record<string, Tone> = { pending: "warn", approved: "info", paid: "ok", void: "bad" };
const COM_PT: Record<string, string> = { pending: "em carência", approved: "aprovada", paid: "paga", void: "anulada" };

export default function TeacherHome() {
  const { toast } = useAdmin();
  const { data, reload } = useApi<Overview>("/teacher/overview");
  const [tab, setTab] = useState<"alunos" | "comissoes">("alunos");
  const [sp, setSp] = useState(1);
  const [cp, setCp] = useState(1);
  const students = useApi<Pg<SRow>>(`/teacher/students?page=${sp}&size=10`);
  const coms = useApi<Pg<CRow> & { payouts: { id: number; amount_cents: number; period: string; paid_at: string }[] }>(`/teacher/commissions?page=${cp}&size=10`);

  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const { profile, stats } = data;
  const com = (s: string) => stats.commissions[s]?.cents ?? 0;
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/pt/onboarding/?ref=${profile.code}`;
  const months = stats.series.map((s) => monthLabel(s.month));

  const scols: Col<SRow>[] = [
    { key: "n", head: "Aluno", cell: (r) => r.name },
    { key: "p", head: "Fase", cell: (r) => <span title={phaseName(r.phase ?? 1)}>{r.phase ?? 1}/9</span> },
    { key: "l", head: "Aulas", align: "right", cell: (r) => r.lessons },
    { key: "s", head: "Streak", align: "right", cell: (r) => r.streak ?? 0 },
    { key: "a", head: "Última aula", cell: (r) => <span className="text-muted">{r.last_day ? dateBr(r.last_day + " 00:00:00") : "nunca"}</span> },
    { key: "pl", head: "Plano", cell: (r) => <Badge tone={r.sub_status === "active" ? "ok" : "neutral"}>{r.sub_status === "active" ? "assinante" : "grátis"}</Badge> },
  ];
  const ccols: Col<CRow>[] = [
    { key: "s", head: "Aluno", cell: (r) => r.student },
    { key: "p", head: "%", align: "right", cell: (r) => `${r.percent}%` },
    { key: "v", head: "Valor", align: "right", cell: (r) => brl(r.amount_cents) },
    { key: "l", head: "Libera em", cell: (r) => <span className="text-muted">{dateBr(r.available_at)}</span> },
    { key: "st", head: "Situação", cell: (r) => <Badge tone={COM_TONE[r.status]}>{COM_PT[r.status]}</Badge> },
  ];

  async function setStatus(id: number, status: string) {
    const r = await send("PATCH", `/teacher/appointments/${id}`, { status });
    if (r.ok) {
      toast("Consulta atualizada.");
      reload();
    } else toast(ERRORS[r.code] ?? ERRORS.generic, "bad");
  }

  return (
    <div>
      <PageHead eyebrow="Painel do professor" title={`Olá, ${profile.name.split(" ")[0]}`}>
        <Badge tone={profile.status === "active" ? "ok" : "warn"}>{profile.status === "active" ? "conta ativa" : profile.status}</Badge>
      </PageHead>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Seu link de indicação</p>
            <p className="mt-1 truncate font-mono text-[12px]">{link}</p>
            <p className="mt-1 text-[11px] text-muted">Quem criar a conta por este link fica vinculado a você e gera comissão recorrente enquanto assinar. Código: <b className="font-mono font-medium text-fg">{profile.code}</b></p>
          </div>
          <Btn variant="primary" size="md" onClick={() => { void navigator.clipboard?.writeText(link); toast("Link copiado."); }}><Copy size={14} aria-hidden="true" />Copiar link</Btn>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Alunos indicados" value={num(stats.students)} spark={stats.series.map((s) => s.newStudents)} sparkColor={C.bronze} />
        <Stat label="Assinantes ativos" value={num(stats.active)} sub={`MRR gerado ${brl(stats.mrr)}`} />
        <Stat label="Sua comissão" value={`${stats.percent}%`} sub="por mensalidade paga" />
        <Stat label="Em carência" value={brl(com("pending"))} sub="libera após a carência" />
        <Stat label="A receber" value={brl(com("approved"))} sub="aprovada, aguardando repasse" />
        <Stat label="Já recebido" value={brl(com("paid"))} spark={stats.series.map((s) => s.commission)} sparkColor={C.sage} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Comissões geradas por mês" sub="Últimos 6 meses">
          <LineChart labels={months} height={210} format={brlShort} label="Comissões por mês" series={[{ name: "Comissão", values: stats.series.map((s) => s.commission), color: C.bronze, area: true }]} />
        </Card>
        <Card className="lg:col-span-4" title="Próxima faixa" sub="Sua comissão sobe com mais alunos ativos">
          {stats.nextTier ? (
            <>
              <p className="font-display text-4xl leading-none">+{stats.nextTier.percent - stats.percent} pontos</p>
              <p className="mt-2 text-[12px] text-muted">Faltam <b className="font-medium text-fg">{stats.nextTier.missing}</b> alunos ativos para a faixa <b className="font-medium text-fg">{stats.nextTier.id}</b> ({stats.nextTier.percent}%).</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-bronze" style={{ width: `${Math.min(100, (stats.active / stats.nextTier.min) * 100)}%` }} /></div>
              <p className="mt-1 text-[10px] text-muted">{stats.active} de {stats.nextTier.min}</p>
            </>
          ) : <p className="text-[13px] text-muted">Você está na faixa mais alta. Obrigado por trazer tantos alunos!</p>}
          <p className="mt-5 text-[11px] text-muted">Constância média dos seus alunos: <b className="font-medium text-fg">{stats.avgStreak} dias</b></p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4" title="Alunos que precisam de atenção" sub="Assinantes sem treinar há 7+ dias" pad={false}>
          <ul className="divide-y divide-line">
            {stats.risk.length === 0 && <li className="px-5 py-8 text-center text-muted">Todos os seus alunos estão treinando.</li>}
            {stats.risk.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><span className="truncate">{r.name}</span><Badge tone={r.days >= 14 ? "bad" : "warn"}>{r.days} dias</Badge></li>)}
          </ul>
        </Card>
        <Card className="lg:col-span-4" title="Novos alunos por mês">
          <BarChart labels={months} values={stats.series.map((s) => s.newStudents)} height={170} color={C.ink} label="Novos alunos por mês" />
        </Card>
        <Card className="lg:col-span-4" title="Minhas consultas" sub="Próximas" pad={false}>
          <ul className="divide-y divide-line">
            {data.upcoming.length === 0 && <li className="px-5 py-8 text-center text-muted">Sem consultas agendadas.</li>}
            {data.upcoming.map((a) => (
              <li key={a.id} className="px-5 py-2.5">
                <div className="flex items-center justify-between gap-2"><span className="truncate">{a.student}</span><Badge tone={a.status === "confirmed" ? "ok" : "warn"}>{a.status === "confirmed" ? "confirmada" : "pedido"}</Badge></div>
                <p className="text-[11px] text-muted">{dateTimeBr(a.starts_at)} · {a.duration_min} min</p>
                <div className="mt-1.5 flex gap-1.5">
                  {a.status === "requested" && <Btn onClick={() => setStatus(a.id, "confirmed")}>Confirmar</Btn>}
                  {a.status === "confirmed" && <Btn onClick={() => setStatus(a.id, "done")}>Realizada</Btn>}
                  {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-full border-[0.5px] border-line px-3.5 text-[12px] hover:bg-surface2">Abrir chamada</a>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" pad={false}>
        <div className="px-4 pt-3"><Tabs value={tab} onChange={setTab} items={[{ value: "alunos", label: "Meus alunos", count: students.data?.total }, { value: "comissoes", label: "Comissões e repasses", count: coms.data?.total }]} /></div>
        {tab === "alunos" ? (
          <>
            <DataTable cols={scols} rows={students.data?.rows ?? []} loading={!students.data} empty="Você ainda não tem alunos indicados. Compartilhe o seu link!" />
            <Pager page={sp} size={10} total={students.data?.total ?? 0} onPage={setSp} />
          </>
        ) : (
          <>
            <DataTable cols={ccols} rows={coms.data?.rows ?? []} loading={!coms.data} empty="Nenhuma comissão ainda." />
            <Pager page={cp} size={10} total={coms.data?.total ?? 0} onPage={setCp} />
            {(coms.data?.payouts.length ?? 0) > 0 && (
              <div className="border-t-[0.5px] border-line px-5 py-4">
                <h3 className="eyebrow mb-2">Repasses recebidos</h3>
                <ul className="space-y-1 text-[12px]">{coms.data!.payouts.map((p) => <li key={p.id} className="flex justify-between"><span>{p.period} · {dateBr(p.paid_at)}</span><b className="font-medium">{brl(p.amount_cents)}</b></li>)}</ul>
              </div>
            )}
          </>
        )}
      </Card>
      <p className="mt-4 text-[11px] text-muted">Por privacidade, você vê apenas o progresso de treino dos seus alunos — nunca dados de saúde (anamnese).</p>
    </div>
  );
}
