"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  Mic,
  MicOff,
  Keyboard,
  AudioLines,
  RotateCcw,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";

type InterviewMode = "choose" | "text" | "voice";
type RecordingState = "idle" | "recording" | "paused";

interface InterviewSession {
  sessionId: string;
  questions: string[];
}

export default function EntrevistaPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { markStep } = useWorkflowStore();
  const { setKnowledge } = useKnowledgeStore();

  const [mode, setMode] = useState<InterviewMode>("choose");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Audio state
  const [loadingTTS, setLoadingTTS] = useState(false);
  const [playingTTS, setPlayingTTS] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // TTS preload cache: questionIndex -> blob URL
  const ttsCacheRef = useRef<Map<number, string>>(new Map());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup audio, mic, and TTS cache on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      // Revoke all cached blob URLs
      ttsCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      ttsCacheRef.current.clear();
    };
  }, []);

  // Recording timer
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingState]);

  // Fetch questions
  useEffect(() => {
    const init = async () => {
      try {
        const result = await api.post<InterviewSession>("/api/voice/questions", { locale });
        if (!result.questions || result.questions.length === 0) {
          setError(t("interview.errorNoQuestions"));
          setLoading(false);
          return;
        }
        setSession(result);
        setAnswers(new Array(result.questions.length).fill(""));
      } catch {
        setError(t("interview.errorNoQuestions"));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Preload TTS audio for all questions when voice mode is selected
  useEffect(() => {
    if (!session || mode !== "voice") return;
    // Use the cache itself as the idempotency guard
    if (ttsCacheRef.current.size > 0) return;

    const preloadQuestion = async (index: number) => {
      if (ttsCacheRef.current.has(index)) return;
      try {
        const blob = await api.postBlob("/api/voice/tts", {
          text: session.questions[index],
          locale,
        });
        const url = URL.createObjectURL(blob);
        ttsCacheRef.current.set(index, url);
      } catch {
        // Non-blocking: falls back to on-demand fetch
      }
    };

    const preloadAll = async () => {
      // First two in parallel for fastest availability
      const first = [preloadQuestion(0)];
      if (session.questions.length > 1) first.push(preloadQuestion(1));
      await Promise.all(first);
      // Rest sequentially to avoid hammering the API
      for (let i = 2; i < session.questions.length; i++) {
        await preloadQuestion(i);
      }
    };

    preloadAll();
  }, [session, mode]);

  // In voice mode, auto-play TTS when question changes
  useEffect(() => {
    if (mode === "voice" && session && !loading) {
      handlePlayTTS(session.questions[currentIndex], currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, mode, session?.sessionId]);

  const handlePlayTTS = async (text: string, questionIndex = currentIndex) => {
    if (playingTTS || loadingTTS) {
      audioRef.current?.pause();
      setPlayingTTS(false);
      setLoadingTTS(false);
      return;
    }

    try {
      // Check preload cache first
      const cachedUrl = ttsCacheRef.current.get(questionIndex);
      let url: string;
      if (cachedUrl) {
        url = cachedUrl;
      } else {
        setLoadingTTS(true);
        const blob = await api.postBlob("/api/voice/tts", { text, locale });
        url = URL.createObjectURL(blob);
        ttsCacheRef.current.set(questionIndex, url);
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingTTS(false);
      };
      audio.onerror = () => {
        setPlayingTTS(false);
        setLoadingTTS(false);
      };
      setLoadingTTS(false);
      setPlayingTTS(true);
      await audio.play();
    } catch {
      setPlayingTTS(false);
      setLoadingTTS(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      setError(t("interview.errorMicNotSupported"));
      return;
    }

    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setRecordingSeconds(0);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Release mic
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 100) {
          setRecordingState("idle");
          return;
        }

        // Transcribe
        setTranscribing(true);
        try {
          const res = await api.postAudio("/api/voice/transcribe", audioBlob);
          if (res.transcript) {
            setAnswers((prev) => {
              const updated = [...prev];
              const existing = updated[currentIndex]?.trim();
              updated[currentIndex] = existing
                ? `${existing} ${res.transcript}`
                : res.transcript;
              return updated;
            });
          } else {
            setError(t("interview.errorTranscribe"));
          }
        } catch {
          setError(t("interview.errorTranscribeGeneral"));
        } finally {
          setTranscribing(false);
          setRecordingState("idle");
        }
      };

      // Collect chunks every 1 second (better for longer recordings)
      mediaRecorder.start(1000);
      setRecordingState("recording");
    } catch {
      setError(t("interview.errorMicAccess"));
    }
  }, [currentIndex]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current?.state === "recording" ||
      mediaRecorderRef.current?.state === "paused"
    ) {
      mediaRecorderRef.current.stop();
      // Don't set idle here — onstop handler will handle state transition after transcription
    }
  }, []);

  const restartRecording = useCallback(() => {
    // Stop current, clear chunks, start fresh
    if (
      mediaRecorderRef.current?.state === "recording" ||
      mediaRecorderRef.current?.state === "paused"
    ) {
      // Override onstop to NOT transcribe — instead restart recording
      mediaRecorderRef.current.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecordingState("idle");
        setRecordingSeconds(0);
        startRecording();
      };
      mediaRecorderRef.current.stop();
    } else {
      setRecordingState("idle");
      setRecordingSeconds(0);
      startRecording();
    }
  }, [startRecording]);

  const handleNext = () => {
    if (!session) return;
    if (recordingState !== "idle") stopRecording();
    if (currentIndex < session.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (recordingState !== "idle") stopRecording();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    if (!session) return;
    if (recordingState !== "idle") stopRecording();
    setSubmitting(true);
    setError("");

    try {
      const answerPromises = answers.map((answer, i) => {
        if (!answer.trim()) return Promise.resolve({ status: "skipped" as const });
        return api
          .post("/api/voice/text-answer", {
            sessionId: session.sessionId,
            questionIndex: i,
            answer: answer.trim(),
          })
          .then(() => ({ status: "ok" as const }))
          .catch(() => ({ status: "failed" as const }));
      });
      const results = await Promise.all(answerPromises);
      const savedCount = results.filter((r) => r.status === "ok").length;

      if (savedCount === 0) {
        setError(t("interview.errorNoAnswers"));
        setSubmitting(false);
        return;
      }

      await api.post(`/api/voice/complete/${session.sessionId}`);
      markStep("interview");

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
          : t("interview.errorNoAnswers")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = answers.filter((a) => a.trim().length > 0).length;
  const totalQuestions = session?.questions.length || 0;
  const isRecording = recordingState !== "idle";

  // ---------- LOADING ----------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---------- COMPLETED ----------
  if (completed) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="pt-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("interview.completedTitle")}
          </h1>
          <p className="text-base text-muted-foreground mt-2 max-w-md mx-auto">
            {t("interview.completedDesc")}
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={() => router.push("/dashboard/job")}
            className="h-12 px-8 rounded-full text-sm font-semibold"
          >
            {t("interview.personalizeForJob")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ---------- NO SESSION (no profile) ----------
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="pt-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("interview.title")}
          </h1>
        </div>
        {error && (
          <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        <div className="flex justify-center">
          <Button
            onClick={() => router.push("/dashboard/profile")}
            variant="outline"
            className="h-10 px-6 rounded-full text-sm"
          >
            {t("interview.goToUpload")}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- MODE SELECTION ----------
  if (mode === "choose") {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="pt-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("interview.title")}
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            {t("interview.chooseMode")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          <button
            onClick={() => setMode("voice")}
            className="apple-shadow rounded-2xl bg-card p-6 text-left hover:ring-2 hover:ring-foreground/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:bg-foreground/10 transition-colors">
              <AudioLines className="h-6 w-6 text-foreground/70" />
            </div>
            <p className="text-sm font-semibold text-foreground">{t("interview.byVoice")}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t("interview.byVoiceDesc")}
            </p>
          </button>

          <button
            onClick={() => setMode("text")}
            className="apple-shadow rounded-2xl bg-card p-6 text-left hover:ring-2 hover:ring-foreground/20 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:bg-foreground/10 transition-colors">
              <Keyboard className="h-6 w-6 text-foreground/70" />
            </div>
            <p className="text-sm font-semibold text-foreground">{t("interview.byText")}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t("interview.byTextDesc")}
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ---------- INTERVIEW (VOICE OR TEXT) ----------
  const currentQuestion = session.questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="pt-4 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("interview.title")}
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            {mode === "voice"
              ? t("interview.voiceInstructions")
              : t("interview.textInstructions")}
          </p>
        </div>
        <button
          onClick={() => {
            if (isRecording) stopRecording();
            setMode(mode === "voice" ? "text" : "voice");
          }}
          className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full bg-secondary"
          title={mode === "voice" ? t("interview.switchToText") : t("interview.switchToVoice")}
        >
          {mode === "voice" ? (
            <>
              <Keyboard className="h-3.5 w-3.5" />
              {t("interview.textMode")}
            </>
          ) : (
            <>
              <AudioLines className="h-3.5 w-3.5" />
              {t("interview.voiceMode")}
            </>
          )}
        </button>
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

      {/* TTS Loading Banner (voice mode) */}
      {mode === "voice" && loadingTTS && (
        <div className="flex items-center gap-3 rounded-xl bg-secondary/50 px-5 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t("interview.loadingAudio")}
          </span>
        </div>
      )}

      {/* Question Card */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="p-8">
          {/* Question */}
          <div className="flex items-start gap-4 mb-6">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 mt-0.5">
              <MessageSquare className="h-5 w-5 text-foreground/70" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {t("interview.question", { number: currentIndex + 1 })}
              </p>
              <p className="text-base font-medium text-foreground leading-relaxed">
                {currentQuestion}
              </p>
            </div>
            {/* Only show TTS button in text mode — voice mode auto-plays */}
            {mode === "text" && (
              <button
                onClick={() => handlePlayTTS(currentQuestion)}
                disabled={loadingTTS}
                className={cn(
                  "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                  playingTTS || loadingTTS
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary"
                )}
                title={playingTTS ? t("interview.stopAudio") : t("interview.listenQuestion")}
              >
                {loadingTTS ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : playingTTS ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          {/* Voice Recording Controls */}
          {mode === "voice" && (
            <div className="mb-4">
              {recordingState === "idle" && !transcribing ? (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={startRecording}
                    variant="outline"
                    className="h-12 px-6 rounded-full text-sm gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    {answers[currentIndex]?.trim()
                      ? t("interview.recordMore")
                      : t("interview.recordAnswer")}
                  </Button>

                  {answers[currentIndex]?.trim() && (
                    <button
                      onClick={() => {
                        setAnswers((prev) => {
                          const updated = [...prev];
                          updated[currentIndex] = "";
                          return updated;
                        });
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t("interview.clear")}
                    </button>
                  )}
                </div>
              ) : transcribing ? (
                <div className="flex items-center gap-3 py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("interview.transcribing")}
                  </span>
                </div>
              ) : (
                /* Recording or Paused */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {recordingState === "recording" ? (
                      <>
                        <Button
                          onClick={pauseRecording}
                          variant="outline"
                          className="h-12 px-5 rounded-full text-sm gap-2"
                        >
                          <Pause className="h-4 w-4" />
                          {t("interview.pause")}
                        </Button>
                        <Button
                          onClick={stopRecording}
                          className="h-12 px-5 rounded-full text-sm gap-2"
                        >
                          <MicOff className="h-4 w-4" />
                          {t("interview.submit")}
                        </Button>
                      </>
                    ) : (
                      /* Paused */
                      <>
                        <Button
                          onClick={resumeRecording}
                          variant="outline"
                          className="h-12 px-5 rounded-full text-sm gap-2"
                        >
                          <Play className="h-4 w-4" />
                          {t("interview.continue")}
                        </Button>
                        <Button
                          onClick={stopRecording}
                          className="h-12 px-5 rounded-full text-sm gap-2"
                        >
                          <MicOff className="h-4 w-4" />
                          {t("interview.submit")}
                        </Button>
                      </>
                    )}
                    <button
                      onClick={restartRecording}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 ml-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t("interview.restart")}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      {recordingState === "recording" ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {recordingState === "recording"
                        ? t("interview.recording")
                        : t("interview.paused")}{" "}
                      — {formatTime(recordingSeconds)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Answer Text Area */}
          <Textarea
            placeholder={
              mode === "voice"
                ? t("interview.voicePlaceholder")
                : t("interview.textPlaceholder")
            }
            value={answers[currentIndex] || ""}
            onChange={(e) => {
              const updated = [...answers];
              updated[currentIndex] = e.target.value;
              setAnswers(updated);
            }}
            rows={mode === "voice" ? 4 : 5}
            className="rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
          />

          <p className="text-xs text-muted-foreground/60 mt-2">
            {mode === "voice"
              ? t("interview.voiceHint")
              : t("interview.textHint")}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0 || isRecording}
          className="h-10 px-5 rounded-full text-sm"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t("common.previous")}
        </Button>

        <p className="text-xs text-muted-foreground">
          {answeredCount} {t("interview.of")} {totalQuestions} {t("interview.answered")}
        </p>

        {currentIndex < totalQuestions - 1 ? (
          <Button
            onClick={handleNext}
            disabled={isRecording}
            className="h-10 px-5 rounded-full text-sm font-semibold"
          >
            {t("common.next")}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || answeredCount === 0 || isRecording}
            className="h-10 px-6 rounded-full text-sm font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("interview.submitting")}
              </>
            ) : (
              <>
                {t("interview.finishInterview")}
                <CheckCircle2 className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
