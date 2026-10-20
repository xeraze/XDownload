import { useTranslation } from "react-i18next";
import IconDownload from "~icons/tabler/download";
import IconLink from "~icons/tabler/link";
import IconVideo from "~icons/tabler/video";

export default function HowItWorks() {
  const { t } = useTranslation();

  const steps = [
    { icon: IconLink, title: t("how.s1t"), desc: t("how.s1d") },
    { icon: IconVideo, title: t("how.s2t"), desc: t("how.s2d") },
    { icon: IconDownload, title: t("how.s3t"), desc: t("how.s3d") },
  ];

  return (
    <section className="py-14 sm:py-20">
      <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("how.title")}
      </h2>
      <p className="mt-2 text-base text-[color:var(--ink-soft)]">{t("how.lead")}</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-5">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <a
              key={step.title}
              href="#how"
              className="group relative overflow-hidden rounded-3xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] p-7 transition-all hover:-translate-y-1 hover:border-[color:var(--glass-border)] sm:p-8"
            >
              <span
                aria-hidden="true"
                className="font-display pointer-events-none absolute -top-6 right-4 text-8xl leading-none font-extrabold tracking-tight text-[color:var(--line-strong)] select-none transition-colors group-hover:text-[color:var(--ink-soft)]"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg)] text-[color:var(--ink)] transition-transform group-hover:scale-110">
                <StepIcon width={22} height={22} />
              </span>
              <h3 className="font-display mt-6 text-xl font-semibold tracking-tight text-[color:var(--ink)] sm:text-2xl">
                {step.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[color:var(--ink-soft)] text-pretty">
                {step.desc}
              </p>
            </a>
          );
        })}
      </div>
    </section>
  );
}
