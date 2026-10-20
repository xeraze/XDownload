import type { TFunction } from "i18next";

export type Theme = "day" | "morning" | "night";

export interface ScheduleState {
  theme: Theme;
  paused: boolean;
  opensToday: boolean;
  nextOpen: Date | null;
  nextClose: Date | null;
}

export interface OpenAnnounce {
  day: "today" | "tomorrow" | "date";
  date: string;
  local: string;
  kyiv: string | null;
}

const MORNING_MIN = 6 * 60;
const OPEN_MIN = 9 * 60;
const EVENING_CLOSE = 21 * 60;
const EVENING_CLOSE_WEEKEND = 21 * 60 + 30;
const TZ = "Europe/Kyiv";

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFmt = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function zonedWallToUtc(year: number, month: number, day: number, minutes: number): Date {
  const target = Date.UTC(year, month - 1, day, 0, minutes);
  let ts = target;
  for (let i = 0; i < 2; i += 1) {
    const parts = partsFmt(TZ).formatToParts(new Date(ts));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    ts += target - asUtc;
  }
  return new Date(ts);
}

export function scheduleState(now: Date = new Date()): ScheduleState {
  const parts = partsFmt(TZ).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const weekday = WEEKDAYS[parts.find((p) => p.type === "weekday")?.value ?? "Sun"] ?? 0;
  const minutes = get("hour") * 60 + get("minute");
  const close = weekday === 5 || weekday === 6 ? EVENING_CLOSE_WEEKEND : EVENING_CLOSE;

  const paused = minutes < OPEN_MIN || minutes >= close;
  const opensToday = minutes < close;
  const theme: Theme =
    minutes < MORNING_MIN ? "night" : minutes < OPEN_MIN ? "morning" : minutes < close ? "day" : "night";

  let nextOpen: Date | null = null;
  let nextClose: Date | null = null;
  if (paused) {
    nextOpen = zonedWallToUtc(get("year"), get("month"), get("day") + (minutes < OPEN_MIN ? 0 : 1), OPEN_MIN);
  } else {
    nextClose = zonedWallToUtc(get("year"), get("month"), get("day"), close);
  }

  return { theme, paused, opensToday, nextOpen, nextClose };
}

function nextOpenFallback(now: Date = new Date()): Date {
  const parts = partsFmt(TZ).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const minutes = get("hour") * 60 + get("minute");
  return zonedWallToUtc(get("year"), get("month"), get("day") + (minutes >= OPEN_MIN ? 1 : 0), OPEN_MIN);
}

export function previewState(param: string | null): ScheduleState | null {
  if (!param) return null;
  const real = scheduleState();
  if (param === "day") return { ...real, theme: "day", paused: false };
  if (param === "morning" || param === "night") {
    const theme: Theme = param;
    return {
      ...real,
      theme,
      paused: true,
      nextOpen: real.nextOpen ?? nextOpenFallback(),
    };
  }
  return null;
}

export function openAnnounce(state: ScheduleState, lang: "ru" | "en"): OpenAnnounce | null {
  if (!state.nextOpen) return null;
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const local = new Intl.DateTimeFormat(locale, timeOpts).format(state.nextOpen);
  const kyiv = new Intl.DateTimeFormat(locale, { ...timeOpts, timeZone: TZ }).format(state.nextOpen);
  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const diff = Math.round((startOfDay(state.nextOpen) - startOfDay(new Date())) / 86400000);
  const day = diff <= 0 ? "today" : diff === 1 ? "tomorrow" : "date";
  const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(state.nextOpen);
  return { day, date, local, kyiv: kyiv === local ? null : kyiv };
}

export function announceOpens(t: TFunction, announce: OpenAnnounce): string {
  const day = announce.day === "date" ? announce.date : t(`status.${announce.day}`);
  const time = announce.kyiv
    ? t("status.timeKyiv", { time: announce.local, kyiv: announce.kyiv })
    : announce.local;
  return t("status.opens", { day, time });
}
