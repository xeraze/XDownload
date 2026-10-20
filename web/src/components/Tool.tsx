import { useTranslation } from "react-i18next";
import type { ScheduleState } from "../lib/schedule";
import type { DownloadEntry } from "../lib/history";
import Downloader from "./Downloader";
import Downloads from "./Downloads";

interface Props {
  state: ScheduleState;
  entries: DownloadEntry[];
  onDownloaded: (entry: DownloadEntry) => void;
  onClear: () => void;
}

export default function Tool({ state, entries, onDownloaded, onClear }: Props) {
  const { t } = useTranslation();

  return (
    <section className="py-14 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("tool.title")}</h1>
        <p className="mt-4 text-[color:var(--ink-soft)]">{t("tool.subtitle")}</p>
      </div>
      <div className="mx-auto mt-8 max-w-3xl">
        <Downloader state={state} onDownloaded={onDownloaded} />
      </div>
      <div className="mt-14">
        <Downloads entries={entries} onClear={onClear} />
      </div>
    </section>
  );
}
