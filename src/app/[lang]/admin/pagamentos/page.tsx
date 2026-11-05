"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { brl, brlShort, dateBr, ERRORS, num, pctText, send, useApi } from "@/lib/admin";
import { BarChart, C, Donut } from "@/components/admin/charts";
import { Badge, Btn, Card, DataTable, inputCls, PageHead, Pager, Spinner, Stat, Tabs, Toolbar, useAdmin, type Col, type Tone } from "@/components/admin/ui";

interface Billing {
  mrr: number; arr: number; activeSubs: number; arpu: number; revenue30: number; revenueDelta: number | null; refunds30: number; refundRate: number; failed30: number;
  churn30: number; ltv: number | null; byMethod: Record<string, { n: number; cents: number }>; statuses: Record<string, number>;
  commissions: Record<string, { cents: number; n: number }>; commissionsDueNow: number; dailyRevenue: { day: string; cents: number }[];
}
interface Pg<T> { total: number; page: number; size: number; rows: T[] }
interface Pay { id: number; name: string; email: string; amount_cents: number; status: string; method: string; paid_at: string | null; is_demo: number }
interface Sub { id: number; name: string; email: string; status: string; price_cents: number; started_at: string; canceled_at: string | null; provider: string; is_demo: number }
interface Com { id: number; teacher: string; student: string; amount_cents: number; percent: number; status: string; available_at: string; paid_at: string | null; is_demo: number }
interface Payout { id: number; teacher: string; amount_cents: number; period: string; paid_at: string; note: string | null }

const PAY_TONE: Record<string, Tone> = { paid: "ok", refunded: "warn", failed: "bad", pending: "neutral" };
const PAY_PT: Record<string, string> = { paid: "pago", refunded: "reembolsado", failed: "falhou", pending: "pendente" };
const COM_TONE: Record<string, Tone> = { pending: "warn", approved: "info", paid: "ok", void: "bad" };
const COM_PT: Record<string, string> = { pending: "em carência", approved: "aprovada", paid: "paga", void: "anulada" };

export default function Page() {
  return (
    <Suspense fallback={<div className="flex justify-center py-32"><Spinner /></div>}>
      <Payments />
    </Suspense>
  );
}

function Payments() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"resumo" | "pagamentos" | "assinaturas" | "comissoes" | "repasses">(sp.get("tab") === "comissoes" ? "comissoes" : "resumo");
  return (
    <div>
      <PageHead eyebrow="Comercial" title="Pagamentos e repasses">
        <a href="/api/admin/export/payments.csv" className="inline-flex h-8 items-center gap-1.5 rounded-full border-[0.5px] border-line px-3.5 text-[12px] hover:bg-surface2"><Download size={13} aria-hidden="true" />Pagamentos CSV</a>
        <a href="/api/admin/export/commissions.csv" className="inline-flex h-8 items-center gap-1.5 rounded-full border-[0.5px] border-line px-3.5 text-[12px] hover:bg-surface2"><Download size={13} aria-hidden="true" />Comissões CSV</a>
      </PageHead>
      <Tabs value={tab} onChange={setTab} items={[{ value: "resumo", label: "Resumo" }, { value: "pagamentos", label: "Pagamentos" }, { value: "assinaturas", label: "Assinaturas" }, { value: "comissoes", label: "Comissões" }, { value: "repasses", label: "Repasses" }]} />
      <div className="mt-4">
        {tab === "resumo" && <Summary />}
        {tab === "pagamentos" && <PaymentsTab />}
        {tab === "assinaturas" && <SubsTab />}
        {tab === "comissoes" && <CommissionsTab />}
        {tab === "repasses" && <PayoutsTab />}
      </div>
      <p className="mt-6 text-[11px] text-muted">Pagamentos reais entrarão pelo Stripe (cartão e Pix) via webhook. Até lá, o ambiente usa a assinatura de teste e os dados de demonstração.</p>
    </div>
  );
}

