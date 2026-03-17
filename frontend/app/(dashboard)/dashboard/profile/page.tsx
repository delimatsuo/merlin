"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useProfileStore, useWorkflowStore, useProcessingStore, useKnowledgeStore } from "@/lib/store";
import { Upload, FileText, Loader2, CheckCircle2, Trash2, ArrowRight, Sparkles, ChevronDown, ChevronUp, AlertTriangle, Info, AlertCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { Button } from "@/components/ui/button";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

interface ProfileSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface RecommendationExample {
  before: string;
  after: string;
}

interface Recommendation {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  examples: RecommendationExample[];
}

export default function PerfilPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<ProfileSummary[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { profile, setProfile, setLoading } = useProfileStore();
  const { setProfileId, setApplicationId, setSteps, markStep } = useWorkflowStore();
  const { addTask, completeTask, failTask } = useProcessingStore();
  const { knowledge, setKnowledge } = useKnowledgeStore();
  const isFirstUpload = useRef(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState("");
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

  // Load all profiles on mount
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const result = await api.get<{ profiles: ProfileSummary[] }>("/api/profile/all");
        setAllProfiles(result.profiles);
        if (result.profiles.length > 0) {
          isFirstUpload.current = false;
        }
      } catch {
        // ignore
      } finally {
        setLoadingProfiles(false);
      }
    };
    fetchProfiles();
  }, []);

  const handleDelete = async (profileId: string) => {
    setDeletingId(profileId);
    try {
      await api.delete(`/api/profile/${profileId}`);
      setConfirmDeleteId(null);

      // Use functional updater to avoid stale closure on allProfiles
      let wasLastProfile = false;
      setAllProfiles((prev) => {
        const remaining = prev.filter((p) => p.id !== profileId);
        wasLastProfile = remaining.length === 0;
        return remaining;
      });

      if (wasLastProfile) {
        // Last profile deleted — full workflow reset
        setSteps({ upload: false, interview: false, job: false, analysis: false, result: false });
        setProfileId("");
        setApplicationId("");
        setKnowledge(null);
        setProfile(null as never);
        setUploadedFile(null);
        isFirstUpload.current = true;
      } else {
        // Partial delete — refresh knowledge only
        api.get<{ knowledge: Record<string, unknown> }>("/api/profile/knowledge")
          .then((res) => setKnowledge(res.knowledge as never))
          .catch(() => {});
      }
    } catch {
      setError(t("profile.errorDelete"));
    } finally {
      setDeletingId(null);
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError(t("profile.errorFileSize"));
        return;
      }

      setError("");
      setUploading(true);
      setLoading(true);

      try {
        const result = await api.upload<{
          profileId: string;
          profile: Record<string, unknown>;
        }>("/api/resume/upload", file);
        setUploadedFile(file.name);
        setProfile(result.profile as never);
        setProfileId(result.profileId);
        markStep("upload");

        // Add to profiles list
        setAllProfiles((prev) => [
          {
            id: result.profileId,
            name: (result.profile as Record<string, string>).name || file.name,
            status: "parsed",
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);

        // Trigger background company research
        addTask("research", t("profile.researchTask"));
        api.post(`/api/research/enrich/${result.profileId}`)
          .then(() => completeTask("research"))
          .catch(() => failTask("research", t("profile.researchFailed")));

        // Auto-redirect to interview on first upload
        const interviewDone = useWorkflowStore.getState().steps.interview;
        if (isFirstUpload.current && !interviewDone) {
          isFirstUpload.current = false;
          router.push("/dashboard/interview");
          return;
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("profile.errorProcess")
        );
      } finally {
        setUploading(false);
        setLoading(false);
      }
    },
    [setProfile, setLoading, setProfileId, markStep, addTask, completeTask, failTask, router]
  );

  const handleGetRecommendations = async () => {
    if (allProfiles.length === 0) return;
    const profileId = allProfiles[0].id;
    setLoadingRecommendations(true);
    setRecommendationsError("");
    try {
      const result = await api.post<{ recommendations: Recommendation[] }>(
        `/api/profile/${profileId}/recommendations`,
        { locale }
      );
      setRecommendations(result.recommendations);
    } catch {
      setRecommendationsError(t("profile.errorRecommendations"));
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("profile.title")}
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          {t("profile.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Upload Zone */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">{t("profile.upload")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("profile.uploadDesc")}
          </p>
        </div>
        <div className="p-8 pt-4">
          <div
            {...getRootProps()}
            className={cn(
              "rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300",
              isDragActive
                ? "border-foreground/30 bg-secondary"
                : "border-border hover:border-foreground/20 hover:bg-secondary/50",
              uploading && "opacity-50 cursor-not-allowed"
            )}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative h-14 w-14">
                  <div className="absolute inset-0 rounded-full border-2 border-muted" />
                  <div className="absolute inset-0 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("profile.processing")}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {t("profile.processingTime")}
                </p>
              </div>
            ) : uploadedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-foreground/5 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {uploadedFile}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("profile.clickToUploadAnother")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isDragActive
                      ? t("profile.dropHere")
                      : t("profile.dragOrClick")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("profile.pdfOrDocx")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Next Step CTA */}
      {allProfiles.length > 0 && (
        <Link
          href="/dashboard/job"
          className="flex items-center justify-between gap-4 px-8 py-5 rounded-2xl bg-foreground text-background hover:opacity-90 transition-opacity"
        >
          <div>
            <p className="text-sm font-semibold">{t("profile.nextStep")}</p>
            <p className="text-xs opacity-70 mt-0.5">
              {t("profile.nextStepDesc")}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </Link>
      )}

      {/* Uploaded Resumes List */}
      {allProfiles.length > 0 && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-lg font-semibold text-foreground">
              {t("profile.uploadedResumes")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {allProfiles.length} {allProfiles.length === 1 ? t("profile.resume") : t("profile.resumes")} {t("profile.onYourProfile")}
            </p>
          </div>
          <div className="px-8 pb-8 pt-4 space-y-2">
            {loadingProfiles ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              allProfiles.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50"
                >
                  <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-foreground/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.name || t("profile.resumeLabel")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {p.status === "enriched" ? t("profile.enriched") : t("profile.parsed")}
                  </span>
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deletingId === p.id}
                        className="text-[10px] font-medium text-white bg-destructive hover:bg-destructive/90 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
                      >
                        {deletingId === p.id ? t("profile.deleting") : t("common.confirm")}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-full transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(p.id)}
                      className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Excluir currículo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CV Recommendations */}
      {allProfiles.length > 0 && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("profile.recommendationsTitle")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("profile.recommendationsDesc")}
              </p>
            </div>
            {recommendations.length === 0 && (
              <Button
                onClick={handleGetRecommendations}
                disabled={loadingRecommendations}
                size="sm"
                className="rounded-lg text-xs shrink-0"
              >
                {loadingRecommendations ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                {loadingRecommendations
                  ? t("profile.loadingRecommendations")
                  : t("profile.getCVFeedback")}
              </Button>
            )}
          </div>

          {recommendationsError && (
            <div className="px-8 pt-4">
              <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-destructive">{recommendationsError}</p>
                <button
                  onClick={handleGetRecommendations}
                  className="text-xs font-medium text-destructive underline ml-3 shrink-0"
                >
                  {t("common.retry")}
                </button>
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="px-8 pb-8 pt-4 space-y-3">
              {recommendations.map((rec) => {
                const isExpanded = expandedRec === rec.id;
                const severityStyles = {
                  high: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", Icon: AlertCircle },
                  medium: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", Icon: AlertTriangle },
                  low: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", Icon: Info },
                };
                const severity = severityStyles[rec.severity] || severityStyles.medium;
                return (
                  <div key={rec.id} className="rounded-xl bg-secondary/50 overflow-hidden">
                    <button
                      onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                      className="w-full px-5 py-4 flex items-start gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 mt-0.5",
                          severity.bg,
                          severity.text
                        )}
                      >
                        {t(`profile.severity${rec.severity.charAt(0).toUpperCase() + rec.severity.slice(1)}`)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{rec.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{rec.detail}</p>
                      </div>
                      {rec.examples.length > 0 && (
                        isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      )}
                    </button>
                    {isExpanded && rec.examples.length > 0 && (
                      <div className="px-5 pb-4 space-y-3">
                        {rec.examples.map((ex, i) => (
                          <div key={i} className="rounded-lg overflow-hidden text-sm">
                            <div className="bg-red-50 dark:bg-red-950/20 px-4 py-2.5 border-l-2 border-red-300 dark:border-red-700">
                              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">{t("profile.before")}</p>
                              <p className="text-foreground/80">{ex.before}</p>
                            </div>
                            <div className="bg-green-50 dark:bg-green-950/20 px-4 py-2.5 border-l-2 border-green-300 dark:border-green-700">
                              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">{t("profile.after")}</p>
                              <p className="text-foreground/80">{ex.after}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Knowledge Summary */}
      {knowledge && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-lg font-semibold text-foreground">
              {t("profile.consolidatedProfile")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("profile.consolidatedDesc")}
            </p>
          </div>
          <div className="px-8 pb-8 pt-4 space-y-4">
            {(knowledge as Record<string, unknown[]>).skills &&
              ((knowledge as Record<string, string[]>).skills).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t("profile.skills")} ({((knowledge as Record<string, string[]>).skills).length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {((knowledge as Record<string, string[]>).skills).slice(0, 30).map((skill: string) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-secondary text-foreground/80"
                    >
                      {skill}
                    </span>
                  ))}
                  {((knowledge as Record<string, string[]>).skills).length > 30 && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-secondary text-muted-foreground">
                      +{((knowledge as Record<string, string[]>).skills).length - 30} {t("profile.more")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parsed Profile Preview */}
      {profile && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                <FileText className="h-5 w-5 text-foreground/70" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {t("profile.lastUpload")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("profile.lastUploadDesc")}
                </p>
              </div>
            </div>
          </div>
          <div className="px-8 pb-8 pt-6 space-y-6">
            {profile.name && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("profile.name")}
                </p>
                <p className="text-base font-medium text-foreground mt-1">
                  {profile.name}
                </p>
              </div>
            )}
            {profile.summary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("profile.summary")}
                </p>
                <p className="text-sm text-foreground/80 mt-1 leading-relaxed">
                  {profile.summary}
                </p>
              </div>
            )}
            {profile.experience && profile.experience.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {t("profile.experience")}
                </p>
                <div className="space-y-4">
                  {profile.experience.map((exp, i) => (
                    <div key={i} className="relative pl-5">
                      <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-foreground/20" />
                      <p className="text-sm font-semibold text-foreground">
                        {exp.role}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {exp.company}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {exp.startDate} — {exp.endDate || t("profile.current")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
