import { useEffect, useState } from "react";
import { previewState, scheduleState, type ScheduleState } from "./lib/schedule";
import { addHistory, clearHistory, loadHistory, type DownloadEntry } from "./lib/history";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Status from "./components/Status";
import HowItWorks from "./components/HowItWorks";
import Services from "./components/Services";
import HowPage from "./components/HowPage";
import ServicesPage from "./components/ServicesPage";
import Tool from "./components/Tool";
import Privacy from "./components/Privacy";
import Footer from "./components/Footer";

const TOP_ROUTES = ["", "#home", "#download", "#downloads", "#privacy", "#how", "#services"];
const FINE_POINTER = window.matchMedia("(pointer: fine)").matches;

export default function App() {
  const [preview] = useState(() =>
    previewState(new URLSearchParams(window.location.search).get("theme")),
  );
  const [state, setState] = useState<ScheduleState>(() => preview ?? scheduleState());
  const [route, setRoute] = useState(() => window.location.hash);
  const [history, setHistory] = useState<DownloadEntry[]>(() => loadHistory());

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state]);

  useEffect(() => {
    if (preview) return;
    const id = window.setInterval(() => setState(scheduleState()), 30_000);
    return () => window.clearInterval(id);
  }, [preview]);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (TOP_ROUTES.includes(route)) {
      window.scrollTo({ top: 0 });
      return;
    }
    document.getElementById(route.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [route]);

  const onDownloaded = (entry: DownloadEntry) => {
    setHistory(addHistory(entry));
  };

  const onClear = () => {
    clearHistory();
    setHistory([]);
  };

  const view =
    route === "#download" || route === "#downloads"
      ? "tool"
      : route === "#privacy"
        ? "privacy"
        : route === "#how"
          ? "how"
          : route === "#services"
            ? "services"
            : "home";

  return (
    <div
      className="flex min-h-screen flex-col"
      onMouseMove={(event) => {
        if (!FINE_POINTER) return;
        document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
        document.documentElement.style.setProperty("--my", `${event.clientY}px`);
      }}
    >
      <div className="page-grid pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <div className="page-grid-glow pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <div className="spotlight pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <div className="page-grain pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <Header />
      <main className="mx-auto w-full max-w-[2000px] flex-1 px-6 sm:px-10 xl:px-16">
        {view === "tool" ? (
          <Tool state={state} entries={history} onDownloaded={onDownloaded} onClear={onClear} />
        ) : view === "privacy" ? (
          <Privacy />
        ) : view === "how" ? (
          <HowPage />
        ) : view === "services" ? (
          <ServicesPage />
        ) : (
          <>
            <Hero />
            <Status state={state} />
            <HowItWorks />
            <Services />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
