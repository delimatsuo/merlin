"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Search, Zap, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/job-card";
import { JobPreferencesForm } from "@/components/job-preferences-form";
import { BatchPreflightSheet } from "@/components/batch-preflight-sheet";
import { ExtensionInstallBanner } from "@/components/extension-install-banner";
import {
  useBatchSelectionStore,
  useJobFeedStore,
  type JobPreferences,
  type MatchedJobItem,
} from "@/lib/store";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { isAutoApplySupported } from "@/lib/job-automation";

interface FeedResponse {
  date: string;
  matches: MatchedJobItem[];
  total_matches: number;
  generated_at: string | null;
}

const TIME_RANGE_VALUES = [1, 3, 7, 14] as const;

function VagasContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    preferences, matches, days, loading, prefsLoading,
    setPreferences, setMatches, setDays, setLoading, setPrefsLoading,
  } = useJobFeedStore();
  const { selectedIds, toggle, clear } = useBatchSelectionStore();

  const [showPrefsEditor, setShowPrefsEditor] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [totalInSystem, setTotalInSystem] = useState<number | null>(null);

  const visibleMatches = useMemo(
    () => matches.filter((m) => ["gupy", "catho"].includes((m.source || "").toLowerCase())),
    [matches],
  );
  const automatableMatches = useMemo(
    () => visibleMatches.filter(isAutoApplySupported),
    [visibleMatches],
  );
  const selectedJobs = useMemo(
    () => automatableMatches.filter((m) => selectedIds.has(m.job_id)),
    [automatableMatches, selectedIds],
  );

  // Clear selection when the underlying matches change so we don't carry
  // stale IDs across preference edits or time-range changes.
  useEffect(() => {
    clear();
  }, [days, preferences, clear]);

  const handleOpenPreflight = () => {
    if (selectedJobs.length === 0) return;
    setPreflightOpen(true);
  };

  const handleSubmitBatch = async () => {
    if (selectedJobs.length === 0 || submittingBatch) return;
    setSubmittingBatch(true);
    try {
      const jobIds = selectedJobs.map((j) => j.job_id);
      const resp = await api.post<{ batch_id: string; count: number; rejected: unknown[] }>(
        "/api/applications/queue",
        { job_ids: jobIds },
      );
      // Nudge the extension service worker to start driving immediately
      // (instead of waiting for the 90s alarm). Bridge content script on
      // this domain forwards this postMessage to the SW as QUEUE_KICK.
      try {
        window.postMessage({ type: "MERLIN_QUEUE_KICK" }, window.location.origin);
      } catch {
        /* extension not installed — backend-only fallback still works */
      }
      clear();
      setPreflightOpen(false);
      toast.success(`Lote iniciado: ${resp.count} vagas`);
      router.push("/dashboard/candidaturas");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("vagas.batch.startError"),
      );
    } finally {
      setSubmittingBatch(false);
    }
  };

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      setPrefsLoading(true);
      try {
        const prefs = await api.get<JobPreferences | null>("/api/jobs/preferences");
        setPreferences(prefs);
      } catch {
        setPreferences(null);
      } finally {
        setPrefsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch total jobs in the system (independent of matched feed)
  useEffect(() => {
    (async () => {
      try {
        const resp = await api.get<{ total: number }>("/api/jobs/total");
        setTotalInSystem(resp.total);
      } catch {
        setTotalInSystem(null);
      }
    })();
  }, []);

  // Load feed when preferences exist or days change
  useEffect(() => {
    if (!preferences) return;
    loadFeed(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences, days]);

  const loadFeed = async (numDays: number) => {
    setLoading(true);
    try {
      const result = await api.get<FeedResponse>(`/api/jobs/feed?days=${numDays}`);
      setMatches(result.matches);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDaysChange = (newDays: number) => {
    setDays(newDays);
  };

  // Loading state
  if (prefsLoading) {
    return (
      <div className="space-y-10">
        <div className="pt-4">
          <div className="h-9 w-48 bg-secondary rounded-xl animate-pulse" />
          <div className="h-4 w-64 bg-secondary rounded-lg animate-pulse mt-3" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-card h-24 animate-pulse apple-shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  // No preferences — show setup form
  if (!preferences && !showPrefsEditor) {
    return (
      <div className="space-y-10">
        <div className="pt-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("vagas.title")}
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            {t("vagas.subtitle")}
          </p>
          {totalInSystem !== null && (
            <p className="text-sm text-muted-foreground/80 mt-2">
              {t("vagas.totalInSystem", { count: totalInSystem.toLocaleString("pt-BR") })}
            </p>
          )}
        </div>
        <JobPreferencesForm onSaved={() => setShowPrefsEditor(false)} />
      </div>
    );
  }

  // Preferences editing mode
  if (showPrefsEditor) {
    return (
      <div className="space-y-10">
        <div className="pt-4 flex items-center justify-between">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("vagas.editFilters")}
          </h1>
          <Button
            variant="ghost"
            onClick={() => setShowPrefsEditor(false)}
            className="h-9 px-4 rounded-full text-xs font-medium"
          >
            {t("common.back")}
          </Button>
        </div>
        <JobPreferencesForm
          initial={preferences}
          onSaved={() => setShowPrefsEditor(false)}
        />
      </div>
    );
  }

  // Feed view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("vagas.title")}
          </h1>
          {totalInSystem !== null && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("vagas.totalInSystem", { count: totalInSystem.toLocaleString("pt-BR") })}
            </p>
          )}
          {visibleMatches.length > 0 && (
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              {t("vagas.matchesFound", { count: String(visibleMatches.length) })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => setShowPrefsEditor(true)}
          className="h-9 px-4 rounded-full text-xs font-medium gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("vagas.editFilters")}
        </Button>
      </div>

      <ExtensionInstallBanner />

      {/* Early application tip */}
      <div className="rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">{t("vagas.tipTitle")}</span>{" "}
          {t("vagas.tipBody")}
        </p>
      </div>

      {/* Supported-boards notice. */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-center gap-2.5">
        <div className="shrink-0 h-7 w-7 rounded-full bg-amber-500/20 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 text-amber-700" />
        </div>
        <p className="text-xs text-amber-900 font-medium leading-relaxed flex-1">
          {t("vagas.batch.supportedBoardsNotice")}
        </p>
      </div>

      {/* Time range selector */}
      <div className="flex items-center justify-center gap-1.5">
        {TIME_RANGE_VALUES.map((value) => (
          <button
            key={value}
            onClick={() => handleDaysChange(value)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
              days === value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {value === 1 ? "24h" : t("vagas.timeRangeDays", { days: String(value) })}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center animate-pulse">
            {t("vagas.searching")}
          </p>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-card h-24 animate-pulse apple-shadow-sm" />
          ))}
        </div>
      )}

      {/* Matches */}
      {!loading && visibleMatches.length > 0 && (
        <div className={cn("space-y-3", selectedJobs.length > 0 && "pb-24")}>
          {visibleMatches.map((job) => (
            <JobCard
              key={job.job_id}
              job={job}
              selected={selectedIds.has(job.job_id) && isAutoApplySupported(job)}
              onToggleSelect={toggle}
            />
          ))}
        </div>
      )}

      {!loading && visibleMatches.length === 0 && matches.length > 0 && (
        <div className="apple-shadow rounded-2xl bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("vagas.batch.filterEmptyAutomatable")}
          </p>
        </div>
      )}

      {/* Floating batch action footer */}
      {selectedJobs.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none px-4 pb-4">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="rounded-2xl bg-foreground text-background apple-shadow-lg p-3 flex items-center gap-3">
              <span className="text-sm font-semibold pl-2">
                {selectedJobs.length === 1
                  ? t("vagas.batch.footerCountOne")
                  : t("vagas.batch.footerCount", { count: String(selectedJobs.length) })}
              </span>
              <button
                type="button"
                onClick={clear}
                aria-label={t("vagas.batch.clearSelection")}
                className="h-7 w-7 rounded-full hover:bg-background/10 flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex-1" />
              <Button
                onClick={handleOpenPreflight}
                className="h-9 rounded-full bg-background text-foreground hover:bg-background/90 text-xs font-semibold px-4"
              >
                {t("vagas.batch.footerAction")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && matches.length === 0 && (
        <div className="apple-shadow rounded-2xl bg-card p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <Search className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {t("vagas.noMatches")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            {t("vagas.noMatchesSub")}
          </p>
        </div>
      )}

      <BatchPreflightSheet
        open={preflightOpen}
        jobs={selectedJobs}
        submitting={submittingBatch}
        onCancel={() => setPreflightOpen(false)}
        onConfirm={handleSubmitBatch}
      />
    </div>
  );
}

export default function VagasPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-10 pt-4">
          <div className="h-9 w-48 bg-secondary rounded-xl animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-card h-24 animate-pulse apple-shadow-sm" />
            ))}
          </div>
        </div>
      }
    >
      <VagasContent />
    </Suspense>
  );
}
