"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import type { JointName, Pose } from "@/lib/pose";

export type Seg = "torso" | "thigh" | "shank" | "uarm" | "farm" | "neckseg" | "foot";
export type PoseRef = MutableRefObject<Pose>;

/**
 * Cada segmento vai de A (t = 0) até B (t = 1). No espaço local de uma peça ancorada: +y aponta de A para B,
 * e para os segmentos que apontam para baixo (tronco, coxa, canela, braço) a FRENTE do corpo é −x e o lado
 * direito/esquerdo é ±z. Use `FRONT = -1` para posicionar peças na frente.
 */
export const SEG: Record<Seg, [JointName, JointName]> = {
  torso: ["neck", "hip"],
  thigh: ["hip", "knee"],
  shank: ["knee", "ankle"],
  uarm: ["shoulder", "elbow"],
  farm: ["elbow", "wrist"],
  neckseg: ["head", "neck"],
  foot: ["heel", "toe"],
};
export const SEG_LEN: Record<Seg, number> = { torso: 0.52, thigh: 0.45, shank: 0.45, uarm: 0.3, farm: 0.27, neckseg: 0.17, foot: 0.25 };
export const FRONT = -1;

export const LEG_Z = [-0.1, 0.1];
export const ARM_Z = [-0.2, 0.2];

export const BONE = "#EDE6D8";
export const BONE_DARK = "#cfc4ad";
export const BRONZE = "#C79A68";
export const TENDON = "#E9E1D2";

/** Peça fixada a um segmento do esqueleto; acompanha a pose e estica junto com o comprimento do segmento. */
export function Anchored({ poseRef, seg, t = 0.5, off = 0, z = 0, children }: { poseRef: PoseRef; seg: Seg; t?: number; off?: number; z?: number; children: ReactNode }) {
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
    g.scale.y = len / SEG_LEN[seg];
  });
  return <group ref={ref}>{children}</group>;
}

/** Corpo cônico ao longo do eixo do segmento: [t (0 = A, 1 = B), raio]. Suaviza o perfil com Catmull-Rom. */
export function taperGeometry(len: number, profile: [number, number][], radial = 28) {
  const curve = new THREE.SplineCurve(profile.map(([t, r]) => new THREE.Vector2(t, r)));
  const pts = curve.getPoints(profile.length * 6).map((p) => new THREE.Vector2(Math.max(0.001, p.y), -len / 2 + THREE.MathUtils.clamp(p.x, 0, 1) * len));
  return new THREE.LatheGeometry(pts, radial);
}

/** Geometria de osso longo: haste fina com extremidades alargadas. [posição 0..1, raio]. */
export function boneGeometry(len: number, profile: [number, number][], radial = 14) {
  return taperGeometry(len, profile, radial);
}
