// Testes: Estúdio 3D (rig/biomecânica por exercício, versões e rota pública).
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
const admin = new Client();
await admin.login("admin@teste.local");
const anon = new Client();

const key = (p, hipY, lean, handY) => ({ p, hip: { x: -0.1, y: hipY }, lean, headLean: lean * 0.45, hand: { x: 0.3, y: handY } });
const def = (over = {}) => ({
  v: 1,
  lengths: { thigh: 0.45, shank: 0.45, torso: 0.52, uarm: 0.3, farm: 0.27, neck: 0.15 },
  keys: [key(0, 0.965, 0.1, 1.2), key(0.5, 0.75, 0.4, 1.1), key(1, 0.52, 0.65, 1.0)],
  limits: { knee: [0, 140], hip: [0, 130], trunk: [0, 85], elbow: [0, 150], shoulder: [0, 180] },
  checks: [{ joint: "knee", enabled: true, tolerance: 15, weight: 3, cueLow: { pt: "Dobre mais", en: "Bend more", es: "Flexiona más" }, cueHigh: { pt: "Dobre menos", en: "Bend less", es: "Flexiona menos" } }],
  repSeconds: 4,
  ...over,
});

await admin.call("POST", "/admin/method/import-default");
console.log("Estúdio 3D");
const list = await admin.call("GET", "/admin/studio");
ok("lista os exercícios e informa quais têm rig próprio", list.status === 200 && list.json.rows.length >= 5 && list.json.rows.every((r) => r.rig_version === null), JSON.stringify(list.json?.rows?.[0]));
const slug = list.json.rows.find((r) => r.slug === "squat")?.slug ?? list.json.rows[0].slug;
const g0 = await admin.call("GET", `/admin/studio/${slug}`);
ok("exercício sem rig devolve def nula e o tipo padrão", g0.status === 200 && g0.json.def === null && g0.json.history.length === 0 && !!g0.json.motion);
ok("exercício inexistente => 404", (await admin.call("GET", "/admin/studio/nao-existe")).status === 404);
ok("rota pública começa sem rigs", Object.keys((await anon.call("GET", "/motions")).json.rigs).length === 0);

ok("sem versão 3 chaves mínimas => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ keys: [key(0, 0.9, 0.1, 1)] }) })).status === 422);
ok("chaves precisam ir de 0% a 100% => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ keys: [key(0.1, 0.9, 0.1, 1), key(1, 0.5, 0.5, 1)] }) })).json?.error === "rig_keys_range");
ok("chaves repetidas => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ keys: [key(0, 0.9, 0.1, 1), key(0.5, 0.7, 0.2, 1), key(0.5, 0.6, 0.3, 1), key(1, 0.5, 0.5, 1)] }) })).json?.error === "rig_keys_duplicate");
ok("segmento absurdo => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ lengths: { thigh: 5, shank: 0.45, torso: 0.52, uarm: 0.3, farm: 0.27, neck: 0.15 } }) })).status === 422);
ok("posição fora do alcance do espaço => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ keys: [key(0, 9, 0.1, 1), key(1, 0.5, 0.5, 1)] }) })).status === 422);
ok("limite invertido => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ limits: { knee: [100, 10], hip: [0, 130], trunk: [0, 85], elbow: [0, 150], shoulder: [0, 180] } }) })).status === 422);
ok("tolerância inválida => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ checks: [{ joint: "knee", enabled: true, tolerance: 0, weight: 3, cueLow: {}, cueHigh: {} }] }) })).status === 422);
ok("articulação desconhecida => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ checks: [{ joint: "ankle", enabled: true, tolerance: 10, weight: 3, cueLow: {}, cueHigh: {} }] }) })).status === 422);

const s1 = await admin.call("PUT", `/admin/studio/${slug}`, { def: def(), note: "primeira versão" });
ok("salva a v1", s1.status === 200 && s1.json.version === 1);
const pub1 = (await anon.call("GET", "/motions")).json.rigs[slug];
ok("o app recebe o movimento salvo (público, sem login)", pub1 && pub1.keys.length === 3 && pub1.lengths.thigh === 0.45 && pub1.checks[0].cueLow.pt === "Dobre mais");
const s2 = await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ keys: [key(0, 0.965, 0.1, 1.2), key(1, 0.45, 0.7, 1.0)], repSeconds: 5 }), note: "mais profundo" });
const g2 = await admin.call("GET", `/admin/studio/${slug}`);
ok("nova versão vira a atual e o histórico guarda autor e nota", s2.json.version === 2 && g2.json.version === 2 && g2.json.history.length === 2 && g2.json.history[0].is_current === 1 && g2.json.history[0].note === "mais profundo" && !!g2.json.history[0].author, JSON.stringify(g2.json.history));
ok("rota pública reflete a versão atual", (await anon.call("GET", "/motions")).json.rigs[slug].repSeconds === 5);
ok("restaura a v1 como nova versão (v3)", (await admin.call("POST", `/admin/studio/${slug}/restore`, { version: 1 })).json?.version === 3 && (await anon.call("GET", "/motions")).json.rigs[slug].keys.length === 3);
ok("restaurar versão inexistente => 404", (await admin.call("POST", `/admin/studio/${slug}/restore`, { version: 99 })).status === 404);
ok("voltar ao padrão remove o rig do app mas preserva o histórico", (await admin.call("DELETE", `/admin/studio/${slug}`)).status === 200 && !(slug in (await anon.call("GET", "/motions")).json.rigs) && (await admin.call("GET", `/admin/studio/${slug}`)).json.history.length === 3);

console.log("Vídeo de referência");
const vid = (over = {}) => ({ url: "/videos/agachamento.mp4", t0: 1.2, t1: 3.4, t2: 5.6, flip: false, scale: 1.1, ox: 10, oy: -5, opacity: 0.5, heightM: 1.68, ...over });
ok("marcas fora de ordem => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ video: vid({ t1: 0.5 }) }) })).json?.error === "video_marks");
ok("endereço de vídeo inválido (javascript:) => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ video: vid({ url: "javascript:alert(1)" }) }) })).status === 422);
ok("altura da instrutora fora da faixa => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ video: vid({ heightM: 3.5 }) }) })).status === 422);
const sv = await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ video: vid() }), note: "com vídeo" });
const gv = await admin.call("GET", `/admin/studio/${slug}`);
ok("salva vídeo, marcas e calibração junto do rig", sv.status === 200 && gv.json.def.video.t1 === 3.4 && gv.json.def.video.url === "/videos/agachamento.mp4" && gv.json.def.video.flip === false && gv.json.def.video.heightM === 1.68, JSON.stringify(gv.json.def?.video));
ok("o app recebe as marcas junto do movimento", (await anon.call("GET", "/motions")).json.rigs[slug].video.t2 === 5.6);
ok("rig sem vídeo continua válido", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ video: null }) })).status === 200 && (await admin.call("GET", `/admin/studio/${slug}`)).json.def.video === null);
ok("detalhe traz o vídeo cadastrado no exercício (ou nulo)", "video_url" in gv.json);
await admin.call("DELETE", `/admin/studio/${slug}`);

