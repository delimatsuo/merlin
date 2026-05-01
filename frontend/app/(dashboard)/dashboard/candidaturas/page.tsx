"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  SkipForward,
  AlertTriangle,
  Loader2,
  Clock,
  ExternalLink,
  Pause,
  Ban,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useQueueStore, type QueueEntry } from "@/lib/store";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { useExtensionDetected } from "@/lib/hooks/useExtensionDetected";
import { ExtensionInstallBanner } from "@/components/extension-install-banner";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;
const IDLE_POLL_INTERVAL_MS = 60_000;

interface QueueResponse {
  active: QueueEntry[];
  recent: QueueEntry[];
  active_batch_id: string | null;
}

const STATUS_COLORS: Record<QueueEntry["status"], { bg: string; text: string }> = {
  pending: { bg: "bg-muted", text: "text-muted-foreground" },
  running: { bg: "bg-blue-500/10", text: "text-blue-700" },
  applied: { bg: "bg-green-500/10", text: "text-green-700" },
  needs_attention: { bg: "bg-amber-500/10", text: "text-amber-700" },
  failed: { bg: "bg-red-500/10", text: "text-red-600" },
  skipped: { bg: "bg-muted", text: "text-muted-foreground" },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground" },
};

function StatusIcon({ status }: { status: QueueEntry["status"] }) {
  switch (status) {
    case "applied":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "needs_attention":
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "skipped":
    case "cancelled":
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:
      return null;
  }
}

