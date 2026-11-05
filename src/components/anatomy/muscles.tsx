"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { EXERCISES, muscleRole, type MuscleId, type MuscleRole } from "@/lib/exercises";
import { timingFactor, type MotionDef } from "@/lib/motion";
import { ARM_Z, Anchored, FRONT, LEG_Z, TENDON, type PoseRef, type Seg } from "./shared";

export type Layer = "skin" | "muscle" | "skeleton";

export const ROLE_COLOR: Record<MuscleRole, string> = { primary: "#E2563B", secondary: "#C79A68", stabilizer: "#8C877E" };
const IDLE = "#8a5148";

interface MuscleDef {
  id: MuscleId;
  seg: Seg;
  t: number;
  off: number;
  zs: number[];
  size: [number, number, number];
  shape?: "fus" | "ball";
  /** posição do ventre (0 = perto de A, 1 = perto de B) */
  belly?: number;
  tilt?: number;
}

const F = FRONT; // frente do corpo = −x no espaço local dos segmentos que apontam para baixo
const LZ = LEG_Z;

/** Cada músculo com suas cabeças/porções, para uma silhueta mais próxima da anatomia real. */
const MUSCLES: MuscleDef[] = [
  // quadríceps: reto femoral, vasto lateral, vasto medial
  { id: "quads", seg: "thigh", t: 0.45, off: -F * 0.058, zs: LZ, size: [0.03, 0.2, 0.031], belly: 0.45 },
  { id: "quads", seg: "thigh", t: 0.5, off: -F * 0.045, zs: [-0.15, 0.15], size: [0.037, 0.19, 0.04], belly: 0.5 },
  { id: "quads", seg: "thigh", t: 0.76, off: -F * 0.044, zs: [-0.056, 0.056], size: [0.034, 0.115, 0.032], belly: 0.66 },
  // posteriores: bíceps femoral e semitendíneo/semimembranáceo
  { id: "hamstrings", seg: "thigh", t: 0.48, off: F * 0.062, zs: [-0.13, 0.13], size: [0.032, 0.18, 0.032], belly: 0.42 },
  { id: "hamstrings", seg: "thigh", t: 0.48, off: F * 0.062, zs: [-0.075, 0.075], size: [0.034, 0.18, 0.03], belly: 0.4 },
  // panturrilha: gastrocnêmio (duas cabeças) e sóleo
  { id: "calves", seg: "shank", t: 0.24, off: F * 0.052, zs: [-0.128, 0.128], size: [0.036, 0.125, 0.032], belly: 0.38 },
  { id: "calves", seg: "shank", t: 0.24, off: F * 0.052, zs: [-0.072, 0.072], size: [0.036, 0.125, 0.032], belly: 0.38 },
  { id: "calves", seg: "shank", t: 0.44, off: F * 0.038, zs: LZ, size: [0.03, 0.11, 0.036], belly: 0.4 },
  // glúteos: máximo e médio
  { id: "glutes", seg: "torso", t: 0.96, off: F * 0.082, zs: [-0.07, 0.07], size: [0.07, 0.1, 0.085], shape: "ball" },
  { id: "glutes", seg: "torso", t: 0.88, off: F * 0.066, zs: [-0.112, 0.112], size: [0.044, 0.055, 0.05], shape: "ball" },
  // abdômen: reto abdominal em gomos e oblíquos
  { id: "abs", seg: "torso", t: 0.6, off: -F * 0.098, zs: [-0.032, 0.032], size: [0.02, 0.046, 0.034], shape: "ball" },
  { id: "abs", seg: "torso", t: 0.72, off: -F * 0.098, zs: [-0.032, 0.032], size: [0.02, 0.046, 0.034], shape: "ball" },
  { id: "abs", seg: "torso", t: 0.84, off: -F * 0.095, zs: [-0.032, 0.032], size: [0.02, 0.046, 0.034], shape: "ball" },
  { id: "abs", seg: "torso", t: 0.7, off: -F * 0.06, zs: [-0.128, 0.128], size: [0.024, 0.13, 0.045], belly: 0.5 },
  // eretores da espinha
  { id: "erector", seg: "torso", t: 0.62, off: F * 0.1, zs: [-0.04, 0.04], size: [0.03, 0.2, 0.034], belly: 0.5 },
  { id: "erector", seg: "torso", t: 0.86, off: F * 0.098, zs: [-0.036, 0.036], size: [0.026, 0.1, 0.03], belly: 0.5 },
  // dorsais
  { id: "lats", seg: "torso", t: 0.4, off: F * 0.095, zs: [-0.105, 0.105], size: [0.028, 0.18, 0.085], belly: 0.55, tilt: 0.0 },
  // peitorais: porção clavicular, esternal e abdominal
  { id: "pecs", seg: "torso", t: 0.2, off: -F * 0.108, zs: [-0.078, 0.078], size: [0.03, 0.07, 0.08], shape: "ball" },
  { id: "pecs", seg: "torso", t: 0.13, off: -F * 0.104, zs: [-0.075, 0.075], size: [0.026, 0.045, 0.072], shape: "ball" },
  { id: "pecs", seg: "torso", t: 0.27, off: -F * 0.098, zs: [-0.07, 0.07], size: [0.026, 0.045, 0.07], shape: "ball" },
  // trapézio: superior e médio
  { id: "traps", seg: "torso", t: 0.05, off: F * 0.07, zs: [-0.075, 0.075], size: [0.036, 0.075, 0.075], shape: "ball" },
  { id: "traps", seg: "torso", t: 0.15, off: F * 0.098, zs: [-0.05, 0.05], size: [0.028, 0.075, 0.06], shape: "ball" },
  // deltoide: anterior, lateral e posterior
  { id: "deltoids", seg: "uarm", t: 0.1, off: -F * 0.036, zs: ARM_Z, size: [0.03, 0.075, 0.036], belly: 0.45 },
  { id: "deltoids", seg: "uarm", t: 0.1, off: F * 0.036, zs: ARM_Z, size: [0.03, 0.075, 0.036], belly: 0.45 },
  { id: "deltoids", seg: "uarm", t: 0.1, off: 0, zs: [-0.234, 0.234], size: [0.034, 0.08, 0.036], belly: 0.45 },
  // bíceps: cabeça curta e longa
  { id: "biceps", seg: "uarm", t: 0.5, off: -F * 0.044, zs: [-0.186, 0.186], size: [0.028, 0.105, 0.03], belly: 0.5 },
  { id: "biceps", seg: "uarm", t: 0.5, off: -F * 0.044, zs: [-0.214, 0.214], size: [0.028, 0.1, 0.03], belly: 0.5 },
  // tríceps: cabeça longa, lateral e medial
  { id: "triceps", seg: "uarm", t: 0.5, off: F * 0.044, zs: ARM_Z, size: [0.034, 0.115, 0.036], belly: 0.45 },
  { id: "triceps", seg: "uarm", t: 0.52, off: F * 0.028, zs: [-0.228, 0.228], size: [0.026, 0.1, 0.03], belly: 0.45 },
  { id: "triceps", seg: "uarm", t: 0.52, off: F * 0.03, zs: [-0.172, 0.172], size: [0.024, 0.09, 0.028], belly: 0.45 },
];

