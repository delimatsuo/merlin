"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApplicationStore, useWorkflowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillItem {
  skill: string;
  status: string;
  evidence?: string | null;
}

interface AnalysisResult {
  analysis: Record<string, unknown>;
  skillsMatrix: SkillItem[];
  atsScore: number | null;
  applicationId: string;
  followUp: { decision: string; questions: string[] } | null;
}

export default function VagaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const {
    jobDescription,
    setJobDescription,
    setJobAnalysis,
    setAtsScore,
    setSkillsMatrix,
    setApplicationId,
    setFollowUp,
    setTailoredResume,
    setCoverLetter,
  } = useApplicationStore();

  // Analysis results (inline)
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Follow-up text answers
  const [textAnswers, setTextAnswers] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jobDescription.trim().length < 50) {
      setError("A descricao da vaga precisa ter pelo menos 50 caracteres.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<AnalysisResult>("/api/job/analyze", {
        jobDescription,
      });
      setResult(res);
      setJobAnalysis(res.analysis);
      setAtsScore(res.atsScore);
      setSkillsMatrix(res.skillsMatrix as unknown as Record<string, unknown>);
      setApplicationId(res.applicationId);
      setFollowUp(res.followUp);

      // Init text answers array
      if (res.followUp?.questions) {
        setTextAnswers(new Array(res.followUp.questions.length).fill(""));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao analisar a vaga. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!result) return;
    setGenerating(true);
    setError("");

    // Save comment to knowledge if provided
    if (comment.trim()) {
      try {
        await api.post(`/api/applications/${result.applicationId}/comment`, {
          comment: comment.trim(),
        });
      } catch {
        // non-blocking
      }
    }

    // Save text answers as comments if provided
    for (const answer of textAnswers) {
      if (answer.trim()) {
        try {
          await api.post(`/api/applications/${result.applicationId}/comment`, {
            comment: answer.trim(),
          });
        } catch {
          // non-blocking
        }
      }
    }

    try {
      // Get profileId from workflow store
      const { profileId } = useWorkflowStore.getState();
      const genResult = await api.post<{
        resumeContent: string;
        coverLetter: string;
      }>("/api/tailor/generate", {
        profileId,
        applicationId: result.applicationId,
      });
      setTailoredResume(genResult.resumeContent);
      setCoverLetter(genResult.coverLetter);
      router.push(`/dashboard/candidatura?id=${result.applicationId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao gerar curriculo. Tente novamente."
      );
    } finally {
      setGenerating(false);
    }
  };

  const score = result?.atsScore ?? 0;
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600";
    if (s >= 60) return "text-yellow-600";
    return "text-red-500";
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Nova Vaga
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Cole a descricao da vaga para analise e geracao do curriculo.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Step 1: JD Input */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">
            Descricao da Vaga
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Copie e cole a descricao completa.
          </p>
        </div>
        <div className="p-8 pt-4">
          <form onSubmit={handleAnalyze} className="space-y-5">
            <Textarea
              placeholder="Cole aqui a descricao da vaga..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={14}
              disabled={!!result}
              className="resize-y rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground tabular-nums">
                {jobDescription.length} caracteres
              </p>
              {!result && (
                <Button
                  type="submit"
                  disabled={loading || jobDescription.trim().length < 50}
                  className="h-11 px-6 rounded-full text-sm font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      Analisar Vaga
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
              {result && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setJobDescription("");
                    setComment("");
                    setTextAnswers([]);
                  }}
                  className="h-9 px-4 rounded-full text-xs"
                >
                  Nova analise
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Step 2: Inline Analysis Results */}
      {result && (
        <>
          {/* ATS Score + Skills Matrix */}
          <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-6">
                {/* Score */}
                <div className="text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Score ATS
                  </p>
                  <p className={cn("text-4xl font-bold tabular-nums", getScoreColor(score))}>
                    {Math.round(score)}
                  </p>
                </div>

                {/* Skills Summary */}
                <div className="flex-1 space-y-2">
                  {result.skillsMatrix.filter((s) => s.status === "has").length > 0 && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {result.skillsMatrix
                          .filter((s) => s.status === "has")
                          .map((s) => (
                            <span key={s.skill} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700">
                              {s.skill}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {result.skillsMatrix.filter((s) => s.status === "likely").length > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {result.skillsMatrix
                          .filter((s) => s.status === "likely")
                          .map((s) => (
                            <span key={s.skill} className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-700">
                              {s.skill}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {result.skillsMatrix.filter((s) => s.status === "missing").length > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {result.skillsMatrix
                          .filter((s) => s.status === "missing")
                          .map((s) => (
                            <span key={s.skill} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">
                              {s.skill}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Follow-up section */}
          {result.followUp && result.followUp.decision !== "skip" && result.followUp.questions.length > 0 && (
            <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
              <div className="px-8 pt-8 pb-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Perguntas Complementares
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Responda para melhorar a personalizacao do curriculo.
                </p>
              </div>
              <div className="p-8 pt-4 space-y-4">
                {result.followUp.questions.map((question, i) => (
                  <div key={i} className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {question}
                    </p>
                    <Textarea
                      placeholder="Sua resposta..."
                      value={textAnswers[i] || ""}
                      onChange={(e) => {
                        const updated = [...textAnswers];
                        updated[i] = e.target.value;
                        setTextAnswers(updated);
                      }}
                      rows={2}
                      className="rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-4"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comment box */}
          <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
            <div className="px-8 pt-8 pb-2">
              <h2 className="text-lg font-semibold text-foreground">
                Algo mais?
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Adicione contexto que ajude na personalizacao (opcional).
              </p>
            </div>
            <div className="p-8 pt-4">
              <Textarea
                placeholder="Ex: Tenho 3 anos de experiencia liderando equipes remotas..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-4"
              />
            </div>
          </div>

          {/* Generate button */}
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="h-12 px-8 rounded-full text-sm font-semibold"
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
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
