import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ReviewError,
  avatarHref,
  clearEdit,
  deleteReview,
  fetchMyReview,
  fetchReviews,
  identityOf,
  storedEdit,
  storeEdit,
  submitReview,
  updateReview,
  type ReviewItem,
  type ReviewList,
  type ReviewSource,
} from "../lib/reviews";

type LoadState = "loading" | "ok" | "error";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

function Avatar({ review }: { review: ReviewItem }) {
  const [failed, setFailed] = useState(false);
  if (review.has_avatar && !failed) {
    return (
      <img
        src={avatarHref(review.id)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-11 w-11 shrink-0 rounded-full border border-[color:var(--line)] object-cover"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--chip-bg)] text-xs font-semibold text-[color:var(--ink-soft)]">
      {initials(review.author)}
    </div>
  );
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="tracking-tight text-amber-500" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ fontSize: size }} aria-hidden="true">
          {n <= value ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function SourceBadge({ source, label }: { source: ReviewSource; label: string }) {
  const tone =
    source === "bot"
      ? "border-sky-500/40 text-sky-500"
      : source === "manual"
        ? "border-violet-500/40 text-violet-500"
        : "border-[color:var(--line)] text-[color:var(--ink-soft)]";
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${tone}`}>
      {label}
    </span>
  );
}

export default function Reviews() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<LoadState>("loading");
  const [list, setList] = useState<ReviewList | null>(null);
  const [mine, setMine] = useState<ReviewItem | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (signal?: AbortSignal) => {
    try {
      const [next, own] = await Promise.all([
        fetchReviews(signal),
        fetchMyReview(identityOf()).catch(() => null),
      ]);
      setList(next);
      setMine(own);
      if (own && !editing) {
        setRating(own.rating);
        setText(own.text);
        setAuthor(own.author);
      }
      setStatus("ok");
    } catch (error) {
      if (error instanceof ReviewError && error.kind === "blocked") {
        setBlocked(error.reason ?? "");
        setStatus("ok");
        return;
      }
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      setStatus("error");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const onDelete = async () => {
    const edit = storedEdit();
    if (!mine || !edit) return;
    if (!window.confirm(t("reviews.deleteConfirm"))) return;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await deleteReview(mine.id, edit.token);
      clearEdit();
      setMine(null);
      setEditing(false);
      setRating(0);
      setText("");
      setAuthor("");
      setNotice(t("reviews.deleted"));
      await load();
    } catch (error) {
      if (error instanceof ReviewError && error.kind === "blocked") {
        setBlocked(error.reason ?? "");
      } else {
        setFormError(t("reviews.errGeneric"));
      }
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      setFormError(t("reviews.pickRating"));
      return;
    }
    if (!mine && !text.trim()) {
      setFormError(t("reviews.textRequired"));
      return;
    }
    setBusy(true);
    setFormError(null);
    setNotice(null);
    const payload = { rating, text: text.trim(), author: author.trim() || "Guest" };
    try {
      const edit = storedEdit();
      if (mine && edit) {
        try {
          await updateReview(edit.id, { rating: payload.rating, text: payload.text, token: edit.token });
        } catch (error) {
          if (error instanceof ReviewError && error.kind === "generic") {
            clearEdit();
            const created = await submitReview(payload);
            storeEdit(created.id, created.edit_token);
          } else {
            throw error;
          }
        }
        setNotice(t("reviews.updated"));
      } else {
        const created = await submitReview(payload);
        storeEdit(created.id, created.edit_token);
        setNotice(t("reviews.saved"));
      }
      setEditing(false);
      await load();
    } catch (error) {
      if (error instanceof ReviewError && error.kind === "blocked") {
        setBlocked(error.reason ?? "");
      } else if (error instanceof ReviewError && error.kind === "cooldown") {
        setFormError(t("reviews.cooldown", { s: error.retry ?? 60 }));
      } else {
        setFormError(t("reviews.errGeneric"));
      }
    } finally {
      setBusy(false);
    }
  };

  if (blocked !== null) {
    return (
      <section className="mx-auto max-w-3xl py-14 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("reviews.title")}</h1>
        <div className="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          {t("reviews.blocked", { reason: blocked || t("reviews.blockedPlain") })}
        </div>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className="mx-auto max-w-3xl py-14 text-sm text-[color:var(--ink-soft)] sm:py-20">
        {t("reviews.loading")}
      </section>
    );
  }

  if (status === "error" || !list) {
    return (
      <section className="mx-auto max-w-3xl py-14 text-sm text-[color:var(--ink-soft)] sm:py-20">
        {t("reviews.loadErr")}
      </section>
    );
  }

  const { aggregate, reviews } = list;
  const dist = aggregate.dist ?? {};
  const maxDist = Math.max(1, ...[1, 2, 3, 4, 5].map((n) => Number(dist[String(n)] ?? 0)));
  const showForm = !mine || editing;
  const lang = i18n.resolvedLanguage === "en" ? "en-US" : "ru-RU";

  return (
    <section className="mx-auto max-w-3xl py-14 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("reviews.title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">{t("reviews.lead")}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] px-6 py-5 text-center">
          <div className="text-4xl font-semibold tracking-tight">
            {aggregate.count ? aggregate.avg.toFixed(1) : "—"}
          </div>
          <div className="mt-1">
            <Stars value={Math.round(aggregate.avg)} />
          </div>
          <div className="mt-1 text-xs text-[color:var(--ink-soft)]">
            {aggregate.count
              ? t("reviews.avgOf", { avg: aggregate.avg.toFixed(1) })
              : t("reviews.count", { count: 0 })}
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-xs text-[color:var(--ink-soft)]">
            <span className="font-medium uppercase">{t("reviews.distTitle")}</span>
            <span>{t("reviews.count", { count: aggregate.count })}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const value = Number(dist[String(n)] ?? 0);
              return (
                <div key={n} className="flex items-center gap-3 text-xs">
                  <span className="w-3 text-right text-[color:var(--ink-soft)]">{n}</span>
                  <span aria-hidden="true" className="text-amber-500">
                    ★
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--line)]">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${(value / maxDist) * 100}%` }}
                    />
                  </div>
                  <span className="w-5 text-right text-[color:var(--ink-soft)]">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              {editing ? t("reviews.yourReview") : t("reviews.formTitle")}
            </h2>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setFormError(null);
                  if (mine) {
                    setRating(mine.rating);
                    setText(mine.text);
                    setAuthor(mine.author);
                  }
                }}
                className="text-xs text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
              >
                {t("reviews.cancel")}
              </button>
            )}
          </div>

          <div className="mt-4 text-xs font-medium text-[color:var(--ink-soft)]">
            {t("reviews.ratingLabel")}
          </div>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setRating(n);
                  setFormError(null);
                }}
                aria-label={`${n}/5`}
                className={
                  "flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition-all active:scale-95 " +
                  (n <= rating
                    ? "border-amber-500 bg-amber-500/15 text-amber-500"
                    : "border-[color:var(--line)] text-[color:var(--ink-soft)] hover:border-amber-500/50")
                }
              >
                ★
              </button>
            ))}
          </div>

          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            maxLength={64}
            placeholder={t("reviews.namePlaceholder")}
            className="mt-4 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[color:var(--ink)]"
          />
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFormError(null);
            }}
            maxLength={2000}
            rows={3}
            placeholder={t("reviews.textPlaceholder")}
            className="mt-3 w-full resize-y rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[color:var(--ink)]"
          />

          {formError && <p className="mt-3 text-xs text-red-500">{formError}</p>}
          {notice && <p className="mt-3 text-xs text-emerald-500">{notice}</p>}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] leading-snug text-[color:var(--ink-soft)]">
              {t("reviews.privacyNote")}
            </span>
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-full bg-[color:var(--ink)] px-5 py-2 text-xs font-medium text-[color:var(--bg)] transition-all hover:opacity-85 active:scale-95 disabled:opacity-60"
            >
              {busy ? t("reviews.saving") : t("reviews.submit")}
            </button>
          </div>
        </form>
      ) : (
        mine && (
          <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-[color:var(--ink-soft)]">
                <span className="font-medium uppercase text-[color:var(--ink)]">
                  {t("reviews.yourReview")}
                </span>
                <Stars value={mine.rating} size={12} />
              </div>
              <p className="mt-1 truncate text-sm text-[color:var(--ink-soft)]">
                {mine.text || "—"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(true);
                  setRating(mine.rating);
                  setText(mine.text);
                  setAuthor(mine.author);
                  setNotice(null);
                  setFormError(null);
                }}
                className="rounded-full border border-[color:var(--line)] px-4 py-1.5 text-xs font-medium transition-all hover:border-[color:var(--ink)] active:scale-95 disabled:opacity-60"
              >
                {t("reviews.edit")}
              </button>
              {storedEdit() && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className="rounded-full border border-red-500/40 px-4 py-1.5 text-xs font-medium text-red-500 transition-all hover:border-red-500 active:scale-95 disabled:opacity-60"
                >
                  {t("reviews.delete")}
                </button>
              )}
            </div>
          </div>
        )
      )}

      {notice && !showForm && (
        <p className="mt-3 text-xs text-emerald-500">{notice}</p>
      )}
      {!showForm && formError && (
        <p className="mt-3 text-xs text-red-500">{formError}</p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {reviews.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--line)] px-5 py-8 text-center text-sm text-[color:var(--ink-soft)]">
            {t("reviews.empty")}
          </p>
        ) : (
          reviews.map((review) => (
            <article
              key={review.id}
              className="flex gap-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-bg)] p-4 transition-all hover:border-[color:var(--glass-border)]"
            >
              <Avatar review={review} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{review.author}</span>
                  <SourceBadge
                    source={review.source}
                    label={
                      review.source === "bot"
                        ? t("reviews.sourceBot")
                        : review.source === "manual"
                          ? t("reviews.sourceManual")
                          : t("reviews.sourceSite")
                    }
                  />
                  <span className="ml-auto shrink-0 text-[11px] text-[color:var(--ink-soft)]">
                    {new Date(review.created_at).toLocaleDateString(lang)}
                  </span>
                </div>
                <div className="mt-1">
                  <Stars value={review.rating} />
                </div>
                {review.text && (
                  <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-[color:var(--ink-soft)]">
                    {review.text}
                  </p>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
