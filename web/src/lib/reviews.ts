const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export type ReviewSource = "site" | "bot" | "manual";

export interface ReviewItem {
  id: string;
  rating: number;
  text: string;
  author: string;
  source: ReviewSource;
  has_avatar: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewAggregate {
  avg: number;
  count: number;
  dist: Record<string, number>;
}

export interface ReviewList {
  reviews: ReviewItem[];
  aggregate: ReviewAggregate;
  cooldown_s?: number;
}

export type ReviewErrorKind = "blocked" | "cooldown" | "generic";

export class ReviewError extends Error {
  kind: ReviewErrorKind;
  reason?: string;
  retry?: number;

  constructor(kind: ReviewErrorKind, opts: { reason?: string; retry?: number } = {}) {
    super(kind);
    this.kind = kind;
    this.reason = opts.reason;
    this.retry = opts.retry;
  }
}

const DEVICE_KEY = "xdl_device_id";
const EDIT_KEY = "xdl_review_edit";

export function deviceId(): string {
  let id = "";
  try {
    id = localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    id = "";
  }
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
    }
  }
  return id;
}

export function identityOf(): string {
  return `dev:${deviceId()}`;
}

export function storedEdit(): { id: string; token: string } | null {
  try {
    const raw = localStorage.getItem(EDIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; token?: string };
    if (parsed?.id && parsed?.token) return { id: parsed.id, token: parsed.token };
  } catch {
  }
  return null;
}

export function storeEdit(id: string, token: string): void {
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify({ id, token }));
  } catch {
  }
}

export function clearEdit(): void {
  try {
    localStorage.removeItem(EDIT_KEY);
  } catch {
  }
}

function deviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Device-Id": deviceId(), ...extra };
}

async function failure(res: Response): Promise<ReviewError> {
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (data?.error === "blocked") {
    return new ReviewError("blocked", { reason: typeof data.reason === "string" ? data.reason : undefined });
  }
  if (data?.error === "cooldown") {
    const retry = Number(data.retry);
    return new ReviewError("cooldown", { retry: Number.isFinite(retry) ? retry : 60 });
  }
  return new ReviewError("generic");
}

async function handle(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  throw await failure(res);
}

export async function fetchReviews(signal?: AbortSignal): Promise<ReviewList> {
  const res = await fetch(`${base}/api/reviews`, {
    headers: deviceHeaders(),
    signal: signal ?? AbortSignal.timeout(8000),
  });
  return (await handle(res)) as ReviewList;
}

export async function fetchMyReview(identity: string): Promise<ReviewItem | null> {
  const res = await fetch(`${base}/api/reviews/mine?identity=${encodeURIComponent(identity)}`, {
    headers: deviceHeaders(),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await handle(res)) as { found?: boolean; review?: ReviewItem };
  return data.found && data.review ? data.review : null;
}

export async function submitReview(payload: {
  rating: number;
  text: string;
  author: string;
}): Promise<{ id: string; edit_token: string }> {
  const res = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: deviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      rating: payload.rating,
      text: payload.text,
      author: payload.author,
      identity: identityOf(),
    }),
    signal: AbortSignal.timeout(15000),
  });
  return (await handle(res)) as { id: string; edit_token: string };
}

export async function updateReview(
  id: string,
  payload: { rating: number; text: string; token: string },
): Promise<void> {
  const res = await fetch(`${base}/api/reviews/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: deviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      rating: payload.rating,
      text: payload.text,
      edit_token: payload.token,
    }),
    signal: AbortSignal.timeout(15000),
  });
  await handle(res);
}

export async function deleteReview(id: string, token: string): Promise<void> {
  const res = await fetch(`${base}/api/reviews/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: deviceHeaders({ "X-Edit-Token": token }),
    signal: AbortSignal.timeout(15000),
  });
  await handle(res);
}

export function avatarHref(id: string): string {
  return `${base}/api/reviews/avatar/${encodeURIComponent(id)}`;
}
