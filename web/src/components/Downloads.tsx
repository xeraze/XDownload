import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import IconDownload from "~icons/tabler/download";
import IconDatabase from "~icons/tabler/database";
import IconTrash from "~icons/tabler/trash";
import { fileHref } from "../lib/api";
import { formatSize } from "../lib/format";
import type { DownloadEntry } from "../lib/history";

interface Props {
  entries: DownloadEntry[];
  onClear: () => void;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export default function Downloads({ entries, onClear }: Props) {
  const { t, i18n } = useTranslation();
  const [alive, setAlive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let stopped = false;
    const check = async (entry: DownloadEntry) => {
      try {
        const response = await fetch(fileHref(entry.id), {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        const type = response.headers.get("content-type") ?? "";
        const ok = response.ok && !type.includes("text/html");
        if (!stopped) setAlive((prev) => ({ ...prev, [entry.id]: ok }));
      } catch {
        if (!stopped) setAlive((prev) => ({ ...prev, [entry.id]: false }));
      }
    };
    void Promise.all(entries.map(check));
    return () => {
      stopped = true;
    };
  }, [entries]);

  const dateLocale = i18n.resolvedLanguage === "en" ? "en-US" : "ru-RU";

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("downloads.title")}
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] px-4 py-2 text-xs text-[color:var(--ink-soft)] transition-all hover:border-[color:var(--ink-soft)] active:scale-[0.98]"
          >
            <IconTrash width={14} height={14} />
            {t("downloads.clear")}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="glass mt-8 flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
          <IconDatabase width={24} height={24} className="text-[color:var(--ink-soft)]" />
          <p className="text-sm text-[color:var(--ink-soft)]">{t("downloads.empty")}</p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] px-5 py-4"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)]">
                <IconDownload width={15} height={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.name}</p>
                <p className="truncate text-xs text-[color:var(--ink-soft)]">
                  {[
                    formatSize(entry.size),
                    new Date(entry.at).toLocaleString(dateLocale),
                    hostOf(entry.url),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {alive[entry.id] ? (
                <a
                  href={fileHref(entry.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-neutral-700 active:scale-[0.95] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  {t("downloads.again")}
                </a>
              ) : (
                <span className="shrink-0 text-xs text-[color:var(--ink-soft)]">
                  {alive[entry.id] === undefined ? "" : t("downloads.local")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
