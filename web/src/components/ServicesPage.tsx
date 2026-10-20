import { useTranslation } from "react-i18next";
import ServicesGrid from "./ServicesGrid";

export default function ServicesPage() {
  const { t } = useTranslation();

  return (
    <section className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("services.title")}
      </h1>
      <p className="mt-3 text-[color:var(--ink-soft)]">{t("services.subtitle")}</p>
      <div className="mt-8">
        <ServicesGrid />
      </div>
      <p className="mt-6 text-sm text-[color:var(--ink-soft)]">
        {t("services.legend")}
      </p>
    </section>
  );
}
