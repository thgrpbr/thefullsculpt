// Testes: planos e preços, promoções, códigos promocionais, regras de desconto e calendário festivo.
const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const PW = "senha-de-teste-local-1";
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name, String(extra).slice(0, 300));
  }
};

class Client {
  jar = "";
  async call(method, path, body) {
    const h = { "Content-Type": "application/json", "X-Requested-With": "tfs" };
    if (this.jar) h.Cookie = this.jar;
    const res = await fetch(BASE + "/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [k, v] = c.split(";")[0].split("=");
      this.jar = v === "" ? "" : `${k}=${v}`;
    }
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  }
  login(email, password = PW) {
    return this.call("POST", "/auth/login", { email, password });
  }
}
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const shift = (days) => new Date(Date.parse(today + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

const admin = new Client();
await admin.login("admin@teste.local");
const anon = new Client();

async function newStudent(tag) {
  const c = new Client();
  const r = await c.call("POST", "/auth/register", { name: "Aluno " + tag, email: `${tag}${Date.now()}@teste.local`, password: "uma-senha-bem-longa-123", consents: { terms: true, health: true, adult: true }, birth: "1990-01-01" });
  return { c, ok: r.status === 201 };
}

console.log("Planos");
const pub0 = await anon.call("GET", "/plans");
ok("plano inicial 'mensal' vem do preço atual (R$ 79,90) e é público", pub0.status === 200 && pub0.json.plans.length === 1 && pub0.json.plans[0].slug === "mensal" && pub0.json.plans[0].final_cents === 7990 && pub0.json.plans[0].features.pt.length === 4);
const all0 = await admin.call("GET", "/admin/pricing");
ok("admin vê planos, promoções, códigos e regras", all0.status === 200 && all0.json.plans.length === 1 && all0.json.rules.max_discount_pct === 70 && Array.isArray(all0.json.codes));
const aluno = await new Client();
await aluno.login("teste@thefullsculpt.com.br");
ok("aluno não acessa o admin de preços", (await aluno.call("GET", "/admin/pricing")).status === 403);
const planBody = (over = {}) => ({ name: { pt: "Plano anual", en: "Annual plan", es: "Plan anual" }, description: { pt: "12 meses", en: "12 months", es: "12 meses" }, features: { pt: ["Tudo do mensal", "  ", "Economia"], en: ["All of monthly"], es: [] }, interval_months: 12, price_cents: 59900, active: true, featured: false, sort: 20, ...over });
ok("preço inválido => 422", (await admin.call("POST", "/admin/pricing/plans", planBody({ price_cents: 100 }))).status === 422);
ok("ciclo inválido => 422", (await admin.call("POST", "/admin/pricing/plans", planBody({ interval_months: 5 }))).status === 422);
ok("nome em português obrigatório", (await admin.call("POST", "/admin/pricing/plans", planBody({ name: { pt: "", en: "x" } }))).status === 422);
const anual = await admin.call("POST", "/admin/pricing/plans", planBody());
ok("cria plano anual (slug automático)", anual.status === 201 && anual.json.slug === "plano-anual", JSON.stringify(anual.json));
const dup = await admin.call("POST", "/admin/pricing/plans", planBody());
ok("nome repetido gera slug único", dup.status === 201 && dup.json.slug === "plano-anual-2");
ok("exclui plano sem uso", (await admin.call("DELETE", `/admin/pricing/plans/${dup.json.id}`)).status === 200);
const pub1 = await anon.call("GET", "/plans");
const pa = pub1.json.plans.find((p) => p.slug === "plano-anual");
ok("novo pacote aparece no site, com textos nos 3 idiomas e itens limpos", pa && pa.name.en === "Annual plan" && pa.name.es === "Plan anual" && pa.features.pt.length === 2 && pa.interval_months === 12 && pa.final_cents === 59900);
const mensalId = all0.json.plans[0].id;
ok("destaque único: marcar um desmarca o outro", (await admin.call("PUT", `/admin/pricing/plans/${anual.json.id}`, planBody({ featured: true }))).status === 200 && (await anon.call("GET", "/plans")).json.plans.filter((p) => p.featured).length === 1);
ok("renomear reflete no site", (await admin.call("PUT", `/admin/pricing/plans/${anual.json.id}`, planBody({ featured: true, name: { pt: "Anual Premium", en: "", es: "" } }))).status === 200 && (await anon.call("GET", "/plans")).json.plans.find((p) => p.id === anual.json.id).name.en === "Anual Premium");
ok("desativar tira do site", (await admin.call("PUT", `/admin/pricing/plans/${anual.json.id}`, planBody({ active: false }))).status === 200 && (await anon.call("GET", "/plans")).json.plans.length === 1);
ok("não deixa desativar o último plano", (await admin.call("PUT", `/admin/pricing/plans/${mensalId}`, { ...planBody(), name: { pt: "Plano mensal" }, interval_months: 1, price_cents: 7990, active: false })).status === 409);
await admin.call("PUT", `/admin/pricing/plans/${anual.json.id}`, planBody({ active: true }));

console.log("Promoções automáticas");
const promoBody = (over = {}) => ({ name: "Semana do Consumidor", label: "-20%", kind: "percent", value: 20, plan_ids: null, starts_on: shift(-1), ends_on: shift(5), first_purchase_only: false, active: true, ...over });
ok("percentual acima de 90 => 422", (await admin.call("POST", "/admin/pricing/promotions", promoBody({ value: 95 }))).status === 422);
ok("fim antes do início => 422", (await admin.call("POST", "/admin/pricing/promotions", promoBody({ starts_on: shift(5), ends_on: shift(1) }))).status === 422);
ok("data inválida => 422", (await admin.call("POST", "/admin/pricing/promotions", promoBody({ starts_on: "2026-02-31" }))).status === 422);
const p20 = await admin.call("POST", "/admin/pricing/promotions", promoBody());
ok("cria promoção de 20% vigente", p20.status === 201);
const pubP = (await anon.call("GET", "/plans")).json.plans;
ok("site mostra o preço promocional (R$ 63,92) e o selo", pubP.find((p) => p.slug === "mensal").final_cents === 6392 && pubP.find((p) => p.slug === "mensal").promo_label === "-20%" && pubP.find((p) => p.slug === "mensal").discount_pct === 20);
const pFut = await admin.call("POST", "/admin/pricing/promotions", promoBody({ name: "Futura", value: 50, starts_on: shift(10), ends_on: shift(12) }));
const pOnlyAnual = await admin.call("POST", "/admin/pricing/promotions", promoBody({ name: "Só anual", value: 30, plan_ids: [anual.json.id] }));
const pubP2 = (await anon.call("GET", "/plans")).json.plans;
ok("promoção futura não vale; promoção por plano só vale no plano escolhido", pubP2.find((p) => p.slug === "mensal").final_cents === 6392 && pubP2.find((p) => p.slug === "plano-anual").final_cents === 41930, JSON.stringify(pubP2.map((p) => p.final_cents)));
const list = (await admin.call("GET", "/admin/pricing")).json.promotions;
ok("admin vê quais estão em andamento", list.find((p) => p.id === p20.json.id).running === true && list.find((p) => p.id === pFut.json.id).running === false);
ok("desativar promoção a retira do site", (await admin.call("PUT", `/admin/pricing/promotions/${pOnlyAnual.json.id}`, promoBody({ name: "Só anual", value: 30, plan_ids: [anual.json.id], active: false }))).status === 200 && (await anon.call("GET", "/plans")).json.plans.find((p) => p.slug === "plano-anual").final_cents === 47920);
ok("exclui promoção", (await admin.call("DELETE", `/admin/pricing/promotions/${pFut.json.id}`)).status === 200);

console.log("Códigos promocionais");
const codeBody = (over = {}) => ({ code: "ola10", kind: "percent", value: 10, plan_ids: null, starts_on: null, ends_on: null, max_uses: null, first_purchase_only: false, stackable: false, active: true, note: "teste", ...over });
ok("código com caracteres inválidos => 422", (await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "a b" }))).status === 422);
const c10 = await admin.call("POST", "/admin/pricing/codes", codeBody());
ok("cria código (guardado em maiúsculas)", c10.status === 201 && (await admin.call("GET", "/admin/pricing")).json.codes.some((c) => c.code === "OLA10"));
ok("código repetido => 409", (await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "OLA10" }))).status === 409);
const quote = (code, plan = mensalId) => anon.call("POST", "/plans/quote", { plan_id: plan, code });
let q = await quote("ola10");
ok("promoção maior (20%) vence o código de 10% e o código não é consumido", q.json.total_cents === 6392 && q.json.code === null && q.json.code_error === "promo_better", JSON.stringify(q.json));
const c30 = await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "VIP30", value: 30, max_uses: 2, note: "influenciadora" }));
q = await quote("vip30");
ok("código maior vence a promoção (30% => R$ 55,93)", q.json.total_cents === 5593 && q.json.code.code === "VIP30" && q.json.promo === null, JSON.stringify(q.json));
ok("código inexistente informa o motivo", (await quote("NAOEXISTE")).json.code_error === "code_invalid");
const cOld = await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "VENCIDO", starts_on: shift(-10), ends_on: shift(-2) }));
const cFut = await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "FUTURO", starts_on: shift(3) }));
ok("código vencido e ainda não iniciado são recusados", (await quote("VENCIDO")).json.code_error === "code_expired" && (await quote("FUTURO")).json.code_error === "code_expired");
const cPlan = await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "SOANUAL", value: 40, plan_ids: [anual.json.id] }));
ok("código restrito a um plano só vale nele", (await quote("SOANUAL")).json.code_error === "code_not_for_plan" && (await quote("SOANUAL", anual.json.id)).json.code?.code === "SOANUAL");
const cInact = await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "PAUSADO", active: false }));
ok("código desativado é recusado", (await quote("PAUSADO")).json.code_error === "code_invalid");

