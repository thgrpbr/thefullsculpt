"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useSyncExternalStore, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import { EXERCISES, muscleRole, type MuscleId, type MuscleRole } from "@/lib/exercises";
import { REP_SECONDS, computePose, wave, type JointName, type Pose } from "@/lib/pose";
import { poseFromDef, timingFactor, type MotionDef } from "@/lib/motion";

export type Layer = "skin" | "muscle" | "skeleton";
export type ViewPreset = "side" | "front" | "angle";

interface Props {
  exerciseId: string;
  playing: boolean;
  layer: Layer;
  showIK: boolean;
  view: ViewPreset;
  resetKey?: number | string;
  speed?: number;
  hoverMuscle: MuscleId | null;
  onHover: (m: MuscleId | null) => void;
  onMetrics?: (m: Pose["metrics"]) => void;
  /** movimento personalizado (Estúdio); sem ele usa o padrão do exercício */
  motionDef?: MotionDef | null;
  /** clique em um músculo (Estúdio: pintar o papel) */
  onPickMuscle?: (m: MuscleId) => void;
  /** posição fixa na repetição (0–1), usada pelo Estúdio ao arrastar a linha do tempo */
  scrub?: number | null;
}

type Seg = "torso" | "thigh" | "shank" | "uarm" | "farm" | "neckseg" | "foot";
type PoseRef = MutableRefObject<Pose>;

const SEG: Record<Seg, [JointName, JointName]> = {
  torso: ["neck", "hip"],
  thigh: ["hip", "knee"],
  shank: ["knee", "ankle"],
  uarm: ["shoulder", "elbow"],
  farm: ["elbow", "wrist"],
  neckseg: ["head", "neck"],
  foot: ["heel", "toe"],
};
const SEG_LEN: Record<Seg, number> = { torso: 0.52, thigh: 0.45, shank: 0.45, uarm: 0.3, farm: 0.27, neckseg: 0.17, foot: 0.25 };

const LEG_Z = [-0.1, 0.1];
const ARM_Z = [-0.2, 0.2];

const ROLE_COLOR: Record<MuscleRole, string> = { primary: "#E2563B", secondary: "#C79A68", stabilizer: "#8C877E" };
const IDLE = "#7d4d45";
const BONE = "#F6F3EE";
const BRONZE = "#C79A68";

interface MuscleDef {
  id: MuscleId;
  seg: Seg;
  t: number;
  off: number;
  zs: number[];
  size: [number, number, number]; // [perp, along, z] (semi-eixos)
  shape?: "fus" | "ball";
  tilt?: number; // inclinação extra (rad) no plano do segmento
}

