import { useTranslation } from "react-i18next";
import { ServicesMarquee } from "./ServicesGrid";

export default function Services() {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden py-12 sm:py-16">
      <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("services.title")}
      </h2>
      <p className="mt-2 text-sm text-[color:var(--ink-soft)]">{t("services.subtitle")}</p>
      <a href="#services" className="mt-8 block" aria-label={t("nav.services")}>
        <ServicesMarquee />
      </a>
    </section>
  );
}