console.log("Regras de desconto");
await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "SOMA15", value: 15, stackable: true }));
ok("sem acúmulo, código acumulável também não soma", (await quote("SOMA15")).json.stacked === false);
ok("regras inválidas => 422", (await admin.call("PUT", "/admin/pricing/rules", { max_discount_pct: 150, allow_stack: true, min_price_cents: 990 })).status === 422);
ok("liga acúmulo (promoção + código acumulável)", (await admin.call("PUT", "/admin/pricing/rules", { max_discount_pct: 70, allow_stack: true, min_price_cents: 990 })).status === 200);
q = await quote("SOMA15");
ok("acúmulo: 20% + 15% sobre o valor já reduzido (R$ 54,34)", q.json.stacked === true && q.json.total_cents === 5434 && q.json.promo && q.json.code, JSON.stringify(q.json));
ok("código não acumulável continua não somando", (await quote("VIP30")).json.stacked === false);
await admin.call("PUT", "/admin/pricing/rules", { max_discount_pct: 25, allow_stack: true, min_price_cents: 990 });
q = await quote("SOMA15");
ok("teto de desconto (25%) limita o total (R$ 59,93)", q.json.capped === true && q.json.total_cents === 5993 && q.json.discount_pct === 25, JSON.stringify(q.json));
await admin.call("PUT", "/admin/pricing/rules", { max_discount_pct: 90, allow_stack: false, min_price_cents: 7000 });
q = await quote("VIP30");
ok("preço mínimo (R$ 70,00) limita o desconto", q.json.total_cents === 7000 && q.json.capped === true, JSON.stringify(q.json));
await admin.call("PUT", "/admin/pricing/rules", { max_discount_pct: 70, allow_stack: false, min_price_cents: 990 });

