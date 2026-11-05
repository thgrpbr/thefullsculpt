import type { MotionType, MuscleId, MuscleRole } from "./exercises";
import { LEN, controlsFor, poseFromControls, type Controls, type Lengths, type Pose, type V } from "./pose";

/**
 * Definição do movimento de um exercício (o "rig" editado no Estúdio 3D).
 *  - keys: poses-chave ao longo da repetição (p = 0 início … 1 ponto máximo). Entre elas, interpolação linear.
 *  - lengths: comprimento dos segmentos do corpo.
 *  - limits: amplitude articular aceitável (graus) — o Estúdio avisa quando uma pose passa dos limites.
 *  - checks: regras para a futura correção por câmera (MediaPipe): quanto cada ângulo pode divergir da referência.
 */
export type JointAngle = "knee" | "hip" | "trunk" | "elbow" | "shoulder";
export const JOINTS: JointAngle[] = ["knee", "hip", "trunk", "elbow", "shoulder"];

export interface Key {
  p: number;
  hip: V;
  lean: number; // rad
  headLean: number; // rad
  hand: V;
}
export interface Check {
  joint: JointAngle;
  enabled: boolean;
  tolerance: number; // graus
  weight: number; // 1–5, peso na nota final
  cueLow: Record<"pt" | "en" | "es", string>; // medido ABAIXO da referência
  cueHigh: Record<"pt" | "en" | "es", string>; // medido ACIMA da referência
}
/** Vídeo da instrutora usado como referência: marcas de tempo da repetição e calibração do traçado. */
export interface VideoRef {
  url: string;
  t0: number; // início da repetição (s)
  t1: number; // ponto máximo (s)
  t2: number; // fim da repetição (s)
  flip: boolean; // vídeo voltado para a esquerda
  scale: number;
  ox: number;
  oy: number;
  opacity: number;
  heightM: number; // altura da instrutora (m), para calibrar a escala
}
export const defaultVideo = (url = ""): VideoRef => ({ url, t0: 0, t1: 2, t2: 4, flip: false, scale: 1, ox: 0, oy: 0, opacity: 0.6, heightM: 1.7 });

/** Ativação de um músculo: papel, intensidade (0–100) e em que fase da repetição é mais exigido. */
export type MuscleTiming = "hold" | "rise" | "fall";
export interface MuscleAct {
  role: MuscleRole;
  level: number;
  timing: MuscleTiming;
}
export type MuscleMap = Partial<Record<MuscleId, MuscleAct>>;
export const MUSCLE_IDS: MuscleId[] = ["quads", "hamstrings", "glutes", "calves", "abs", "erector", "lats", "pecs", "traps", "deltoids", "biceps", "triceps"];
export const ROLE_LEVEL: Record<MuscleRole, number> = { primary: 100, secondary: 60, stabilizer: 30 };
export const TIMING_LABEL: Record<MuscleTiming, string> = { hold: "Constante", rise: "Mais forte na subida/esforço", fall: "Mais forte na descida/alongamento" };

/** Monta o mapa de ativação a partir das listas do exercício (principais, auxiliares, estabilizadores). */
export function musclesFromLists(primary: string[], secondary: string[], stabilizers: string[]): MuscleMap {
  const m: MuscleMap = {};
  const put = (ids: string[], role: MuscleRole) => ids.forEach((id) => {
    if ((MUSCLE_IDS as string[]).includes(id)) m[id as MuscleId] = { role, level: ROLE_LEVEL[role], timing: "hold" };
  });
  put(stabilizers, "stabilizer");
  put(secondary, "secondary");
  put(primary, "primary");
  return m;
}

/** Fator de ativação ao longo da repetição (p: 0 início … 1 ponto máximo). */
export function timingFactor(t: MuscleTiming, p: number): number {
  return t === "rise" ? 0.3 + 0.7 * p : t === "fall" ? 0.3 + 0.7 * (1 - p) : 1;
}

export interface MotionDef {
  v: 1;
  video?: VideoRef | null;
  /** músculos ativados neste exercício (null/ausente = usa a lista do exercício) */
  muscles?: MuscleMap | null;
  /** false = só aparecem os músculos ativados (os demais ficam ocultos) */
  showInactive?: boolean;
  lengths: Lengths;
  keys: Key[];
  limits: Record<JointAngle, [number, number]>;
  checks: Check[];
  repSeconds: number;
}

