// Testes do back-office. Uso: BASE=http://127.0.0.1:8081 DB=/caminho/db.sqlite node scripts/api-admin-test.mjs
// (usa o admin/professor/aluno criados por `scripts/dev-api.php init`)
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const DB = process.env.DB;
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
  async call(method, path, body, { raw = false } = {}) {
    const h = { "Content-Type": "application/json", "X-Requested-With": "tfs" };
    if (this.jar) h.Cookie = this.jar;
    const res = await fetch(BASE + "/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [k, v] = c.split(";")[0].split("=");
      this.jar = v === "" ? "" : `${k}=${v}`;
    }
    if (raw) return { status: res.status, text: await res.text(), type: res.headers.get("content-type") };
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  }
  async login(email, password = PW) {
    const r = await this.call("POST", "/auth/login", { email, password });
    return r;
  }
}

const admin = new Client();
const teacherC = new Client();
const student = new Client();
const anon = new Client();

console.log("Autenticação por papel (RBAC)");
ok("admin loga", (await admin.login("admin@teste.local")).status === 200);
ok("professor loga", (await teacherC.login("prof@teste.local")).status === 200);
ok("aluno loga", (await student.login("teste@thefullsculpt.com.br")).status === 200);
ok("anônimo => 401 no admin", (await anon.call("GET", "/admin/overview")).status === 401);
ok("aluno => 403 no admin", (await student.call("GET", "/admin/overview")).status === 403);
ok("professor => 403 no admin", (await teacherC.call("GET", "/admin/students")).status === 403);
ok("aluno => 403 no painel do professor", (await student.call("GET", "/teacher/overview")).status === 403);
ok("admin => 403 no painel do professor", (await admin.call("GET", "/teacher/overview")).status === 403);
ok("professor vê /teacher/overview", (await teacherC.call("GET", "/teacher/overview")).status === 200);
const sys = await admin.call("GET", "/admin/system");
ok("migração aplicou o esquema v2+", sys.json?.schema >= 2, JSON.stringify(sys.json));

console.log("Método e exercícios");
const imp = await admin.call("POST", "/admin/method/import-default");
ok("importa catálogo padrão (5 exercícios, 54 aulas)", imp.status === 200 && imp.json?.exercises === 5 && imp.json?.lessons === 54, JSON.stringify(imp.json));
const imp2 = await admin.call("POST", "/admin/method/import-default");
ok("importação é idempotente", imp2.json?.exercises === 0 && imp2.json?.lessons === 0);
const method = await admin.call("GET", "/admin/method");
ok("54 aulas com 5 exercícios cada", method.json?.lessons?.length === 54 && method.json.lessons.every((l) => l.exercises.length === 5));
ok("fase 1 usa meio agachamento no lugar de agachamento", method.json.lessons.find((l) => l.phase === 1 && l.n === 1).exercises.every((e) => e.slug !== "squat"));
const base = { slug: "lunge", motion: "squat", depth: 0.7, primary: ["quads", "glutes"], secondary: ["hamstrings"], stabilizers: ["abs"], i18n: { pt: { name: "Afundo", bio: "Passada à frente.", cues: ["a", "b", "c", "d"] }, en: { name: "Lunge" }, es: { name: "Zancada" } } };
ok("exercício sem nome => 422", (await admin.call("POST", "/admin/exercises", { ...base, i18n: { pt: { name: "" } } })).status === 422);
ok("movimento inválido => 422", (await admin.call("POST", "/admin/exercises", { ...base, motion: "fly" })).status === 422);
ok("vídeo http (inseguro) => 422", (await admin.call("POST", "/admin/exercises", { ...base, video_url: "http://x.com/a.mp4" })).status === 422);
const cr = await admin.call("POST", "/admin/exercises", base);
ok("cria exercício", cr.status === 201 && cr.json?.id > 0, JSON.stringify(cr.json));
ok("slug duplicado => 409", (await admin.call("POST", "/admin/exercises", base)).status === 409);
ok("edita exercício", (await admin.call("PUT", `/admin/exercises/${cr.json.id}`, { ...base, depth: 0.8, video_url: "https://cdn.exemplo.com/lunge.mp4" })).status === 200);
const squat = (await admin.call("GET", "/admin/exercises")).json.rows.find((r) => r.slug === "squat");
ok("excluir exercício em uso => 409", (await admin.call("DELETE", `/admin/exercises/${squat.id}`)).status === 409);
const lesson = method.json.lessons.find((l) => l.phase === 4 && l.n === 1);
ok("edita aula (troca exercícios e tempos)", (await admin.call("PUT", `/admin/lessons/${lesson.id}`, { work_sec: 35, rest_sec: 20, rounds: 2, exercises: [cr.json.id, squat.id, cr.json.id] })).status === 200);
ok("aula inválida (0 exercícios) => 422", (await admin.call("PUT", `/admin/lessons/${lesson.id}`, { work_sec: 35, rest_sec: 20, rounds: 2, exercises: [] })).status === 422);
ok("excluir exercício em uso por aula editada => 409", (await admin.call("DELETE", `/admin/exercises/${cr.json.id}`)).status === 409);
const cat = await anon.call("GET", "/catalog");
ok("catálogo público (exercícios + aulas)", cat.status === 200 && cat.json.exercises.length === 6 && cat.json.lessons.length === 54, JSON.stringify(cat.json).slice(0, 120));
ok("catálogo traz i18n e músculos", cat.json.exercises[0].i18n?.pt?.name && Array.isArray(cat.json.exercises[0].primary));

