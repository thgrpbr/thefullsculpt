"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { EXERCISES, type MuscleId } from "@/lib/exercises";
import { REP_SECONDS, computePose, wave, type Pose } from "@/lib/pose";
import { poseFromDef, type MotionDef } from "@/lib/motion";
import { ARM_Z, BRONZE, LEG_Z, type PoseRef } from "./anatomy/shared";
import { Bones } from "./anatomy/bones";
import { Muscles, type Layer } from "./anatomy/muscles";
import { Skin } from "./anatomy/skin";

export type { Layer };
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
      {(layer === "skin" || layer === "muscle") && <Skin poseRef={poseRef} o={layer === "skin" ? 0.3 : 0.12} />}
      {(layer === "skeleton" || showIK) && <Bones poseRef={poseRef} ik={showIK} />}
      {layer === "muscle" && !showIK && <Bones poseRef={poseRef} o={0.32} />}
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
