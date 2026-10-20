import { useTranslation } from "react-i18next";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-[color:var(--line)]">
      <div className="mx-auto flex w-full max-w-[2000px] flex-col gap-3 px-6 py-8 text-xs text-[color:var(--ink-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-10 xl:px-16">
        <span className="font-hand shrink-0 text-xl leading-normal font-bold whitespace-nowrap text-[color:var(--ink)]">
          XDownload
        </span>
        <span>{t("footer.note")}</span>
        <div className="flex flex-wrap items-center gap-5">
          <span className="font-medium text-[color:var(--ink)]">{t("footer.contacts")}</span>
          <a
            href="https://t.me/xerazetg"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[color:var(--ink)]"
          >
            t.me/xerazetg
          </a>
          <a href="#privacy" className="transition-colors hover:text-[color:var(--ink)]">
            {t("footer.privacy")}
          </a>
        </div>
      </div>
    </footer>
  );
}
