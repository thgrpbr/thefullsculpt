"use client";

import { useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { ChevronDown } from "lucide-react";
import { ERRORS, num, send, useApi } from "@/lib/admin";
import { useStore } from "@/lib/store";
import { Badge, Btn, Card, Field, inputCls, KV, Spinner, useAdmin } from "./ui";

interface Smtp {
  enabled: boolean; host: string; port: number; secure: "ssl" | "tls" | "none"; user: string; from_email: string; from_name: string; reply_to: string;
  verify_tls: boolean; public_url: string; has_password: boolean; configured: boolean;
}
interface Result { ok: boolean; error: string | null; log: string[] }
interface DnsCheck {
  domain: string; spf: { found: boolean; value: string | null; multiple: boolean }; dmarc: { found: boolean; value: string | null };
  dkim: { selector: string; name: string; found: boolean; type: string | null; value: string | null }[];
  suggest: { type: string; name: string; value: string; note: string }[];
}
interface DbInfo {
  driver: string; host: string; database: string; user: string; version: string; latency_ms: number; schema: number; latest_schema: number;
  tables: { name: string; rows: number; kb: number | null }[]; total_kb: number; config_writable: boolean; config_file: string;
}

const EXTRA: Record<string, string> = {
  invalid_smtp: "Servidor, porta ou e-mails inválidos.", invalid_url: "A URL pública deve começar com https://.", smtp_incomplete: "Para ativar, informe servidor e e-mail remetente.",
};

export function SmtpCard() {
  const { toast } = useAdmin();
  const email = useStore((s) => s.profile?.email ?? "");
  const { data, reload } = useApi<Smtp>("/admin/smtp");
  if (!data) return <Card title="E-mail (SMTP)"><div className="flex justify-center py-10"><Spinner /></div></Card>;
  return <SmtpForm key={JSON.stringify([data.host, data.port, data.user, data.enabled, data.has_password])} s={data} adminEmail={email} onSaved={reload} toast={toast} />;
}

function SmtpForm({ s, adminEmail, onSaved, toast }: { s: Smtp; adminEmail: string; onSaved: () => void; toast: (m: string, t?: "ok" | "bad") => void }) {
  const [f, setF] = useState({ ...s, password: "", clear: false });
  const [to, setTo] = useState(adminEmail);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [err, setErr] = useState("");
  const [dns, setDns] = useState<DnsCheck | null>(null);
  const [dnsBusy, setDnsBusy] = useState(false);
  async function checkDns() {
    setDnsBusy(true);
    setErr("");
    const r = await send<DnsCheck>("GET", "/admin/smtp/dns");
    setDnsBusy(false);
    if (r.ok) setDns(r.data);
    else setErr(r.code === "smtp_incomplete" ? "Salve primeiro o e-mail do remetente para verificar o DNS do domínio." : (EXTRA[r.code] ?? ERRORS[r.code] ?? ERRORS.generic));
  }
  const body = () => ({ enabled: f.enabled, host: f.host.trim(), port: Number(f.port), secure: f.secure, user: f.user.trim(), password: f.password, clear_password: f.clear, from_email: f.from_email.trim(), from_name: f.from_name.trim(), reply_to: f.reply_to.trim(), verify_tls: f.verify_tls, public_url: f.public_url.trim() });

  async function save() {
    setBusy("save");
    setErr("");
    const r = await send("PUT", "/admin/smtp", body());
    setBusy("");
    if (r.ok) {
      toast("Configuração de e-mail salva.");
      onSaved();
    } else setErr(EXTRA[r.code] ?? ERRORS[r.code] ?? ERRORS.generic);
  }
  async function test() {
    setBusy("test");
    setErr("");
    setRes(null);
    const r = await send<Result>("POST", "/admin/smtp/test", { ...body(), to });
    setBusy("");
    if (r.ok) setRes(r.data);
    else setErr(EXTRA[r.code] ?? ERRORS[r.code] ?? ERRORS.generic);
  }
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Card title="E-mail (SMTP)" sub="Envia boas-vindas, recuperação de senha e confirmação de consultas" className="lg:col-span-2"
      action={<Badge tone={s.enabled ? "ok" : "neutral"}>{s.enabled ? "ativo" : "desativado"}</Badge>}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted">Atalho:</span>
        <Btn onClick={() => setF((x) => ({ ...x, host: "smtp.hostinger.com", port: 465, secure: "ssl" }))}>Hostinger (SSL 465)</Btn>
        <Btn onClick={() => setF((x) => ({ ...x, host: "smtp.hostinger.com", port: 587, secure: "tls" }))}>Hostinger (STARTTLS 587)</Btn>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Servidor SMTP"><input className={inputCls} value={f.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.seudominio.com" autoComplete="off" /></Field>
        <Field label="Porta"><input className={inputCls} type="number" value={f.port} onChange={(e) => set("port", Number(e.target.value))} /></Field>
        <Field label="Segurança">
          <select className={inputCls} value={f.secure} onChange={(e) => set("secure", e.target.value as Smtp["secure"])}><option value="ssl">SSL/TLS (porta 465)</option><option value="tls">STARTTLS (porta 587)</option><option value="none">Nenhuma (não recomendado)</option></select>
        </Field>
        <Field label="Usuário"><input className={inputCls} value={f.user} onChange={(e) => set("user", e.target.value)} autoComplete="off" placeholder="contato@seudominio.com" /></Field>
        <Field label="Senha" hint={s.has_password ? "Já há uma senha salva (criptografada). Deixe em branco para mantê-la." : "Será guardada criptografada no servidor."}>
          <PasswordField meter={false} className={inputCls} value={f.password} onChange={(v) => set("password", v)} autoComplete="new-password" placeholder={s.has_password ? "••••••••••" : ""} label="Senha" />
        </Field>
        <Field label="Nome do remetente"><input className={inputCls} value={f.from_name} onChange={(e) => set("from_name", e.target.value)} /></Field>
        <Field label="E-mail do remetente"><input className={inputCls} type="email" value={f.from_email} onChange={(e) => set("from_email", e.target.value)} placeholder="nao-responder@seudominio.com" /></Field>
        <Field label="Responder para (opcional)"><input className={inputCls} type="email" value={f.reply_to} onChange={(e) => set("reply_to", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="URL pública do site" hint="Usada nos links dos e-mails (precisa ser https)."><input className={inputCls} value={f.public_url} onChange={(e) => set("public_url", e.target.value)} /></Field></div>
        <div className="flex flex-col justify-end gap-2 text-[12px] sm:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.verify_tls} onChange={(e) => set("verify_tls", e.target.checked)} className="h-4 w-4 accent-[#161514]" />Validar o certificado do servidor (recomendado)</label>
          {s.has_password && <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={f.clear} onChange={(e) => set("clear", e.target.checked)} className="h-4 w-4 accent-[#161514]" />Apagar a senha salva</label>}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-[#161514]" />Ativar o envio de e-mails da plataforma</label>
      {err && <p role="alert" className="mt-3 text-[12px] text-ember">{err}</p>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Btn variant="primary" size="md" onClick={save} disabled={busy !== ""}>{busy === "save" ? "Salvando…" : "Salvar configuração"}</Btn>
        <div className="ml-auto flex items-end gap-2">
          <div className="w-[240px]"><Field label="Enviar e-mail de teste para"><input className={inputCls} type="email" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
          <Btn size="md" onClick={test} disabled={busy !== "" || !to}>{busy === "test" ? "Enviando…" : "Testar envio"}</Btn>
        </div>
      </div>
      {res && (
        <div className={`mt-4 rounded-xl border-[0.5px] p-4 text-[12px] ${res.ok ? "border-[#6f8a6b]/50 bg-[#6f8a6b]/10" : "border-ember/40 bg-ember/5"}`} role="status">
          <p className={res.ok ? "text-[#4f6a4b]" : "text-ember"}>{res.ok ? "E-mail de teste enviado. Confira a caixa de entrada (e o spam)." : res.error}</p>
          {res.log.length > 0 && <pre className="mt-3 max-h-40 overflow-auto font-mono text-[10px] leading-relaxed text-muted">{res.log.join("\n")}</pre>}
        </div>
      )}
      <div className="mt-6 border-t-[0.5px] border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-medium">Entregabilidade: SPF, DKIM e DMARC</h3>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-muted">Esses registros precisam existir no <b className="font-medium text-fg">DNS do domínio</b> (no seu caso, o Cloudflare). Colar chaves aqui não basta: o painel só confere se estão publicados e mostra exatamente o que criar. Sem eles, os e-mails tendem a cair no spam.</p>
          </div>
          <Btn onClick={checkDns} disabled={dnsBusy}>{dnsBusy ? "Verificando…" : "Verificar DNS"}</Btn>
        </div>
        {dns && (
          <div className="mt-4 space-y-4 text-[12px]">
            <ul className="grid gap-2 sm:grid-cols-3">
              <li className="rounded-xl bg-surface2 px-4 py-3"><p className="eyebrow !text-[9px]">SPF</p><p className={dns.spf.found ? "text-[#4f6a4b]" : "text-ember"}>{dns.spf.found ? "Encontrado" : "Não encontrado"}{dns.spf.multiple && " · vários registros (corrija: só pode haver um)"}</p>{dns.spf.value && <p className="mt-1 break-all font-mono text-[10px] text-muted">{dns.spf.value}</p>}</li>
              <li className="rounded-xl bg-surface2 px-4 py-3"><p className="eyebrow !text-[9px]">DKIM</p>{dns.dkim.map((k) => <p key={k.selector} className={k.found ? "text-[#4f6a4b]" : "text-ember"}>{k.selector}: {k.found ? `ok (${k.type})` : "não encontrado"}</p>)}</li>
              <li className="rounded-xl bg-surface2 px-4 py-3"><p className="eyebrow !text-[9px]">DMARC</p><p className={dns.dmarc.found ? "text-[#4f6a4b]" : "text-ember"}>{dns.dmarc.found ? "Encontrado" : "Não encontrado"}</p>{dns.dmarc.value && <p className="mt-1 break-all font-mono text-[10px] text-muted">{dns.dmarc.value}</p>}</li>
            </ul>
            <div>
              <p className="eyebrow mb-2">Registros sugeridos para {dns.domain} (crie no Cloudflare)</p>
              <ul className="space-y-2">
                {dns.suggest.map((r) => (
                  <li key={r.name + r.type} className="rounded-xl border-[0.5px] border-line p-3">
                    <p className="flex flex-wrap items-center gap-2"><Badge tone="dark">{r.type}</Badge><span className="font-mono">{r.name}</span><button type="button" className="ml-auto text-[11px] text-bronze" onClick={() => { void navigator.clipboard?.writeText(r.value); toast("Valor copiado."); }}>copiar valor</button></p>
                    <p className="mt-1.5 break-all font-mono text-[11px]">{r.value}</p>
                    <p className="mt-1 text-[10px] text-muted">{r.note}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-muted">No Cloudflare, registros de e-mail devem ficar como “somente DNS” (nuvem cinza). A propagação pode levar de minutos a algumas horas.</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 text-[11px] text-muted">Os testes usam os valores digitados, mesmo antes de salvar. A senha nunca é exibida nem aparece nos registros.</p>
    </Card>
  );
}

export function DatabaseCard() {
  const { data, reload } = useApi<DbInfo>("/admin/database");
  const { toast } = useAdmin();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ host: "localhost", dbname: "", user: "", password: "", admin_password: "" });
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [needs, setNeeds] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!data) return <Card title="Banco de dados"><div className="flex justify-center py-10"><Spinner /></div></Card>;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const base = () => ({ host: f.host.trim(), dbname: f.dbname.trim(), user: f.user.trim(), password: f.password });

  async function test() {
    setBusy(true);
    setRes(null);
    const r = await send<{ ok: boolean; error?: string; version?: string; hasSchema?: boolean; users?: number }>("POST", "/admin/database/test", base());
    setBusy(false);
    if (!r.ok) return setRes({ ok: false, text: ERRORS[r.code] ?? ERRORS.generic });
    if (!r.data.ok) return setRes({ ok: false, text: r.data.error ?? ERRORS.generic });
    setRes({ ok: true, text: `Conexão ok · MySQL ${r.data.version} · ${r.data.hasSchema ? `tabelas do sistema encontradas (${num(r.data.users)} usuários)` : "banco vazio (sem tabelas do sistema)"}` });
    setNeeds(!r.data.hasSchema);
  }
  async function apply() {
    if (!window.confirm("Trocar as credenciais do banco em uso? Uma cópia do arquivo de configuração será guardada (.bak). Se o banco de destino for outro, os dados NÃO são copiados.")) return;
    setBusy(true);
    const r = await send<{ ok: boolean; note?: string; error?: string; needsConfirm?: boolean }>("PUT", "/admin/database", { ...base(), admin_password: f.admin_password, confirm_empty: confirmEmpty });
    setBusy(false);
    if (r.ok && r.data.ok) {
      toast(r.data.note ?? "Banco atualizado.");
      setEdit(false);
      setF({ ...f, password: "", admin_password: "" });
      reload();
    } else if (!r.ok) setRes({ ok: false, text: r.code === "invalid_credentials" ? "Sua senha de administrador está incorreta." : (ERRORS[r.code] ?? ERRORS.generic) });
  }

  return (
    <Card title="Banco de dados" sub="Conexão MySQL usada pela plataforma" className="lg:col-span-2" action={<Badge tone={data.schema === data.latest_schema ? "ok" : "warn"}>esquema v{data.schema}{data.schema === data.latest_schema ? " · atualizado" : ` (disponível v${data.latest_schema})`}</Badge>}>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          <KV k="Servidor" v={data.host} />
          <KV k="Banco" v={<span className="font-mono">{data.database}</span>} />
          <KV k="Usuário" v={<span className="font-mono">{data.user}</span>} />
          <KV k="Senha" v="••••••••  (arquivo fora do site público)" />
        </div>
        <div>
          <KV k="Motor" v={`${data.driver === "mysql" ? "MySQL" : data.driver} ${data.version}`} />
          <KV k="Latência" v={`${data.latency_ms} ms`} />
          <KV k="Tamanho" v={data.total_kb ? `${num(Math.round(data.total_kb / 1024 * 10) / 10)} MB` : "–"} />
          <KV k="Arquivo de configuração" v={<span className="flex items-center gap-2"><span className="font-mono">{data.config_file}</span><Badge tone={data.config_writable ? "ok" : "warn"}>{data.config_writable ? "editável" : "somente leitura"}</Badge></span>} />
        </div>
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-4 flex items-center gap-1.5 text-[12px] text-bronze"><ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />{open ? "Ocultar tabelas" : `Ver ${data.tables.length} tabelas`}</button>
      {open && (
        <div className="mt-2 grid gap-x-8 gap-y-0.5 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
          {data.tables.map((t) => <div key={t.name} className="flex justify-between border-b-[0.5px] border-line py-1"><span className="font-mono text-[11px]">{t.name}</span><span className="text-muted">{num(t.rows)} reg.{t.kb !== null ? ` · ${t.kb} KB` : ""}</span></div>)}
        </div>
      )}

      <div className="mt-5 border-t-[0.5px] border-line pt-4">
        {!edit ? (
          <Btn onClick={() => setEdit(true)}>Alterar ou testar credenciais</Btn>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Servidor"><input className={inputCls} value={f.host} onChange={(e) => set("host", e.target.value)} autoComplete="off" /></Field>
              <Field label="Nome do banco"><input className={inputCls} value={f.dbname} onChange={(e) => set("dbname", e.target.value)} autoComplete="off" /></Field>
              <Field label="Usuário"><input className={inputCls} value={f.user} onChange={(e) => set("user", e.target.value)} autoComplete="off" /></Field>
              <Field label="Senha do banco"><PasswordField meter={false} className={inputCls} value={f.password} onChange={(v) => set("password", v)} autoComplete="new-password" label="Senha do banco" /></Field>
            </div>
            {res && <p role="status" className={`rounded-xl px-3 py-2 text-[12px] ${res.ok ? "bg-[#6f8a6b]/10 text-[#4f6a4b]" : "bg-ember/5 text-ember"}`}>{res.text}</p>}
            {needs && <label className="flex items-start gap-2 text-[12px]"><input type="checkbox" checked={confirmEmpty} onChange={(e) => setConfirmEmpty(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#161514]" />O banco de destino está vazio: criar as tabelas do sistema nele. Os dados do banco atual não serão copiados.</label>}
            <div className="flex flex-wrap items-end gap-3">
              <Btn onClick={test} disabled={busy || !f.dbname || !f.user}>{busy ? "Testando…" : "Testar conexão"}</Btn>
              <div className="w-[260px]"><Field label="Sua senha de administrador (para aplicar)"><PasswordField meter={false} className={inputCls} value={f.admin_password} onChange={(v) => set("admin_password", v)} autoComplete="current-password" label="Sua senha de administrador" /></Field></div>
              <Btn variant="danger" onClick={apply} disabled={busy || !f.dbname || !f.user || !f.admin_password || (needs && !confirmEmpty)}>Aplicar credenciais</Btn>
              <Btn onClick={() => { setEdit(false); setRes(null); }}>Cancelar</Btn>
            </div>
            <p className="text-[11px] text-muted">A conexão é testada antes de qualquer alteração. Ao aplicar, o arquivo de configuração é regravado com permissão restrita e a cópia anterior fica como <span className="font-mono">.bak</span>. A migração de esquema roda automaticamente.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