console.log("Configurações");
const st = await admin.call("GET", "/admin/settings");
ok("configurações padrão", st.json?.price_cents === 7990 && st.json?.commission_tiers?.length === 3);
ok("preço inválido => 422", (await admin.call("PUT", "/admin/settings", { price_cents: 10 })).status === 422);
ok("faixas inválidas => 422", (await admin.call("PUT", "/admin/settings", { commission_tiers: [{ id: "x", min: 0, percent: 20 }] })).status === 422);
ok("disponibilidade inválida => 422", (await admin.call("PUT", "/admin/settings", { availability: { weekdays: [1], start: "18:00", end: "09:00", slot_min: 40 } })).status === 422);
const up = await admin.call("PUT", "/admin/settings", { price_cents: 9990, commission_hold_days: 0, commission_tiers: [{ id: "bronze", min: 1, percent: 20 }, { id: "silver", min: 15, percent: 25 }, { id: "gold", min: 40, percent: 30 }] });
ok("atualiza preço e carência", up.json?.price_cents === 9990 && up.json?.commission_hold_days === 0);

console.log("Professores, indicação e comissões");
ok("professor sem e-mail válido => 422", (await admin.call("POST", "/admin/teachers", { name: "Zé", email: "x" })).status === 422);
const nt = await admin.call("POST", "/admin/teachers", { name: "Carla Souza", email: "carla@teste.local", cref: "012345-G/SP" });
ok("cria professor com código e senha temporária", nt.status === 201 && /^[A-Z]+\d{3}$/.test(nt.json?.code) && nt.json?.tempPassword?.length >= 12, JSON.stringify(nt.json));
ok("e-mail de professor duplicado => 409", (await admin.call("POST", "/admin/teachers", { name: "Carla", email: "carla@teste.local" })).status === 409);
const carla = new Client();
ok("professora loga com a senha temporária", (await carla.login("carla@teste.local", nt.json.tempPassword)).status === 200);
// aluno novo indicado pelo código
const refStudent = new Client();
const reg = await refStudent.call("POST", "/auth/register", { name: "Aluno Indicado", email: `ind${Date.now()}@teste.local`, password: "uma-senha-bem-longa-123", consents: { terms: true, health: true, adult: true }, ref: nt.json.code.toLowerCase() });
ok("cadastro com código de indicação", reg.status === 201);
const list = await admin.call("GET", "/admin/students?q=Indicado");
const indicado = list.json.rows[0];
ok("aluno aparece vinculado ao professor", indicado?.teacher_id === nt.json.id && indicado?.teacher_name === "Carla Souza", JSON.stringify(indicado));
await refStudent.call("PUT", "/anamnese", { answers: { goal: "sculpt", injuries: [] }, assignment: { phase: 2, medicalClearance: false, restrictions: [] } });
const act = await refStudent.call("POST", "/subscription/activate");
ok("assinatura (teste) ativa", act.json?.sub === "active");
const comm = await admin.call("GET", `/admin/commissions?teacher=${nt.json.id}`);
ok("comissão gerada: 20% de R$ 99,90", comm.json?.rows?.length === 1 && comm.json.rows[0].amount_cents === 1998 && comm.json.rows[0].percent === 20 && comm.json.rows[0].status === "pending", JSON.stringify(comm.json?.rows));
ok("aprova comissões liberadas (carência 0)", (await admin.call("POST", "/admin/commissions/approve", { teacher_id: nt.json.id })).json?.approved === 1);
ok("repasse sem professor válido => 422", (await admin.call("POST", "/admin/payouts", { teacher_id: 999999 })).status === 422);
const po = await admin.call("POST", "/admin/payouts", { teacher_id: nt.json.id, note: "teste" });
ok("repasse paga R$ 19,98", po.status === 201 && po.json?.amount_cents === 1998, JSON.stringify(po.json));
ok("segundo repasse => 409 (nada a pagar)", (await admin.call("POST", "/admin/payouts", { teacher_id: nt.json.id })).status === 409);
const tOv = await carla.call("GET", "/teacher/overview");
ok("professora vê estatística própria (1 aluno, 1 ativo, comissão paga)", tOv.status === 200 && tOv.json?.stats?.students === 1 && tOv.json?.stats?.active === 1 && tOv.json?.stats?.commissions?.paid?.cents === 1998, JSON.stringify(tOv.json?.stats));
ok("professora vê só os próprios alunos", (await carla.call("GET", "/teacher/students")).json?.total === 1 && (await teacherC.call("GET", "/teacher/students")).json?.total === 0);
ok("professor nunca vê anamnese (rota inexistente no perfil dele)", (await carla.call("POST", `/admin/students/${indicado.id}/anamnese`)).status === 403);
ok("ajusta percentual individual", (await admin.call("PATCH", `/admin/teachers/${nt.json.id}`, { tier_percent: 35 })).status === 200 && (await admin.call("GET", `/admin/teachers/${nt.json.id}`)).json?.percent === 35);
const csv = await admin.call("GET", "/admin/export/commissions.csv", undefined, { raw: true });
ok("exporta CSV de comissões", csv.status === 200 && /text\/csv/.test(csv.type) && csv.text.startsWith("id;professor") && csv.text.includes("Carla Souza"), csv.text.slice(0, 80));
const pays = await admin.call("GET", "/admin/payments?status=paid");
ok("lista pagamentos", pays.status === 200 && pays.json.rows.some((r) => r.amount_cents === 9990));
const refund = await admin.call("POST", `/admin/payments/${pays.json.rows.find((r) => r.amount_cents === 9990).id}/refund`);
ok("reembolso", refund.status === 200 && (await admin.call("POST", `/admin/payments/${pays.json.rows[0].id}/refund`)).status === 409);