const MUSCLES: MuscleDef[] = [
  // coxa: reto femoral + vasto lateral + vasto medial
  { id: "quads", seg: "thigh", t: 0.46, off: 0.064, zs: LEG_Z, size: [0.032, 0.19, 0.036], shape: "fus" },
  { id: "quads", seg: "thigh", t: 0.5, off: 0.05, zs: [-0.148, 0.148], size: [0.034, 0.18, 0.036], shape: "fus" },
  { id: "quads", seg: "thigh", t: 0.7, off: 0.046, zs: [-0.056, 0.056], size: [0.036, 0.115, 0.032], shape: "fus" },
  // posteriores: bíceps femoral + semitendíneo/semimembranáceo
  { id: "hamstrings", seg: "thigh", t: 0.5, off: -0.062, zs: [-0.13, 0.13], size: [0.032, 0.18, 0.032], shape: "fus" },
  { id: "hamstrings", seg: "thigh", t: 0.5, off: -0.062, zs: [-0.075, 0.075], size: [0.034, 0.18, 0.03], shape: "fus" },
  // panturrilha: gastrocnêmio (duas cabeças) + sóleo
  { id: "calves", seg: "shank", t: 0.24, off: -0.052, zs: [-0.128, 0.128], size: [0.036, 0.125, 0.032], shape: "fus" },
  { id: "calves", seg: "shank", t: 0.24, off: -0.052, zs: [-0.072, 0.072], size: [0.036, 0.125, 0.032], shape: "fus" },
  { id: "glutes", seg: "torso", t: 0.95, off: -0.082, zs: [-0.07, 0.07], size: [0.07, 0.1, 0.085], shape: "ball" },
  // abdômen: reto abdominal em gomos
  { id: "abs", seg: "torso", t: 0.6, off: 0.098, zs: [-0.032, 0.032], size: [0.02, 0.046, 0.034], shape: "ball" },
  { id: "abs", seg: "torso", t: 0.72, off: 0.098, zs: [-0.032, 0.032], size: [0.02, 0.046, 0.034], shape: "ball" },
  { id: "abs", seg: "torso", t: 0.84, off: 0.095, zs: [-0.032, 0.032], size: [0.02, 0.046, 0.034], shape: "ball" },
  { id: "erector", seg: "torso", t: 0.64, off: -0.1, zs: [-0.04, 0.04], size: [0.03, 0.2, 0.034], shape: "fus" },
  { id: "lats", seg: "torso", t: 0.38, off: -0.095, zs: [-0.105, 0.105], size: [0.03, 0.17, 0.085], shape: "fus" },
  { id: "pecs", seg: "torso", t: 0.21, off: 0.108, zs: [-0.075, 0.075], size: [0.03, 0.075, 0.08], shape: "ball" },
  { id: "traps", seg: "torso", t: 0.07, off: -0.085, zs: [-0.06, 0.06], size: [0.036, 0.1, 0.085], shape: "ball" },
  { id: "deltoids", seg: "uarm", t: 0.1, off: 0, zs: ARM_Z, size: [0.058, 0.085, 0.06], shape: "ball" },
  { id: "biceps", seg: "uarm", t: 0.52, off: 0.043, zs: ARM_Z, size: [0.032, 0.105, 0.034], shape: "fus" },
  { id: "triceps", seg: "uarm", t: 0.5, off: -0.043, zs: ARM_Z, size: [0.034, 0.11, 0.038], shape: "fus" },
];

/** Perfil fusiforme (ventre central, pontas afiladas) e esfera: geometrias compartilhadas. */
const FUS_GEO = (() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    pts.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(Math.PI * u), 0.72)), -1 + 2 * u));
  }
  return new THREE.LatheGeometry(pts, 16);
})();
const BALL_GEO = new THREE.SphereGeometry(1, 20, 16);

/** Corpo cônico (afunila) ao longo do eixo do segmento: [t (0=topo,1=base), raio]. */
function taperGeometry(len: number, profile: [number, number][]) {
  const pts = profile.map(([t, r]) => new THREE.Vector2(r, -len / 2 + t * len));
  return new THREE.LatheGeometry(pts, 24);
}
const PROFILE: Record<string, [number, number][]> = {
  thigh: [[0, 0.04], [0.04, 0.074], [0.14, 0.088], [0.35, 0.08], [0.65, 0.066], [0.9, 0.054], [1, 0.04]],
  shank: [[0, 0.04], [0.05, 0.052], [0.22, 0.06], [0.45, 0.046], [0.8, 0.034], [1, 0.028]],
  uarm: [[0, 0.03], [0.06, 0.05], [0.3, 0.047], [0.7, 0.04], [1, 0.034]],
  farm: [[0, 0.034], [0.15, 0.042], [0.5, 0.036], [0.85, 0.028], [1, 0.024]],
  torso: [[0, 0.045], [0.04, 0.07], [0.12, 0.1], [0.28, 0.108], [0.5, 0.092], [0.66, 0.084], [0.82, 0.096], [0.95, 0.1], [1, 0.06]],
  neckseg: [[0, 0.034], [0.25, 0.04], [1, 0.05]],
  foot: [[0, 0.034], [0.2, 0.04], [0.7, 0.032], [1, 0.02]],
};

/* ---------- Peças ancoradas num segmento ---------- */

function Anchored({
  poseRef,
  seg,
  t = 0.5,
  off = 0,
  z = 0,
  children,
}: {
  poseRef: PoseRef;
  seg: Seg;
  t?: number;
  off?: number;
  z?: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const [a, b] = SEG[seg];
    const A = poseRef.current.j[a];
    const B = poseRef.current.j[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    g.position.set(A.x + dx * t + (-dy / len) * off, A.y + dy * t + (dx / len) * off, z);
    g.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
  });
  return <group ref={ref}>{children}</group>;
}

