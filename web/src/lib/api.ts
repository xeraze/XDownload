const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export type JobState = "queued" | "running" | "done" | "error";

export interface JobStatus {
  state: JobState;
  progress?: number;
  file?: { name: string; size?: number };
  message?: string;
}

export type ApiErrorKind = "unsupported" | "generic";

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

export async function fetchHealth(): Promise<boolean> {
  const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) return false;
  const data = (await response.json()) as { ok?: boolean };
  return data.ok === true;
}

export async function createJob(
  url: string,
  format: "mp4" | "mp3",
  height?: number,
): Promise<string> {
  const response = await fetch(`${base}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format, height }),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 400 || response.status === 415) throw new ApiError("unsupported");
  if (!response.ok) throw new ApiError("generic");
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new ApiError("generic");
  return data.id;
}

export async function getJob(id: string): Promise<JobStatus> {
  const response = await fetch(`${base}/api/job/${id}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ApiError("generic");
  return (await response.json()) as JobStatus;
}

export function fileHref(id: string): string {
  return `${base}/api/file/${id}`;
}

const CHUNK = 8 * 1024 * 1024;

export async function saveFile(
  id: string,
  name: string,
  size: number,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  const parts: BlobPart[] = [];
  let received = 0;
  let type = "";
  while (received < size) {
    const end = Math.min(size, received + CHUNK) - 1;
    let part: Blob | null = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(`${base}/api/file/${id}`, {
          headers: { Range: `bytes=${received}-${end}` },
          signal: AbortSignal.timeout(95_000),
        });
        if (res.status === 206 || res.status === 200) {
          if (!type) type = res.headers.get("content-type") ?? "";
          part = await res.blob();
          if (res.status === 200) {
            parts.push(part);
            received = size;
            onProgress?.(size, size);
            break;
          }
          if (part.size > size - received) part = part.slice(0, size - received);
          break;
        }
        part = null;
      } catch {
        part = null;
      }
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
    if (received >= size) break;
    if (!part || part.size === 0) throw new ApiError("generic");
    parts.push(part);
    received += part.size;
    onProgress?.(received, size);
  }
  const blob = new Blob(parts, type ? { type } : undefined);
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