function Summary() {
  const { q } = useAdmin();
  const { data } = useApi<Billing>(q("/admin/billing/summary"));
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const d = data;
  const com = (s: string) => d.commissions[s] ?? { cents: 0, n: 0 };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="MRR" value={brl(d.mrr)} sub={`ARR ${brl(d.arr)}`} />
        <Stat label="Receita (30 dias)" value={brl(d.revenue30)} delta={d.revenueDelta} />
        <Stat label="Assinantes" value={num(d.activeSubs)} sub={`ARPU ${brl(d.arpu)}`} />
        <Stat label="Churn (30 dias)" value={pctText(d.churn30)} invert sub={d.ltv ? `LTV estimado ${brl(d.ltv)}` : "LTV: sem churn"} />
        <Stat label="Reembolsos" value={brl(d.refunds30)} sub={`${pctText(d.refundRate)} da receita`} />
        <Stat label="Falhas de cobrança" value={num(d.failed30)} sub="últimos 30 dias" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Receita diária" sub="Últimos 30 dias">
          <BarChart labels={d.dailyRevenue.map((x) => x.day.slice(8))} values={d.dailyRevenue.map((x) => x.cents)} height={200} color={C.bronze} format={brlShort} label="Receita diária" />
        </Card>
        <Card className="lg:col-span-4" title="Meios de pagamento" sub="Últimos 90 dias">
          <Donut size={128} items={[{ label: "Cartão", value: d.byMethod.card.n, color: C.ink }, { label: "Pix", value: d.byMethod.pix.n, color: C.bronze }]} center={<><b className="font-display text-2xl font-normal leading-none">{d.byMethod.card.n + d.byMethod.pix.n}</b><span className="text-[9px] text-muted">pagamentos</span></>} />
          <p className="mt-4 text-[11px] text-muted">Pix: {brl(d.byMethod.pix.cents)} · Cartão: {brl(d.byMethod.card.cents)}</p>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6" title="Assinaturas por situação">
          <Donut size={116} items={[{ label: "Ativas", value: d.statuses.active ?? 0, color: C.sage }, { label: "Canceladas", value: d.statuses.canceled ?? 0, color: C.ember }, { label: "Em atraso", value: d.statuses.past_due ?? 0, color: C.bronze }]} center={<><b className="font-display text-2xl font-normal leading-none">{Object.values(d.statuses).reduce((a, b) => a + b, 0)}</b><span className="text-[9px] text-muted">total</span></>} />
        </Card>
        <Card className="lg:col-span-6" title="Comissões de professores" sub="Pipeline de pagamento">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[{ k: "pending", l: "Carência", c: "text-bronze" }, { k: "approved", l: "Aprovadas", c: "text-fg" }, { k: "paid", l: "Pagas", c: "text-[#4f6a4b]" }, { k: "void", l: "Anuladas", c: "text-ember" }].map((x) => (
              <div key={x.k} className="rounded-xl bg-surface2 px-1 py-3"><p className={`font-display text-xl leading-none ${x.c}`}>{brl(com(x.k).cents)}</p><p className="eyebrow mt-1.5 !text-[9px]">{x.l} · {com(x.k).n}</p></div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">{d.commissionsDueNow > 0 ? <>Há <b className="font-medium text-fg">{brl(d.commissionsDueNow)}</b> com carência cumprida, prontos para aprovar na aba Comissões.</> : "Nenhuma comissão com carência cumprida aguardando aprovação."}</p>
        </Card>
      </div>
    </div>
  );
}

function PaymentsTab() {
  const { q, toast } = useAdmin();
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Pg<Pay>>(q("/admin/payments", { status, method, q: term, page, size: 15 }));
  const cols: Col<Pay>[] = [
    { key: "d", head: "Data", cell: (r) => <span className="text-muted">{dateBr(r.paid_at)}</span> },
    { key: "n", head: "Aluno", cell: (r) => <div><p className="flex items-center gap-2">{r.name}{r.is_demo ? <Badge>demo</Badge> : null}</p><p className="text-[11px] text-muted">{r.email}</p></div> },
    { key: "m", head: "Meio", cell: (r) => (r.method === "pix" ? "Pix" : "Cartão") },
    { key: "v", head: "Valor", align: "right", cell: (r) => brl(r.amount_cents) },
    { key: "s", head: "Situação", cell: (r) => <Badge tone={PAY_TONE[r.status]}>{PAY_PT[r.status]}</Badge> },
    { key: "a", head: "", align: "right", cell: (r) => r.status === "paid" ? <Btn variant="danger" onClick={async () => { const x = await send("POST", `/admin/payments/${r.id}/refund`); if (x.ok) { toast("Reembolso registrado."); reload(); } else toast(ERRORS[x.code] ?? ERRORS.generic, "bad"); }}>Reembolsar</Btn> : null },
  ];
  return (
    <Card pad={false}>
      <Toolbar>
        <input className={`${inputCls} !h-9 max-w-[240px]`} placeholder="Buscar aluno" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); }} aria-label="Buscar" />
        <select className={`${inputCls} !h-9 !w-auto`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(PAY_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={`${inputCls} !h-9 !w-auto`} value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} aria-label="Meio"><option value="">Cartão e Pix</option><option value="card">Cartão</option><option value="pix">Pix</option></select>
        {loading && <Spinner />}
      </Toolbar>
      <DataTable cols={cols} rows={data?.rows ?? []} loading={loading && !data} empty="Nenhum pagamento encontrado." />
      <Pager page={page} size={15} total={data?.total ?? 0} onPage={setPage} />
    </Card>
  );
}