function Capsule({ seg, r, color, opacity = 1, scaleZ = 1, ghost = false }: { seg: Seg; r: number; color: string; opacity?: number; scaleZ?: number; ghost?: boolean }) {
  const length = Math.max(0.001, SEG_LEN[seg] - 2 * r);
  return (
    <mesh scale={[1, 1, scaleZ]}>
      <capsuleGeometry args={[r, length, 6, 16]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={!ghost} roughness={0.65} />
    </mesh>
  );
}

function Ball({ r, color, opacity = 1, scale = [1, 1, 1], ghost = false }: { r: number; color: string; opacity?: number; scale?: [number, number, number]; ghost?: boolean }) {
  return (
    <mesh scale={scale}>
      <sphereGeometry args={[r, 20, 16]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={!ghost} roughness={0.65} />
    </mesh>
  );
}

function Taper({ seg, color, opacity = 1, scaleZ = 1, ghost = false }: { seg: Seg; color: string; opacity?: number; scaleZ?: number; ghost?: boolean }) {
  const geo = useMemo(() => taperGeometry(SEG_LEN[seg], PROFILE[seg]), [seg]);
  return (
    <mesh geometry={geo} scale={[1, 1, scaleZ]}>
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={!ghost} roughness={0.7} metalness={0.02} />
    </mesh>
  );
}

function Skin({ poseRef, o = 0.3 }: { poseRef: PoseRef; o?: number }) {
  const c = "#d8d2c8";
  return (
    <>
      {LEG_Z.map((z) => (
        <group key={`l${z}`}>
          <Anchored poseRef={poseRef} seg="thigh" z={z}><Taper seg="thigh" color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="shank" z={z}><Taper seg="shank" color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="foot" z={z}><Taper seg="foot" color={c} opacity={o} scaleZ={1.25} ghost /></Anchored>
        </group>
      ))}
      {ARM_Z.map((z) => (
        <group key={`a${z}`}>
          <Anchored poseRef={poseRef} seg="uarm" z={z}><Taper seg="uarm" color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="farm" z={z}><Taper seg="farm" color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="farm" t={1.1} z={z}><Ball r={0.036} color={c} opacity={o} scale={[0.75, 1.35, 0.55]} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="uarm" t={0} z={z}><Ball r={0.05} color={c} opacity={o} ghost /></Anchored>
        </group>
      ))}
      <Anchored poseRef={poseRef} seg="torso"><Taper seg="torso" color={c} opacity={o} scaleZ={1.62} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={0.02}><Ball r={0.09} color={c} opacity={o} scale={[0.9, 0.5, 2.1]} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={1}><Ball r={0.105} color={c} opacity={o} scale={[1, 0.8, 1.45]} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="neckseg"><Taper seg="neckseg" color={c} opacity={o} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="neckseg" t={-0.28}><Ball r={0.088} color={c} opacity={o} scale={[1, 1.22, 0.95]} ghost /></Anchored>
    </>
  );
}

function Skeleton({ poseRef, ik }: { poseRef: PoseRef; ik: boolean }) {
  const bone = (seg: Seg, z: number, color: string, key: string) => (
    <Anchored key={key} poseRef={poseRef} seg={seg} z={z}>
      <Capsule seg={seg} r={0.012} color={color} />
    </Anchored>
  );
  const joint = (seg: Seg, t: number, z: number, color: string, key: string) => (
    <Anchored key={key} poseRef={poseRef} seg={seg} t={t} z={z}>
      <Ball r={0.026} color={color} />
    </Anchored>
  );
  const chain = ik ? BRONZE : BONE;
  return (
    <>
      {bone("torso", 0, BONE, "spine")}
      {bone("neckseg", 0, BONE, "neck")}
      <Anchored poseRef={poseRef} seg="neckseg" t={-0.28}><Ball r={0.088} color={BONE} opacity={0.3} scale={[1, 1.22, 0.95]} ghost /></Anchored>
      {[0.16, 0.23, 0.3, 0.37, 0.44].map((t, i) => (
        <Anchored key={`rib${i}`} poseRef={poseRef} seg="torso" t={t}>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1.55, 1]}>
            <torusGeometry args={[0.092 - Math.abs(i - 1.5) * 0.004, 0.0065, 6, 24]} />
            <meshStandardMaterial color={BONE} transparent opacity={0.8} />
          </mesh>
        </Anchored>
      ))}
      <Anchored poseRef={poseRef} seg="torso" t={0.97}>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1.5, 1]}>
          <torusGeometry args={[0.08, 0.012, 6, 24]} />
          <meshStandardMaterial color={BONE} transparent opacity={0.85} />
        </mesh>
      </Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={0}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.012, 0.38, 4, 8]} /><meshStandardMaterial color={BONE} /></mesh>
      </Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={1}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.012, 0.18, 4, 8]} /><meshStandardMaterial color={BONE} /></mesh>
      </Anchored>
      {LEG_Z.map((z) => [
        bone("thigh", z, chain, `th${z}`),
        bone("shank", z, chain, `sh${z}`),
        bone("foot", z, BONE, `ft${z}`),
        joint("thigh", 0, z, BONE, `hj${z}`),
        joint("thigh", 1, z, BONE, `kj${z}`),
        joint("shank", 1, z, BONE, `aj${z}`),
      ])}
      {ARM_Z.map((z) => [
        bone("uarm", z, chain, `ua${z}`),
        bone("farm", z, chain, `fa${z}`),
        joint("uarm", 0, z, BONE, `sj${z}`),
        joint("uarm", 1, z, BONE, `ej${z}`),
        joint("farm", 1, z, BONE, `wj${z}`),
      ])}
    </>
  );
}