/** Tendões: pontas claras e finas ligando o músculo ao osso. */
const TENDONS: { seg: Seg; t: number; off: number; zs: number[]; len: number; r: number }[] = [
  { seg: "thigh", t: 0.95, off: -F * 0.042, zs: LZ, len: 0.1, r: 0.011 },
  { seg: "shank", t: 0.07, off: -F * 0.034, zs: LZ, len: 0.1, r: 0.009 },
  { seg: "shank", t: 0.82, off: F * 0.034, zs: LZ, len: 0.2, r: 0.0085 },
  { seg: "thigh", t: 0.95, off: F * 0.044, zs: [-0.1, 0.1], len: 0.09, r: 0.008 },
  { seg: "uarm", t: 0.93, off: -F * 0.03, zs: ARM_Z, len: 0.09, r: 0.006 },
  { seg: "uarm", t: 0.94, off: F * 0.036, zs: ARM_Z, len: 0.09, r: 0.007 },
];

/** Perfil fusiforme com ventre deslocável (belly) e extremidades afiladas. */
const fusCache = new Map<number, THREE.LatheGeometry>();
function fusGeo(belly = 0.5): THREE.LatheGeometry {
  const key = Math.round(belly * 100);
  let g = fusCache.get(key);
  if (!g) {
    const k = Math.log(0.5) / Math.log(Math.min(0.85, Math.max(0.15, belly)));
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22;
      pts.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(Math.PI * Math.pow(u, k)), 0.72)), -1 + 2 * u));
    }
    g = new THREE.LatheGeometry(pts, 20);
    fusCache.set(key, g);
  }
  return g;
}
let BALL: THREE.SphereGeometry | null = null;
const ball = () => (BALL ??= new THREE.SphereGeometry(1, 22, 16));

