"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Shuffle, Tag } from "lucide-react";
import { brl, dateBr, ERRORS, send, useApi } from "@/lib/admin";
import { Badge, Btn, Card, DataTable, Drawer, Field, inputCls, PageHead, Spinner, Stat, Tabs, useAdmin, type Col, type Tone } from "@/components/admin/ui";

type Lang = "pt" | "en" | "es";
interface Plan { id: number; slug: string; name: Record<Lang, string>; description: Record<Lang, string>; features: Record<Lang, string[]>; interval_months: number; price_cents: number; active: boolean; featured: boolean; sort: number; subscribers: number }
interface Promo { id: number; name: string; label: string | null; kind: "percent" | "fixed"; value: number; plan_ids: number[] | null; starts_on: string | null; ends_on: string | null; first_purchase_only: boolean; active: boolean; running: boolean; event_key: string | null }
interface Code { id: number; code: string; note: string | null; kind: "percent" | "fixed"; value: number; plan_ids: number[] | null; starts_on: string | null; ends_on: string | null; max_uses: number | null; uses: number; first_purchase_only: boolean; stackable: boolean; active: boolean; discounted_cents: number }
interface Rules { max_discount_pct: number; allow_stack: boolean; min_price_cents: number }
interface All { plans: Plan[]; promotions: Promo[]; codes: Code[]; rules: Rules; today: string }
interface Ev { key: string; date: string; name: string; kind: string; custom: boolean; id: number | null }
interface Cal { year: number; events: Ev[]; promotions: { id: number; name: string; starts_on: string | null; ends_on: string | null; active: number }[]; today: string }
interface Quote { base_cents: number; promo: { name: string; discount_cents: number } | null; code: { code: string; discount_cents: number } | null; code_error: string | null; discount_cents: number; total_cents: number; discount_pct: number; stacked: boolean; capped: boolean }

const MORE: Record<string, string> = {
  invalid_date: "Data inválida.", invalid_period: "A data final não pode ser antes da inicial.", invalid_code: "Use 3 a 24 caracteres: letras, números, - ou _.",
  code_taken: "Já existe um código igual.", in_use: "Já está em uso (assinaturas ou resgates). Desative em vez de excluir.", last_plan: "Precisa existir ao menos um pacote ativo à venda.",
  max_below_uses: "O limite não pode ser menor que os usos já feitos.", plan_not_found: "Pacote não encontrado.",
};
const CODE_ERR: Record<string, string> = {
  code_invalid: "Código inexistente ou desativado.", code_expired: "Fora do período de validade.", code_exhausted: "Limite de usos esgotado.", code_not_for_plan: "Não vale para este pacote.",
  code_first_purchase: "Só vale na primeira compra.", code_already_used: "Este aluno já usou o código.", promo_better: "A promoção em andamento já dá desconto maior (o código não entra).",
};
const INTERVAL: Record<number, string> = { 1: "mensal", 3: "trimestral", 6: "semestral", 12: "anual" };
const KIND_TONE: Record<string, { label: string; color: string; tone: Tone }> = {
  holiday: { label: "Feriado nacional", color: "#b4452c", tone: "bad" }, optional: { label: "Ponto facultativo", color: "#c08a2e", tone: "warn" },
  commercial: { label: "Data comercial", color: "#2f7a4a", tone: "ok" }, health: { label: "Saúde / fitness", color: "#3b6fa5", tone: "info" }, custom: { label: "Personalizada", color: "#7a5aa6", tone: "neutral" },
};
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const inputToCents = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);
const discountText = (kind: string, value: number) => (kind === "percent" ? `${value}%` : brl(value));
const fail = (code: string) => MORE[code] ?? CODE_ERR[code] ?? ERRORS[code] ?? ERRORS.generic;

