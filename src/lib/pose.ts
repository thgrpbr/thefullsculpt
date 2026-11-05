import type { MotionType } from "./exercises";

export interface V {
  x: number;
  y: number;
}

/** Comprimentos dos segmentos (m) — figura de ~1,75 m, vista lateral (x = frente, y = cima). */
export const LEN = { thigh: 0.45, shank: 0.45, torso: 0.52, uarm: 0.3, farm: 0.27, neck: 0.15 };

export const ANKLE: V = { x: 0, y: 0.08 };
const HEEL: V = { x: -0.07, y: 0 };
const TOE: V = { x: 0.18, y: 0 };

export type JointName =
  | "head"
  | "neck"
  | "hip"
  | "knee"
  | "ankle"
  | "heel"
  | "toe"
  | "shoulder"
  | "elbow"
  | "wrist";

export interface Pose {
  j: Record<JointName, V>;
  /** alvos da cinemática inversa (pé fixo no chão, mão guiada) */
  targets: { foot: V; hand: V };
  metrics: { knee: number; hip: number; trunk: number; elbow: number; shoulder: number };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: V, b: V, t: number): V => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** Cinemática inversa de 2 ossos (lei dos cossenos). `side` escolhe para que lado a articulação dobra. */
export function ik2(root: V, target: V, l1: number, l2: number, side: 1 | -1): V {
  let dx = target.x - root.x;
  let dy = target.y - root.y;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 1e-4;
  if (d > max) {
    const k = max / d;
    dx *= k;
    dy *= k;
    d = max;
  }
  d = Math.max(d, Math.abs(l1 - l2) + 1e-4);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;
  const py = ux;
  return {
    x: root.x + l1 * (Math.cos(A) * ux + side * Math.sin(A) * px),
    y: root.y + l1 * (Math.cos(A) * uy + side * Math.sin(A) * py),
  };
}

const angleBetween = (a: V, b: V) => {
  const dot = a.x * b.x + a.y * b.y;
  const m = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  return (Math.acos(clamp(dot / (m || 1), -1, 1)) * 180) / Math.PI;
};

const STAND_HIP: V = { x: -0.01, y: 0.965 };

/** Comprimentos dos segmentos editáveis no Estúdio. */
export type Lengths = typeof LEN;

/**
 * Parâmetros que definem uma pose (o "rig" de controle): quadril, inclinação do tronco, da cabeça e alvo da mão.
 * Pé fixo no chão; joelho e cotovelo saem da cinemática inversa. Coordenadas em metros, origem no chão sob o tornozelo.
 */
export interface Controls {
  hip: V;
  lean: number;
  headLean: number;
  hand: V;
}

const HEAD_LEN = 0.17;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Controles do movimento padrão de cada tipo. p: 0 (posição inicial) → 1 (ponto máximo). */
export function controlsFor(type: MotionType, depth: number, p: number, L: Lengths = LEN): Controls {
  const e = p * depth;
  let hip: V = STAND_HIP;
  let lean = 0.08;

  if (type === "squat") {
    hip = lerpV(STAND_HIP, { x: -0.34, y: 0.52 }, e);
    lean = 0.12 + 0.55 * e;
  } else if (type === "hinge") {
    hip = lerpV(STAND_HIP, { x: -0.28, y: 0.86 }, e);
    lean = 0.1 + 1.2 * e;
  } else if (type === "press") {
    lean = 0.05;
  } else {
    lean = 0.04;
  }

  const shoulder: V = { x: hip.x + L.torso * Math.sin(lean), y: hip.y + L.torso * Math.cos(lean) };
  let hand: V;
  if (type === "squat") {
    hand = { x: shoulder.x + 0.4, y: shoulder.y - 0.06 };
  } else if (type === "hinge") {
    hand = { x: shoulder.x + 0.03, y: shoulder.y - 0.52 };
  } else if (type === "press") {
    const rack: V = { x: shoulder.x + 0.14, y: shoulder.y + 0.06 };
    const top: V = { x: shoulder.x + 0.02, y: shoulder.y + 0.56 };
    hand = lerpV(rack, top, p);
  } else {
    const phi = p * (Math.PI / 2) * 0.97;
    hand = { x: shoulder.x + 0.55 * Math.sin(phi), y: shoulder.y - 0.55 * Math.cos(phi) };
  }
  return { hip, lean, headLean: lean * 0.45, hand };
}

/** Resolve a pose a partir dos controles (cinemática inversa para joelho e cotovelo). */
export function poseFromControls(c: Controls, L: Lengths = LEN): Pose {
  const { hip, lean, headLean, hand } = c;
  const knee = ik2(ANKLE, hip, L.shank, L.thigh, -1);
  const neck: V = { x: hip.x + L.torso * Math.sin(lean), y: hip.y + L.torso * Math.cos(lean) };
  const head: V = { x: neck.x + HEAD_LEN * Math.sin(headLean), y: neck.y + HEAD_LEN * Math.cos(headLean) };
  const shoulder = neck;

  const elbow = ik2(shoulder, hand, L.uarm, L.farm, -1);
  // punho = ponto real alcançado (respeita limite do braço)
  const reach = Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y);
  const max = L.uarm + L.farm - 1e-4;
  const wrist: V =
    reach > max
      ? { x: shoulder.x + ((hand.x - shoulder.x) * max) / reach, y: shoulder.y + ((hand.y - shoulder.y) * max) / reach }
      : hand;

  const kneeFlex = 180 - angleBetween({ x: hip.x - knee.x, y: hip.y - knee.y }, { x: ANKLE.x - knee.x, y: ANKLE.y - knee.y });
  const hipFlex = 180 - angleBetween({ x: neck.x - hip.x, y: neck.y - hip.y }, { x: knee.x - hip.x, y: knee.y - hip.y });
  const elbowFlex = 180 - angleBetween({ x: shoulder.x - elbow.x, y: shoulder.y - elbow.y }, { x: wrist.x - elbow.x, y: wrist.y - elbow.y });
  const shoulderAng = angleBetween({ x: hip.x - shoulder.x, y: hip.y - shoulder.y }, { x: elbow.x - shoulder.x, y: elbow.y - shoulder.y });

  return {
    j: { head, neck, hip, knee, ankle: ANKLE, heel: HEEL, toe: TOE, shoulder, elbow, wrist },
    targets: { foot: ANKLE, hand },
    metrics: { knee: Math.round(kneeFlex), hip: Math.round(hipFlex), trunk: Math.round(toDeg(lean)), elbow: Math.round(elbowFlex), shoulder: Math.round(shoulderAng) },
  };
}

/** p: 0 (posição inicial) → 1 (ponto máximo do movimento). */
export function computePose(type: MotionType, depth: number, p: number): Pose {
  return poseFromControls(controlsFor(type, depth, p));
}

/** Onda suave com pequena pausa nos extremos. */
export function wave(t: number): number {
  const ph = t - Math.floor(t);
  const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const s = clamp((tri - 0.08) / 0.84, 0, 1);
  return s * s * (3 - 2 * s);
}

export const REP_SECONDS = 4;
