"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useWorkflowStore, useKnowledgeStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Volume2,
  VolumeX,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InterviewSession {
  sessionId: string;
  questions: string[];
}

export default function EntrevistaPage() {
  const router = useRouter();
  const { markStep } = useWorkflowStore();
  const { setKnowledge } = useKnowledgeStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [playingTTS, setPlayingTTS] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check if user has a profile, then fetch questions
  useEffect(() => {
    const init = async () => {
      try {
        const result = await api.post<InterviewSession>("/api/voice/questions");
        if (!result.questions || result.questions.length === 0) {
          // No questions generated — profile may be missing
          setError("Envie seu curriculo primeiro para gerar as perguntas.");
          setLoading(false);
          return;
        }
        setSession(result);
        setAnswers(new Array(result.questions.length).fill(""));
      } catch {
        setError("Envie seu curriculo primeiro para gerar as perguntas.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handlePlayTTS = async (text: string) => {
    if (playingTTS) {
      audioRef.current?.pause();
      setPlayingTTS(false);
      return;
    }

    try {
      setPlayingTTS(true);
      const blob = await api.postBlob("/api/voice/tts", { text });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingTTS(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingTTS(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setPlayingTTS(false);
    }
  };

  const handleNext = () => {
    if (!session) return;
    if (currentIndex < session.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (!session) return;
    setSubmitting(true);
    setError("");

    try {
      // Save each answer
      for (let i = 0; i < answers.length; i++) {
        if (answers[i].trim()) {
          await api.post("/api/voice/text-answer", {
            sessionId: session.sessionId,
            questionIndex: i,
            answer: answers[i].trim(),
          });
        }
      }

      // Complete the session (processes answers + merges into knowledge)
      await api.post(`/api/voice/complete/${session.sessionId}`);

      // Mark interview step
      markStep("interview");

      // Refresh knowledge
      try {
        const res = await api.get<{ knowledge: Record<string, unknown> }>(
          "/api/profile/knowledge"
        );
        setKnowledge(res.knowledge as never);
      } catch {
        // non-blocking
      }

      setCompleted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar respostas. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = answers.filter((a) => a.trim().length > 0).length;
  const totalQuestions = session?.questions.length || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (completed) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="pt-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Entrevista Concluida
          </h1>
          <p className="text-base text-muted-foreground mt-2 max-w-md mx-auto">
            Suas respostas foram processadas e adicionadas ao seu perfil. Agora
            voce pode personalizar curriculos com muito mais precisao.
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => router.push("/dashboard/vaga")}
            className="h-12 px-8 rounded-full text-sm font-semibold"
          >
            Personalizar para uma Vaga
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="pt-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Entrevista de Perfil
          </h1>
        </div>
        {error && (
          <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        <div className="flex justify-center">
          <Button
            onClick={() => router.push("/dashboard/perfil")}
            variant="outline"
            className="h-10 px-6 rounded-full text-sm"
          >
            Ir para Upload de Curriculo
          </Button>
        </div>
      </div>
    );
  }

  const currentQuestion = session.questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Entrevista de Perfil
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Responda as perguntas para enriquecer seu perfil. Quanto mais
          detalhes, melhor a personalizacao.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground rounded-full transition-all duration-500"
            style={{
              width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {currentIndex + 1} / {totalQuestions}
        </span>
      </div>

      {/* Question Card */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 mt-0.5">
              <MessageSquare className="h-5 w-5 text-foreground/70" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Pergunta {currentIndex + 1}
              </p>
              <p className="text-base font-medium text-foreground leading-relaxed">
                {currentQuestion}
              </p>
            </div>
            <button
              onClick={() => handlePlayTTS(currentQuestion)}
              className={cn(
                "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                playingTTS
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary"
              )}
              title={playingTTS ? "Parar audio" : "Ouvir pergunta"}
            >
              {playingTTS ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
          </div>

          <Textarea
            placeholder="Sua resposta..."
            value={answers[currentIndex] || ""}
            onChange={(e) => {
              const updated = [...answers];
              updated[currentIndex] = e.target.value;
              setAnswers(updated);
            }}
            rows={5}
            className="rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
          />

          <p className="text-xs text-muted-foreground/60 mt-2">
            Responda com detalhes — mencione numeros, resultados e exemplos
            quando possivel.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="h-10 px-5 rounded-full text-sm"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Anterior
        </Button>

        <p className="text-xs text-muted-foreground">
          {answeredCount} de {totalQuestions} respondidas
        </p>

        {currentIndex < totalQuestions - 1 ? (
          <Button
            onClick={handleNext}
            className="h-10 px-5 rounded-full text-sm font-semibold"
          >
            Proxima
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || answeredCount === 0}
            className="h-10 px-6 rounded-full text-sm font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                Concluir Entrevista
                <CheckCircle2 className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