/** Textura de fibras musculares (relevo fino ao longo do comprimento). */
let fiberTex: THREE.CanvasTexture | null = null;
function fiber(): THREE.CanvasTexture {
  if (fiberTex) return fiberTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 16);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < 256; x += 2) {
    const v = 90 + Math.floor(rnd() * 90);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1 + Math.floor(rnd() * 2), 16);
  }
  fiberTex = new THREE.CanvasTexture(c);
  fiberTex.wrapS = fiberTex.wrapT = THREE.RepeatWrapping;
  fiberTex.repeat.set(3, 1);
  fiberTex.anisotropy = 4;
  return fiberTex;
}

/** Material do músculo: intensidade (0–100) e fase da repetição variam o brilho em tempo real. */
function MuscleMaterial({ color, opacity, active, hover, act, pRef }: { color: string; opacity: number; active: boolean; hover: boolean; act: { level: number; timing: "hold" | "rise" | "fall" } | null; pRef: MutableRefObject<number> }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const tex = useMemo(() => fiber(), []);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    const lvl = act ? act.level / 100 : 1;
    const f = act ? timingFactor(act.timing, pRef.current) : 1;
    m.emissiveIntensity = hover ? 0.7 : active ? 0.05 + 0.3 * lvl * f : 0;
    m.opacity = active ? opacity * (0.55 + 0.45 * lvl) : opacity;
  });
  return <meshStandardMaterial ref={mat} color={color} transparent opacity={opacity} roughness={0.42} metalness={0.03} bumpMap={tex} bumpScale={0.9} emissive={active ? color : "#000000"} emissiveIntensity={active ? 0.25 : 0} depthWrite={opacity > 0.8} />;
}

export function Muscles({ poseRef, pRef, exerciseId, layer, hover, onHover, motionDef, onPick }: {
  poseRef: PoseRef;
  pRef: MutableRefObject<number>;
  exerciseId: string;
  layer: Layer;
  hover: MuscleId | null;
  onHover: (m: MuscleId | null) => void;
  motionDef?: MotionDef | null;
  onPick?: (m: MuscleId) => void;
}) {
  const ex = EXERCISES[exerciseId];
  const custom = motionDef?.muscles ?? null;
  const hideIdle = motionDef?.showInactive === false;
  return (
    <>
      {MUSCLES.map((m, mi) => {
        const act = custom ? custom[m.id] ?? null : null;
        const role = custom ? (act?.role ?? null) : muscleRole(ex, m.id);
        if (layer !== "muscle" && !role) return null;
        if (hideIdle && !role) return null;
        const active = !!role;
        const base = new THREE.Color(role ? ROLE_COLOR[role] : IDLE).offsetHSL(0, 0, ((mi % 3) - 1) * 0.022).getStyle();
        const opacity = layer === "muscle" ? (active ? 0.96 : 0.62) : layer === "skin" ? 0.85 : 0.5;
        const isHover = hover === m.id;
        return m.zs.map((z) => (
          <Anchored key={`${mi}-${z}`} poseRef={poseRef} seg={m.seg} t={m.t} off={m.off} z={z}>
            <mesh
              geometry={m.shape === "ball" ? ball() : fusGeo(m.belly)}
              rotation={[0, 0, m.tilt ?? 0]}
              scale={m.size.map((s) => s * (isHover ? 1.14 : 1)) as [number, number, number]}
              onClick={onPick ? (e) => { e.stopPropagation(); onPick(m.id); } : undefined}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover(m.id);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                onHover(null);
                document.body.style.cursor = "";
              }}
            >
              <MuscleMaterial color={base} opacity={opacity} active={active} hover={isHover} act={act} pRef={pRef} />
            </mesh>
          </Anchored>
        ));
      })}
      {layer === "muscle" && TENDONS.map((t, i) => t.zs.map((z) => (
        <Anchored key={`t${i}-${z}`} poseRef={poseRef} seg={t.seg} t={t.t} off={t.off} z={z}>
          <mesh>
            <cylinderGeometry args={[t.r * 0.8, t.r, t.len, 8]} />
            <meshStandardMaterial color={TENDON} roughness={0.5} transparent opacity={0.9} />
          </mesh>
        </Anchored>
      )))}
    </>
  );
}
