// Teste de integração da API. Uso: BASE=http://127.0.0.1:8081 DB=/caminho/db.sqlite node scripts/api-test.mjs
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE ?? "http://127.0.0.1:8081";
const DB = process.env.DB;
let pass = 0;
let fail = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name, extra);
  }
}

class Client {
  jar = "";
  async call(method, path, body, { csrf = true, headers = {} } = {}) {
    const h = { "Content-Type": "application/json", ...headers };
    if (csrf) h["X-Requested-With"] = "tfs";
    if (this.jar) h.Cookie = this.jar;
    const res = await fetch(BASE + "/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [kv] = c.split(";");
      const [k, v] = kv.split("=");
      this.jar = v === "" ? "" : `${k}=${v}`;
    }
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json, setCookie: set.join("|") };
  }
}

const email = `teste${Date.now()}@exemplo.com`;
const password = "uma-senha-bem-longa-123";
const consents = { terms: true, health: true, adult: true, marketing: false };
const a = new Client();

console.log("Básico e segurança");
ok("health", (await a.call("GET", "/health")).status === 200);
ok("POST sem X-Requested-With => 403", (await a.call("POST", "/auth/register", { name: "A B", email, password, consents }, { csrf: false })).status === 403);
ok("Origin de outro site => 403", (await a.call("POST", "/auth/register", { name: "A B", email, password, consents }, { headers: { Origin: "https://evil.example" } })).status === 403);
ok("senha fraca => 422", (await a.call("POST", "/auth/register", { name: "A B", email, password: "curta", consents })).status === 422);
ok("sem consentimento de saúde => 422", (await a.call("POST", "/auth/register", { name: "A B", email, password, consents: { terms: true, health: false, adult: true } })).status === 422);
ok("cadastro de menor de 18 (data de nascimento) => 422 underage", (await a.call("POST", "/auth/register", { name: "A B", email: "menor" + email, password, consents, birth: new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().slice(0, 10) })).json?.error === "underage");
ok("rota inexistente => 404", (await a.call("GET", "/nada")).status === 404);

console.log("Cadastro e sessão");
const reg = await a.call("POST", "/auth/register", { name: "Ana Teste", email, password, consents, locale: "pt" });
ok("register => 201", reg.status === 201, JSON.stringify(reg.json));
ok("cookie HttpOnly + SameSite", /HttpOnly/i.test(reg.setCookie) && /SameSite=Lax/i.test(reg.setCookie), reg.setCookie);
ok("estado inicial sem anamnese", reg.json?.assignment === null && reg.json?.sub === "free");
ok("e-mail duplicado => 409", (await new Client().call("POST", "/auth/register", { name: "X Y", email, password, consents })).status === 409);
ok("/me com sessão => 200", (await a.call("GET", "/me")).status === 200);
ok("/me sem sessão => 401", (await new Client().call("GET", "/me")).status === 401);

console.log("Anamnese criptografada e paywall no servidor");
ok("aula antes da anamnese => 409", (await a.call("POST", "/lessons/complete", { lessonId: "f4-1", sec: 600, rpe: 6, steps: 10 })).status === 409);
const an = await a.call("PUT", "/anamnese", { answers: { goal: "sculpt", injuries: ["knee"], parq: { heart: false } }, assignment: { phase: 4, medicalClearance: false, restrictions: ["knee"] } });
ok("anamnese => 200 e fase 4", an.status === 200 && an.json?.assignment?.phase === 4 && an.json?.assignment?.level === "intermediate", JSON.stringify(an.json));
ok("anamnese volta decifrada", an.json?.answers?.goal === "sculpt");
ok("fase inválida => 422", (await a.call("PUT", "/anamnese", { answers: {}, assignment: { phase: 12 } })).status === 422);
ok("menor de 18 (idade) => 422", (await a.call("PUT", "/anamnese", { answers: { age: 17 }, assignment: { phase: 1, medicalClearance: false, restrictions: [] } })).json?.error === "underage");
const y17 = new Date(Date.now() - 17 * 365.25 * 86400000).toISOString().slice(0, 10);
ok("menor de 18 (data de nascimento) ou data futura => 422", (await a.call("PUT", "/anamnese", { answers: { birth: y17 }, assignment: { phase: 1, medicalClearance: false, restrictions: [] } })).status === 422 && (await a.call("PUT", "/anamnese", { answers: { birth: "2999-01-01" }, assignment: { phase: 1, medicalClearance: false, restrictions: [] } })).status === 422);
ok("maior de 18 com objetivos múltiplos é aceito", (await a.call("PUT", "/anamnese", { answers: { goals: ["sculpt", "lose"], equipment: ["bands", "dumbbells"], birth: "1990-05-10", age: 36, injuries: [], parq: {} }, assignment: { phase: 4, medicalClearance: false, restrictions: ["knee"] } })).status === 200);
if (DB) {
  const db = new DatabaseSync(DB);
  const row = db.prepare("SELECT data_enc FROM anamneses WHERE user_id = (SELECT id FROM users WHERE email = ?)").get(email);
  ok("dado de saúde cifrado em repouso", row && !/knee|sculpt|injuries/.test(row.data_enc) && row.data_enc.length > 40);
  const u = db.prepare("SELECT password_hash FROM users WHERE email = ?").get(email);
  ok("senha com hash forte (argon2/bcrypt)", /^\$(argon2id|2y)\$/.test(u.password_hash) && !u.password_hash.includes(password));
  const ip = db.prepare("SELECT ip_hash FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)").get(email);
  ok("IP guardado só como hash", ip.ip_hash.length === 64 && !ip.ip_hash.includes("127.0.0.1"));
}
ok("aula grátis errada (f4-2) => 402", (await a.call("POST", "/lessons/complete", { lessonId: "f4-2", sec: 600, rpe: 6, steps: 10 })).status === 402);
const l1 = await a.call("POST", "/lessons/complete", { lessonId: "f4-1", sec: 600, rpe: 6, steps: 10 });
ok("aula grátis f4-1 => 200, xp 150, streak 1", l1.status === 200 && l1.json?.xp === 150 && l1.json?.streak === 1, JSON.stringify(l1.json));
ok("segunda aula grátis => 402", (await a.call("POST", "/lessons/complete", { lessonId: "f4-1", sec: 600, rpe: 6, steps: 10 })).status === 402);
ok("dados inválidos => 422", (await a.call("POST", "/lessons/complete", { lessonId: "f4-1", sec: 0, rpe: 99, steps: 10 })).status === 422);

