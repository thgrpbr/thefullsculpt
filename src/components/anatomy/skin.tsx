"use client";

import { useMemo } from "react";
import { ARM_Z, Anchored, FRONT, LEG_Z, SEG_LEN, taperGeometry, type PoseRef, type Seg } from "./shared";

const PROFILE: Record<Seg, [number, number][]> = {
  thigh: [[0, 0.05], [0.03, 0.075], [0.12, 0.09], [0.3, 0.085], [0.5, 0.077], [0.72, 0.066], [0.9, 0.054], [1, 0.045]],
  shank: [[0, 0.046], [0.05, 0.054], [0.2, 0.062], [0.35, 0.054], [0.6, 0.04], [0.85, 0.032], [1, 0.03]],
  uarm: [[0, 0.04], [0.08, 0.052], [0.35, 0.047], [0.65, 0.041], [0.9, 0.036], [1, 0.034]],
  farm: [[0, 0.036], [0.15, 0.043], [0.45, 0.037], [0.85, 0.028], [1, 0.024]],
  torso: [[0, 0.045], [0.04, 0.07], [0.12, 0.1], [0.28, 0.108], [0.5, 0.09], [0.66, 0.082], [0.82, 0.095], [0.95, 0.1], [1, 0.06]],
  neckseg: [[0, 0.036], [0.3, 0.041], [1, 0.053]],
  foot: [[0, 0.034], [0.2, 0.04], [0.7, 0.03], [1, 0.02]],
};

function Taper({ seg, color, opacity, scaleZ = 1, rough = 0.62 }: { seg: Seg; color: string; opacity: number; scaleZ?: number; rough?: number }) {
  const geo = useMemo(() => taperGeometry(SEG_LEN[seg], PROFILE[seg], 32), [seg]);
  return (
    <mesh geometry={geo} scale={[1, 1, scaleZ]}>
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={false} roughness={rough} metalness={0.02} />
    </mesh>
  );
}
function Blob({ p, s, color, opacity, r = [0, 0, 0] }: { p: [number, number, number]; s: [number, number, number]; color: string; opacity: number; r?: [number, number, number] }) {
  return (
    <mesh position={p} scale={s} rotation={r}>
      <sphereGeometry args={[1, 24, 18]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={false} roughness={0.62} />
    </mesh>
  );
}

/** Pele translúcida: silhueta do corpo com cabeça, mandíbula, nariz, orelhas, mãos e pés. */
export function Skin({ poseRef, o = 0.3 }: { poseRef: PoseRef; o?: number }) {
  const c = "#dcd3c6";
  const d = "#cfc4b4";
  return (
    <>
      {LEG_Z.map((z) => (
        <group key={`l${z}`}>
          <Anchored poseRef={poseRef} seg="thigh" z={z}><Taper seg="thigh" color={c} opacity={o} /></Anchored>
          <Anchored poseRef={poseRef} seg="shank" z={z}><Taper seg="shank" color={c} opacity={o} /></Anchored>
          <Anchored poseRef={poseRef} seg="thigh" t={1} z={z}><Blob p={[0, 0, 0]} s={[0.05, 0.045, 0.052]} color={c} opacity={o} /></Anchored>
          <Anchored poseRef={poseRef} seg="foot" z={z}>
            <Taper seg="foot" color={c} opacity={o} scaleZ={1.25} />
            <Blob p={[0.0, 0.215, 0]} s={[0.02, 0.05, 0.045]} color={d} opacity={o} />
            <Blob p={[0.01, 0.02, 0]} s={[0.036, 0.04, 0.032]} color={c} opacity={o} />
          </Anchored>
        </group>
      ))}
      {ARM_Z.map((z) => {
        const s = Math.sign(z);
        return (
          <group key={`a${z}`}>
            <Anchored poseRef={poseRef} seg="uarm" z={z}><Taper seg="uarm" color={c} opacity={o} /></Anchored>
            <Anchored poseRef={poseRef} seg="farm" z={z}><Taper seg="farm" color={c} opacity={o} /></Anchored>
            <Anchored poseRef={poseRef} seg="uarm" t={0} z={z}><Blob p={[0, 0, 0]} s={[0.052, 0.058, 0.054]} color={c} opacity={o} /></Anchored>
            <Anchored poseRef={poseRef} seg="uarm" t={1} z={z}><Blob p={[0.004, 0, 0]} s={[0.036, 0.036, 0.036]} color={c} opacity={o} /></Anchored>
            {/* mão: palma, quatro dedos e polegar */}
            <Anchored poseRef={poseRef} seg="farm" t={1} z={z}>
              <Blob p={[0, 0.045, 0]} s={[0.014, 0.05, 0.034]} color={c} opacity={o} />
              {[-0.017, -0.006, 0.006, 0.017].map((k, i) => <Blob key={k} p={[0, 0.115 - (i === 0 || i === 3 ? 0.01 : 0), k * 1.1]} s={[0.0095, 0.045 - (i === 0 || i === 3 ? 0.008 : 0), 0.0095]} color={d} opacity={o} />)}
              <Blob p={[FRONT * 0.02, 0.06, -s * 0.034]} s={[0.011, 0.034, 0.011]} color={d} opacity={o} r={[0, 0, s * 0.5]} />
            </Anchored>
          </group>
        );
      })}
      {/* tronco, ombros, glúteos e quadris */}
      <Anchored poseRef={poseRef} seg="torso"><Taper seg="torso" color={c} opacity={o} scaleZ={1.62} /></Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={0.02}><Blob p={[0.012, 0, 0]} s={[0.075, 0.045, 0.19]} color={c} opacity={o} /></Anchored>
      <Anchored poseRef={poseRef} seg="torso" t={1}><Blob p={[0.012, 0, 0]} s={[0.1, 0.085, 0.15]} color={c} opacity={o} /></Anchored>
      {/* pescoço, cabeça */}
      <Anchored poseRef={poseRef} seg="neckseg"><Taper seg="neckseg" color={c} opacity={o} /></Anchored>
      <Anchored poseRef={poseRef} seg="neckseg" t={0}>
        <Blob p={[0.004, -0.048, 0]} s={[0.093, 0.108, 0.082]} color={c} opacity={o} />
        <Blob p={[FRONT * 0.045, 0.018, 0]} s={[0.05, 0.062, 0.062]} color={c} opacity={o} />
        <Blob p={[FRONT * 0.052, 0.058, 0]} s={[0.034, 0.02, 0.04]} color={d} opacity={o} />
        <Blob p={[FRONT * 0.092, 0.0, 0]} s={[0.014, 0.026, 0.012]} color={d} opacity={o} />
        {[-1, 1].map((s) => <Blob key={s} p={[0.008, -0.03, s * 0.08]} s={[0.012, 0.03, 0.01]} color={d} opacity={o} />)}
      </Anchored>
    </>
  );
}
