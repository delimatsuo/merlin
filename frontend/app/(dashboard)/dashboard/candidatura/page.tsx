"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useVersionStore, type ResumeVersion } from "@/lib/store";
import { VersionSidebar } from "@/components/version-sidebar";
import { ResumeEditor } from "@/components/resume-editor";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ApplicationDetail {
  id: string;
  jobAnalysis: {
    title?: string;
    company?: string;
    [key: string]: unknown;
  };
  atsScore: number | null;
  skillsMatrix: Array<{ skill: string; status: string; evidence?: string | null }>;
  createdAt: string;
}

function CandidaturaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applicationId = searchParams.get("id") || "";

  const { setVersions, setLoading: setVersionsLoading } = useVersionStore();

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!applicationId) {
      router.push("/dashboard");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch application + versions in parallel
        const [appResult, versionsResult] = await Promise.all([
          api.get<ApplicationDetail>(`/api/job/analysis/${applicationId}`).catch(() => null),
          api.get<{ versions: ResumeVersion[] }>(
            `/api/tailor/versions/${applicationId}`
          ),
        ]);

        // If direct analysis endpoint doesn't exist, build from application data
        if (!appResult) {
          // Fallback: try to get the latest resume to know versions exist
        }

        setVersions(versionsResult.versions);

        // Fetch application details separately
        const appData = await api.get<ApplicationDetail>(
          `/api/profile/status`
        ).catch(() => null);

      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    // Simpler approach: just fetch versions directly
    const fetchAll = async () => {
      setLoading(true);
      try {
        const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
          `/api/tailor/versions/${applicationId}`
        );
        setVersions(versionsResult.versions);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [applicationId, router, setVersions]);

  const handleDownload = async (versionId: string, type: "resume" | "cover-letter") => {
    try {
      const endpoint = type === "resume" ? "resume" : "cover-letter";
      const result = await api.get<{ url: string }>(
        `/api/export/${endpoint}?application_id=${applicationId}&version_id=${versionId}`
      );
      window.open(result.url, "_blank");
    } catch {
      // ignore
    }
  };

  const handleEdit = (versionId: string) => {
    useVersionStore.getState().setActiveVersion(versionId);
    // The editor component handles edit mode
  };

  const handleRegenerate = async (instructions: string) => {
    setRegenerating(true);
    try {
      const result = await api.post<{ resumeContent: string }>("/api/tailor/regenerate", {
        applicationId,
        instructions,
      });
      // Reload versions
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      setVersions(versionsResult.versions);
    } catch {
      // ignore
    } finally {
      setRegenerating(false);
    }
  };

  const handleNewVersion = async () => {
    // Navigate to vaga page to generate a new version
    // Or trigger regeneration with default instructions
    setRegenerating(true);
    try {
      const result = await api.post<{ resumeContent: string }>("/api/tailor/regenerate", {
        applicationId,
        instructions: "Gere uma nova versão com abordagem diferente.",
      });
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      setVersions(versionsResult.versions);
    } catch {
      // ignore
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
            Candidatura
          </h1>
        </div>
      </div>

      {/* Two-panel layout */}
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
        />
      </div>
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
