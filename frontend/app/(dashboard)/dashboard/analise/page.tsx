"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApplicationStore, useWorkflowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, XCircle, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillsMatrixData {
  matched: string[];
  probable: string[];
  missing: string[];
}

interface AnalysisData {
  atsScore: number;
  skillsMatrix: SkillsMatrixData;
}

export default function AnalisePage() {
  const router = useRouter();
  const { atsScore, setAtsScore, setSkillsMatrix, setTailoredResume, setCoverLetter } = useApplicationStore();
  const { applicationId, profileId } = useWorkflowStore();
  const [skills, setSkills] = useState<SkillsMatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const score = atsScore || 0;

  useEffect(() => {
    if (!applicationId) return;

    const fetchAnalysis = async () => {
      setLoading(true);
      try {
        const result = await api.get<AnalysisData>(
          `/api/job/analysis/${applicationId}`
        );
        setAtsScore(result.atsScore);
        setSkillsMatrix(result.skillsMatrix as unknown as Record<string, unknown>);
        setSkills(result.skillsMatrix);
      } catch {
        // Use store data if available
        setError("Dados da analise nao disponiveis. Complete os passos anteriores.");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [applicationId, setAtsScore, setSkillsMatrix]);

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600";
    if (s >= 60) return "text-yellow-600";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Analise de Compatibilidade
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Veja como seu perfil se encaixa na vaga selecionada.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Score Card */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="p-10 text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">
            Score ATS
          </p>
          <div className="relative inline-flex items-center justify-center">
            {/* Circular progress */}
            <svg className="h-40 w-40 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-secondary"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 264} 264`}
                className={getScoreColor(score)}
                style={{
                  transition: "stroke-dasharray 1s ease-out",
                }}
              />
            </svg>
            <div className="absolute">
              <p
                className={cn(
                  "text-4xl font-bold tabular-nums",
                  getScoreColor(score)
                )}
              >
                {score}
              </p>
              <p className="text-xs text-muted-foreground -mt-0.5">de 100</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Compatibilidade do seu curriculo com a vaga
          </p>
        </div>
      </div>

      {/* Skills Matrix */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">
            Matriz de Competencias
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mapeamento das habilidades exigidas pela vaga
          </p>
        </div>
        <div className="p-8 pt-5 space-y-2.5">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-green-500/5">
            <div className="h-9 w-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Competencias que voce tem
              </p>
              {skills?.matched && skills.matched.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.matched.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dados serao exibidos apos a analise
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl bg-yellow-500/5">
            <div className="h-9 w-9 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Competencias provaveis
              </p>
              {skills?.probable && skills.probable.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.probable.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Inferidas pela pesquisa de empresas
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl bg-red-500/5">
            <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Competencias ausentes
              </p>
              {skills?.missing && skills.missing.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.missing.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nao identificadas no seu perfil
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="flex justify-end">
        <Button
          onClick={async () => {
            if (!applicationId || !profileId) {
              setError("Complete os passos anteriores antes de gerar o curriculo.");
              return;
            }
            setGenerating(true);
            setError("");
            try {
              const result = await api.post<{
                resumeContent: string;
                coverLetter: string;
              }>("/api/tailor/generate", {
                profileId,
                applicationId,
              });
              setTailoredResume(result.resumeContent);
              setCoverLetter(result.coverLetter);
              router.push("/dashboard/resultado");
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Erro ao gerar curriculo. Tente novamente."
              );
            } finally {
              setGenerating(false);
            }
          }}
          disabled={generating || !score}
          className="h-11 px-6 rounded-full text-sm font-semibold"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar Curriculo Personalizado
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