function Muscles({
  poseRef,
  pRef,
  exerciseId,
  layer,
  hover,
  onHover,
  motionDef,
  onPick,
}: {
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
  return (
    <>
      {MUSCLES.map((m, mi) => {
        const act = custom ? custom[m.id] ?? null : null;
        const role = custom ? (act?.role ?? null) : muscleRole(ex, m.id);
        if (layer !== "muscle" && !role) return null;
        const active = !!role;
        const color = role ? ROLE_COLOR[role] : IDLE;
        const opacity = layer === "muscle" ? (active ? 0.95 : 0.6) : layer === "skin" ? 0.85 : 0.5;
        const isHover = hover === m.id;
        return m.zs.map((z) => (
          <Anchored key={`${mi}-${z}`} poseRef={poseRef} seg={m.seg} t={m.t} off={m.off} z={z}>
            <mesh
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
              <primitive object={m.shape === "ball" ? BALL_GEO : FUS_GEO} attach="geometry" />
              <MuscleMaterial color={color} opacity={opacity} active={active} hover={isHover} act={act} pRef={pRef} />
            </mesh>
          </Anchored>
        ));
      })}
    </>
  );
}

/** Material do músculo: intensidade (0–100) e fase da repetição variam o brilho em tempo real. */
function MuscleMaterial({ color, opacity, active, hover, act, pRef }: { color: string; opacity: number; active: boolean; hover: boolean; act: { level: number; timing: "hold" | "rise" | "fall" } | null; pRef: MutableRefObject<number> }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    const lvl = act ? act.level / 100 : 1;
    const f = act ? timingFactor(act.timing, pRef.current) : 1;
    m.emissiveIntensity = hover ? 0.7 : active ? 0.06 + 0.32 * lvl * f : 0;
    m.opacity = active ? opacity * (0.55 + 0.45 * lvl) : opacity;
  });
  return <meshStandardMaterial ref={mat} color={color} transparent opacity={opacity} roughness={0.5} emissive={active ? color : "#000000"} emissiveIntensity={active ? 0.28 : 0} depthWrite={opacity > 0.8} />;
}