console.log("Assinatura com plano e código");
const s1 = await newStudent("s1");
ok("aluno novo criado", s1.ok);
ok("código inválido na assinatura => 422 e nada é cobrado", (await s1.c.call("POST", "/subscription/activate", { plan_id: mensalId, code: "NAOEXISTE" })).json?.error === "code_invalid" && (await s1.c.call("GET", "/me")).json.sub === "free");
const act = await s1.c.call("POST", "/subscription/activate", { plan_id: mensalId, code: "VIP30" });
ok("assina com código: cobra o preço cotado", act.status === 200 && act.json.sub === "active");
const all1 = (await admin.call("GET", "/admin/pricing")).json;
const vip = all1.codes.find((c) => c.code === "VIP30");
ok("uso do código é contado e o desconto somado", vip.uses === 1 && vip.discounted_cents === 2397, JSON.stringify(vip));
const pays = (await admin.call("GET", "/admin/payments?q=aluno")).json;
ok("pagamento registrado com o valor cotado", pays.rows.some((r) => r.amount_cents === 5593), JSON.stringify(pays.rows?.slice(0, 2)));
ok("plano fica gravado na assinatura (não dá para excluir plano em uso)", (await admin.call("DELETE", `/admin/pricing/plans/${mensalId}`)).status === 409);
const s2 = await newStudent("s2");
const s3 = await newStudent("s3");
ok("segundo aluno usa o código", (await s2.c.call("POST", "/subscription/activate", { plan_id: mensalId, code: "VIP30" })).status === 200);
ok("limite de usos esgota o código", (await s3.c.call("POST", "/subscription/activate", { plan_id: mensalId, code: "VIP30" })).json?.error === "code_exhausted");
ok("código esgotado não pode ser excluído nem ter limite menor que os usos", (await admin.call("DELETE", `/admin/pricing/codes/${c30.json.id}`)).status === 409 && (await admin.call("PUT", `/admin/pricing/codes/${c30.json.id}`, codeBody({ code: "VIP30", value: 30, max_uses: 1 }))).status === 422);
ok("sem código usa a promoção vigente", (await s3.c.call("POST", "/subscription/activate", { plan_id: mensalId })).status === 200 && (await admin.call("GET", "/admin/payments?q=aluno")).json.rows.some((r) => r.amount_cents === 6392));
const cFirst = await admin.call("POST", "/admin/pricing/codes", codeBody({ code: "PRIMEIRA", value: 50, first_purchase_only: true }));
ok("código de primeira compra recusa quem já pagou", (await s1.c.call("POST", "/plans/quote", { plan_id: mensalId, code: "PRIMEIRA" })).json.code_error === "code_first_purchase");
ok("simulador do admin calcula o preço final", (await admin.call("POST", "/admin/pricing/quote", { plan_id: mensalId, code: "PRIMEIRA" })).json.total_cents === 3995);
ok("exclui código sem uso", (await admin.call("DELETE", `/admin/pricing/codes/${cFirst.json.id}`)).status === 200);

