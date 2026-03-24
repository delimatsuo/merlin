"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/job-card";
import { JobPreferencesForm } from "@/components/job-preferences-form";
import { useJobFeedStore, type JobPreferences, type MatchedJobItem } from "@/lib/store";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/hooks/useTranslation";

interface FeedResponse {
  date: string;
  matches: MatchedJobItem[];
  total_matches: number;
  generated_at: string | null;
}

function VagasContent() {
  const { t } = useTranslation();
  const {
    preferences, matches, date, loading, prefsLoading,
    setPreferences, setMatches, setDate, setLoading, setPrefsLoading,
  } = useJobFeedStore();

  const [showPrefsEditor, setShowPrefsEditor] = useState(false);
  const searchParams = useSearchParams();

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

  // Load feed when preferences exist
  useEffect(() => {
    if (!preferences) return;
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences]);

  // Check for date param
  useEffect(() => {
    const dateParam = searchParams?.get("date");
    if (dateParam && preferences) {
      loadFeedForDate(dateParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, preferences]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const result = await api.get<FeedResponse>("/api/jobs/feed");
      setMatches(result.matches);
      setDate(result.date);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFeedForDate = async (targetDate: string) => {
    setLoading(true);
    try {
      const result = await api.get<FeedResponse>(`/api/jobs/feed/${targetDate}`);
      setMatches(result.matches);
      setDate(result.date);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const navigateDate = (direction: -1 | 1) => {
    if (!date) return;
    const current = new Date(date + "T12:00:00");
    current.setDate(current.getDate() + direction);
    const newDate = current.toISOString().split("T")[0];

    // Don't go into the future
    const today = new Date().toISOString().split("T")[0];
    if (newDate > today) return;

    // Don't go more than 30 days back
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (current < thirtyDaysAgo) return;

    loadFeedForDate(newDate);
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    } catch {
      return dateStr;
    }
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

      {/* Date navigation */}
      {date && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => navigateDate(-1)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-4 py-1.5 rounded-full bg-secondary text-xs font-medium text-foreground min-w-[80px] text-center">
            {formatDateDisplay(date)}
          </span>
          <button
            onClick={() => navigateDate(1)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
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

      {/* Empty state — preferences set but no matches */}
      {!loading && matches.length === 0 && (
        <div className="apple-shadow rounded-2xl bg-card p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <Search className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {date ? t("vagas.noMatches") : t("vagas.pendingTitle")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            {date ? t("vagas.noMatchesSub") : t("vagas.pendingSub")}
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