export default function Pricing() {
  const { toast } = useAdmin();
  const { data, reload } = useApi<All>("/admin/pricing");
  const [tab, setTab] = useState<"pacotes" | "promocoes" | "codigos" | "regras" | "calendario">("pacotes");
  const [promoDraft, setPromoDraft] = useState<Partial<Promo> | null | "new">(null);
  if (!data) return <div className="flex justify-center py-32"><Spinner /></div>;

  const running = data.promotions.filter((p) => p.running).length;
  const activeCodes = data.codes.filter((c) => c.active).length;
  return (
    <div>
      <PageHead eyebrow="Comercial" title="Planos e preços" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pacotes à venda" value={data.plans.filter((p) => p.active).length} sub={`${data.plans.length} cadastrados`} />
        <Stat label="Promoções em andamento" value={running} sub={`${data.promotions.length} cadastradas`} />
        <Stat label="Códigos ativos" value={activeCodes} sub={`${data.codes.reduce((a, c) => a + c.uses, 0)} usos no total`} />
        <Stat label="Teto de desconto" value={`${data.rules.max_discount_pct}%`} sub={`preço mínimo ${brl(data.rules.min_price_cents)}`} />
      </div>
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "pacotes", label: "Pacotes", count: data.plans.length }, { value: "promocoes", label: "Promoções", count: data.promotions.length }, { value: "codigos", label: "Códigos promocionais", count: data.codes.length }, { value: "regras", label: "Regras de desconto" }, { value: "calendario", label: "Calendário festivo" }]} /></div>

      {tab === "pacotes" && <Plans data={data} reload={reload} toast={toast} />}
      {tab === "promocoes" && <Promos data={data} reload={reload} toast={toast} draft={promoDraft} setDraft={setPromoDraft} />}
      {tab === "codigos" && <Codes data={data} reload={reload} toast={toast} />}
      {tab === "regras" && <RulesTab data={data} reload={reload} toast={toast} />}
      {tab === "calendario" && <Calendar data={data} onPromo={(d) => { setPromoDraft(d); setTab("promocoes"); }} toast={toast} />}
    </div>
  );
}

type Toast = (m: string, t?: "ok" | "bad") => void;

/* ---------------------------------------------------------------- Pacotes */

function Plans({ data, reload, toast }: { data: All; reload: () => void; toast: Toast }) {
  const [edit, setEdit] = useState<Plan | "new" | null>(null);
  const cols: Col<Plan>[] = [
    { key: "n", head: "Pacote", cell: (p) => <div><p className="flex items-center gap-2">{p.name.pt}{p.featured && <Badge tone="dark">destaque</Badge>}</p><p className="font-mono text-[10px] text-muted">{p.slug}</p></div> },
    { key: "i", head: "Ciclo", cell: (p) => <span className="text-muted">{INTERVAL[p.interval_months] ?? `${p.interval_months} meses`}</span> },
    { key: "p", head: "Preço", align: "right", cell: (p) => <span>{brl(p.price_cents)}{p.interval_months > 1 && <span className="ml-1 text-[10px] text-muted">({brl(Math.round(p.price_cents / p.interval_months))}/mês)</span>}</span> },
    { key: "s", head: "Assinantes", align: "right", cell: (p) => p.subscribers },
    { key: "o", head: "Ordem", align: "right", cell: (p) => <span className="text-muted">{p.sort}</span> },
    { key: "a", head: "Situação", cell: (p) => <Badge tone={p.active ? "ok" : "neutral"}>{p.active ? "à venda" : "oculto"}</Badge> },
  ];
  return (
    <>
      <Card pad={false} title="Pacotes" sub="O nome, o preço e os benefícios daqui aparecem na página inicial e na tela de assinatura, em português, inglês e espanhol."
        action={<Btn variant="primary" size="md" onClick={() => setEdit("new")}><Plus size={14} aria-hidden="true" />Novo pacote</Btn>}>
        <DataTable cols={cols} rows={data.plans} onRow={(p) => setEdit(p)} empty="Nenhum pacote." />
      </Card>
      <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-muted">Quem já assinou mantém o preço contratado. Um pacote com assinantes não pode ser excluído (apenas ocultado). Deve haver sempre ao menos um pacote à venda.</p>
      <Drawer open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Novo pacote" : "Editar pacote"} width={640}>
        {edit && <PlanForm key={edit === "new" ? "new" : edit.id} plan={edit === "new" ? null : edit} onDone={() => { setEdit(null); reload(); }} toast={toast} />}
      </Drawer>
    </>
  );
}

