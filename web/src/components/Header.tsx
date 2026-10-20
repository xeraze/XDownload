import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconMenu from "~icons/tabler/menu";
import IconX from "~icons/tabler/x";
import { setLanguage } from "../i18n";
import logoUrl from "../assets/transparent-logo.png";

export default function Header() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const lang = i18n.resolvedLanguage === "en" ? "en" : "ru";

  const langSwitch = (visibility: "always" | "desktop") => (
    <div
      className={
        (visibility === "desktop" ? "hidden sm:flex " : "flex ") +
        "items-center rounded-full border border-[color:var(--line)] p-0.5 text-xs font-medium"
      }
    >
      {(["ru", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          className={
            "rounded-full px-2.5 py-1 uppercase transition-all active:scale-95 " +
            (lang === code
              ? "bg-[color:var(--ink)] text-[color:var(--bg)]"
              : "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]")
          }
        >
          {code}
        </button>
      ))}
    </div>
  );

  return (
    <header className="glass sticky top-0 z-50">
      <div className="mx-auto flex h-16 w-full max-w-[2000px] items-center justify-between gap-3 px-6 sm:gap-0 sm:px-10 xl:px-16">
        <a href="#home" className="flex shrink-0 items-center gap-2.5">
          <img src={logoUrl} alt="" className="h-7 w-7 object-contain dark:invert" />
          <span className="font-hand text-2xl leading-normal font-bold whitespace-nowrap text-[color:var(--ink)]">
            XDownload
          </span>
        </a>
        <nav className="flex items-center gap-3 text-sm sm:gap-6">
          <a
            href="#how"
            className="hidden text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] sm:block"
          >
            {t("nav.how")}
          </a>
          <a
            href="#services"
            className="hidden text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] sm:block"
          >
            {t("nav.services")}
          </a>
          <a
            href="#download"
            className="rounded-full bg-[color:var(--ink)] px-4 py-1.5 text-xs font-medium text-[color:var(--bg)] transition-all hover:opacity-85 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
          >
            {t("nav.download")}
          </a>
          {langSwitch("desktop")}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={t("nav.menu")}
            className="-mr-1 rounded-full p-2 text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] active:scale-95 sm:hidden"
          >
            {open ? <IconX width={18} height={18} /> : <IconMenu width={18} height={18} />}
          </button>
        </nav>
        {open && (
          <div className="absolute inset-x-0 top-16 border-b border-[color:var(--line)] bg-[color:var(--bg)] px-6 py-2 shadow-lg sm:hidden">
            <a
              href="#how"
              onClick={() => setOpen(false)}
              className="block py-3 text-sm text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
            >
              {t("nav.how")}
            </a>
            <a
              href="#services"
              onClick={() => setOpen(false)}
              className="block border-t border-[color:var(--line)] py-3 text-sm text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
            >
              {t("nav.services")}
            </a>
            <div className="border-t border-[color:var(--line)] py-3">{langSwitch("always")}</div>
          </div>
        )}
      </div>
    </header>
  );
}
