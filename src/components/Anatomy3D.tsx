"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useSyncExternalStore, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import { EXERCISES, muscleRole, type MuscleId, type MuscleRole } from "@/lib/exercises";
import { REP_SECONDS, computePose, wave, type JointName, type Pose } from "@/lib/pose";

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
const IDLE = "#6b645c";
const BONE = "#F6F3EE";
const BRONZE = "#C79A68";

interface MuscleDef {
  id: MuscleId;
  seg: Seg;
  t: number;
  off: number;
  zs: number[];
  size: [number, number, number]; // [perp, along, z]
}

const MUSCLES: MuscleDef[] = [
  { id: "quads", seg: "thigh", t: 0.5, off: 0.04, zs: LEG_Z, size: [0.05, 0.2, 0.055] },
  { id: "hamstrings", seg: "thigh", t: 0.5, off: -0.04, zs: LEG_Z, size: [0.045, 0.19, 0.05] },
  { id: "calves", seg: "shank", t: 0.28, off: -0.035, zs: LEG_Z, size: [0.04, 0.15, 0.04] },
  { id: "glutes", seg: "torso", t: 0.97, off: -0.075, zs: [-0.07, 0.07], size: [0.07, 0.09, 0.08] },
  { id: "abs", seg: "torso", t: 0.78, off: 0.08, zs: [0], size: [0.04, 0.14, 0.09] },
  { id: "erector", seg: "torso", t: 0.62, off: -0.08, zs: [-0.04, 0.04], size: [0.035, 0.2, 0.04] },
  { id: "lats", seg: "torso", t: 0.35, off: -0.08, zs: [-0.1, 0.1], size: [0.04, 0.15, 0.07] },
  { id: "pecs", seg: "torso", t: 0.2, off: 0.09, zs: [-0.07, 0.07], size: [0.04, 0.07, 0.075] },
  { id: "traps", seg: "torso", t: 0.04, off: -0.06, zs: [-0.05, 0.05], size: [0.05, 0.09, 0.07] },
  { id: "deltoids", seg: "uarm", t: 0.12, off: 0, zs: ARM_Z, size: [0.055, 0.08, 0.055] },
  { id: "biceps", seg: "uarm", t: 0.5, off: 0.035, zs: ARM_Z, size: [0.032, 0.11, 0.035] },
  { id: "triceps", seg: "uarm", t: 0.5, off: -0.035, zs: ARM_Z, size: [0.032, 0.11, 0.035] },
];

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

function Skin({ poseRef }: { poseRef: PoseRef }) {
  const c = "#d8d2c8";
  const o = 0.3;
  return (
    <>
      {LEG_Z.map((z) => (
        <group key={`l${z}`}>
          <Anchored poseRef={poseRef} seg="thigh" z={z}><Capsule seg="thigh" r={0.075} color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="shank" z={z}><Capsule seg="shank" r={0.055} color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="foot" z={z}><Capsule seg="foot" r={0.035} color={c} opacity={o} ghost /></Anchored>
        </group>
      ))}
      {ARM_Z.map((z) => (
        <group key={`a${z}`}>
          <Anchored poseRef={poseRef} seg="uarm" z={z}><Capsule seg="uarm" r={0.045} color={c} opacity={o} ghost /></Anchored>
          <Anchored poseRef={poseRef} seg="farm" z={z}><Capsule seg="farm" r={0.037} color={c} opacity={o} ghost /></Anchored>
        </group>
      ))}
      <Anchored poseRef={poseRef} seg="torso"><Capsule seg="torso" r={0.11} color={c} opacity={o} scaleZ={1.45} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={1}><Ball r={0.11} color={c} opacity={o} scale={[1, 1, 1.35]} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="neckseg"><Capsule seg="neckseg" r={0.04} color={c} opacity={o} ghost /></Anchored>
      <Anchored poseRef={poseRef} seg="neckseg" t={0}><Ball r={0.1} color={c} opacity={o} ghost /></Anchored>
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
      <Anchored poseRef={poseRef} seg="neckseg" t={0}><Ball r={0.085} color={BONE} opacity={0.35} ghost /></Anchored>
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
  exerciseId,
  layer,
  hover,
  onHover,
}: {
  poseRef: PoseRef;
  exerciseId: string;
  layer: Layer;
  hover: MuscleId | null;
  onHover: (m: MuscleId | null) => void;
}) {
  const ex = EXERCISES[exerciseId];
  return (
    <>
      {MUSCLES.map((m) => {
        const role = muscleRole(ex, m.id);
        if (layer !== "muscle" && !role) return null;
        const active = !!role;
        const color = role ? ROLE_COLOR[role] : IDLE;
        const opacity = layer === "muscle" ? (active ? 0.95 : 0.35) : layer === "skin" ? 0.85 : 0.5;
        const isHover = hover === m.id;
        return m.zs.map((z) => (
          <Anchored key={`${m.id}${z}`} poseRef={poseRef} seg={m.seg} t={m.t} off={m.off} z={z}>
            <mesh
              scale={m.size.map((s) => s * (isHover ? 1.14 : 1)) as [number, number, number]}
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
              <sphereGeometry args={[1, 18, 14]} />
              <meshStandardMaterial
                color={color}
                transparent
                opacity={opacity}
                roughness={0.5}
                emissive={active ? color : "#000000"}
                emissiveIntensity={isHover ? 0.7 : active ? 0.28 : 0}
                depthWrite={opacity > 0.8}
              />
            </mesh>
          </Anchored>
        ));
      })}
    </>
  );
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
  const { exerciseId, playing, layer, showIK, hoverMuscle, onHover, onMetrics, speed = 1, resetKey } = props;
  const ex = EXERCISES[exerciseId];
  const poseRef = useRef<Pose>(computePose(ex.motion.type, ex.motion.depth, 0));
  const clock = useRef(0);
  const lastEmit = useRef(0);

  useEffect(() => {
    clock.current = 0;
  }, [exerciseId, resetKey]);

  useFrame((_, dt) => {
    if (playing) clock.current += Math.min(dt, 0.1) * speed;
    const p = wave(clock.current / REP_SECONDS);
    poseRef.current = computePose(ex.motion.type, ex.motion.depth, p);
    const now = performance.now();
    if (onMetrics && now - lastEmit.current > 140) {
      lastEmit.current = now;
      onMetrics(poseRef.current.metrics);
    }
  }, -1);

  return (
    <group position={[-0.06, 0, 0]}>
      {layer === "skin" && <Skin poseRef={poseRef} />}
      {(layer === "skeleton" || showIK) && <Skeleton poseRef={poseRef} ik={showIK} />}
      <Muscles poseRef={poseRef} exerciseId={exerciseId} layer={layer} hover={hoverMuscle} onHover={onHover} />
      {showIK && <IKMarkers poseRef={poseRef} />}
    </group>
  );
}

const VIEWS: Record<ViewPreset, [number, number, number]> = {
  side: [0.1, 0.95, 3.7],
  front: [3.7, 0.95, 0.1],
  angle: [2.6, 1.2, 2.8],
};
const TARGET = new THREE.Vector3(0.05, 0.82, 0);

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