function SubsTab() {
  const { q, toast } = useAdmin();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Pg<Sub>>(q("/admin/subscriptions", { status, page, size: 15 }));
  const cols: Col<Sub>[] = [
    { key: "n", head: "Aluno", cell: (r) => <div><p className="flex items-center gap-2">{r.name}{r.is_demo ? <Badge>demo</Badge> : null}</p><p className="text-[11px] text-muted">{r.email}</p></div> },
    { key: "p", head: "Plano", cell: () => "Mensal" },
    { key: "v", head: "Valor", align: "right", cell: (r) => brl(r.price_cents) },
    { key: "i", head: "Início", cell: (r) => <span className="text-muted">{dateBr(r.started_at)}</span> },
    { key: "f", head: "Fim", cell: (r) => <span className="text-muted">{r.canceled_at ? dateBr(r.canceled_at) : "–"}</span> },
    { key: "s", head: "Situação", cell: (r) => <Badge tone={r.status === "active" ? "ok" : "neutral"}>{r.status === "active" ? "ativa" : "cancelada"}</Badge> },
    { key: "a", head: "", align: "right", cell: (r) => r.status === "active" ? <Btn onClick={async () => { const x = await send("POST", `/admin/subscriptions/${r.id}/cancel`); if (x.ok) { toast("Assinatura cancelada."); reload(); } else toast(ERRORS[x.code] ?? ERRORS.generic, "bad"); }}>Cancelar</Btn> : null },
  ];
  return (
    <Card pad={false}>
      <Toolbar>
        <select className={`${inputCls} !h-9 !w-auto`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação"><option value="">Todas</option><option value="active">Ativas</option><option value="canceled">Canceladas</option></select>
        {loading && <Spinner />}
      </Toolbar>
      <DataTable cols={cols} rows={data?.rows ?? []} loading={loading && !data} empty="Nenhuma assinatura." />
      <Pager page={page} size={15} total={data?.total ?? 0} onPage={setPage} />
    </Card>
  );
}

function CommissionsTab() {
  const { q, toast } = useAdmin();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<Pg<Com> & { summary: { status: string; cents: number; n: number }[] }>(q("/admin/commissions", { status, page, size: 15 }));
  const cols: Col<Com>[] = [
    { key: "t", head: "Professor", cell: (r) => <span className="flex items-center gap-2">{r.teacher}{r.is_demo ? <Badge>demo</Badge> : null}</span> },
    { key: "s", head: "Aluno", cell: (r) => <span className="text-muted">{r.student}</span> },
    { key: "p", head: "%", align: "right", cell: (r) => `${r.percent}%` },
    { key: "v", head: "Valor", align: "right", cell: (r) => brl(r.amount_cents) },
    { key: "l", head: "Libera em", cell: (r) => <span className="text-muted">{dateBr(r.available_at)}</span> },
    { key: "st", head: "Situação", cell: (r) => <Badge tone={COM_TONE[r.status]}>{COM_PT[r.status]}</Badge> },
  ];
  async function approve() {
    const r = await send<{ approved: number }>("POST", "/admin/commissions/approve", {});
    if (r.ok) {
      toast(r.data.approved ? `${r.data.approved} comissões aprovadas.` : "Nenhuma comissão com carência cumprida.");
      reload();
    } else toast(ERRORS.generic, "bad");
  }
  return (
    <Card pad={false}>
      <Toolbar>
        <select className={`${inputCls} !h-9 !w-auto`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Situação"><option value="">Todas</option>{Object.entries(COM_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Btn variant="primary" onClick={approve}>Aprovar todas as liberadas</Btn>
        <span className="text-[11px] text-muted">O repasse é feito por professor, na ficha dele (Professores).</span>
        {loading && <Spinner />}
      </Toolbar>
      <DataTable cols={cols} rows={data?.rows ?? []} loading={loading && !data} empty="Nenhuma comissão." />
      <Pager page={page} size={15} total={data?.total ?? 0} onPage={setPage} />
    </Card>
  );
}

function PayoutsTab() {
  const { q } = useAdmin();
  const { data, loading } = useApi<{ rows: Payout[] }>(q("/admin/payouts"));
  const cols: Col<Payout>[] = [
    { key: "d", head: "Pago em", cell: (r) => dateBr(r.paid_at) },
    { key: "t", head: "Professor", cell: (r) => r.teacher },
    { key: "p", head: "Período", cell: (r) => <span className="text-muted">{r.period}</span> },
    { key: "v", head: "Valor", align: "right", cell: (r) => <b className="font-medium">{brl(r.amount_cents)}</b> },
    { key: "n", head: "Nota", cell: (r) => <span className="text-muted">{r.note ?? "–"}</span> },
  ];
  return <Card pad={false}><DataTable cols={cols} rows={data?.rows ?? []} loading={loading && !data} empty="Nenhum repasse realizado." /></Card>;
}