function QueueRow({
  entry,
  onReview,
}: {
  entry: QueueEntry;
  onReview: (entry: QueueEntry) => void;
}) {
  const { t } = useTranslation();
  const colors = STATUS_COLORS[entry.status];

  return (
    <div className="apple-shadow-sm rounded-2xl bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-7 w-7 rounded-full bg-background border border-border flex items-center justify-center mt-0.5">
          <StatusIcon status={entry.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {entry.title || "Vaga sem título"}
            </h3>
          </div>
          {entry.company && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {entry.company}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                colors.bg,
                colors.text,
              )}
            >
              {t(`candidaturas.status.${entry.status}`)}
            </span>

            {entry.error_message && entry.status === "failed" && (
              <span className="text-[10px] text-red-600 truncate max-w-[240px]">
                {entry.error_message}
              </span>
            )}

            {entry.job_url && (
              <a
                href={entry.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {entry.source ? entry.source.charAt(0).toUpperCase() + entry.source.slice(1) : "Vaga"}
              </a>
            )}
          </div>
        </div>

        {entry.status === "needs_attention" && (
          <Button
            onClick={() => onReview(entry)}
            className="h-8 rounded-full text-xs font-semibold px-3 gap-1"
          >
            {t("candidaturas.reviewAnswer")}
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function CandidaturasContent() {
  const { t } = useTranslation();
  const { active, recent, loading, setQueue, setLoading } = useQueueStore();
  const [tab, setTab] = useState<"pipeline" | "history">("pipeline");
  const [controlBusy, setControlBusy] = useState(false);
  const extensionDetected = useExtensionDetected() === true;
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCount = active.length;

  const fetchQueue = async () => {
    try {
      const resp = await api.get<QueueResponse>("/api/applications/queue");
      setQueue({
        active: resp.active,
        recent: resp.recent,
        activeBatchId: resp.active_batch_id,
      });
    } catch {
      /* transient errors show via toast elsewhere */
    }
  };

  // Initial load + live polling while on Pipeline tab.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchQueue().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll 5s while there's live work the user is watching, 60s while idle
  // (just to notice a new batch from another device). Pause entirely when
  // the tab is hidden so we don't burn quota in a background window, and
  // refresh immediately when it becomes visible again.
  useEffect(() => {
    if (tab !== "pipeline") {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    const schedule = () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (document.visibilityState !== "visible") {
        pollTimer.current = null;
        return;
      }
      const interval = activeCount > 0 ? POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
      pollTimer.current = setInterval(fetchQueue, interval);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchQueue();
        schedule();
      } else if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeCount]);

  // Default to Pipeline when there's active work; otherwise show whichever
  // tab the user picked.
  useEffect(() => {
    if (active.length > 0 && tab !== "pipeline") setTab("pipeline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length]);

  const handleReview = (entry: QueueEntry) => {
    // Ask the extension SW (via the merlincv.com content-script bridge) to
    // focus the Gupy tab for this queue entry. Only fall back to opening
    // a fresh tab when the extension isn't installed — otherwise the
    // user ends up with two tabs on the same Gupy page.
    if (extensionDetected) {
      try {
        window.postMessage(
          { type: "MERLIN_QUEUE_FOCUS_TAB", queueId: entry.id },
          window.location.origin,
        );
      } catch {
        /* ignore */
      }
      return;
    }
    window.open(entry.job_url, "_blank", "noopener");
  };

  const handlePause = async () => {
    if (controlBusy) return;
    setControlBusy(true);
    try {
      const resp = await api.post<{ paused: number }>("/api/applications/queue/pause", {});
      toast.success(`${resp.paused} vagas pausadas`);
      await fetchQueue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao pausar");
    } finally {
      setControlBusy(false);
    }
  };

  const handleCancel = async () => {
    if (controlBusy) return;
    if (!confirm("Cancelar todas as candidaturas restantes deste lote?")) return;
    setControlBusy(true);
    try {
      const resp = await api.post<{ cancelled: number }>("/api/applications/queue/cancel", {});
      toast.success(`${resp.cancelled} vagas canceladas`);
      await fetchQueue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    } finally {
      setControlBusy(false);
    }
  };

  // Last-batch summary for the empty-pipeline state.
  const lastBatchSummary = (() => {
    if (recent.length === 0) return null;
    const lastBatchId = recent[0].batch_id;
    const entries = recent.filter((e) => e.batch_id === lastBatchId);
    const applied = entries.filter((e) => e.status === "applied").length;
    const attention = entries.filter((e) => e.status === "needs_attention").length;
    const failed = entries.filter((e) => e.status === "failed" || e.status === "cancelled" || e.status === "skipped").length;
    return { batchId: lastBatchId, total: entries.length, applied, attention, failed };
  })();

  return (
    <div className="space-y-6">
      <div className="pt-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          {t("candidaturas.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("candidaturas.subtitle")}
        </p>
      </div>

      <ExtensionInstallBanner />

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center">
          {[
            { key: "pipeline" as const, label: t("candidaturas.tabPipeline"), count: active.length },
            { key: "history" as const, label: t("candidaturas.tabHistory"), count: recent.length },
          ].map((item) => {
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  {item.label}
                  {item.count > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-semibold",
                        isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {tab === "pipeline" && active.length > 0 && (
            <>
              <Button
                variant="ghost"
                onClick={handlePause}
                disabled={controlBusy}
                className="h-8 rounded-full text-xs font-medium gap-1.5"
              >
                <Pause className="h-3.5 w-3.5" />
                {t("candidaturas.pause")}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={controlBusy}
                className="h-8 rounded-full text-xs font-medium gap-1.5"
              >
                <Ban className="h-3.5 w-3.5" />
                {t("candidaturas.cancel")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline tab */}
      {tab === "pipeline" && (
        <>
          {loading && active.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl bg-card h-20 animate-pulse apple-shadow-sm" />
              ))}
            </div>
          )}

          {!loading && active.length === 0 && (
            <div className="apple-shadow rounded-2xl bg-card p-8 text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <PlayCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {t("candidaturas.emptyPipeline")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
                {t("candidaturas.emptyPipelineSub")}
              </p>

              {lastBatchSummary && (
                <div className="mt-5 rounded-xl bg-muted/40 border border-border p-4 max-w-sm mx-auto text-left">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {t("candidaturas.lastBatch")}
                  </p>
                  <p className="text-sm text-foreground mt-1.5">
                    {t("candidaturas.batchSummary", {
                      applied: String(lastBatchSummary.applied),
                      attention: String(lastBatchSummary.attention),
                      failed: String(lastBatchSummary.failed),
                    })}
                  </p>
                  <button
                    onClick={() => setTab("history")}
                    className="text-xs text-foreground font-medium mt-2 hover:underline"
                  >
                    {t("candidaturas.viewHistory")} →
                  </button>
                </div>
              )}

              <div className="mt-5">
                <Link
                  href="/dashboard/vagas"
                  className="inline-flex items-center h-9 px-5 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors"
                >
                  {t("candidaturas.browseJobs")}
                </Link>
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div className="space-y-3">
              {active.map((entry) => (
                <QueueRow key={entry.id} entry={entry} onReview={handleReview} />
              ))}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === "history" && (
        <>
          {recent.length === 0 ? (
            <div className="apple-shadow rounded-2xl bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("candidaturas.emptyHistory")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map((entry) => (
                <QueueRow key={entry.id} entry={entry} onReview={handleReview} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CandidaturasPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-10 pt-4">
          <div className="h-9 w-48 bg-secondary rounded-xl animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-card h-20 animate-pulse apple-shadow-sm" />
            ))}
          </div>
        </div>
      }
    >
      <CandidaturasContent />
    </Suspense>
  );
}
