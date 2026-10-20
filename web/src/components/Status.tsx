import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import IconActivity from "~icons/tabler/activity";
import IconMoon from "~icons/tabler/moon";
import { fetchHealth } from "../lib/api";
import { announceOpens, openAnnounce, type ScheduleState } from "../lib/schedule";

interface Props {
  state: ScheduleState;
}

export default function Status({ state }: Props) {
  const { t, i18n } = useTranslation();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const ok = await fetchHealth();
        if (!stopped) setOnline(ok);
      } catch {
        if (!stopped) setOnline(false);
      }
    };
    void check();
    const id = window.setInterval(() => void check(), 30000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  const morningNow = state.theme === "morning";
  const announce = openAnnounce(state, i18n.resolvedLanguage === "en" ? "en" : "ru");

  const messageKey = state.paused
    ? morningNow
      ? "status.morning"
      : "status.pause"
    : online === null
      ? "status.checking"
      : online
        ? "status.day"
        : "status.technical";

  const healthy = !state.paused && online === true;

  return (
    <section id="status" className="pb-8">
      <div className="glass flex items-center gap-4 rounded-3xl px-6 py-5">
        <span
          className={
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] " +
            (healthy ? "text-emerald-600 dark:text-emerald-400" : "text-[color:var(--ink-soft)]")
          }
        >
          {state.paused ? <IconMoon width={18} height={18} /> : <IconActivity width={18} height={18} className={healthy ? "animate-pulse" : ""} />}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{t("status.title")}</h2>
          <p className="text-sm text-[color:var(--ink-soft)]">
            {state.paused && announce
              ? t(messageKey, { opens: announceOpens(t, announce) })
              : t(messageKey)}
          </p>
        </div>
      </div>
    </section>
  );
}