export const JOINT_LABEL: Record<JointAngle, string> = { knee: "Joelho (flexão)", hip: "Quadril (flexão)", trunk: "Tronco (inclinação)", elbow: "Cotovelo (flexão)", shoulder: "Ombro (elevação)" };

/** Pontos do MediaPipe Pose (33 landmarks) usados para medir cada ângulo — lado esquerdo/direito. */
export const MEDIAPIPE_MAP: Record<JointAngle, { description: string; left: number[]; right: number[]; vertex: number }> = {
  knee: { description: "ângulo interno em joelho: 180° − ∠(quadril, joelho, tornozelo)", left: [23, 25, 27], right: [24, 26, 28], vertex: 1 },
  hip: { description: "180° − ∠(ombro, quadril, joelho)", left: [11, 23, 25], right: [12, 24, 26], vertex: 1 },
  trunk: { description: "inclinação do segmento quadril→ombro em relação à vertical", left: [23, 11], right: [24, 12], vertex: 0 },
  elbow: { description: "180° − ∠(ombro, cotovelo, punho)", left: [11, 13, 15], right: [12, 14, 16], vertex: 1 },
  shoulder: { description: "∠(quadril, ombro, cotovelo)", left: [23, 11, 13], right: [24, 12, 14], vertex: 1 },
};

const DEFAULT_LIMITS: MotionDef["limits"] = { knee: [0, 140], hip: [0, 130], trunk: [0, 85], elbow: [0, 150], shoulder: [0, 180] };
const DEFAULT_CUES: Record<JointAngle, { low: Record<"pt" | "en" | "es", string>; high: Record<"pt" | "en" | "es", string> }> = {
  knee: { low: { pt: "Dobre mais os joelhos.", en: "Bend your knees more.", es: "Flexiona más las rodillas." }, high: { pt: "Dobre menos os joelhos.", en: "Bend your knees less.", es: "Flexiona menos las rodillas." } },
  hip: { low: { pt: "Leve mais o quadril para trás.", en: "Push your hips back more.", es: "Lleva más la cadera atrás." }, high: { pt: "Não exagere na flexão do quadril.", en: "Don't over-hinge at the hips.", es: "No exageres la flexión de cadera." } },
  trunk: { low: { pt: "Incline um pouco mais o tronco.", en: "Lean your torso a bit more.", es: "Inclina un poco más el torso." }, high: { pt: "Mantenha o tronco mais ereto.", en: "Keep your torso more upright.", es: "Mantén el torso más erguido." } },
  elbow: { low: { pt: "Dobre mais os cotovelos.", en: "Bend your elbows more.", es: "Flexiona más los codos." }, high: { pt: "Estenda mais os cotovelos.", en: "Extend your elbows more.", es: "Extiende más los codos." } },
  shoulder: { low: { pt: "Eleve mais os braços.", en: "Raise your arms higher.", es: "Eleva más los brazos." }, high: { pt: "Não eleve tanto os braços.", en: "Don't raise your arms so high.", es: "No eleves tanto los brazos." } },
};