function PlanForm({ plan, onDone, toast }: { plan: Plan | null; onDone: () => void; toast: Toast }) {
  const [name, setName] = useState<Record<Lang, string>>(plan?.name ?? { pt: "", en: "", es: "" });
  const [desc, setDesc] = useState<Record<Lang, string>>(plan?.description ?? { pt: "", en: "", es: "" });
  const [feat, setFeat] = useState<Record<Lang, string>>({ pt: (plan?.features.pt ?? []).join("\n"), en: (plan?.features.en ?? []).join("\n"), es: (plan?.features.es ?? []).join("\n") });
  const [months, setMonths] = useState(plan?.interval_months ?? 1);
  const [price, setPrice] = useState(plan ? centsToInput(plan.price_cents) : "79,90");
  const [sort, setSort] = useState(plan?.sort ?? 10);
  const [active, setActive] = useState(plan?.active ?? true);
  const [featured, setFeatured] = useState(plan?.featured ?? false);
  const [lang, setLang] = useState<Lang>("pt");
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    const body = {
      name, description: desc, features: { pt: feat.pt.split("\n"), en: feat.en.split("\n"), es: feat.es.split("\n") },
      interval_months: months, price_cents: inputToCents(price), active, featured, sort,
    };
    const r = plan ? await send("PUT", `/admin/pricing/plans/${plan.id}`, body) : await send("POST", "/admin/pricing/plans", body);
    if (r.ok) { toast(plan ? "Pacote atualizado." : "Pacote criado."); onDone(); } else setErr(fail(r.code));
  }
  async function remove() {
    if (!plan || !confirm(`Excluir o pacote “${plan.name.pt}”?`)) return;
    const r = await send("DELETE", `/admin/pricing/plans/${plan.id}`);
    if (r.ok) { toast("Pacote excluído."); onDone(); } else setErr(fail(r.code));
  }
  return (
    <form className="space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Tabs value={lang} onChange={setLang} items={[{ value: "pt", label: "Português" }, { value: "en", label: "English" }, { value: "es", label: "Español" }]} />
      <Field label={`Nome do pacote (${lang})${lang === "pt" ? " *" : " — vazio usa o português"}`}><input className={inputCls} value={name[lang]} onChange={(e) => setName({ ...name, [lang]: e.target.value })} maxLength={80} required={lang === "pt"} /></Field>
      <Field label="Descrição curta"><input className={inputCls} value={desc[lang]} onChange={(e) => setDesc({ ...desc, [lang]: e.target.value })} maxLength={240} /></Field>
      <Field label="Benefícios (um por linha)"><textarea className="min-h-[110px] w-full rounded-xl border-[0.5px] border-line bg-surface p-3 text-[13px] outline-none focus:border-bronze" value={feat[lang]} onChange={(e) => setFeat({ ...feat, [lang]: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Preço do ciclo (R$)"><input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
        <Field label="Cobrança">
          <select className={inputCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{INTERVAL[m]} ({m} {m === 1 ? "mês" : "meses"})</option>)}</select>
        </Field>
        <Field label="Ordem na vitrine"><input className={inputCls} type="number" min={0} max={9999} value={sort} onChange={(e) => setSort(Number(e.target.value))} /></Field>
      </div>
      <div className="flex flex-wrap gap-6 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />À venda (visível no site)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />Destacar (pacote padrão)</label>
      </div>
      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" variant="primary" size="md">{plan ? "Salvar pacote" : "Criar pacote"}</Btn>
        {plan && <Btn type="button" variant="ember" size="md" onClick={remove}>Excluir</Btn>}
      </div>
    </form>
  );
}

/* -------------------------------------------------------- campos em comum */

function PlanPicker({ plans, value, onChange }: { plans: Plan[]; value: number[] | null; onChange: (v: number[] | null) => void }) {
  return (
    <fieldset className="rounded-xl border-[0.5px] border-line p-3">
      <legend className="px-1 text-[11px] text-muted">Vale para</legend>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : [])} />Todos os pacotes</label>
      {value !== null && <div className="mt-2 grid gap-1.5">{plans.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))} />{p.name.pt} <span className="text-[11px] text-muted">({brl(p.price_cents)})</span></label>
      ))}</div>}
    </fieldset>
  );
}

