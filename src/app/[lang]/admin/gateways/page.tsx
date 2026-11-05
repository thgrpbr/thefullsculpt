"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Star } from "lucide-react";
import { ERRORS, dateTimeBr, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, Field, inputCls, Modal, PageHead, Spinner, Stat, useAdmin } from "@/components/admin/ui";

interface Fld { key: string; label: string; secret: boolean; optional?: boolean; public?: boolean }
interface Cat { provider: string; name: string; methods: string[]; fields: Fld[]; checkout: string; recurring: string; docs: string }
interface Item {
  id: number; provider: string; label: string; enabled: boolean; is_default: boolean; priority: number; mode: "sandbox" | "live"; methods: string[];
  fields: { key: string; label: string; secret: boolean; has_value: boolean; value: string | null }[];
  last_test_at: string | null; last_test_ok: boolean | null; last_test_msg: string | null;
}
const METHOD_PT: Record<string, string> = { card: "Cartão", pix: "Pix", boleto: "Boleto" };
const GW_ERR: Record<string, string> = {
  missing_fields: "Preencha todas as credenciais obrigatórias.", invalid_methods: "Escolha ao menos um meio de pagamento.", test_required: "Teste a conexão com sucesso antes de ativar.",
  not_enabled: "Ative o gateway antes de torná-lo o padrão.", invalid_fields: "Credenciais com formato inválido.", invalid_provider: "Provedor inválido.",
};

