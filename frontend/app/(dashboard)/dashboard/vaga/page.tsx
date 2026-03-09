"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApplicationStore, useWorkflowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight } from "lucide-react";

export default function VagaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { jobDescription, setJobDescription, setJobAnalysis } =
    useApplicationStore();
  const { setApplicationId, markStep } = useWorkflowStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jobDescription.trim().length < 50) {
      setError("A descrição da vaga precisa ter pelo menos 50 caracteres.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await api.post<{ analysis: Record<string, unknown>; applicationId?: string }>(
        "/api/job/analyze",
        { jobDescription }
      );
      setJobAnalysis(result.analysis);
      if (result.applicationId) setApplicationId(result.applicationId);
      markStep("job");
      markStep("analysis");
      router.push("/dashboard/analise");
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

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Descrição da Vaga
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Cole a descrição da vaga para a qual deseja se candidatar.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Input Card */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">
            Detalhes da Vaga
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Copie e cole a descrição completa, incluindo requisitos e
            responsabilidades.
          </p>
        </div>
        <div className="p-8 pt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Textarea
              placeholder="Cole aqui a descrição da vaga..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={14}
              className="resize-y rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground tabular-nums">
                {jobDescription.length} caracteres
              </p>
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
