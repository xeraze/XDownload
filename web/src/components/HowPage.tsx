import { useTranslation } from "react-i18next";
import IconDownload from "~icons/tabler/download";
import IconHistory from "~icons/tabler/history";
import IconLink from "~icons/tabler/link";
import IconDatabase from "~icons/tabler/database";
import IconPhotoVideo from "~icons/tabler/photo-video";
import IconVideo from "~icons/tabler/video";

export default function HowPage() {
  const { t } = useTranslation();

  const steps = [
    { icon: IconLink, title: t("how.s1t"), text: t("how.s1d") },
    { icon: IconVideo, title: t("how.s2t"), text: t("how.s2d") },
    { icon: IconDownload, title: t("how.s3t"), text: t("how.s3d") },
  ];

  const blocks = [
    { icon: IconPhotoVideo, title: t("how.fmtT"), text: t("how.fmtD") },
    { icon: IconDatabase, title: t("how.storT"), text: t("how.storD") },
    { icon: IconHistory, title: t("how.histT"), text: t("how.histD") },
  ];

  const faq = [
    { q: t("how.q1"), a: t("how.a1") },
    { q: t("how.q2"), a: t("how.a2") },
    { q: t("how.q3"), a: t("how.a3") },
  ];

  return (
    <section className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("how.title")}
      </h1>
      <p className="mt-3 text-[color:var(--ink-soft)]">{t("how.lead")}</p>

      <div className="mt-10 grid gap-4">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <div
              key={step.title}
              className="flex items-start gap-5 rounded-3xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] p-6 sm:p-8"
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--line)]">
                <StepIcon width={20} height={20} />
              </span>
              <div>
                <span className="text-xs font-medium text-[color:var(--ink-soft)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-1 text-lg font-medium">{step.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--ink-soft)]">
                  {step.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {blocks.map((block) => {
          const BlockIcon = block.icon;
          return (
            <div
              key={block.title}
              className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] p-6"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line)]">
                <BlockIcon width={16} height={16} />
              </span>
              <h3 className="mt-4 font-medium">{block.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                {block.text}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("how.faqT")}
        </h2>
        <div className="mt-6 grid max-w-3xl gap-3">
          {faq.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-[color:var(--line)] px-5 py-4"
            >
              <p className="font-medium">{item.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