console.log("Assinatura (teste) e fases");
ok("ativar assinatura (teste)", (await a.call("POST", "/subscription/activate")).json?.sub === "active");
const l2 = await a.call("POST", "/lessons/complete", { lessonId: "f4-2", sec: 700, rpe: 7, steps: 10 });
ok("aula f4-2 liberada, streak mantém 1 no mesmo dia", l2.status === 200 && l2.json?.streak === 1 && l2.json?.xp === 300, JSON.stringify(l2.json));
ok("fase futura (f5-1) => 403", (await a.call("POST", "/lessons/complete", { lessonId: "f5-1", sec: 700, rpe: 7, steps: 10 })).status === 403);
ok("avançar fase sem concluir => 409", (await a.call("POST", "/phase/advance")).status === 409);
for (const n of [3, 4, 5, 6]) await a.call("POST", "/lessons/complete", { lessonId: `f4-${n}`, sec: 600, rpe: 6, steps: 10 });
const adv = await a.call("POST", "/phase/advance");
ok("avançar fase após 6 aulas => fase 5", adv.status === 200 && adv.json?.assignment?.phase === 5, JSON.stringify(adv.json));

console.log("Login, limite de tentativas, logout");
const b = new Client();
ok("login com senha errada => 401", (await b.call("POST", "/auth/login", { email, password: "errada-errada-123" })).status === 401);
ok("login correto => 200", (await b.call("POST", "/auth/login", { email, password })).status === 200);
ok("logout limpa sessão", (await b.call("POST", "/auth/logout")).status === 200 && (await b.call("GET", "/me")).status === 401);
let limited = false;
for (let i = 0; i < 12; i++) {
  const r = await new Client().call("POST", "/auth/login", { email, password: "errada-errada-" + i });
  if (r.status === 429) limited = true;
}
ok("força bruta bloqueada (429)", limited);

console.log("LGPD: exportar e excluir");
const c = new Client();
// o limite de login (por IP) pode estar ativo; a sessão `a` continua válida
const ex = await a.call("GET", "/privacy/export");
ok("export contém dados, consentimentos e atividade", ex.status === 200 && ex.json?.data?.answers?.goals?.includes("sculpt") && ex.json?.consents?.length >= 3 && ex.json?.activity?.length > 0);
ok("excluir com senha errada => 401", (await a.call("DELETE", "/privacy/account", { password: "errada-errada-123" })).status === 401);
ok("excluir conta => 200", (await a.call("DELETE", "/privacy/account", { password })).status === 200);
ok("sessão invalidada após exclusão", (await a.call("GET", "/me")).status === 401);
if (DB) {
  const db = new DatabaseSync(DB);
  ok("usuário e dados removidos do banco", db.prepare("SELECT COUNT(*) n FROM users WHERE email = ?").get(email).n === 0 && db.prepare("SELECT COUNT(*) n FROM anamneses WHERE user_id NOT IN (SELECT id FROM users)").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM lesson_logs WHERE user_id NOT IN (SELECT id FROM users)").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id NOT IN (SELECT id FROM users)").get().n === 0);
  ok("auditoria preservada sem vínculo ao usuário", db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'account_deleted' AND user_id IS NULL").get().n === 1);
}

console.log("Usuário de teste (seed)");
const t = new Client();
const tl = await t.call("POST", "/auth/login", { email: "teste@thefullsculpt.com.br", password: "senha-de-teste-local-1" });
ok("login do usuário de teste => 200", tl.status === 200, JSON.stringify(tl.json));
ok("fase 4, assinatura ativa, 14 aulas, 1840 XP", tl.json?.assignment?.phase === 4 && tl.json?.sub === "active" && tl.json?.log?.length === 14 && tl.json?.xp === 1840);
ok("anamnese do seed decifra", tl.json?.answers?.goal === "sculpt");
ok("pode concluir aula da fase 4", (await t.call("POST", "/lessons/complete", { lessonId: "f4-4", sec: 600, rpe: 6, steps: 10 })).status === 200);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
