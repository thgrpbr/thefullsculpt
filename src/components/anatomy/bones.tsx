"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { ARM_Z, Anchored, BONE, BONE_DARK, BRONZE, FRONT, LEG_Z, boneGeometry, type PoseRef } from "./shared";

const SPHERE = new THREE.SphereGeometry(1, 20, 14);
type V3 = [number, number, number];

/** Elipsoide (osso arredondado): posição, semi-eixos, rotação. */
function Ell({ p, s, r = [0, 0, 0], c = BONE, o = 1 }: { p: V3; s: V3; r?: V3; c?: string; o?: number }) {
  return (
    <mesh geometry={SPHERE} position={p} scale={s} rotation={r}>
      <meshStandardMaterial color={c} roughness={0.5} metalness={0.02} transparent={o < 1} opacity={o} depthWrite={o >= 1} />
    </mesh>
  );
}
/** Haste cilíndrica entre dois raios. */
function Bar({ p, len, r, r2, rot = [0, 0, 0], c = BONE, o = 1 }: { p: V3; len: number; r: number; r2?: number; rot?: V3; c?: string; o?: number }) {
  return (
    <mesh position={p} rotation={rot}>
      <cylinderGeometry args={[r2 ?? r, r, len, 10]} />
      <meshStandardMaterial color={c} roughness={0.5} transparent={o < 1} opacity={o} depthWrite={o >= 1} />
    </mesh>
  );
}
function Lathe({ len, profile, p, c = BONE, o = 1, rot = [0, 0, 0] }: { len: number; profile: [number, number][]; p: V3; c?: string; o?: number; rot?: V3 }) {
  const geo = useMemo(() => boneGeometry(len, profile), [len, profile]);
  return (
    <mesh geometry={geo} position={p} rotation={rot}>
      <meshStandardMaterial color={c} roughness={0.5} metalness={0.02} transparent={o < 1} opacity={o} depthWrite={o >= 1} />
    </mesh>
  );
}

const FEMUR: [number, number][] = [[0, 0.013], [0.12, 0.0145], [0.5, 0.0135], [0.82, 0.0165], [1, 0.02]];
const TIBIA: [number, number][] = [[0, 0.018], [0.12, 0.0145], [0.55, 0.012], [0.9, 0.0145], [1, 0.019]];
const HUMERUS: [number, number][] = [[0, 0.013], [0.15, 0.012], [0.55, 0.0105], [0.9, 0.0135], [1, 0.017]];
const ARC_GAP = 0.85;

