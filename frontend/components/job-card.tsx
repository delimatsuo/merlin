"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";
import type { MatchedJobItem } from "@/lib/store";
import {
  getAutoApplyRejectionReason,
  isAutoApplySupported,
} from "@/lib/job-automation";

const SOURCE_LABELS: Record<string, string> = {
  gupy: "Gupy",
  catho: "Catho",
  linkedin: "LinkedIn",
  vagas: "Vagas",
  vagascom: "Vagas.com",
  programathor: "ProgramaThor",
  infojobs: "InfoJobs",
  apinfo: "APInfo",
  brazil_jobs: "Brasil",
};

function getScoreBadgeClass(score: number) {
  if (score >= 80) return "bg-green-500/10 text-green-700";
  if (score >= 60) return "bg-yellow-500/10 text-yellow-700";
  return "bg-red-500/10 text-red-600";
}

function getRelativeTime(postedDate: string | null, t: (key: string, params?: Record<string, string>) => string): string {
  if (!postedDate) return "";
  try {
    const posted = new Date(postedDate);
    const now = new Date();
    const diffMs = now.getTime() - posted.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return t("vagas.today");
    if (diffHours < 24) return t("vagas.hoursAgo", { hours: String(diffHours) });
    return t("vagas.daysAgo", { days: String(diffDays) });
  } catch {
    return "";
  }
}

function isNew(postedDate: string | null): boolean {
  if (!postedDate) return false;
  try {
    const posted = new Date(postedDate);
    const now = new Date();
    return now.getTime() - posted.getTime() < 48 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Hibrido",
  onsite: "Presencial",
};

interface Props {
  job: MatchedJobItem;
  selected?: boolean;
  onToggleSelect?: (jobId: string) => void;
}

export function JobCard({ job, selected = false, onToggleSelect }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const relTime = getRelativeTime(job.posted_date, t);
  const fresh = isNew(job.posted_date);
  const rejectionReason = getAutoApplyRejectionReason(job);
  const automatable = isAutoApplySupported(job);
  const selectable = onToggleSelect !== undefined;

  const handleApply = () => {
    router.push(`/dashboard/job?prefill=${encodeURIComponent(job.job_id)}`);
  };

  const handleToggle = () => {
    if (!automatable || !onToggleSelect) return;
    onToggleSelect(job.job_id);
  };

  return (
    <div
      className={cn(
        "group apple-shadow-sm rounded-2xl bg-card p-5 transition-all duration-300 hover:apple-shadow hover:scale-[1.005]",
        selected && "ring-2 ring-foreground/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Selection checkbox */}
        {selectable && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={!automatable}
            aria-label={automatable ? "Selecionar vaga" : t("vagas.batch.unsupportedTag")}
            title={!automatable ? t("vagas.batch.unsupportedTag") : undefined}
            className={cn(
              "mt-0.5 shrink-0 h-5 w-5 rounded-md border flex items-center justify-center transition-colors",
              !automatable
                ? "border-muted-foreground/20 bg-muted/40 cursor-not-allowed"
                : selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-muted-foreground/40 bg-background hover:border-foreground",
            )}
          >
            {selected && automatable && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
        )}

        {/* Left: Title + Company + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {job.title}
            </h3>
            {fresh && (
              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-bold">
                <Sparkles className="h-2.5 w-2.5" />
                {t("vagas.newBadge")}
              </span>
            )}
          </div>

          {job.company && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {job.company}
            </p>
          )}

          {/* Meta row: ATS score, location, work mode, source, time */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {job.ats_score > 0 && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
                  getScoreBadgeClass(job.ats_score),
                )}
              >
                {job.ats_score.toFixed(0)}%
              </span>
            )}

            {job.location && (
              <span className="text-[10px] text-muted-foreground/70">
                {job.location}
              </span>
            )}

            {job.work_mode && job.work_mode !== "onsite" && (
              <span className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] text-muted-foreground font-medium">
                {WORK_MODE_LABELS[job.work_mode] || job.work_mode}
              </span>
            )}

            <span className="text-[10px] text-muted-foreground/50">
              {SOURCE_LABELS[job.source] || job.source}
            </span>

            {selectable && !automatable && (
              <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground/70 font-medium">
                {rejectionReason === "unsupported_apply_method"
                  ? t("vagas.batch.manualApplyTag")
                  : t("vagas.batch.unsupportedTag")}
              </span>
            )}

            {relTime && (
              <>
                <span className="text-[10px] text-muted-foreground/30">·</span>
                <span className="text-[10px] text-muted-foreground/50">
                  {relTime}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: ATS score large (mobile-hidden, desktop visible) */}
        {job.ats_score > 0 && (
          <div className="hidden sm:flex items-center">
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                job.ats_score >= 80
                  ? "text-green-600"
                  : job.ats_score >= 60
                    ? "text-yellow-600"
                    : "text-red-500",
              )}
            >
              {job.ats_score.toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            <ExternalLink className="h-3 w-3" />
            {t("vagas.viewJob")}
          </a>
        )}
        <div className="flex-1" />
        <Button
          onClick={handleApply}
          className="h-8 px-4 rounded-full text-xs font-semibold"
        >
          {t("vagas.apply")}
        </Button>
      </div>
    </div>
  );
}