function IKMarkers({ poseRef }: { poseRef: PoseRef }) {
  const hands = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const h = poseRef.current.targets.hand;
    hands.current.forEach((m) => m?.position.set(h.x, h.y, m.position.z));
  });
  return (
    <>
      {LEG_Z.map((z) => (
        <mesh key={`f${z}`} position={[0, 0.08, z]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.055, 0.006, 8, 32]} />
          <meshBasicMaterial color={BRONZE} />
        </mesh>
      ))}
      {ARM_Z.map((z, i) => (
        <mesh key={`h${z}`} ref={(el) => { hands.current[i] = el; }} position={[0, 0, z]}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshBasicMaterial color={BRONZE} />
        </mesh>
      ))}
    </>
  );
}

/* ---------- Cena ---------- */

function Figure(props: Props) {
  const { exerciseId, playing, layer, showIK, hoverMuscle, onHover, onMetrics, speed = 1, resetKey, motionDef, scrub } = props;
  const ex = EXERCISES[exerciseId];
  const poseRef = useRef<Pose>(computePose(ex.motion.type, ex.motion.depth, 0));
  const clock = useRef(0);
  const pRef = useRef(0);
  const lastEmit = useRef(0);

  useEffect(() => {
    clock.current = 0;
  }, [exerciseId, resetKey]);

  useFrame((_, dt) => {
    if (playing) clock.current += Math.min(dt, 0.1) * speed;
    const seconds = motionDef?.repSeconds ?? REP_SECONDS;
    const p = scrub !== null && scrub !== undefined ? scrub : wave(clock.current / seconds);
    pRef.current = p;
    poseRef.current = motionDef ? poseFromDef(motionDef, p) : computePose(ex.motion.type, ex.motion.depth, p);
    const now = performance.now();
    if (onMetrics && now - lastEmit.current > 140) {
      lastEmit.current = now;
      onMetrics(poseRef.current.metrics);
    }
  }, -1);

  return (
    <group position={[-0.06, 0, 0]}>
      {(layer === "skin" || layer === "muscle") && <Skin poseRef={poseRef} o={layer === "skin" ? 0.3 : 0.14} />}
      {(layer === "skeleton" || showIK) && <Skeleton poseRef={poseRef} ik={showIK} />}
      <Muscles poseRef={poseRef} pRef={pRef} exerciseId={exerciseId} layer={layer} hover={hoverMuscle} onHover={onHover} motionDef={motionDef} onPick={props.onPickMuscle} />
      {showIK && <IKMarkers poseRef={poseRef} />}
    </group>
  );
}

const VIEWS: Record<ViewPreset, [number, number, number]> = {
  side: [0.1, 0.95, 4.4],
  front: [4.4, 0.95, 0.1],
  angle: [3.1, 1.25, 3.3],
};
const TARGET = new THREE.Vector3(0.05, 0.86, 0);

function CameraRig({ view }: { view: ViewPreset }) {
  const { camera } = useThree();
  const dest = useRef(new THREE.Vector3(...VIEWS[view]));
  const moving = useRef(false);
  useEffect(() => {
    dest.current.set(...VIEWS[view]);
    moving.current = true;
  }, [view]);
  useFrame(() => {
    if (!moving.current) return;
    camera.position.lerp(dest.current, 0.1);
    if (camera.position.distanceTo(dest.current) < 0.01) moving.current = false;
  });
  return null;
}

let webglCache: boolean | null = null;
function webglAvailable() {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const noopSubscribe = () => () => {};

export default function Anatomy3D(props: Props) {
  const ok = useSyncExternalStore<boolean | null>(noopSubscribe, webglAvailable, () => null);

  if (ok === false) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-muted">3D indisponível neste dispositivo</div>;
  }
  if (ok === null) return null;

  return (
    <Canvas camera={{ position: VIEWS.angle, fov: 32 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 3]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#C79A68" />
      <Figure {...props} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
        <circleGeometry args={[1.15, 64]} />
        <meshStandardMaterial color="#1c1a19" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <ringGeometry args={[1.13, 1.15, 96]} />
        <meshBasicMaterial color="#A97C50" />
      </mesh>
      <ContactShadows position={[0, 0.003, 0]} opacity={0.45} scale={4} blur={2.4} far={1.8} />
      <CameraRig view={props.view} />
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={2} maxDistance={6} target={TARGET} maxPolarAngle={Math.PI * 0.55} />
    </Canvas>
  );
}
