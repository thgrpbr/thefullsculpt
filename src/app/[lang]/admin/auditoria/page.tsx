"use client";

import { useState } from "react";
import { ACTION_PT, dateTimeBr, num, useApi } from "@/lib/admin";
import { Badge, Card, DataTable, inputCls, KV, PageHead, Pager, Spinner, Stat, Tabs, Toolbar, type Col } from "@/components/admin/ui";

interface Row { id: number; user_id: number | null; action: string; meta: string; created_at: string; name: string | null; role: string | null }
interface Privacy {
  consents: { type: string; granted: number; n: number }[];
  activity90d: { action: string; n: number }[];
  withHealthData: number;
  sessionsActive: number;
}

const FILTERS = [
  { v: "", l: "Todas as ações" }, { v: "admin_", l: "Ações administrativas" }, { v: "login", l: "Logins" }, { v: "admin_view_anamnese", l: "Leituras de anamnese" },
  { v: "admin_export", l: "Exportações" }, { v: "account_deleted", l: "Exclusões de conta" }, { v: "export", l: "Exportação pelo titular" }, { v: "appointment", l: "Consultas" },
];

export default function Audit() {
  const [tab, setTab] = useState<"log" | "lgpd">("log");
  return (
    <div>
      <PageHead eyebrow="Conformidade" title="Auditoria e LGPD" />
      <Tabs value={tab} onChange={setTab} items={[{ value: "log", label: "Registro de auditoria" }, { value: "lgpd", label: "Privacidade (LGPD)" }]} />
      <div className="mt-4">{tab === "log" ? <Log /> : <Lgpd />}</div>
    </div>
  );
}

function Log() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<{ total: number; rows: Row[] }>(`/admin/audit?page=${page}&size=20${action ? `&action=${action}` : ""}`);
  const sensitive = (a: string) => ["admin_view_anamnese", "admin_student_deleted", "admin_export", "admin_refund", "admin_payout"].includes(a);
  const cols: Col<Row>[] = [
    { key: "t", head: "Quando", cell: (r) => <span className="whitespace-nowrap text-muted">{dateTimeBr(r.created_at)}</span> },
    { key: "u", head: "Quem", cell: (r) => r.name ? <span>{r.name} <span className="text-[10px] text-muted">({r.role})</span></span> : <span className="text-muted">{r.user_id === null ? "titular removido / sistema" : "–"}</span> },
    { key: "a", head: "Ação", cell: (r) => <span className="flex items-center gap-2">{ACTION_PT[r.action] ?? r.action}{sensitive(r.action) && <Badge tone="warn">sensível</Badge>}</span> },
    { key: "m", head: "Detalhe", cell: (r) => <span className="font-mono text-[11px] text-muted">{r.meta || "–"}</span> },
  ];
  return (
    <Card pad={false}>
      <Toolbar>
        <select className={`${inputCls} !h-9 !w-auto`} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filtrar ação">{FILTERS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}</select>
        {loading && <Spinner />}
        <span className="text-[11px] text-muted">Os endereços IP são armazenados apenas como hash (HMAC) — minimização de dados.</span>
      </Toolbar>
      <DataTable cols={cols} rows={data?.rows ?? []} loading={loading && !data} empty="Nenhum evento registrado." />
      <Pager page={page} size={20} total={data?.total ?? 0} onPage={setPage} />
    </Card>
  );
}

function Lgpd() {
  const { data } = useApi<Privacy>("/admin/privacy");
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const rate = (type: string) => {
    const yes = data.consents.find((c) => c.type === type && c.granted)?.n ?? 0;
    const no = data.consents.find((c) => c.type === type && !c.granted)?.n ?? 0;
    return { yes, total: yes + no, pct: yes + no ? Math.round((yes / (yes + no)) * 100) : 0 };
  };
  const act = (a: string) => data.activity90d.find((x) => x.action === a)?.n ?? 0;
  const marketing = rate("marketing");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Com dados de saúde" value={num(data.withHealthData)} sub="anamnese criptografada" />
        <Stat label="Opt-in de marketing" value={`${marketing.pct}%`} sub={`${marketing.yes} de ${marketing.total} titulares`} />
        <Stat label="Sessões ativas" value={num(data.sessionsActive)} sub="cookies HttpOnly" />
        <Stat label="Leituras de anamnese" value={act("admin_view_anamnese")} sub="pela administração, 90 dias" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Direitos dos titulares (90 dias)">
          <KV k="Titulares que exportaram os próprios dados" v={act("export")} />
          <KV k="Contas excluídas pelo próprio titular" v={act("account_deleted")} />
          <KV k="Alunos excluídos pela administração" v={act("admin_student_deleted")} />
          <KV k="Exportações administrativas (CSV)" v={act("admin_export")} />
          <KV k="Tentativas de login falhas" v={act("login_fail")} />
        </Card>
        <Card title="Controles técnicos ativos">
          <ul className="space-y-2 text-[12px]">
            {[
              "Dados de saúde criptografados em repouso (libsodium/XSalsa20-Poly1305)",
              "Senhas com Argon2id; tokens de sessão guardados só como hash",
              "IPs armazenados apenas como HMAC (sem endereço em claro)",
              "Consentimentos versionados, com data e hash do IP",
              "Leitura de anamnese pela equipe sempre registrada na auditoria",
              "Exportação e exclusão de conta disponíveis ao titular no app",
              "Limite de tentativas de login/cadastro e proteção CSRF",
              "Segredos fora do diretório público; instalador travado",
            ].map((t) => <li key={t} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6f8a6b]" />{t}</li>)}
          </ul>
        </Card>
      </div>
      <p className="text-[11px] text-muted">Este painel apoia o cumprimento da LGPD, mas não substitui o parecer de um encarregado (DPO) e de assessoria jurídica: política de privacidade, RIPD e plano de resposta a incidentes continuam necessários antes do lançamento.</p>
    </div>
  );
}
