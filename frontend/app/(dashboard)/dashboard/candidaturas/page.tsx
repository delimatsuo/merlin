"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
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
import { useAuthStore, useQueueStore, type QueueEntry } from "@/lib/store";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { useExtensionStatus, type ExtensionUser } from "@/lib/hooks/useExtensionDetected";
import { ExtensionInstallBanner } from "@/components/extension-install-banner";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5_000;
const IDLE_POLL_INTERVAL_MS = 60_000;

interface QueueResponse {
  active: QueueEntry[];
  recent: QueueEntry[];
  active_batch_id: string | null;
}

interface QueueDriveResult {
  ok: boolean;
  reason?: string;
  activeCount?: number;
  pendingCount?: number;
  runningCount?: number;
  attentionCount?: number;
  openedCount?: number;
  failedToOpenCount?: number;
  pendingIds?: string[];
  apiStatus?: number;
  error?: string;
}

interface QueueKickResult {
  ok?: boolean;
  error?: string;
  queue?: QueueDriveResult;
  user?: ExtensionUser | null;
  isAuthenticated?: boolean;
  version?: string;
}

function shortUid(uid?: string | null): string {
  if (!uid) return "";
  return uid.length > 8 ? `...${uid.slice(-8)}` : uid;
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
  const { user } = useAuthStore();
  const { active, recent, loading, setQueue, setLoading } = useQueueStore();
  const [tab, setTab] = useState<"pipeline" | "history">("pipeline");
  const [controlBusy, setControlBusy] = useState(false);
  const [lastKickResult, setLastKickResult] = useState<QueueKickResult | null>(null);
  const extensionStatus = useExtensionStatus();
  const extensionDetected = extensionStatus.detected === true;
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQueueKick = useRef<{ signature: string; at: number } | null>(null);
  const activeCount = active.length;
  const pendingEntries = useMemo(
    () => active.filter((entry) => entry.status === "pending"),
    [active],
  );
  const pendingCount = pendingEntries.length;

  const fetchQueue = useCallback(async () => {
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
  }, [setQueue]);

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
  }, [fetchQueue, setLoading]);

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
  }, [tab, activeCount, fetchQueue]);

  // Default to Pipeline when there's active work; otherwise show whichever
  // tab the user picked.
  useEffect(() => {
    if (active.length > 0 && tab !== "pipeline") setTab("pipeline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length]);

  // If the user lands directly on the batch page with pending entries, nudge
  // the extension worker. The original flow only kicked the worker from the
  // job-search page after creating a batch, so any missed bridge message left
  // the pipeline stuck in "Aguardando" until the extension alarm eventually
  // fired, or forever if the bridge was stale.
  useEffect(() => {
    if (!extensionDetected) return;
    const pendingIds = pendingEntries
      .map((entry) => entry.id)
      .sort();
    if (pendingIds.length === 0) return;

    const signature = pendingIds.join(",");
    const now = Date.now();
    const last = lastQueueKick.current;
    if (last?.signature === signature && now - last.at < 15_000) return;

    lastQueueKick.current = { signature, at: now };
    try {
      window.postMessage({ type: "MERLIN_QUEUE_KICK" }, window.location.origin);
    } catch {
      /* extension unavailable; install banner covers the fallback */
    }
  }, [pendingEntries, extensionDetected]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as QueueKickResult & { type?: string };
      if (!data || data.type !== "MERLIN_QUEUE_KICK_RESULT") return;
      setLastKickResult({
        ok: data.ok,
        error: data.error,
        queue: data.queue,
        user: data.user ?? null,
        isAuthenticated: data.isAuthenticated,
        version: data.version,
      });
      void fetchQueue();
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [fetchQueue]);

  const queueIssue = useMemo(() => {
    if (pendingCount === 0) return null;
    if (extensionStatus.detected === false) return null;

    const extensionUser = lastKickResult?.user ?? extensionStatus.user ?? null;
    const extensionAuthenticated =
      lastKickResult?.isAuthenticated ?? extensionStatus.isAuthenticated;
    const dashboardEmail = user?.email ?? null;

    if (extensionStatus.detected === true && !extensionStatus.version) {
      return {
        title: "Extensão desatualizada",
        body: "Recarregue a extensão Merlin 1.0.7. A versão instalada não envia diagnósticos suficientes para iniciar este lote com segurança.",
        detail: "",
      };
    }

    if (extensionStatus.detected === true && extensionAuthenticated === false) {
      return {
        title: "Extensão sem login",
        body: "Entre na extensão Merlin com a mesma conta do painel antes de iniciar as candidaturas.",
        detail: dashboardEmail ? `Painel: ${dashboardEmail}` : "",
      };
    }

    if (user?.uid && extensionUser?.uid && user.uid !== extensionUser.uid) {
      return {
        title: "Extensão conectada em outra sessão",
        body: "O painel e a extensão estão autenticados como usuários Firebase diferentes, então a extensão não encontra este lote.",
        detail: `Painel: ${dashboardEmail ?? shortUid(user.uid)} (${shortUid(user.uid)}) · Extensão: ${extensionUser.email ?? shortUid(extensionUser.uid)} (${shortUid(extensionUser.uid)})`,
      };
    }

    const queue = lastKickResult?.queue;
    if (!queue) return null;
    if (queue.reason === "already_running") return null;

    if (queue.ok === false) {
      const authCopy =
        queue.apiStatus === 401
          ? "A sessão da extensão expirou. Entre novamente na extensão."
          : "A extensão tentou buscar a fila, mas o backend recusou ou falhou.";
      return {
        title: "Extensão não conseguiu iniciar a fila",
        body: authCopy,
        detail: queue.error
          ? `Erro: ${queue.error}${queue.apiStatus ? ` (HTTP ${queue.apiStatus})` : ""}`
          : queue.apiStatus
            ? `HTTP ${queue.apiStatus}`
            : "",
      };
    }

    if ((queue.pendingCount ?? 0) === 0 && pendingCount > 0) {
      return {
        title: "Extensão não encontrou este lote",
        body: "O painel tem vagas aguardando, mas a extensão buscou uma fila sem pendências. Saia e entre novamente na extensão com a mesma conta do painel.",
        detail: dashboardEmail ? `Conta do painel: ${dashboardEmail}` : "",
      };
    }

    if ((queue.failedToOpenCount ?? 0) > 0) {
      return {
        title: "Algumas abas não abriram",
        body: "A extensão encontrou o lote, mas não conseguiu abrir ou marcar todas as vagas como em andamento.",
        detail: `${queue.failedToOpenCount} falha(s) ao abrir ou atualizar a fila.`,
      };
    }

    return null;
  }, [
    extensionStatus.detected,
    extensionStatus.isAuthenticated,
    extensionStatus.user,
    extensionStatus.version,
    lastKickResult,
    pendingCount,
    user?.email,
    user?.uid,
  ]);

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

      {queueIssue && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{queueIssue.title}</p>
              <p className="text-xs mt-1 text-amber-900">{queueIssue.body}</p>
              {queueIssue.detail && (
                <p className="text-[11px] mt-1 text-amber-800 break-words">
                  {queueIssue.detail}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
