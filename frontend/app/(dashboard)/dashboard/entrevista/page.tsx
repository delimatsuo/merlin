"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useWorkflowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface InterviewSession {
  sessionId: string;
  questions: string[];
  status: string;
}

export default function EntrevistaPage() {
  const router = useRouter();
  const { markStep } = useWorkflowStore();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  // Read question aloud using TTS
  const speakQuestion = useCallback(() => {
    const question = session?.questions[currentIndex];
    if (!question || !window.speechSynthesis) return;

    // Stop if already speaking
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(question);
    utterance.lang = "pt-BR";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    // Try to find a pt-BR voice
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(
      (v) => v.lang === "pt-BR" || v.lang.startsWith("pt")
    );
    if (ptVoice) utterance.voice = ptVoice;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [session, currentIndex, isSpeaking]);

  // Auto-read question when it changes
  useEffect(() => {
    if (session && !completed) {
      // Small delay so the UI updates first
      const timer = setTimeout(() => speakQuestion(), 500);
      return () => clearTimeout(timer);
    }
  // Only trigger on question change, not on speakQuestion reference change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, session, completed]);

  // Start/stop voice recording using Speech Recognition
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Seu navegador nao suporta reconhecimento de voz. Use Chrome.");
      return;
    }

    // Stop TTS if playing
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = answer;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + transcript;
        } else {
          interim = transcript;
        }
      }
      setAnswer(finalTranscript + (interim ? " " + interim : ""));
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        setError("Erro no reconhecimento de voz. Tente novamente.");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setError("");
  }, [isRecording, isSpeaking, answer]);

  const startInterview = async () => {
    setStarting(true);
    setError("");
    try {
      const result = await api.post<InterviewSession>("/api/voice/questions");
      setSession(result);
      setAnswers(new Array(result.questions.length).fill(""));
    } catch {
      setError(
        "Erro ao iniciar entrevista. Verifique se voce ja enviou seu curriculo."
      );
    } finally {
      setStarting(false);
    }
  };

  const submitAnswer = async () => {
    if (!session || !answer.trim()) return;

    // Stop recording if active
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    setLoading(true);
    try {
      await api.post("/api/voice/text-answer", {
        sessionId: session.sessionId,
        questionIndex: currentIndex,
        answer: answer.trim(),
      });

      const newAnswers = [...answers];
      newAnswers[currentIndex] = answer.trim();
      setAnswers(newAnswers);

      if (currentIndex < session.questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setAnswer("");
      } else {
        await api.post(`/api/voice/complete/${session.sessionId}`);
        markStep("interview");
        setCompleted(true);
      }
    } catch {
      setError("Erro ao salvar resposta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const totalQuestions = session?.questions.length || 0;
  const progress =
    totalQuestions > 0
      ? ((currentIndex + (completed ? 1 : 0)) / totalQuestions) * 100
      : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Entrevista
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Responda perguntas sobre sua experiencia para enriquecer seu perfil.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        {!session && !completed ? (
          /* Start screen */
          <div className="p-8">
            <div className="text-center py-12">
              <div className="relative mx-auto mb-8 h-28 w-28">
                <div className="absolute inset-0 rounded-full bg-secondary" />
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                  <Mic className="h-10 w-10 text-foreground/60" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Entrevista de Perfil
              </h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
                A IA fara perguntas personalizadas sobre sua experiencia.
                Responda por voz ou texto.
              </p>
              <Button
                size="lg"
                className="h-12 px-8 rounded-full text-sm font-semibold"
                onClick={startInterview}
                disabled={starting}
              >
                {starting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparando...
                  </>
                ) : (
                  "Iniciar Entrevista"
                )}
              </Button>
            </div>
          </div>
        ) : completed ? (
          /* Completed screen */
          <div className="p-8">
            <div className="text-center py-12">
              <div className="relative mx-auto mb-8 h-28 w-28">
                <div className="absolute inset-0 rounded-full bg-foreground" />
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-background" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Entrevista Concluida
              </h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
                Suas respostas foram processadas e seu perfil foi enriquecido.
              </p>
              <Button
                size="lg"
                className="h-12 px-8 rounded-full text-sm font-semibold"
                onClick={() => router.push("/dashboard/vaga")}
              >
                Proximo Passo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          /* Interview in progress */
          <div className="p-8 space-y-6">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Pergunta {currentIndex + 1} de {totalQuestions}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Question with listen button */}
            <div className="rounded-2xl bg-secondary/70 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Pergunta {currentIndex + 1}
                  </p>
                  <p className="text-base font-medium text-foreground leading-relaxed">
                    {session?.questions[currentIndex]}
                  </p>
                </div>
                <button
                  onClick={speakQuestion}
                  className={cn(
                    "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                    isSpeaking
                      ? "bg-foreground text-background"
                      : "bg-background/60 text-foreground/60 hover:bg-background hover:text-foreground"
                  )}
                  title={isSpeaking ? "Parar leitura" : "Ouvir pergunta"}
                >
                  {isSpeaking ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Answer: voice + text */}
            <div className="space-y-4">
              {/* Voice recording button */}
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleRecording}
                  className={cn(
                    "relative h-16 w-16 rounded-full flex items-center justify-center transition-all shrink-0",
                    isRecording
                      ? "bg-red-500 text-white"
                      : "bg-secondary text-foreground/60 hover:bg-secondary/80 hover:text-foreground"
                  )}
                >
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
                  )}
                  {isRecording ? (
                    <MicOff className="h-6 w-6 relative z-10" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </button>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {isRecording
                      ? "Gravando... Clique para parar"
                      : "Clique para responder por voz"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isRecording
                      ? "Sua resposta esta sendo transcrita em tempo real"
                      : "Ou digite sua resposta abaixo"}
                  </p>
                </div>
              </div>

              {/* Text input */}
              <Textarea
                placeholder="Sua resposta aparecera aqui... Fale ou digite."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                className="rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    submitAnswer();
                  }
                }}
              />

              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Cmd+Enter para enviar
                </p>
                <Button
                  onClick={submitAnswer}
                  disabled={loading || !answer.trim()}
                  className="h-11 px-6 rounded-full text-sm font-semibold"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {currentIndex < totalQuestions - 1 ? "Proxima" : "Concluir"}
                </Button>
              </div>
            </div>

            {/* Previous answers */}
            {answers.filter(Boolean).length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Respostas anteriores
                </p>
                {answers.map((a, i) =>
                  a ? (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-xs font-medium text-muted-foreground mt-0.5 shrink-0">
                        P{i + 1}
                      </span>
                      <span className="text-foreground/70 line-clamp-1">
                        {a}
                      </span>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