console.log("Gestão de alunos");
ok("filtra por plano/fase", (await admin.call("GET", "/admin/students?sub=active&phase=2")).json?.rows?.some((r) => r.id === indicado.id));
ok("ordenação inválida cai no padrão (sem erro)", (await admin.call("GET", "/admin/students?sort=DROP;--&dir=asc")).status === 200);
const det = await admin.call("GET", `/admin/students/${indicado.id}`);
ok("detalhe do aluno", det.status === 200 && det.json?.user?.password_hash === undefined && det.json?.payments?.length >= 1 && det.json?.hasAnamnese === true);
ok("adiciona nota interna", (await admin.call("POST", `/admin/students/${indicado.id}/note`, { note: "Pediu consulta." })).status === 201);
const viewA = await admin.call("POST", `/admin/students/${indicado.id}/anamnese`);
ok("admin lê anamnese (decifrada)", viewA.json?.anamnese?.answers?.goal === "sculpt", JSON.stringify(viewA.json));
ok("leitura da anamnese ficou na auditoria", (await admin.call("GET", "/admin/audit?action=admin_view_anamnese")).json?.rows?.length >= 1);
ok("suspende aluno", (await admin.call("PATCH", `/admin/students/${indicado.id}`, { status: "suspended" })).status === 200);
ok("sessão do aluno suspenso cai", (await refStudent.call("GET", "/me")).status === 401);
ok("login de suspenso => 403", (await new Client().login(reg.json.profile.email, "uma-senha-bem-longa-123")).status === 403);
ok("reativa e muda fase", (await admin.call("PATCH", `/admin/students/${indicado.id}`, { status: "active", phase: 5, sub: "free" })).status === 200);
ok("fase inválida => 422", (await admin.call("PATCH", `/admin/students/${indicado.id}`, { phase: 11 })).status === 422);
ok("excluir aluno exige confirmação", (await admin.call("DELETE", `/admin/students/${indicado.id}`, {})).status === 422);
ok("exclui aluno (LGPD)", (await admin.call("DELETE", `/admin/students/${indicado.id}`, { confirm: true })).status === 200 && (await admin.call("GET", `/admin/students/${indicado.id}`)).status === 404);