const KEY_PS = [0, 0.25, 0.5, 0.75, 1];
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Movimento padrão do app expresso como poses-chave (o Estúdio parte dele, sem mudar nada visualmente). */
export function defaultDef(type: MotionType, depth: number): MotionDef {
  const keys: Key[] = KEY_PS.map((p) => {
    const c = controlsFor(type, depth, p);
    return { p, hip: { x: r4(c.hip.x), y: r4(c.hip.y) }, lean: r4(c.lean), headLean: r4(c.headLean), hand: { x: r4(c.hand.x), y: r4(c.hand.y) } };
  });
  const active: JointAngle[] = type === "press" || type === "raise" ? ["elbow", "shoulder", "trunk"] : ["knee", "hip", "trunk"];
  return {
    v: 1,
    lengths: { ...LEN },
    keys,
    limits: JSON.parse(JSON.stringify(DEFAULT_LIMITS)),
    checks: JOINTS.map((j) => ({ joint: j, enabled: active.includes(j), tolerance: j === "trunk" ? 12 : 15, weight: j === "knee" || j === "hip" ? 3 : 2, cueLow: { ...DEFAULT_CUES[j].low }, cueHigh: { ...DEFAULT_CUES[j].high } })),
    repSeconds: 4,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Controles interpolados nas poses-chave. */
export function controlsAt(def: MotionDef, p: number): Controls {
  const ks = def.keys;
  const x = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < ks.length - 2 && x > ks[i + 1].p) i++;
  const a = ks[i];
  const b = ks[i + 1] ?? a;
  const t = b.p === a.p ? 0 : Math.min(1, Math.max(0, (x - a.p) / (b.p - a.p)));
  return {
    hip: { x: lerp(a.hip.x, b.hip.x, t), y: lerp(a.hip.y, b.hip.y, t) },
    lean: lerp(a.lean, b.lean, t),
    headLean: lerp(a.headLean, b.headLean, t),
    hand: { x: lerp(a.hand.x, b.hand.x, t), y: lerp(a.hand.y, b.hand.y, t) },
  };
}

export function poseFromDef(def: MotionDef, p: number): Pose {
  return poseFromControls(controlsAt(def, p), def.lengths);
}
export function poseFromKey(def: MotionDef, k: Key): Pose {
  return poseFromControls({ hip: k.hip, lean: k.lean, headLean: k.headLean, hand: k.hand }, def.lengths);
}

/** Curvas de ângulo de referência (o que o aluno deve reproduzir). */
export function referenceCurves(def: MotionDef, n = 41): { p: number[]; angles: Record<JointAngle, number[]> } {
  const out = { p: [] as number[], angles: { knee: [], hip: [], trunk: [], elbow: [], shoulder: [] } as Record<JointAngle, number[]> };
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const m = poseFromDef(def, p).metrics;
    out.p.push(r4(p));
    for (const j of JOINTS) out.angles[j].push(m[j]);
  }
  return out;
}

/** Avisos quando alguma pose passa da amplitude articular definida. */
export function limitWarnings(def: MotionDef): string[] {
  const w: string[] = [];
  const seen = new Set<string>();
  const c = referenceCurves(def, 41);
  for (const j of JOINTS) {
    const [lo, hi] = def.limits[j];
    c.angles[j].forEach((v, i) => {
      if ((v < lo || v > hi) && !seen.has(j)) {
        seen.add(j);
        w.push(`${JOINT_LABEL[j]}: ${v}° em ${Math.round(c.p[i] * 100)}% da repetição (limite ${lo}–${hi}°).`);
      }
    });
  }
  // braço/perna esticados além do alcance
  for (const k of def.keys) {
    const pose = poseFromKey(def, k);
    const sh = pose.j.shoulder;
    const reach = Math.hypot(k.hand.x - sh.x, k.hand.y - sh.y);
    if (reach > def.lengths.uarm + def.lengths.farm + 0.005 && !seen.has("reach")) {
      seen.add("reach");
      w.push(`A mão está além do alcance do braço em ${Math.round(k.p * 100)}% (o braço estica ao máximo).`);
    }
    if (Math.hypot(k.hip.x - pose.j.ankle.x, k.hip.y - pose.j.ankle.y) > def.lengths.thigh + def.lengths.shank + 0.005 && !seen.has("leg")) {
      seen.add("leg");
      w.push(`O quadril está além do alcance da perna em ${Math.round(k.p * 100)}%.`);
    }
  }
  return w;
}

/** Pacote de referência para o comparador por câmera (MediaPipe). */
export function exportReference(slug: string, def: MotionDef) {
  const curves = referenceCurves(def, 101);
  return {
    format: "tfs-motion-reference/1",
    exercise: slug,
    repSeconds: def.repSeconds,
    video: def.video ? { url: def.video.url, t0: def.video.t0, t1: def.video.t1, t2: def.video.t2 } : null,
    note: "p vai de 0 (início) ao ponto máximo (1) e volta; compare o ângulo medido pelo MediaPipe com angles[joint] na fase da repetição.",
    mediapipe: { model: "pose_landmarker", landmarks: MEDIAPIPE_MAP },
    curves,
    checks: def.checks.filter((c) => c.enabled),
    limits: def.limits,
  };
}
