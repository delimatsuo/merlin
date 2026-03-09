"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useApplicationStore, useWorkflowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Mail, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ResultadoPage() {
  const [activeTab, setActiveTab] = useState<"resume" | "cover-letter">(
    "resume"
  );
  const [regenerateInstructions, setRegenerateInstructions] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { tailoredResume, coverLetter, setTailoredResume, setCoverLetter } =
    useApplicationStore();
  const { applicationId, markStep } = useWorkflowStore();

  useEffect(() => {
    if (!applicationId) return;

    const fetchContent = async () => {
      setLoading(true);
      try {
        const result = await api.get<{
          resume: string;
          coverLetter: string;
        }>(`/api/tailor/result/${applicationId}`);
        setTailoredResume(result.resume);
        setCoverLetter(result.coverLetter);
        markStep("result");
      } catch {
        // Content not ready yet
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [applicationId, setTailoredResume, setCoverLetter, markStep]);

  const handleDownloadResume = async () => {
    try {
      const result = await api.get<{ url: string }>(
        applicationId
          ? `/api/export/resume/${applicationId}`
          : "/api/export/resume"
      );
      window.open(result.url, "_blank");
    } catch {
      setError("Erro ao baixar curriculo. Tente novamente.");
    }
  };

  const handleDownloadCoverLetter = async () => {
    try {
      const result = await api.get<{ url: string }>(
        applicationId
          ? `/api/export/cover-letter/${applicationId}`
          : "/api/export/cover-letter"
      );
      window.open(result.url, "_blank");
    } catch {
      setError("Erro ao baixar carta. Tente novamente.");
    }
  };

  const handleRegenerate = async () => {
    if (!regenerateInstructions.trim()) return;
    setRegenerating(true);
    setError("");
    try {
      const result = await api.post<{
        resumeContent: string;
        coverLetter?: string;
      }>("/api/tailor/regenerate", {
        applicationId,
        instructions: regenerateInstructions,
      });
      if (result.resumeContent) setTailoredResume(result.resumeContent);
      if (result.coverLetter) setCoverLetter(result.coverLetter);
      setRegenerateInstructions("");
    } catch {
      setError("Erro ao regenerar. Tente novamente.");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Resultado
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Seu curriculo e carta de apresentacao personalizados.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-secondary rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("resume")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            activeTab === "resume"
              ? "bg-card apple-shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-4 w-4" />
          Curriculo
        </button>
        <button
          onClick={() => setActiveTab("cover-letter")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            activeTab === "cover-letter"
              ? "bg-card apple-shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Mail className="h-4 w-4" />
          Carta de Apresentacao
        </button>
      </div>

      {/* Content */}
      {activeTab === "resume" ? (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-lg font-semibold text-foreground">
              Curriculo Personalizado
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Otimizado para a vaga selecionada e sistemas ATS
            </p>
          </div>
          <div className="p-8 pt-5 space-y-5">
            <div className="rounded-2xl bg-secondary/50 p-8 min-h-[420px]">
              {loading ? (
                <div className="flex items-center justify-center h-full min-h-[380px]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : tailoredResume ? (
                <div className="prose prose-sm max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {tailoredResume}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[380px]">
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    O curriculo personalizado aparecera aqui apos o processamento.
                  </p>
                </div>
              )}
            </div>
            <Button
              onClick={handleDownloadResume}
              disabled={!tailoredResume}
              className="w-full h-12 rounded-xl text-sm font-semibold"
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar Curriculo (.docx)
            </Button>
          </div>
        </div>
      ) : (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-lg font-semibold text-foreground">
              Carta de Apresentacao
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Personalizada para a empresa e vaga
            </p>
          </div>
          <div className="p-8 pt-5 space-y-5">
            <div className="rounded-2xl bg-secondary/50 p-8 min-h-[320px]">
              {loading ? (
                <div className="flex items-center justify-center h-full min-h-[280px]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : coverLetter ? (
                <div className="prose prose-sm max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {coverLetter}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[280px]">
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    A carta de apresentacao aparecera aqui apos o processamento.
                  </p>
                </div>
              )}
            </div>
            <Button
              onClick={handleDownloadCoverLetter}
              disabled={!coverLetter}
              className="w-full h-12 rounded-xl text-sm font-semibold"
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar Carta de Apresentacao (.docx)
            </Button>
          </div>
        </div>
      )}

      {/* Regenerate */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">
            Regenerar com Instrucoes
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Insatisfeito? Diga o que gostaria de mudar.
          </p>
        </div>
        <div className="p-8 pt-5 space-y-4">
          <Textarea
            placeholder="Ex: Destaque mais minha experiencia com gestao de projetos..."
            value={regenerateInstructions}
            onChange={(e) => setRegenerateInstructions(e.target.value)}
            rows={3}
            className="rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
          />
          <Button
            onClick={handleRegenerate}
            disabled={regenerating || !regenerateInstructions.trim()}
            variant="outline"
            className="h-11 px-6 rounded-full text-sm font-medium border-border"
          >
            {regenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Regenerando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