console.log("Consultas online");
const slots = await student.call("GET", "/appointments/slots");
ok("aluno vê horários livres", slots.status === 200 && slots.json?.slots?.length > 10, JSON.stringify(slots.json).slice(0, 100));
ok("horário inexistente => 409", (await student.call("POST", "/appointments", { starts_at: "2020-01-01 12:00:00" })).status === 409);
const slot = slots.json.slots[0];
const bk = await student.call("POST", "/appointments", { starts_at: slot.starts_at });
ok("agenda consulta", bk.status === 201);
ok("segunda consulta aberta => 409", (await student.call("POST", "/appointments", { starts_at: slots.json.slots[1].starts_at })).status === 409);
const apList = await admin.call("GET", "/admin/appointments?status=requested");
const ap = apList.json.rows.find((r) => r.id === bk.json.id);
ok("admin vê o pedido", !!ap && ap.student === "Marina Duarte (teste)");
ok("admin atribui professor e confirma", (await admin.call("PATCH", `/admin/appointments/${ap.id}`, { teacher_id: nt.json.id, status: "confirmed", link: "https://meet.exemplo.com/abc" })).status === 200);
const tAp = await carla.call("GET", "/teacher/appointments");
ok("professor vê a consulta atribuída", tAp.json?.rows?.some((r) => r.id === ap.id && r.link));
ok("professor conclui a consulta", (await carla.call("PATCH", `/teacher/appointments/${ap.id}`, { status: "done" })).status === 200);
ok("outro professor não mexe (404)", (await teacherC.call("PATCH", `/teacher/appointments/${ap.id}`, { status: "canceled" })).status === 404);
const bk2 = await student.call("POST", "/appointments", { starts_at: slots.json.slots[2].starts_at });
ok("nova consulta após concluir", bk2.status === 201);
ok("aluno cancela a própria", (await student.call("DELETE", `/appointments/${bk2.json.id}`)).status === 200);
ok("desliga consultas => sem horários", (await admin.call("PUT", "/admin/settings", { consult_enabled: false })).status === 200 && (await student.call("GET", "/appointments/slots")).json?.slots?.length === 0);
await admin.call("PUT", "/admin/settings", { consult_enabled: true });