function DiscountFields({ kind, value, setKind, setValue }: { kind: "percent" | "fixed"; value: string; setKind: (k: "percent" | "fixed") => void; setValue: (v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tipo de desconto"><select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}><option value="percent">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></select></Field>
      <Field label={kind === "percent" ? "Percentual (1 a 90)" : "Valor do desconto (R$)"}><input className={inputCls} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required /></Field>
    </div>
  );
}
const valueToApi = (kind: string, v: string) => (kind === "percent" ? Number(v.replace(",", ".")) : inputToCents(v));
const valueToInput = (kind: string, v: number) => (kind === "percent" ? String(v) : centsToInput(v));

function planNames(plans: Plan[], ids: number[] | null) {
  return ids === null ? "todos os pacotes" : plans.filter((p) => ids.includes(p.id)).map((p) => p.name.pt).join(", ") || "—";
}

/* ------------------------------------------------------------- Promoções */

function Promos({ data, reload, toast, draft, setDraft }: { data: All; reload: () => void; toast: Toast; draft: Partial<Promo> | null | "new"; setDraft: (d: Partial<Promo> | null | "new") => void }) {
  const status = (p: Promo): { label: string; tone: Tone } => !p.active ? { label: "desativada", tone: "neutral" } : p.running ? { label: "em andamento", tone: "ok" } : p.starts_on && data.today < p.starts_on ? { label: "agendada", tone: "info" } : { label: "encerrada", tone: "warn" };
  const cols: Col<Promo>[] = [
    { key: "n", head: "Promoção", cell: (p) => <div><p className="flex items-center gap-2">{p.name}{p.label && <Badge tone="dark">{p.label}</Badge>}</p><p className="text-[11px] text-muted">{planNames(data.plans, p.plan_ids)}{p.first_purchase_only ? " · só 1ª compra" : ""}</p></div> },
    { key: "d", head: "Desconto", align: "right", cell: (p) => discountText(p.kind, p.value) },
    { key: "p", head: "Período", cell: (p) => <span className="whitespace-nowrap text-muted">{p.starts_on ? dateBr(p.starts_on) : "sempre"} → {p.ends_on ? dateBr(p.ends_on) : "sem fim"}</span> },
    { key: "s", head: "Situação", cell: (p) => <Badge tone={status(p).tone}>{status(p).label}</Badge> },
  ];
  const open = draft !== null;
  const editing = draft && draft !== "new" ? draft : null;
  return (
    <>
      <Card pad={false} title="Promoções automáticas" sub="Entram sozinhas no preço do site durante o período. Se houver mais de uma, vale a de maior desconto."
        action={<Btn variant="primary" size="md" onClick={() => setDraft("new")}><Plus size={14} aria-hidden="true" />Nova promoção</Btn>}>
        <DataTable cols={cols} rows={data.promotions} onRow={(p) => setDraft(p)} empty="Nenhuma promoção. Crie uma ou parta de uma data do Calendário festivo." />
      </Card>
      <Drawer open={open} onClose={() => setDraft(null)} title={editing?.id ? "Editar promoção" : "Nova promoção"} width={600}>
        {open && <PromoForm key={editing?.id ?? JSON.stringify(editing) ?? "new"} promo={editing} plans={data.plans} onDone={() => { setDraft(null); reload(); }} toast={toast} />}
      </Drawer>
    </>
  );
}

function PromoForm({ promo, plans, onDone, toast }: { promo: Partial<Promo> | null; plans: Plan[]; onDone: () => void; toast: Toast }) {
  const [name, setName] = useState(promo?.name ?? "");
  const [label, setLabel] = useState(promo?.label ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(promo?.kind ?? "percent");
  const [value, setValue] = useState(promo?.value !== undefined ? valueToInput(promo.kind ?? "percent", promo.value) : "20");
  const [ids, setIds] = useState<number[] | null>(promo?.plan_ids ?? null);
  const [from, setFrom] = useState(promo?.starts_on ?? "");
  const [to, setTo] = useState(promo?.ends_on ?? "");
  const [first, setFirst] = useState(promo?.first_purchase_only ?? false);
  const [active, setActive] = useState(promo?.active ?? true);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const body = { name, label, kind, value: valueToApi(kind, value), plan_ids: ids, starts_on: from || null, ends_on: to || null, first_purchase_only: first, active, event_key: promo?.event_key ?? null };
    const r = promo?.id ? await send("PUT", `/admin/pricing/promotions/${promo.id}`, body) : await send("POST", "/admin/pricing/promotions", body);
    if (r.ok) { toast("Promoção salva."); onDone(); } else setErr(fail(r.code));
  }
  async function remove() {
    if (!promo?.id || !confirm("Excluir esta promoção?")) return;
    const r = await send("DELETE", `/admin/pricing/promotions/${promo.id}`);
    if (r.ok) { toast("Promoção excluída."); onDone(); } else setErr(fail(r.code));
  }
  return (
    <form className="space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Nome da promoção"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></Field>
        <Field label="Selo no site" hint="Ex.: -20%"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} /></Field>
      </div>
      <DiscountFields kind={kind} value={value} setKind={setKind} setValue={setValue} />
      <PlanPicker plans={plans} value={ids} onChange={setIds} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Começa em (vazio = já)"><input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Termina em (vazio = sem fim)"><input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-6 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} />Só para quem nunca pagou (1ª compra)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativa</label>
      </div>
      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" variant="primary" size="md">Salvar promoção</Btn>
        {promo?.id && <Btn type="button" variant="ember" size="md" onClick={remove}>Excluir</Btn>}
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- Códigos */

function randomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

function Codes({ data, reload, toast }: { data: All; reload: () => void; toast: Toast }) {
  const [edit, setEdit] = useState<Code | "new" | null>(null);
  const cols: Col<Code>[] = [
    { key: "c", head: "Código", cell: (c) => <div><p className="flex items-center gap-2 font-mono text-[13px]">{c.code}<button type="button" aria-label="Copiar código" onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(c.code); toast("Código copiado."); }} className="text-muted hover:text-fg"><Copy size={12} aria-hidden="true" /></button></p><p className="text-[11px] text-muted">{c.note ?? "—"}</p></div> },
    { key: "d", head: "Desconto", align: "right", cell: (c) => discountText(c.kind, c.value) },
    { key: "u", head: "Usos", align: "right", cell: (c) => <span>{c.uses}{c.max_uses !== null ? ` / ${c.max_uses}` : ""}<span className="block text-[10px] text-muted">{brl(c.discounted_cents)} concedidos</span></span> },
    { key: "p", head: "Validade", cell: (c) => <span className="whitespace-nowrap text-muted">{c.starts_on ? dateBr(c.starts_on) : "—"} → {c.ends_on ? dateBr(c.ends_on) : "sem fim"}</span> },
    { key: "r", head: "Regras", cell: (c) => <span className="text-[11px] text-muted">{planNames(data.plans, c.plan_ids)}{c.first_purchase_only ? " · 1ª compra" : ""}{c.stackable ? " · acumula" : ""}</span> },
    { key: "s", head: "Situação", cell: (c) => <Badge tone={!c.active ? "neutral" : c.max_uses !== null && c.uses >= c.max_uses ? "warn" : "ok"}>{!c.active ? "desativado" : c.max_uses !== null && c.uses >= c.max_uses ? "esgotado" : "ativo"}</Badge> },
  ];
  return (
    <>
      <Card pad={false} title="Códigos promocionais" sub="O aluno digita o código na tela de assinatura. Cada aluno só usa um mesmo código uma vez."
        action={<Btn variant="primary" size="md" onClick={() => setEdit("new")}><Plus size={14} aria-hidden="true" />Novo código</Btn>}>
        <DataTable cols={cols} rows={data.codes} onRow={(c) => setEdit(c)} empty="Nenhum código." />
      </Card>
      <Drawer open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Novo código" : "Editar código"} width={600}>
        {edit && <CodeForm key={edit === "new" ? "new" : edit.id} code={edit === "new" ? null : edit} plans={data.plans} onDone={() => { setEdit(null); reload(); }} toast={toast} />}
      </Drawer>
    </>
  );
}

