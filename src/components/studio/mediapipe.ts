import { ANKLE_Y } from "./const";
import type { Key, MotionDef } from "@/lib/motion";
import type { Lengths } from "@/lib/pose";

/**
 * Extrai poses-chave de um vídeo (vista lateral) com o MediaPipe Pose Landmarker, direto no navegador do administrador.
 * Os arquivos do modelo vêm da CDN do MediaPipe na primeira vez. Nada do vídeo é enviado ao nosso servidor.
 */
type Landmarker = { detect: (img: HTMLVideoElement) => { landmarks: { x: number; y: number; visibility?: number }[][] } };
let loading: Promise<Landmarker> | null = null;

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export function loadLandmarker(): Promise<Landmarker> {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    return (await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL }, runningMode: "IMAGE", numPoses: 1 })) as unknown as Landmarker;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      v.removeEventListener("seeked", done);
      reject(new Error("O vídeo demorou a posicionar no quadro pedido."));
    }, 6000);
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface DetectOptions {
  count: number; // quantas poses-chave gerar entre o início e o ponto máximo
  adjustLengths: boolean; // ajustar também as medidas do corpo pela instrutora
  onProgress?: (msg: string) => void;
}

export async function detectKeys(video: HTMLVideoElement, def: MotionDef, opts: DetectOptions): Promise<{ keys: Key[]; lengths?: Lengths; notes: string[] }> {
  const ref = def.video;
  if (!ref) throw new Error("Defina o vídeo e as marcas de início e ponto máximo.");
  if (ref.t1 <= ref.t0) throw new Error("O ponto máximo precisa vir depois do início da repetição.");
  opts.onProgress?.("Carregando o modelo de pose (primeira vez pode levar alguns segundos)…");
  const lm = await loadLandmarker();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("O vídeo ainda não carregou.");
  const wasPlaying = !video.paused;
  video.pause();

  const frames: { p: number; pts: { x: number; y: number; v: number }[] }[] = [];
  for (let i = 0; i < opts.count; i++) {
    const p = i / (opts.count - 1);
    opts.onProgress?.(`Analisando quadro ${i + 1} de ${opts.count}…`);
    await seek(video, ref.t0 + p * (ref.t1 - ref.t0));
    let res;
    try {
      res = lm.detect(video);
    } catch {
      throw new Error("O navegador bloqueou a leitura do vídeo (CORS). Use um vídeo hospedado neste site ou escolha o arquivo do computador.");
    }
    const pts = res.landmarks[0];
    if (!pts) throw new Error(`Não encontrei a pessoa no quadro de ${Math.round(p * 100)}% da repetição. Ajuste as marcas de tempo ou use um vídeo com o corpo inteiro visível, de lado.`);
    frames.push({ p, pts: pts.map((q) => ({ x: q.x * vw, y: q.y * vh, v: q.visibility ?? 1 })) });
  }
  if (wasPlaying) void video.play();

  // lado do corpo mais visível (vista lateral): esquerdo = 11,13,15,23,25,27 · direito = 12,14,16,24,26,28
  const sideVis = (ids: number[]) => frames.reduce((a, f) => a + ids.reduce((b, i) => b + f.pts[i].v, 0), 0);
  const left = sideVis([11, 13, 15, 23, 25, 27]) >= sideVis([12, 14, 16, 24, 26, 28]);
  const I = left ? { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, ear: 7 } : { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, ear: 8 };
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  const f0 = frames[0].pts;
  const legPx = d(f0[I.hip], f0[I.kn]) + d(f0[I.kn], f0[I.an]);
  if (legPx < 20) throw new Error("A perna da instrutora está pequena ou escondida no quadro inicial.");
  const notes: string[] = [`Lado analisado: ${left ? "esquerdo" : "direito"} do corpo.`];

  let lengths: Lengths | undefined;
  let s: number; // metros por pixel
  if (opts.adjustLengths) {
    s = (0.491 * ref.heightM) / legPx; // pernas ≈ 49% da altura
    lengths = {
      thigh: r4(clamp(d(f0[I.hip], f0[I.kn]) * s, 0.25, 0.65)), shank: r4(clamp(d(f0[I.kn], f0[I.an]) * s, 0.25, 0.65)),
      torso: r4(clamp(d(f0[I.hip], f0[I.sh]) * s, 0.3, 0.8)), uarm: r4(clamp(d(f0[I.sh], f0[I.el]) * s, 0.18, 0.45)),
      farm: r4(clamp(d(f0[I.el], f0[I.wr]) * s, 0.15, 0.4)), neck: def.lengths.neck,
    };
    notes.push(`Medidas do corpo ajustadas pela instrutora (altura informada ${ref.heightM.toFixed(2)} m).`);
  } else {
    s = (def.lengths.thigh + def.lengths.shank) / legPx;
  }
  const dir = ref.flip ? -1 : 1;
  const ax = f0[I.an].x;
  const ay = f0[I.an].y;
  const W = (q: { x: number; y: number }) => ({ x: dir * (q.x - ax) * s, y: (ay - q.y) * s + ANKLE_Y });

  const keys: Key[] = frames.map(({ p, pts }) => {
    const hip = W(pts[I.hip]);
    const sh = W(pts[I.sh]);
    const ear = W(pts[I.ear]);
    const wr = W(pts[I.wr]);
    return {
      p: r4(p),
      hip: { x: r4(clamp(hip.x, -1.5, 1.5)), y: r4(clamp(hip.y, 0.1, 1.6)) },
      lean: r4(clamp(Math.atan2(sh.x - hip.x, sh.y - hip.y), -1.6, 1.6)),
      headLean: r4(clamp(Math.atan2(ear.x - sh.x, ear.y - sh.y), -1.6, 1.6)),
      hand: { x: r4(clamp(wr.x, -1.5, 1.5)), y: r4(clamp(wr.y, -0.2, 2.4)) },
    };
  });
  notes.push("Revise as poses: o MediaPipe estima em 2D e pode errar quando um membro fica escondido atrás do corpo.");
  return { keys, lengths, notes };
}
