"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore, useApplicationsListStore, type ApplicationSummary } from "@/lib/store";
import { useOnboarding } from "@/lib/hooks/useOnboarding";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Briefcase,
  Trash2,
  Loader2,
  FileText,
  Upload,
  Mic,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getScoreBadgeClass(score: number | null) {
  if (score === null) return "bg-secondary text-muted-foreground";
  if (score >= 80) return "bg-green-500/10 text-green-700";
  if (score >= 60) return "bg-yellow-500/10 text-yellow-700";
  return "bg-red-500/10 text-red-600";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

function OnboardingFlow() {
  const router = useRouter();

  return (
    <div className="space-y-10">
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Bem-vindo ao Merlin
        </h1>
        <p className="text-base text-muted-foreground mt-2 max-w-lg">
          Para comecar, envie seu curriculo e complete a entrevista. Depois, voce podera personalizar para quantas vagas quiser.
        </p>
      </div>

      <div className="space-y-3">
        <Link href="/dashboard/perfil" className="block group">
          <div className="apple-shadow-sm rounded-2xl bg-card p-6 transition-all duration-300 hover:apple-shadow hover:scale-[1.01]">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary group-hover:bg-foreground/5">
                <Upload className="h-5 w-5 text-foreground/70" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium text-muted-foreground">Passo 1</span>
                <h3 className="text-base font-semibold text-foreground mt-0.5">
                  Envie seu Curriculo
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  PDF ou DOCX para analise inteligente
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-all" />
            </div>
          </div>
        </Link>

        <Link href="/dashboard/entrevista" className="block group">
          <div className="apple-shadow-sm rounded-2xl bg-card p-6 transition-all duration-300 hover:apple-shadow hover:scale-[1.01]">
            <div className="flex items-center gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary group-hover:bg-foreground/5">
                <Mic className="h-5 w-5 text-foreground/70" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium text-muted-foreground">Passo 2</span>
                <h3 className="text-base font-semibold text-foreground mt-0.5">
                  Entrevista de Perfil
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Converse com a IA para enriquecer seu perfil
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-all" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { needsOnboarding, loading: onboardingLoading } = useOnboarding();
  const {
    applications,
    loading,
    hasMore,
    setApplications,
    appendApplications,
    removeApplication,
    setLoading,
    setHasMore,
    setNextCursor,
    nextCursor,
  } = useApplicationsListStore();
  const [deleting, setDeleting] = useState<string | null>(null);

  const firstName = user?.displayName?.split(" ")[0] || "Candidato";

  useEffect(() => {
    if (needsOnboarding || onboardingLoading) return;

    const fetch = async () => {
      setLoading(true);
      try {
        const result = await api.get<{
          applications: ApplicationSummary[];
          nextCursor: string;
          hasMore: boolean;
        }>("/api/applications");
        setApplications(result.applications);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch {
        // API not available
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [needsOnboarding, onboardingLoading, setApplications, setLoading, setHasMore, setNextCursor]);

  const loadMore = async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      const result = await api.get<{
        applications: ApplicationSummary[];
        nextCursor: string;
        hasMore: boolean;
      }>(`/api/applications?cursor=${nextCursor}`);
      appendApplications(result.applications);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/api/applications/${id}`);
      removeApplication(id);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  if (onboardingLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (needsOnboarding) {
    return <OnboardingFlow />;
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="pt-4 flex items-end justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Ola, {firstName}.
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Suas candidaturas
          </p>
        </div>
        <Link href="/dashboard/vaga">
          <Button className="h-10 px-5 rounded-full text-sm font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            Nova Vaga
          </Button>
        </Link>
      </div>

      {/* Application List */}
      {loading && applications.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-card h-24 animate-pulse apple-shadow-sm" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="apple-shadow rounded-2xl bg-card p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
            <Briefcase className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">
            Nenhuma candidatura ainda
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Cole uma descricao de vaga para comecar!
          </p>
          <Link href="/dashboard/vaga">
            <Button className="h-10 px-6 rounded-full text-sm font-semibold">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova Vaga
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Link
              key={app.id}
              href={`/dashboard/candidatura?id=${app.id}`}
              className="block group"
            >
              <div className="apple-shadow-sm rounded-2xl bg-card p-5 transition-all duration-300 hover:apple-shadow hover:scale-[1.005]">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <FileText className="h-5 w-5 text-foreground/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {app.title}
                      </h3>
                      {app.atsScore !== null && (
                        <span
                          className={cn(
                            "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
                            getScoreBadgeClass(app.atsScore)
                          )}
                        >
                          {Math.round(app.atsScore)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {app.company && (
                        <span className="text-xs text-muted-foreground truncate">
                          {app.company}
                        </span>
                      )}
                      {app.company && <span className="text-muted-foreground/30">·</span>}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(app.createdAt)}
                      </span>
                      {app.versionCount > 0 && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-xs text-muted-foreground">
                            {app.versionCount} {app.versionCount === 1 ? "versao" : "versoes"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(app.id);
                    }}
                    className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    {deleting === app.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </Link>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loading}
                className="h-9 px-5 rounded-full text-xs"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Carregar mais"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
