"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarClock, Wallet, UserX } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { brl, brlShort, dateTimeBr, monthLabel, num, pctText, phaseName, send, useApi } from "@/lib/admin";
import { BarChart, C, CohortTable, Funnel, HBars, Heatmap, LineChart } from "@/components/admin/charts";
import { Badge, Btn, Card, PageHead, Spinner, Stat, useAdmin } from "@/components/admin/ui";
import { Segmented } from "@/components/ui";

interface Overview {
  range: number;
  generatedAt: string;
  kpis: {
    students: { value: number; delta: number | null; new: number };
    activeSubs: { value: number; conversion: number };
    mrr: { value: number; arpu: number };
    revenue: { value: number; delta: number | null; refunds: number };
    churn: { value: number; canceled: number };
    lessons: { value: number; delta: number | null; perActive: number };
    active: { dau: number; wau: number; mau: number; stickiness: number; delta: number | null };
    effort: { rpe: number; minutes: number };
  };
  series: { month: string; revenue: number; refunds: number; mrr: number; newStudents: number; canceled: number }[];
  daily: { day: string; lessons: number; active: number; signups: number }[];
  heatmap: { week: string; days: (number | null)[] }[];
  funnel: { key: string; n: number }[];
  cohorts: { cohort: string; size: number; retention: (number | null)[] }[];
  phases: number[];
  rpeDistribution: number[];
  topLessons: { lesson: string; n: number; rpe: number }[];
  risk: { id: number; name: string; days: number; phase: number; streak: number }[];
  recent: { id: number; name: string; created_at: string; phase: number; sub: string }[];
  teachers: { id: number; name: string; students: number; active: number; mrr: number; commission: number; percent: number }[];
  upcoming: { id: number; starts_at: string; status: string; student: string; teacher: string | null }[];
  alerts: { riskStudents: number; consultsAwaiting: number; commissionsToApprove: number; commissionsToPay: number; suspended: number };
}

const FUNNEL_PT: Record<string, string> = { registered: "Cadastros", anamnese: "Anamnese concluída", first_lesson: "Primeira aula", subscribed: "Assinaram", retained: "Ativos nos últimos 14 dias" };

