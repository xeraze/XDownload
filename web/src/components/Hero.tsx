import { useTranslation } from "react-i18next";
import IconDownload from "~icons/tabler/download";
import { PRIMARY } from "../lib/buttons";

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative pt-12 pb-6 sm:pt-20 sm:pb-10">
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl leading-[1.08] font-extrabold tracking-tight text-[color:var(--ink)] text-balance sm:text-5xl xl:text-7xl">
          {t("hero.titleAccent")} {t("hero.titleRest")}
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[color:var(--ink-soft)] text-pretty">
          {t("hero.subtitle")}
        </p>
        <div className="mt-8">
          <a href="#download" className={PRIMARY + " px-7 py-4 text-base"}>
            <IconDownload width={18} height={18} />
            {t("hero.cta")}
          </a>
        </div>
      </div>
    </section>
  );
}