console.log("Calendário festivo");
const cal = (await admin.call("GET", "/admin/pricing/calendar?year=2026")).json;
const ev = (k) => cal.events.find((e) => e.key === k)?.date;
ok("feriados fixos e móveis de 2026", ev("natal") === "2026-12-25" && ev("carnaval") === "2026-02-17" && ev("pascoa") === "2026-04-05" && ev("sexta_santa") === "2026-04-03" && ev("corpus_christi") === "2026-06-04", JSON.stringify(cal.events.map((e) => e.key + e.date).slice(0, 8)));
ok("datas comerciais de 2026", ev("black_friday") === "2026-11-27" && ev("cyber_monday") === "2026-11-30" && ev("dia_maes") === "2026-05-10" && ev("dia_pais") === "2026-08-09" && ev("dia_namorados") === "2026-06-12");
const cal27 = (await admin.call("GET", "/admin/pricing/calendar?year=2027")).json;
ok("2027 recalcula as datas móveis", cal27.events.find((e) => e.key === "pascoa").date === "2027-03-28" && cal27.events.find((e) => e.key === "black_friday").date === "2027-11-26" && cal27.events.find((e) => e.key === "dia_maes").date === "2027-05-09");
ok("lista em ordem de data", cal.events.every((e, i) => i === 0 || cal.events[i - 1].date <= e.date));
ok("ano fora do intervalo => 422", (await admin.call("GET", "/admin/pricing/calendar?year=1800")).status === 422);
const ce = await admin.call("POST", "/admin/pricing/calendar", { date: "2026-08-20", name: "Aniversário da marca", kind: "commercial", yearly: true });
ok("cria data personalizada que se repete todo ano", ce.status === 201 && (await admin.call("GET", "/admin/pricing/calendar?year=2026")).json.events.some((e) => e.name === "Aniversário da marca" && e.custom) && (await admin.call("GET", "/admin/pricing/calendar?year=2028")).json.events.some((e) => e.name === "Aniversário da marca" && e.date === "2028-08-20"));
ok("data inválida => 422", (await admin.call("POST", "/admin/pricing/calendar", { date: "2026-13-01", name: "x" })).status === 422);
ok("remove data personalizada", (await admin.call("DELETE", `/admin/pricing/calendar/${ce.json.id}`)).status === 200 && !(await admin.call("GET", "/admin/pricing/calendar?year=2026")).json.events.some((e) => e.name === "Aniversário da marca"));

console.log("Permissões");
const staff = await admin.call("POST", "/admin/users", { name: "Leitor Preços", email: `leitor${Date.now()}@teste.local`, profile: "custom", permissions: ["pricing.view"] });
const sc = new Client();
await sc.login((await admin.call("GET", "/admin/users")).json.rows.find((r) => r.name === "Leitor Preços").email, staff.json.tempPassword);
ok("quem só visualiza lê mas não altera", (await sc.call("GET", "/admin/pricing")).status === 200 && (await sc.call("POST", "/admin/pricing/promotions", promoBody())).status === 403 && (await sc.call("PUT", "/admin/pricing/rules", { max_discount_pct: 10, allow_stack: false, min_price_cents: 0 })).status === 403);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
