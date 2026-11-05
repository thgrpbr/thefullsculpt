import type { Answers, Assignment } from "./anamnese";
import type { LogEntry } from "./store";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export interface ServerState {
  profile: { name: string; email: string; role: string };
  consents: { health: boolean; terms: boolean; marketing: boolean; at: string };
  answers: Answers | null;
  assignment: Assignment | null;
  sub: "free" | "active";
  xp: number;
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  log: LogEntry[];
}

export async function api<T = ServerState>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "tfs" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* corpo vazio ou não-JSON */
  }
  if (!res.ok) {
    const code = (json as { error?: string } | null)?.error ?? "generic";
    throw new ApiError(res.status, code);
  }
  return json as T;
}