/** Esqueleto: coluna com vértebras, caixa torácica com costelas e esterno, escápulas, clavículas, pelve, crânio, ossos longos e pés/mãos. */
export function Bones({ poseRef, ik = false, o = 1 }: { poseRef: PoseRef; ik?: boolean; o?: number }) {
  const chain = ik ? BRONZE : BONE;
  const thoracic = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ y: 0.04 + i * 0.027, x: 0.062 + 0.01 * Math.sin((i / 11) * Math.PI), s: 0.0125 + 0.0007 * i })), []);
  const lumbar = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ y: 0.375 + i * 0.027, x: 0.062 - 0.014 * Math.sin((i / 4) * Math.PI), s: 0.0165 })), []);
  const cervical = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ y: 0.07 + i * 0.0135, x: 0.03 - 0.004 * Math.sin((i / 6) * Math.PI) })), []);
  const ribs = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const k = Math.sin(((i + 1.5) / 11.5) * Math.PI);          // 0..1: costelas do meio são as mais largas
    return { y: 0.05 + i * 0.026, rx: 0.058 + 0.036 * k, tilt: i < 7 ? 0.0 : 0.06 };
  }), []);

  return (
    <>
      {/* ---------- tronco: coluna, caixa torácica, escápulas, clavículas, pelve ---------- */}
      <Anchored poseRef={poseRef} seg="torso" t={0}>
        {[...thoracic, ...lumbar].map((v, i) => (
          <group key={`v${i}`} position={[v.x, v.y, 0]}>
            <mesh><cylinderGeometry args={[v.s, v.s * 1.06, 0.02, 12]} /><meshStandardMaterial color={BONE} roughness={0.55} transparent={o < 1} opacity={o} depthWrite={o >= 1} /></mesh>
            <mesh position={[0.017, 0.004, 0]} rotation={[0, 0, -0.25]}><boxGeometry args={[0.022, 0.012, 0.006]} /><meshStandardMaterial color={BONE_DARK} roughness={0.55} transparent={o < 1} opacity={o} depthWrite={o >= 1} /></mesh>
          </group>
        ))}
        {ribs.map((r, i) => (
          <group key={`r${i}`} position={[0.02 - r.rx * 0.2, r.y, 0]} rotation={[Math.PI / 2 + r.tilt, 0, 0]}>
            <group scale={[1, 1.5, 1]}>
              <mesh rotation={[0, 0, ARC_GAP / 2 - Math.PI]}>
                <torusGeometry args={[r.rx, 0.0062 - i * 0.00015, 6, 30, Math.PI * 2 - ARC_GAP]} />
                <meshStandardMaterial color={BONE} roughness={0.5} transparent={o < 1} opacity={o * 0.95} depthWrite={o >= 1} />
              </mesh>
            </group>
          </group>
        ))}
        <Ell p={[FRONT * 0.092, 0.115, 0]} s={[0.007, 0.085, 0.022]} c={BONE_DARK} o={o} />
        <Ell p={[FRONT * 0.09, 0.027, 0]} s={[0.009, 0.014, 0.026]} c={BONE_DARK} o={o} />
        {[-1, 1].map((s) => (
          <group key={`sh${s}`}>
            <Bar p={[FRONT * 0.046, 0.022, s * 0.094]} len={0.19} r={0.0075} rot={[Math.PI / 2, 0, s * 0.18]} o={o} />
            <Ell p={[0.074, 0.115, s * 0.1]} s={[0.006, 0.075, 0.052]} r={[0, 0, 0]} c={BONE_DARK} o={o} />
            <Ell p={[0.07, 0.04, s * 0.17]} s={[0.012, 0.014, 0.034]} c={BONE_DARK} o={o} />
            {/* pelve: asa ilíaca, ísquio e púbis */}
            <Ell p={[0.0, 0.485, s * 0.098]} s={[0.034, 0.05, 0.016]} r={[s * 0.55, 0, 0]} c={BONE} o={o} />
            <Ell p={[0.012, 0.545, s * 0.07]} s={[0.025, 0.03, 0.012]} r={[s * 0.3, 0, 0]} c={BONE_DARK} o={o} />
            <Ell p={[FRONT * 0.045, 0.545, s * 0.025]} s={[0.012, 0.022, 0.02]} c={BONE_DARK} o={o} />
          </group>
        ))}
        <Ell p={[0.05, 0.525, 0]} s={[0.018, 0.045, 0.034]} c={BONE_DARK} o={o} />
      </Anchored>

      {/* ---------- pescoço e crânio ---------- */}
      <Anchored poseRef={poseRef} seg="neckseg" t={0}>
        {cervical.map((v, i) => <Ell key={`c${i}`} p={[v.x, v.y, 0]} s={[0.012, 0.0075, 0.012]} c={BONE} o={o} />)}
        <Ell p={[0.0, -0.045, 0]} s={[0.088, 0.1, 0.078]} c={BONE} o={o} />
        <Ell p={[FRONT * 0.05, 0.004, 0]} s={[0.04, 0.045, 0.05]} c={BONE_DARK} o={o} />
        <Ell p={[FRONT * 0.034, 0.05, 0]} s={[0.042, 0.016, 0.046]} c={BONE} o={o} />
        {[-1, 1].map((s) => <Ell key={`eye${s}`} p={[FRONT * 0.07, -0.022, s * 0.03]} s={[0.012, 0.014, 0.014]} c="#5c5242" o={o} />)}
        <Ell p={[FRONT * 0.088, -0.001, 0]} s={[0.008, 0.015, 0.009]} c="#5c5242" o={o} />
      </Anchored>

      {/* ---------- pernas ---------- */}
      {LEG_Z.map((z) => {
        const s = Math.sign(z);
        return (
          <group key={`leg${z}`}>
            <Anchored poseRef={poseRef} seg="thigh" t={0} z={z}>
              <Ell p={[0, 0, -s * 0.02]} s={[0.025, 0.025, 0.025]} c={chain} o={o} />
              <Bar p={[0, 0.03, -s * 0.0]} len={0.075} r={0.011} rot={[s * 1.0, 0, 0]} c={chain} o={o} />
              <Ell p={[0.0, 0.05, s * 0.036]} s={[0.02, 0.026, 0.02]} c={chain} o={o} />
              <Lathe len={0.4} profile={FEMUR} p={[FRONT * 0.008, 0.24, s * 0.004]} c={chain} o={o} />
              {[-1, 1].map((k) => <Ell key={k} p={[0.006, 0.445, k * 0.0195]} s={[0.026, 0.024, 0.02]} c={chain} o={o} />)}
              <Ell p={[FRONT * 0.034, 0.465, 0]} s={[0.009, 0.019, 0.016]} c={BONE_DARK} o={o} />
            </Anchored>
            <Anchored poseRef={poseRef} seg="shank" t={0} z={z}>
              <Ell p={[0, 0.02, 0]} s={[0.03, 0.011, 0.034]} c={chain} o={o} />
              <Lathe len={0.4} profile={TIBIA} p={[FRONT * 0.005, 0.235, -s * 0.004]} c={chain} o={o} />
              <Bar p={[0.008, 0.235, s * 0.03]} len={0.37} r={0.0062} r2={0.0056} c={BONE_DARK} o={o} />
              <Ell p={[0.004, 0.055, s * 0.03]} s={[0.011, 0.012, 0.011]} c={BONE_DARK} o={o} />
              <Ell p={[0.0, 0.438, -s * 0.0185]} s={[0.014, 0.015, 0.012]} c={chain} o={o} />
              <Ell p={[0.004, 0.444, s * 0.026]} s={[0.012, 0.016, 0.01]} c={BONE_DARK} o={o} />
            </Anchored>
            <Anchored poseRef={poseRef} seg="foot" t={0} z={z}>
              <Ell p={[-0.016, 0.03, 0]} s={[0.026, 0.036, 0.022]} c={BONE} o={o} />
              <Ell p={[-0.058, 0.072, 0]} s={[0.018, 0.026, 0.018]} c={BONE} o={o} />
              <Ell p={[-0.03, 0.115, 0]} s={[0.02, 0.03, 0.026]} c={BONE_DARK} o={o} />
              {[-0.016, 0, 0.016].map((k, i) => <Bar key={k} p={[-0.006 - (i === 1 ? 0.002 : 0), 0.17, k]} len={0.09} r={0.0062} rot={[0, 0, 0]} c={BONE} o={o} />)}
              {[-0.018, -0.006, 0.006, 0.018].map((k) => <Bar key={`t${k}`} p={[-0.002, 0.232, k]} len={0.04} r={0.0048} c={BONE} o={o} />)}
            </Anchored>
          </group>
        );
      })}

      {/* ---------- braços ---------- */}
      {ARM_Z.map((z) => {
        const s = Math.sign(z);
        return (
          <group key={`arm${z}`}>
            <Anchored poseRef={poseRef} seg="uarm" t={0} z={z}>
              <Ell p={[0, 0, 0]} s={[0.023, 0.027, 0.023]} c={chain} o={o} />
              <Lathe len={0.27} profile={HUMERUS} p={[0, 0.16, 0]} c={chain} o={o} />
              {[-1, 1].map((k) => <Ell key={k} p={[0.004, 0.295, k * 0.016]} s={[0.014, 0.016, 0.011]} c={chain} o={o} />)}
            </Anchored>
            <Anchored poseRef={poseRef} seg="farm" t={0} z={z}>
              <Ell p={[0.014, 0.0, 0]} s={[0.013, 0.02, 0.013]} c={BONE_DARK} o={o} />
              <Bar p={[0.006, 0.135, -s * 0.008]} len={0.27} r={0.0075} r2={0.0062} c={chain} o={o} />
              <Bar p={[-0.004, 0.125, s * 0.01]} len={0.25} r={0.0068} r2={0.0085} c={BONE} o={o} />
              {/* mão */}
              <Ell p={[0, 0.292, 0]} s={[0.013, 0.014, 0.022]} c={BONE_DARK} o={o} />
              {[-0.016, -0.006, 0.006, 0.016].map((k, i) => (
                <group key={k}>
                  <Bar p={[0, 0.332, k * 1.1]} len={0.06} r={0.0042} rot={[0, 0, 0]} c={BONE} o={o} />
                  <Bar p={[0, 0.382 - (i === 0 || i === 3 ? 0.008 : 0), k * 1.2]} len={0.05 - (i === 0 || i === 3 ? 0.008 : 0)} r={0.0035} c={BONE} o={o} />
                </group>
              ))}
              <Bar p={[FRONT * 0.012, 0.31, -s * 0.03]} len={0.07} r={0.0045} rot={[0.0, 0, s * 0.5]} c={BONE} o={o} />
            </Anchored>
          </group>
        );
      })}
    </>
  );
}