function CodeForm({ code, plans, onDone, toast }: { code: Code | null; plans: Plan[]; onDone: () => void; toast: Toast }) {
  const [text, setText] = useState(code?.code ?? "");
  const [note, setNote] = useState(code?.note ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(code?.kind ?? "percent");
  const [value, setValue] = useState(code ? valueToInput(code.kind, code.value) : "10");
  const [ids, setIds] = useState<number[] | null>(code?.plan_ids ?? null);
  const [from, setFrom] = useState(code?.starts_on ?? "");
  const [to, setTo] = useState(code?.ends_on ?? "");
  const [max, setMax] = useState(code?.max_uses?.toString() ?? "");
  const [first, setFirst] = useState(code?.first_purchase_only ?? false);
  const [stack, setStack] = useState(code?.stackable ?? false);
  const [active, setActive] = useState(code?.active ?? true);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const body = { code: text, note, kind, value: valueToApi(kind, value), plan_ids: ids, starts_on: from || null, ends_on: to || null, max_uses: max === "" ? null : Number(max), first_purchase_only: first, stackable: stack, active };
    const r = code ? await send("PUT", `/admin/pricing/codes/${code.id}`, body) : await send("POST", "/admin/pricing/codes", body);
    if (r.ok) { toast("Código salvo."); onDone(); } else setErr(fail(r.code));
  }
  async function remove() {
    if (!code || !confirm(`Excluir o código ${code.code}?`)) return;
    const r = await send("DELETE", `/admin/pricing/codes/${code.id}`);
    if (r.ok) { toast("Código excluído."); onDone(); } else setErr(fail(r.code));
  }
  return (
    <form className="space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Código (letras, números, - e _)"><input className={`${inputCls} font-mono uppercase`} value={text} onChange={(e) => setText(e.target.value.toUpperCase())} maxLength={24} required /></Field>
        <div className="flex items-end"><Btn type="button" size="md" onClick={() => setText(randomCode())}><Shuffle size={13} aria-hidden="true" />Gerar</Btn></div>
      </div>
      <Field label="Anotação interna (campanha, parceiro…)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></Field>
      <DiscountFields kind={kind} value={value} setKind={setKind} setValue={setValue} />
      <PlanPicker plans={plans} value={ids} onChange={setIds} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Válido a partir de"><input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Válido até"><input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Limite de usos (vazio = ilimitado)"><input className={inputCls} type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
      </div>
      <div className="grid gap-2 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} />Só para quem nunca pagou (1ª compra)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={stack} onChange={(e) => setStack(e.target.checked)} />Pode acumular com promoção automática (precisa estar liberado em Regras)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativo</label>
      </div>
      {code && <p className="text-[11px] text-muted">Já usado {code.uses}x · {brl(code.discounted_cents)} em descontos concedidos.</p>}
      {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" variant="primary" size="md">Salvar código</Btn>
        {code && <Btn type="button" variant="ember" size="md" onClick={remove}>Excluir</Btn>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Regras */

function RulesTab({ data, reload, toast }: { data: All; reload: () => void; toast: Toast }) {
  const [max, setMax] = useState(String(data.rules.max_discount_pct));
  const [stack, setStack] = useState(data.rules.allow_stack);
  const [min, setMin] = useState(centsToInput(data.rules.min_price_cents));
  const [err, setErr] = useState("");
  const [planId, setPlanId] = useState(data.plans[0]?.id ?? 0);
  const [code, setCode] = useState("");
  const [q, setQ] = useState<Quote | null>(null);

  async function save() {
    setErr("");
    const r = await send("PUT", "/admin/pricing/rules", { max_discount_pct: Number(max), allow_stack: stack, min_price_cents: inputToCents(min) });
    if (r.ok) { toast("Regras salvas."); reload(); } else setErr(fail(r.code));
  }
  async function simulate() {
    const r = await send<Quote>("POST", "/admin/pricing/quote", { plan_id: planId, code });
    if (r.ok) setQ(r.data); else toast(fail(r.code), "bad");
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Regras de uso de desconto" sub="Valem para promoções e códigos, em todos os pacotes.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Desconto máximo por compra (%)" hint="O total nunca passa disso, mesmo somando promoção e código."><input className={inputCls} type="number" min={0} max={100} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
          <Field label="Preço mínimo final (R$)" hint="Nenhum desconto leva o valor cobrado abaixo disso."><input className={inputCls} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={stack} onChange={(e) => setStack(e.target.checked)} /><span>Permitir somar <b className="font-medium">promoção automática + código</b> (apenas códigos marcados como “acumulável”). Desligado: vale sempre o maior desconto, nunca os dois.</span></label>
          {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
          <Btn type="submit" variant="primary" size="md">Salvar regras</Btn>
        </form>
        <ul className="mt-5 space-y-1.5 border-t-[0.5px] border-line pt-4 text-[12px] leading-relaxed text-muted">
          <li>• Entre várias promoções em andamento, vale a de maior desconto.</li>
          <li>• Um código por aluno só pode ser usado uma vez; “1ª compra” considera pagamentos reais já feitos.</li>
          <li>• Quem já assina mantém o preço contratado; descontos valem para novas assinaturas.</li>
          <li>• Alterações ficam na auditoria (quem mudou e quando).</li>
        </ul>
      </Card>
      <Card title="Simulador de preço" sub="Veja o valor final como um aluno novo veria, hoje.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pacote"><select className={inputCls} value={planId} onChange={(e) => setPlanId(Number(e.target.value))}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name.pt} — {brl(p.price_cents)}</option>)}</select></Field>
          <Field label="Código (opcional)"><input className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        </div>
        <div className="mt-3"><Btn size="md" onClick={simulate}><Tag size={13} aria-hidden="true" />Calcular</Btn></div>
        {q && (
          <dl className="mt-4 space-y-1.5 rounded-2xl bg-surface2 p-4 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">Preço de tabela</dt><dd>{brl(q.base_cents)}</dd></div>
            {q.promo && <div className="flex justify-between"><dt className="text-muted">Promoção: {q.promo.name}</dt><dd>− {brl(q.promo.discount_cents)}</dd></div>}
            {q.code && <div className="flex justify-between"><dt className="text-muted">Código {q.code.code}</dt><dd>− {brl(q.code.discount_cents)}</dd></div>}
            {q.stacked && <p className="text-[11px] text-muted">Promoção e código acumulados.</p>}
            {q.capped && <p className="text-[11px] text-ember">Limitado pelo teto de desconto ou pelo preço mínimo.</p>}
            {q.code_error && <p className="text-[11px] text-ember">{CODE_ERR[q.code_error] ?? q.code_error}</p>}
            <div className="flex justify-between border-t-[0.5px] border-line pt-2 text-[15px]"><dt>Total ({q.discount_pct}% de desconto)</dt><dd className="font-medium">{brl(q.total_cents)}</dd></div>
          </dl>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- Calendário */

function Calendar({ data, onPromo, toast }: { data: All; onPromo: (d: Partial<Promo>) => void; toast: Toast }) {
  const [year, setYear] = useState(Number(data.today.slice(0, 4)));
  const { data: cal, reload } = useApi<Cal>(`/admin/pricing/calendar?year=${year}`);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", name: "", kind: "commercial", yearly: true });
  const [err, setErr] = useState("");

  const byDate = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of cal?.events ?? []) (m[e.date] ??= []).push(e);
    return m;
  }, [cal]);
  const inPromo = (d: string) => (cal?.promotions ?? []).some((p) => p.active && (!p.starts_on || d >= p.starts_on) && (!p.ends_on || d <= p.ends_on));

  async function add() {
    setErr("");
    const r = await send("POST", "/admin/pricing/calendar", form);
    if (r.ok) { toast("Data adicionada."); setForm({ date: "", name: "", kind: "commercial", yearly: true }); reload(); } else setErr(fail(r.code));
  }
  async function remove(id: number) {
    if (!confirm("Remover esta data?")) return;
    const r = await send("DELETE", `/admin/pricing/calendar/${id}`);
    if (r.ok) { toast("Data removida."); reload(); } else toast(fail(r.code), "bad");
  }
  const suggest = (e: Ev) => {
    const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    const end = e.key === "black_friday" ? addDays(e.date, 3) : e.date;
    onPromo({ name: `Promoção ${e.name} ${year}`, label: e.name.length <= 30 ? e.name : "", kind: "percent", value: 20, starts_on: addDays(e.date, e.key === "black_friday" ? 0 : -7), ends_on: end, event_key: `${e.date}:${e.key}` });
  };

  const list = (cal?.events ?? []).filter((e) => !sel || e.date.startsWith(sel));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card title="Calendário festivo" sub="Feriados nacionais, datas móveis (Carnaval, Páscoa, Black Friday…) e datas comerciais. Clique em um mês para filtrar a lista."
        action={<div className="flex items-center gap-1">
          <button type="button" aria-label="Ano anterior" onClick={() => { setYear(year - 1); setSel(null); }} className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-line hover:bg-surface2"><ChevronLeft size={15} aria-hidden="true" /></button>
          <span className="w-14 text-center font-display text-2xl">{year}</span>
          <button type="button" aria-label="Próximo ano" onClick={() => { setYear(year + 1); setSel(null); }} className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-line hover:bg-surface2"><ChevronRight size={15} aria-hidden="true" /></button>
        </div>}>
        {!cal ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MONTHS.map((name, mi) => {
                const mk = `${year}-${String(mi + 1).padStart(2, "0")}`;
                const first = new Date(year, mi, 1).getDay();
                const days = new Date(year, mi + 1, 0).getDate();
                return (
                  <button key={name} type="button" onClick={() => setSel(sel === mk ? null : mk)} aria-pressed={sel === mk} className={`rounded-2xl border-[0.5px] p-3 text-left ${sel === mk ? "border-fg bg-surface2" : "border-line hover:bg-surface2"}`}>
                    <p className="mb-1.5 text-[12px]">{name}</p>
                    <div className="grid grid-cols-7 gap-y-0.5 text-center text-[9px] text-muted" aria-hidden="true">
                      {Array.from({ length: first }).map((_, i) => <span key={"b" + i} />)}
                      {Array.from({ length: days }).map((_, i) => {
                        const d = `${mk}-${String(i + 1).padStart(2, "0")}`;
                        const ev = byDate[d]?.[0];
                        const c = ev ? KIND_TONE[ev.kind]?.color : undefined;
                        return <span key={d} title={byDate[d]?.map((x) => x.name).join(", ")} className={`mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-full ${d === cal.today ? "ring-1 ring-fg" : ""} ${inPromo(d) && !ev ? "bg-bronze/20" : ""}`} style={c ? { background: c, color: "#fff" } : undefined}>{i + 1}</span>;
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              {Object.entries(KIND_TONE).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />{v.label}</span>)}
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-bronze/30" />dentro de uma promoção</span>
            </div>
          </>
        )}
      </Card>

      <div className="space-y-4">
        <Card pad={false} title={sel ? `${MONTHS[Number(sel.slice(5)) - 1]} de ${year}` : `Datas de ${year}`} sub="Use “Criar promoção” para começar uma campanha já com as datas preenchidas.">
          <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
            {list.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Nenhuma data neste período.</li>}
            {list.map((e) => (
              <li key={e.key + e.date} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] text-muted">{dateBr(e.date)}</span>{e.name}</p>
                  <Badge tone={KIND_TONE[e.kind]?.tone ?? "neutral"}>{KIND_TONE[e.kind]?.label ?? e.kind}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(e.kind === "commercial" || e.kind === "health" || e.kind === "custom" || e.key === "black_friday") && <Btn onClick={() => suggest(e)}>Criar promoção</Btn>}
                  {e.custom && e.id && <button type="button" onClick={() => remove(e.id!)} className="text-[11px] text-ember underline underline-offset-2">remover</button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Adicionar data" sub="Aniversário da marca, campanha própria, evento de parceiro…">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data"><input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
              <Field label="Tipo"><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KIND_TONE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            </div>
            <Field label="Nome"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required /></Field>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.yearly} onChange={(e) => setForm({ ...form, yearly: e.target.checked })} />Repetir todo ano</label>
            {err && <p role="alert" className="text-[12px] text-ember">{err}</p>}
            <Btn type="submit" variant="primary" size="md">Adicionar ao calendário</Btn>
          </form>
        </Card>
      </div>
    </div>
  );
}