export default function GatewaysPage() {
  const { toast } = useAdmin();
  const { data, reload } = useApi<{ catalog: Cat[]; items: Item[] }>("/admin/gateways");
  const [edit, setEdit] = useState<{ cat: Cat; item: Item | null } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;
  const { catalog, items } = data;
  const cat = (p: string) => catalog.find((c) => c.provider === p)!;
  const active = items.filter((i) => i.enabled);

  async function call(id: number, fn: Promise<{ ok: boolean; code?: string; data?: unknown }>, ok: string) {
    setBusy(id);
    const r = await fn;
    setBusy(null);
    if (r.ok) {
      toast(ok);
      reload();
    } else toast(GW_ERR[r.code ?? ""] ?? ERRORS[r.code ?? "generic"] ?? ERRORS.generic, "bad");
  }
  async function test(it: Item) {
    setBusy(it.id);
    const r = await send<{ ok: boolean; msg: string }>("POST", `/admin/gateways/${it.id}/test`);
    setBusy(null);
    if (r.ok) toast(r.data.msg, r.data.ok ? "ok" : "bad");
    else toast(ERRORS.generic, "bad");
    reload();
  }
  const toggle = (it: Item) => call(it.id, send("PUT", `/admin/gateways/${it.id}`, { enabled: !it.enabled, mode: it.mode, methods: it.methods }), it.enabled ? "Gateway desativado." : "Gateway ativado.");
  const move = (it: Item, d: number) => call(it.id, send("PUT", `/admin/gateways/${it.id}`, { enabled: it.enabled, mode: it.mode, methods: it.methods, priority: Math.max(1, it.priority + d) }), "Prioridade atualizada.");

  return (
    <div>
      <PageHead eyebrow="Configurações" title="Pagamentos" sub="Gateways de pagamento, credenciais e webhooks. Preços, promoções e códigos ficam em Comercial > Planos e preços.">
        <p className="max-w-md text-[12px] text-muted">Conecte mais de um provedor. O padrão é usado primeiro no checkout; os demais ficam como alternativa (por prioridade).</p>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contas conectadas" value={items.length} sub={`${active.length} ativas`} />
        <Stat label="Gateway padrão" value={<span className="text-[26px]">{items.find((i) => i.is_default)?.label ?? "—"}</span>} sub={items.find((i) => i.is_default)?.mode === "live" ? "produção" : "ambiente de teste"} />
        <Stat label="Meios disponíveis" value={[...new Set(active.flatMap((i) => i.methods))].map((m) => METHOD_PT[m]).join(" · ") || "—"} />
        <Stat label="Webhook" value={<span className="text-[18px]">/api/webhooks/…</span>} sub="cadastre a URL em cada provedor" />
      </div>

      <Card title="Contas conectadas" sub="Ative somente depois de testar a conexão com sucesso" pad={false}>
        {items.length === 0 && <p className="px-5 py-12 text-center text-[13px] text-muted">Nenhum gateway conectado. Escolha um provedor abaixo.</p>}
        <ul className="divide-y divide-line">
          {items.map((it) => {
            const c = cat(it.provider);
            const hook = typeof window === "undefined" ? "" : `${window.location.origin}/api/webhooks/${it.provider}`;
            return (
              <li key={it.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[15px]">
                      {it.is_default && <Star size={14} className="fill-bronze text-bronze" aria-label="padrão" />}{it.label}
                      <Badge tone={it.enabled ? "ok" : "neutral"}>{it.enabled ? "ativo" : "inativo"}</Badge>
                      <Badge tone={it.mode === "live" ? "bad" : "info"}>{it.mode === "live" ? "produção" : "teste"}</Badge>
                      {it.last_test_ok === true && <Badge tone="ok">conexão ok</Badge>}
                      {it.last_test_ok === false && <Badge tone="bad">teste falhou</Badge>}
                      {it.last_test_ok === null && <Badge tone="warn">não testado</Badge>}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">{c.name} · {it.methods.map((m) => METHOD_PT[m]).join(", ")} · prioridade {it.priority}{it.last_test_at ? ` · último teste ${dateTimeBr(it.last_test_at)}${it.last_test_msg ? `: ${it.last_test_msg}` : ""}` : ""}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">Webhook: <span className="font-mono">{hook}</span><button type="button" aria-label="Copiar URL do webhook" onClick={() => { void navigator.clipboard?.writeText(hook); toast("URL copiada."); }} className="text-bronze"><Copy size={12} /></button></p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Btn onClick={() => move(it, -1)} disabled={busy === it.id}><ArrowUp size={13} aria-label="Subir prioridade" /></Btn>
                    <Btn onClick={() => move(it, 1)} disabled={busy === it.id}><ArrowDown size={13} aria-label="Descer prioridade" /></Btn>
                    <Btn onClick={() => test(it)} disabled={busy === it.id}>{busy === it.id ? "Testando…" : "Testar conexão"}</Btn>
                    <Btn variant={it.enabled ? "ghost" : "primary"} onClick={() => toggle(it)} disabled={busy === it.id}>{it.enabled ? "Desativar" : "Ativar"}</Btn>
                    {it.enabled && !it.is_default && <Btn onClick={() => call(it.id, send("POST", `/admin/gateways/${it.id}/default`), "Gateway padrão atualizado.")}>Tornar padrão</Btn>}
                    <Btn onClick={() => setEdit({ cat: c, item: it })}>Editar</Btn>
                    <Btn variant="danger" onClick={() => { if (window.confirm(`Remover ${it.label}?`)) void call(it.id, send("DELETE", `/admin/gateways/${it.id}`), "Gateway removido."); }}>Remover</Btn>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <h2 className="eyebrow mb-3 mt-8 px-1">Provedores disponíveis</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {catalog.map((c) => (
          <Card key={c.provider} title={c.name} sub={c.checkout} action={<Btn variant="primary" onClick={() => setEdit({ cat: c, item: null })}><Plus size={13} aria-hidden="true" />Conectar</Btn>}>
            <div className="flex flex-wrap gap-1.5">{c.methods.map((m) => <Badge key={m}>{METHOD_PT[m]}</Badge>)}</div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted"><b className="font-medium text-fg">Recorrência:</b> {c.recurring}</p>
            <p className="mt-2 text-[11px]"><a href={c.docs} target="_blank" rel="noopener noreferrer" className="text-bronze">Onde encontrar as chaves ↗</a>{items.filter((i) => i.provider === c.provider).length > 0 && <span className="ml-3 text-muted">{items.filter((i) => i.provider === c.provider).length} conta(s) conectada(s)</span>}</p>
          </Card>
        ))}
      </div>
      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-muted">As credenciais são guardadas <b className="font-medium">criptografadas</b> e nunca voltam para a tela (só as chaves públicas). Os dados do cartão são digitados diretamente no formulário do provedor (checkout transparente) e <b className="font-medium">não passam pelo nosso servidor</b>. O backend já está pronto para <b className="font-medium">Stripe, Mercado Pago, Pagar.me e Asaas</b>: cadastro seguro das credenciais, teste de conexão e recebimento de pagamentos e cancelamentos por webhook verificado (informe o segredo/token do webhook ao cadastrar). O formulário de checkout de cada provedor será conectado assim que a empresa parceira for definida e as credenciais de sandbox estiverem aqui; valide cada provedor em sandbox antes de ativar em produção.</p>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit ? `${edit.item ? "Editar" : "Conectar"} ${edit.cat.name}` : ""} width={600}>
        {edit && <Form key={edit.item?.id ?? edit.cat.provider} cat={edit.cat} item={edit.item} onDone={() => { setEdit(null); reload(); }} />}
      </Modal>
    </div>
  );
}

function Form({ cat, item, onDone }: { cat: Cat; item: Item | null; onDone: () => void }) {
  const { toast } = useAdmin();
  const [label, setLabel] = useState(item?.label ?? cat.name);
  const [mode, setMode] = useState<"sandbox" | "live">(item?.mode ?? "sandbox");
  const [methods, setMethods] = useState<string[]>(item?.methods ?? cat.methods.slice(0, 2));
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(cat.fields.filter((f) => !f.secret).map((f) => [f.key, item?.fields.find((x) => x.key === f.key)?.value ?? ""])));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    const body = { provider: cat.provider, label, mode, methods, fields: vals };
    const r = item ? await send("PUT", `/admin/gateways/${item.id}`, { ...body, enabled: item.enabled && false }) : await send("POST", "/admin/gateways", body);
    setBusy(false);
    if (r.ok) {
      toast(item ? "Gateway atualizado. Teste a conexão para ativar." : "Gateway conectado. Agora teste a conexão.");
      onDone();
    } else setErr(GW_ERR[r.code] ?? ERRORS[r.code] ?? ERRORS.generic);
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Field label="Nome da conta"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} /></Field>
      <Field label="Ambiente">
        <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as "sandbox" | "live")}><option value="sandbox">Teste (sandbox)</option><option value="live">Produção (cobranças reais)</option></select>
      </Field>
      {cat.fields.map((f) => {
        const has = item?.fields.find((x) => x.key === f.key)?.has_value;
        return (
          <Field key={f.key} label={`${f.label}${f.optional ? " (opcional)" : ""}`} hint={f.secret && has ? "Já salva (criptografada). Deixe em branco para manter." : undefined}>
            <input className={inputCls} type={f.secret ? "password" : "text"} autoComplete="off" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder={f.secret && has ? "••••••••••" : ""} />
          </Field>
        );
      })}
      <fieldset>
        <legend className="text-[11px] text-muted">Meios de pagamento aceitos</legend>
        <div className="mt-1.5 flex flex-wrap gap-4 text-[13px]">
          {cat.methods.map((m) => <label key={m} className="flex items-center gap-2"><input type="checkbox" checked={methods.includes(m)} onChange={(e) => setMethods(e.target.checked ? [...methods, m] : methods.filter((x) => x !== m))} className="h-4 w-4 accent-[#161514]" />{METHOD_PT[m]}</label>)}
        </div>
      </fieldset>
      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      {item && <p className="text-[11px] text-muted">Salvar alterações desativa o gateway até você testar a conexão novamente.</p>}
      <Btn type="submit" variant="primary" size="md" disabled={busy}>{busy ? "Salvando…" : item ? "Salvar alterações" : "Conectar gateway"}</Btn>
    </form>
  );
}