console.log("Músculos ativados");
const mus = (m) => def({ muscles: m });
ok("músculo desconhecido => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: mus({ biceps_x: { role: "primary", level: 100, timing: "hold" } }) })).status === 422);
ok("papel inválido => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: mus({ quads: { role: "mestre", level: 100, timing: "hold" } }) })).status === 422);
ok("intensidade fora de 0–100 => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: mus({ quads: { role: "primary", level: 150, timing: "hold" } }) })).status === 422);
ok("fase inválida => 422", (await admin.call("PUT", `/admin/studio/${slug}`, { def: mus({ quads: { role: "primary", level: 80, timing: "sempre" } }) })).status === 422);
const sm = await admin.call("PUT", `/admin/studio/${slug}`, { def: mus({ calves: { role: "primary", level: 90, timing: "rise" }, abs: { role: "secondary", level: 55, timing: "hold" }, traps: { role: "stabilizer", level: 25, timing: "fall" } }), note: "músculos" });
const gm = await admin.call("GET", `/admin/studio/${slug}`);
ok("salva músculos com papel, intensidade e fase", sm.status === 200 && gm.json.def.muscles.calves.level === 90 && gm.json.def.muscles.calves.timing === "rise" && gm.json.def.muscles.traps.role === "stabilizer", JSON.stringify(gm.json.def?.muscles));
ok("o app recebe os músculos junto do movimento", (await anon.call("GET", "/motions")).json.rigs[slug].muscles.abs.role === "secondary");
const exs = (await admin.call("GET", "/admin/exercises")).json.rows.find((e) => e.slug === slug);
ok("a lista do exercício (Método) é atualizada com os papéis editados", exs.primary_m === "calves" && exs.secondary_m === "abs" && exs.stabilizers_m === "traps", JSON.stringify([exs.primary_m, exs.secondary_m, exs.stabilizers_m]));
const hid = await admin.call("PUT", `/admin/studio/${slug}`, { def: def({ muscles: { quads: { role: "primary", level: 100, timing: "hold" } }, showInactive: false }) });
ok("salva a opção de mostrar só os músculos ativados", hid.status === 200 && (await anon.call("GET", "/motions")).json.rigs[slug].showInactive === false);
ok("por padrão mostra todos os músculos", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def() })).status === 200 && (await anon.call("GET", "/motions")).json.rigs[slug].showInactive === true);
await admin.call("PUT", `/admin/studio/${slug}`, { def: mus({ calves: { role: "primary", level: 90, timing: "rise" }, abs: { role: "secondary", level: 55, timing: "hold" }, traps: { role: "stabilizer", level: 25, timing: "fall" } }), note: "músculos" });
ok("o detalhe do Estúdio traz as listas do exercício", gm.json.primary_m === "calves" && gm.json.secondary_m === "abs");
ok("rig sem músculos (null) não mexe nas listas", (await admin.call("PUT", `/admin/studio/${slug}`, { def: def() })).status === 200 && (await admin.call("GET", "/admin/exercises")).json.rows.find((e) => e.slug === slug).primary_m === "calves");
await admin.call("DELETE", `/admin/studio/${slug}`);

console.log("Permissões");
const aluno = new Client();
await aluno.login("teste@thefullsculpt.com.br");
ok("aluno não acessa o estúdio", (await aluno.call("GET", "/admin/studio")).status === 403);
const view = await admin.call("POST", "/admin/users", { name: "Leitor Metodo", email: `lm${Date.now()}@teste.local`, profile: "custom", permissions: ["method.view"] });
const vc = new Client();
await vc.login((await admin.call("GET", "/admin/users")).json.rows.find((r) => r.name === "Leitor Metodo").email, view.json.tempPassword);
ok("quem só visualiza o método lê mas não salva", (await vc.call("GET", `/admin/studio/${slug}`)).status === 200 && (await vc.call("PUT", `/admin/studio/${slug}`, { def: def() })).status === 403 && (await vc.call("DELETE", `/admin/studio/${slug}`)).status === 403);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
