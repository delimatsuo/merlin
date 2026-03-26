"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useVersionStore, type ResumeVersion } from "@/lib/store";
import { VersionSidebar } from "@/components/version-sidebar";
import { ResumeEditor } from "@/components/resume-editor";
import { Loader2, ArrowLeft, FileText, Briefcase } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/hooks/useTranslation";

type ViewMode = "resume" | "jd";

function CandidaturaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const applicationId = searchParams.get("id") || "";
  const initialView = searchParams.get("view") === "jd" ? "jd" : "resume";

  const { setVersions } = useVersionStore();

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!applicationId) {
      router.push("/dashboard");
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [versionsResult, appResult] = await Promise.all([
          api.get<{ versions: ResumeVersion[] }>(
            `/api/tailor/versions/${applicationId}`
          ),
          api.get<{
            jobDescription: string;
            title: string;
            company: string;
          }>(`/api/applications/${applicationId}`),
        ]);
        setVersions(versionsResult.versions);
        setJobDescription(appResult.jobDescription || "");
        setJobTitle(appResult.title || "");
        setJobCompany(appResult.company || "");
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [applicationId, router, setVersions]);

  const handleDownload = async (versionId: string, type: "resume" | "cover-letter") => {
    setDownloading(true);
    try {
      const endpoint = type === "resume" ? "resume" : "cover-letter";
      const blob = await api.getBlob(
        `/api/export/${endpoint}?application_id=${applicationId}&version_id=${versionId}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "resume"
        ? (locale === "en" ? "resume.docx" : "curriculo.docx")
        : (locale === "en" ? "cover-letter.docx" : "carta.docx");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("application.downloadComplete"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("application.errorDownload"));
    } finally {
      setDownloading(false);
    }
  };

  const handleEdit = (versionId: string) => {
    useVersionStore.getState().setActiveVersion(versionId);
  };

  const handleRegenerate = async (instructions: string) => {
    setRegenerating(true);
    try {
      await api.post<{ resumeContent: string }>("/api/tailor/regenerate", {
        applicationId,
        instructions,
      });
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      setVersions(versionsResult.versions);
      toast.success(t("application.newVersionGenerated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("application.errorRegenerate"));
    } finally {
      setRegenerating(false);
    }
  };

  const handleNewVersion = async () => {
    setRegenerating(true);
    try {
      await api.post<{ resumeContent: string }>("/api/tailor/regenerate", {
        applicationId,
        instructions: t("application.regenerateInstruction"),
      });
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      setVersions(versionsResult.versions);
      toast.success(t("application.newVersionGenerated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("application.errorNewVersion"));
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="-mx-6 -my-10 md:-my-10">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Link
          href="/dashboard"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">
            {jobTitle || t("application.title")}
            {jobCompany && (
              <span className="font-normal text-muted-foreground"> — {jobCompany}</span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("jd")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === "jd"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            {t("application.jobDesc")}
          </button>
          <button
            onClick={() => setViewMode("resume")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === "resume"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {t("application.resume")}
          </button>
        </div>
      </div>

      {viewMode === "jd" ? (
        /* Job description view */
        <div className="p-6 overflow-y-auto" style={{ height: "calc(100vh - 7rem)" }}>
          <div className="max-w-3xl mx-auto">
            {jobDescription ? (
              <div className="apple-shadow-sm rounded-2xl bg-card p-8">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  {t("application.jobDescTitle")}
                </h2>
                <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {jobDescription}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t("application.noJobDesc")}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Resume editor view */
        <div className="flex" style={{ height: "calc(100vh - 7rem)" }}>
          <VersionSidebar
            applicationId={applicationId}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            onDownload={handleDownload}
            onEdit={handleEdit}
            onNewVersion={handleNewVersion}
          />
          <ResumeEditor
            applicationId={applicationId}
            onDownload={handleDownload}
            onRegenerate={handleRegenerate}
            regenerating={regenerating}
            downloading={downloading}
          />
        </div>
      )}
    </div>
  );
}

export default function CandidaturaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CandidaturaContent />
    </Suspense>
  );
}