export default function Overview() {
  const { href } = useI18n();
  const { q, range, setRange, toast } = useAdmin();
  const { data, loading, reload } = useApi<Overview>(q("/admin/overview", { range }));
  const [revView, setRevView] = useState<"revenue" | "mrr">("revenue");
  const [busy, setBusy] = useState(false);

  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const k = data.kpis;
  const months = data.series.map((s) => monthLabel(s.month));
  const empty = k.students.value === 0;

  async function seed() {
    setBusy(true);
    const r = await send("POST", "/admin/demo/seed", { students: 400 });
    setBusy(false);
    if (r.ok) {
      toast("Dados de demonstração gerados.");
      reload();
    } else toast("Não foi possível gerar os dados.", "bad");
  }

  return (
    <div>
      <PageHead eyebrow="Painel" title="Visão geral">
        {loading && <Spinner />}
        <Segmented<string> label="Período" value={String(range)} onChange={(v) => setRange(Number(v))} options={[{ value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "365", label: "12 meses" }]} />
      </PageHead>

      {empty && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl">Ainda não há dados para analisar</h2>
              <p className="mt-1 max-w-xl text-[13px] text-muted">Gere uma base fictícia (400 alunos, 8 professores, pagamentos, comissões e consultas) para validar todas as telas. Tudo fica marcado como demo e pode ser apagado em Configurações.</p>
            </div>
            <Btn variant="primary" size="md" onClick={seed} disabled={busy}>{busy ? "Gerando…" : "Gerar dados de demonstração"}</Btn>
          </div>
        </Card>
      )}

      {/* alertas operacionais */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: UserX, n: data.alerts.riskStudents, label: "assinantes em risco (7+ dias sem treinar)", to: "/admin/alunos?risk=1", tone: data.alerts.riskStudents ? "text-ember" : "text-muted" },
          { icon: CalendarClock, n: data.alerts.consultsAwaiting, label: "consultas aguardando confirmação", to: "/admin/consultas", tone: data.alerts.consultsAwaiting ? "text-bronze" : "text-muted" },
          { icon: Wallet, n: data.alerts.commissionsToApprove, label: "comissões prontas para aprovar", to: "/admin/pagamentos?tab=comissoes", tone: data.alerts.commissionsToApprove ? "text-bronze" : "text-muted" },
          { icon: AlertTriangle, n: data.alerts.suspended, label: "alunos suspensos", to: "/admin/alunos?status=suspended", tone: "text-muted" },
        ].map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.label} href={href(a.to)} className="card flex items-center gap-3 p-4 transition-colors hover:bg-surface2/60" style={{ borderRadius: 16 }}>
              <Icon size={18} strokeWidth={1.4} className={a.tone} aria-hidden="true" />
              <span><b className="font-display mr-1.5 text-2xl font-normal">{a.n}</b><span className="text-[12px] text-muted">{a.label}</span></span>
            </Link>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Receita no período" value={brl(k.revenue.value)} delta={k.revenue.delta} sub={`reembolsos ${brl(k.revenue.refunds)}`} spark={data.series.map((s) => s.revenue)} sparkColor={C.bronze} />
        <Stat label="MRR" value={brl(k.mrr.value)} sub={`ARPU ${brl(k.mrr.arpu)}`} spark={data.series.map((s) => s.mrr)} sparkColor={C.ink} hint="Receita mensal recorrente das assinaturas ativas" />
        <Stat label="Assinantes ativos" value={num(k.activeSubs.value)} sub={`${pctText(k.activeSubs.conversion)} dos alunos`} spark={data.series.map((s) => s.mrr)} sparkColor={C.sage} />
        <Stat label="Novos alunos" value={num(k.students.new)} delta={k.students.delta} sub={`${num(k.students.value)} no total`} spark={data.daily.map((d) => d.signups)} sparkColor={C.bronze} />
        <Stat label="Churn (30 dias)" value={pctText(k.churn.value)} sub={`${k.churn.canceled} cancelamentos`} invert spark={data.series.map((s) => s.canceled)} sparkColor={C.ember} hint="Cancelamentos nos últimos 30 dias ÷ assinantes ativos há 30 dias" />
        <Stat label="Aulas concluídas" value={num(k.lessons.value)} delta={k.lessons.delta} sub={`${k.lessons.perActive} por aluno ativo`} spark={data.daily.map((d) => d.lessons)} sparkColor={C.ember} />
      </div>

      {/* receita + funil */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Receita e MRR" sub="Últimos 12 meses · o último ponto é o mês em andamento"
          action={<Segmented<"revenue" | "mrr"> label="Série" value={revView} onChange={setRevView} options={[{ value: "revenue", label: "Receita" }, { value: "mrr", label: "MRR" }]} />}>
          <LineChart
            labels={months}
            height={250}
            format={brlShort}
            label="Receita e MRR mensais"
            series={revView === "revenue"
              ? [{ name: "Receita", values: data.series.map((s) => s.revenue), color: C.bronze, area: true }, { name: "Reembolsos", values: data.series.map((s) => s.refunds), color: C.ember, dashed: true }]
              : [{ name: "MRR", values: data.series.map((s) => s.mrr), color: C.ink, area: true }]}
          />
        </Card>
        <Card className="lg:col-span-4" title="Funil de conversão" sub="Do cadastro ao aluno retido">
          <Funnel steps={data.funnel.map((f) => ({ label: FUNNEL_PT[f.key], n: f.n }))} />
        </Card>
      </div>

      {/* engajamento */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4" title="Engajamento" sub="Alunos únicos que concluíram aulas">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[{ l: "DAU", v: k.active.dau }, { l: "WAU", v: k.active.wau }, { l: "MAU", v: k.active.mau }].map((x) => (
              <div key={x.l}><p className="font-display text-3xl leading-none">{typeof x.v === "number" ? num(Math.round(x.v)) : x.v}</p><p className="eyebrow mt-1 !text-[10px]">{x.l}</p></div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">Aderência (DAU/MAU): <b className="font-medium text-fg">{pctText(k.active.stickiness)}</b></p>
          <div className="mt-4"><BarChart labels={data.daily.map((d) => d.day.slice(8))} values={data.daily.map((d) => d.active)} height={120} color={C.bronze} label="Alunos ativos por dia" /></div>
        </Card>
        <Card className="lg:col-span-4" title="Alunos por fase" sub="Distribuição atual no método">
          <BarChart labels={data.phases.map((_, i) => String(i + 1))} values={data.phases} height={190} color={C.ink} label="Alunos por fase" />
          <p className="mt-2 text-[11px] text-muted">Fases 1–3 básico · 4–6 intermediário · 7–9 avançado</p>
        </Card>
        <Card className="lg:col-span-4" title="Esforço percebido (RPE)" sub={`Média ${k.effort.rpe} · duração média ${k.effort.minutes} min`}>
          <BarChart labels={data.rpeDistribution.map((_, i) => String(i + 1))} values={data.rpeDistribution} height={190} color={C.ember} highlight={Math.round(k.effort.rpe) - 1} label="Distribuição do esforço" />
          <p className="mt-2 text-[11px] text-muted">1 = muito leve · 10 = máximo. Ideal: concentrado entre 5 e 8.</p>
        </Card>
      </div>

      {/* calor + coortes */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6" title="Mapa de calor de atividade" sub="Aulas concluídas por dia, últimas 12 semanas">
          <Heatmap rows={data.heatmap.map((h) => ({ label: h.week, days: h.days }))} cols={["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]} />
        </Card>
        <Card className="lg:col-span-6" title="Retenção por coorte" sub="% de alunos com ao menos uma aula em cada mês após o cadastro">
          <CohortTable rows={data.cohorts} />
        </Card>
      </div>

      {/* listas */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5" title="Ranking de professores" sub="Alunos ativos e comissão acumulada" pad={false}>
          <ul className="divide-y divide-line">
            {data.teachers.length === 0 && <li className="px-5 py-8 text-center text-muted">Nenhum professor ainda.</li>}
            {data.teachers.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <span className="font-display w-5 text-xl text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate">{t.name}</span><span className="text-[11px] text-muted">{t.active} ativos · {t.students} indicados · {t.percent}%</span></span>
                <span className="text-right"><b className="font-medium">{brl(t.commission)}</b><span className="block text-[10px] text-muted">comissão</span></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-4" title="Alunos em risco" sub="Assinantes sem treinar há 7+ dias" pad={false}
          action={<Link href={href("/admin/alunos?risk=1")} className="text-[11px] text-bronze">ver todos</Link>}>
          <ul className="divide-y divide-line">
            {data.risk.length === 0 && <li className="px-5 py-8 text-center text-muted">Nenhum assinante em risco.</li>}
            {data.risk.map((r) => (
              <li key={r.id}>
                <Link href={href(`/admin/alunos?open=${r.id}`)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface2/60">
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="text-[11px] text-muted">fase {r.phase}</span>
                  <Badge tone={r.days >= 14 ? "bad" : "warn"}>{r.days} dias</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-3" title="Próximas consultas" pad={false} action={<Link href={href("/admin/consultas")} className="text-[11px] text-bronze">agenda</Link>}>
          <ul className="divide-y divide-line">
            {data.upcoming.length === 0 && <li className="px-5 py-8 text-center text-muted">Sem consultas agendadas.</li>}
            {data.upcoming.map((a) => (
              <li key={a.id} className="px-5 py-2.5">
                <div className="flex items-center justify-between gap-2"><span className="truncate">{a.student}</span><Badge tone={a.status === "confirmed" ? "ok" : "warn"}>{a.status === "confirmed" ? "confirmada" : "pedido"}</Badge></div>
                <p className="text-[11px] text-muted">{dateTimeBr(a.starts_at)} · {a.teacher ?? "sem professor"}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6" title="Aulas mais concluídas" sub="No período · esforço médio">
          <HBars items={data.topLessons.map((l) => ({ label: `Aula ${l.lesson.toUpperCase().replace("F", "Fase ")}`, value: l.n }))} color={C.bronze} />
          <p className="mt-3 text-[11px] text-muted">Esforço médio: {data.topLessons.slice(0, 4).map((l) => `${l.lesson}: ${l.rpe}`).join(" · ") || "–"}</p>
        </Card>
        <Card className="lg:col-span-6" title="Cadastros recentes" pad={false} action={<Link href={href("/admin/alunos")} className="text-[11px] text-bronze">ver alunos</Link>}>
          <ul className="divide-y divide-line">
            {data.recent.map((r) => (
              <li key={r.id}>
                <Link href={href(`/admin/alunos?open=${r.id}`)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface2/60">
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="text-[11px] text-muted">{phaseName(r.phase)}</span>
                  <Badge tone={r.sub === "active" ? "ok" : "neutral"}>{r.sub === "active" ? "assinante" : "grátis"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-6 text-[11px] text-muted">Atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.generatedAt))}. Cálculos feitos no servidor a partir dos registros; os valores de MRR usam o preço contratado em cada assinatura.</p>
    </div>
  );
}
