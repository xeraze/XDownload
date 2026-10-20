export interface DownloadEntry {
  id: string;
  url: string;
  name: string;
  size?: number;
  at: number;
}

const KEY = "xdl-history";
const LIMIT = 50;

export function loadHistory(): DownloadEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DownloadEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as DownloadEntry).id === "string" &&
        typeof (item as DownloadEntry).name === "string" &&
        typeof (item as DownloadEntry).at === "number",
    );
  } catch {
    return [];
  }
}

export function addHistory(entry: DownloadEntry): DownloadEntry[] {
  const next = [entry, ...loadHistory().filter((item) => item.id !== entry.id)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return loadHistory();
  }
  return next;
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}
