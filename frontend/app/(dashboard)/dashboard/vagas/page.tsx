"use client";

import { useEffect, useState, Suspense } from "react";
import { SlidersHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/job-card";
import { JobPreferencesForm } from "@/components/job-preferences-form";
import { useJobFeedStore, type JobPreferences, type MatchedJobItem } from "@/lib/store";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface FeedResponse {
  date: string;
  matches: MatchedJobItem[];
  total_matches: number;
  generated_at: string | null;
}

const TIME_RANGE_VALUES = [1, 3, 7, 14] as const;

function VagasContent() {
  const { t } = useTranslation();
  const {
    preferences, matches, days, loading, prefsLoading,
    setPreferences, setMatches, setDays, setLoading, setPrefsLoading,
  } = useJobFeedStore();

  const [showPrefsEditor, setShowPrefsEditor] = useState(false);

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
          {matches.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("vagas.matchesFound", { count: String(matches.length) })}
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

      {/* Early application tip */}
      <div className="rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">{t("vagas.tipTitle")}</span>{" "}
          {t("vagas.tipBody")}
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
      {!loading && matches.length > 0 && (
        <div className="space-y-3">
          {matches.map((job) => (
            <JobCard key={job.job_id} job={job} />
          ))}
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