console.log("Dados de demonstração e analytics");
const seed = await admin.call("POST", "/admin/demo/seed", { students: 120 });
ok("gera demo (120 alunos)", seed.status === 201 && seed.json?.students === 120 && seed.json?.lessons > 300 && seed.json?.payments > 20 && seed.json?.teachers === 8, JSON.stringify(seed.json));
const ov = await admin.call("GET", "/admin/overview?range=90&demo=all");
const k = ov.json?.kpis;
ok("overview: KPIs coerentes", ov.status === 200 && k?.students?.value >= 120 && k?.mrr?.value > 0 && k?.activeSubs?.value > 0 && k?.lessons?.value > 0, JSON.stringify(k));
ok("overview: 12 meses de série e 30 dias diários", ov.json?.series?.length === 12 && ov.json?.daily?.length === 30);
ok("overview: funil decrescente", ov.json.funnel.length === 5 && ov.json.funnel[0].n >= ov.json.funnel[1].n && ov.json.funnel[1].n >= ov.json.funnel[2].n);
ok("overview: coortes, mapa de calor, fases", ov.json.cohorts.length === 6 && ov.json.heatmap.length === 12 && ov.json.phases.length === 9);
ok("overview: professores, risco, consultas", ov.json.teachers.length > 0 && Array.isArray(ov.json.risk) && ov.json.upcoming.length >= 0);
const ovReal = await admin.call("GET", "/admin/overview?demo=real");
ok("filtro 'real' exclui o demo", ovReal.json.kpis.students.value < k.students.value && ovReal.json.kpis.students.value >= 1);
const bill = await admin.call("GET", "/admin/billing/summary?demo=only");
ok("billing: MRR, ARR, LTV, métodos", bill.status === 200 && bill.json.mrr > 0 && bill.json.arr === bill.json.mrr * 12 && bill.json.byMethod.pix.n > 0 && bill.json.dailyRevenue.length === 30, JSON.stringify(bill.json).slice(0, 200));
ok("lista de alunos só demo", (await admin.call("GET", "/admin/students?demo=only&size=10")).json?.total === 120);
ok("risco de churn lista alunos", (await admin.call("GET", "/admin/students?demo=only&risk=1")).status === 200);
ok("assinaturas e comissões paginadas", (await admin.call("GET", "/admin/subscriptions?status=active&demo=only")).json.total > 0 && (await admin.call("GET", "/admin/commissions?demo=only")).json.summary.length > 0);
ok("consultas demo no calendário", (await admin.call("GET", "/admin/appointments?demo=only&from=2020-01-01&to=2030-01-01")).json.rows.length > 5);
const priv = await admin.call("GET", "/admin/privacy");
ok("painel LGPD", priv.status === 200 && Array.isArray(priv.json.consents));
ok("auditoria paginada", (await admin.call("GET", "/admin/audit?page=1&size=10")).json?.rows?.length === 10);
if (DB) {
  const db = new DatabaseSync(DB);
  ok("demo sem senha utilizável (hash inválido)", db.prepare("SELECT COUNT(*) n FROM users WHERE is_demo = 1 AND password_hash <> '!demo'").get().n === 0);
  ok("e-mails demo em domínio inválido", db.prepare("SELECT COUNT(*) n FROM users WHERE is_demo = 1 AND email NOT LIKE '%@exemplo.invalid'").get().n === 0);
}
ok("login de usuário demo é impossível", (await new Client().login("demo.aluno1@exemplo.invalid", "!demo")).status === 401);
const purge = await admin.call("POST", "/admin/demo/purge");
ok("apaga os dados de demonstração", purge.json?.removed >= 128 && (await admin.call("GET", "/admin/students?demo=only")).json?.total === 0);
ok("dados reais permanecem após purge", (await admin.call("GET", "/admin/students?demo=real")).json?.total >= 1);
ok("professor não gera demo (403)", (await teacherC.call("POST", "/admin/demo/seed", {})).status === 403);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
