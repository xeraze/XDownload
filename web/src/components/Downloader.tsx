import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import IconAlertCircle from "~icons/tabler/alert-circle";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconCircleCheck from "~icons/tabler/circle-check";
import IconDownload from "~icons/tabler/download";
import IconMusic from "~icons/tabler/music";
import IconVideo from "~icons/tabler/video";
import { ApiError, createJob, fileHref, getJob, saveFile } from "../lib/api";
import { FIELD, PRIMARY, SECONDARY } from "../lib/buttons";
import { formatSize } from "../lib/format";
import type { DownloadEntry } from "../lib/history";
import { announceOpens, openAnnounce, type ScheduleState } from "../lib/schedule";

type Phase = "idle" | "format" | "quality" | "working" | "done" | "error";
type ErrorKey = "offline" | "unsupported" | "generic" | "pause";

interface Props {
  state: ScheduleState;
  onDownloaded: (entry: DownloadEntry) => void;
}

export default function Downloader({ state, onDownloaded }: Props) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [file, setFile] = useState<{ name: string; size?: number } | null>(null);
  const [errorKey, setErrorKey] = useState<ErrorKey>("generic");
  const [saving, setSaving] = useState<number | null>(null);
  const [saveErr, setSaveErr] = useState(false);

  const pauseError = () => {
    setErrorKey("pause");
    setPhase("error");
  };

  const mapError = (err: unknown) => {
    if (err instanceof ApiError) {
      setErrorKey(err.kind === "unsupported" ? "unsupported" : "generic");
    } else {
      setErrorKey("offline");
    }
    setPhase("error");
  };

  const submit = () => {
    const trimmed = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setErrorKey("unsupported");
      setPhase("error");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setErrorKey("unsupported");
      setPhase("error");
      return;
    }
    if (state.paused) {
      pauseError();
      return;
    }
    setPhase("format");
  };

  const start = async (chosen: "mp4" | "mp3", height?: number) => {
    if (state.paused) {
      pauseError();
      return;
    }
    setProgress(null);
    setFile(null);
    setPhase("working");
    try {
      const id = await createJob(url.trim(), chosen, height);
      setJobId(id);
    } catch (err) {
      mapError(err);
    }
  };

  const reset = () => {
    setPhase("idle");
    setJobId(null);
    setProgress(null);
    setFile(null);
    setSaving(null);
    setSaveErr(false);
  };

  const save = async () => {
    if (!jobId || !file || saving !== null) return;
    setSaveErr(false);
    if (!file.size) {
      window.location.href = fileHref(jobId);
      return;
    }
    const total = file.size;
    const fname = file.name;
    setSaving(0);
    try {
      await saveFile(jobId, fname, total, (_received, totalBytes) => {
        setSaving(Math.round((_received / totalBytes) * 100));
      });
    } catch {
      setSaveErr(true);
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    if (!jobId || phase !== "working") return;
    let stopped = false;
    let attempts = 0;
    let timer = 0;

    const tick = async () => {
      try {
        const job = await getJob(jobId);
        if (stopped) return;
        attempts = 0;
        if (job.state === "done") {
          const name = job.file?.name ?? "file";
          const size = job.file?.size;
          setFile({ name, size });
          setPhase("done");
          onDownloaded({ id: jobId, url: url.trim(), name, size, at: Date.now() });
          return;
        }
        if (job.state === "error") {
          setErrorKey("generic");
          setPhase("error");
          return;
        }
        if (typeof job.progress === "number") setProgress(job.progress);
        timer = window.setTimeout(tick, 1000);
      } catch {
        if (stopped) return;
        attempts += 1;
        if (attempts >= 3) {
          setErrorKey("offline");
          setPhase("error");
          return;
        }
        timer = window.setTimeout(tick, 1000);
      }
    };

    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [jobId, phase]);

  const announce = openAnnounce(state, i18n.resolvedLanguage === "en" ? "en" : "ru");
  const errorMessage =
    errorKey === "pause"
      ? t("status.pause", { opens: announce ? announceOpens(t, announce) : "" })
      : errorKey === "offline"
        ? t("dl.errOffline")
        : errorKey === "unsupported"
          ? t("dl.errUnsupported")
          : t("dl.errGeneric");

  return (
    <div className="glass rounded-3xl p-6 transition-colors focus-within:border-[color:var(--ink-soft)] sm:p-8">
      {phase === "idle" && (
        <form
          className="phase-in flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("dl.placeholder")}
            className={FIELD}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className={PRIMARY + " sm:w-40"}>
            {t("dl.submit")}
          </button>
        </form>
      )}

      {phase === "format" && (
        <div className="phase-in">
          <div className="flex items-center justify-between gap-4">
            <span className="truncate text-sm text-[color:var(--ink-soft)]">{url}</span>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="shrink-0 text-sm text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
            >
              {t("dl.change")}
            </button>
          </div>
          <p className="mt-4 text-sm font-medium">{t("dl.chooseFormat")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                setPhase("quality");
              }}
            >
              <IconVideo width={16} height={16} />
              {t("dl.video")}
            </button>
            <button type="button" className={SECONDARY} onClick={() => start("mp3")}>
              <IconMusic width={16} height={16} />
              {t("dl.audio")}
            </button>
          </div>
        </div>
      )}

      {phase === "quality" && (
        <div className="phase-in">
          <div className="flex items-center justify-between gap-4">
            <span className="truncate text-sm text-[color:var(--ink-soft)]">{url}</span>
            <button
              type="button"
              onClick={() => setPhase("format")}
              className="flex shrink-0 items-center gap-1 text-sm text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
            >
              <IconArrowLeft width={14} height={14} />
              {t("dl.back")}
            </button>
          </div>
          <p className="mt-4 text-sm font-medium">{t("dl.chooseQuality")}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {[1080, 720, 480].map((height) => (
              <button
                key={height}
                type="button"
                className={SECONDARY}
                onClick={() => start("mp4", height)}
              >
                {height}p
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "working" && (
        <div className="phase-in py-2">
          {progress === null ? (
            <div className="flex flex-col items-center gap-3" aria-hidden="true">
              <div className="skeleton h-4 w-2/3 rounded-full" />
              <div className="skeleton h-4 w-1/2 rounded-full" />
              <div className="mt-2 flex justify-center gap-3">
                <div className="skeleton h-10 w-32 rounded-2xl" />
                <div className="skeleton h-10 w-32 rounded-2xl" />
              </div>
            </div>
          ) : (
            <div className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[color:var(--chip-bg)]">
              <div
                className="h-full rounded-full bg-neutral-900 transition-all dark:bg-white"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
          <p className="mt-4 text-center text-sm text-[color:var(--ink-soft)]">{t("dl.working")}</p>
        </div>
      )}

      {phase === "done" && file && (
        <div className="phase-in flex flex-col items-center gap-4 py-4 text-center">
          <IconCircleCheck width={28} height={28} className="text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-medium">{file.name}</p>
            {formatSize(file.size) && (
              <p className="mt-1 text-sm text-[color:var(--ink-soft)]">{formatSize(file.size)}</p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {jobId && (
              <button type="button" className={PRIMARY} onClick={() => void save()} disabled={saving !== null}>
                <IconDownload width={16} height={16} />
                {saving === null ? t("dl.save") : `${saving}%`}
              </button>
            )}
            <button type="button" className={SECONDARY} onClick={reset}>
              {t("dl.again")}
            </button>
          </div>
          {saveErr && <p className="text-sm text-red-500">{t("dl.saveErr")}</p>}
        </div>
      )}

      {phase === "error" && (
        <div className="phase-in flex flex-col items-center gap-4 py-4 text-center">
          <IconAlertCircle width={28} height={28} className="text-[color:var(--ink-soft)]" />
          <p className="text-sm text-[color:var(--ink-soft)]">{errorMessage}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className={PRIMARY} onClick={reset}>
              <IconArrowLeft width={16} height={16} />
              {t("dl.retry")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
