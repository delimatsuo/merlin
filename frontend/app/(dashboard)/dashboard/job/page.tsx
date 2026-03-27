"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApplicationStore, useWorkflowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";

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

function VagaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
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
  reset,
  } = useApplicationStore();

  // Reset store on fresh navigation (skip if pre-filling from job feed)
  const prefillJobId = searchParams?.get("prefill");
  useEffect(() => {
    if (!prefillJobId) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill from job feed: fetch job raw_text and auto-trigger analysis
  useEffect(() => {
    if (!prefillJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const job = await api.get<{ raw_text: string }>(`/api/jobs/${prefillJobId}`);
        if (!cancelled && job?.raw_text) {
          reset();
          setJobDescription(job.raw_text);
        }
      } catch {
        // Job not found — user can still paste manually
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillJobId]);

  // Analysis results (inline)
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // Follow-up text answers
  const [textAnswers, setTextAnswers] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jobDescription.trim().length < 50) {
      setError(t("job.errorMinChars"));
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
          : t("job.errorAnalyze")
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

    // Save follow-up answers with question context into knowledge
    const questions = result.followUp?.questions || [];
    for (let i = 0; i < textAnswers.length; i++) {
      const answer = textAnswers[i]?.trim();
      if (answer) {
        try {
          const questionContext = questions[i] || "";
          await api.post(`/api/applications/${result.applicationId}/comment`, {
            comment: questionContext
              ? `Pergunta: ${questionContext}\nResposta: ${answer}`
              : answer,
          });
        } catch {
          // non-blocking
        }
      }
    }

    try {
      // Get profileId from workflow store, fallback to fetching latest profile
      let { profileId } = useWorkflowStore.getState();
      if (!profileId) {
        const profiles = await api.get<{ profiles: { id: string }[] }>("/api/profile/all");
        profileId = profiles.profiles[0]?.id || "";
      }
      if (!profileId) {
        setError(t("job.errorNoProfile"));
        setGenerating(false);
        return;
      }
      const genResult = await api.post<{
        resumeContent: string;
        coverLetter: string;
      }>("/api/tailor/generate", {
        profileId,
        applicationId: result.applicationId,
      });
      setTailoredResume(genResult.resumeContent);
      setCoverLetter(genResult.coverLetter);
      router.push(`/dashboard/application?id=${result.applicationId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("job.errorGenerate")
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
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          {t("common.back")}
        </button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("job.title")}
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          {t("job.subtitle")}
        </p>
        <div className="mt-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">{t("job.howTitle")}</span>{" "}
            {t("job.howBody")}
          </p>
        </div>
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
            {t("job.descriptionTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("job.descriptionSubtitle")}
          </p>
        </div>
        <div className="p-8 pt-4">
          <form onSubmit={handleAnalyze} className="space-y-5">
            <Textarea
              placeholder={t("job.placeholder")}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={14}
              disabled={!!result}
              className="resize-y rounded-xl bg-secondary border-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-5"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground tabular-nums">
                {jobDescription.length} {t("common.characters")}
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
                      {t("job.analyzing")}
                    </>
                  ) : (
                    <>
                      {t("job.analyze")}
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
                    setDisclaimerAccepted(false);
                  }}
                  className="h-9 px-4 rounded-full text-xs"
                >
                  {t("job.newAnalysis")}
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
                    {t("job.atsScore")}
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
                  {t("job.followUpTitle")}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t("job.followUpSubtitle")}
                </p>
              </div>
              <div className="p-8 pt-4 space-y-4">
                {result.followUp.questions.map((question, i) => (
                  <div key={i} className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {question}
                    </p>
                    <Textarea
                      placeholder={t("job.answerPlaceholder")}
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
                {t("job.anythingElse")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("job.anythingElseDesc")}
              </p>
            </div>
            <div className="p-8 pt-4">
              <Textarea
                placeholder={t("job.commentPlaceholder")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring p-4"
              />
            </div>
          </div>

          {/* AI Disclaimer */}
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 overflow-hidden">
            <div className="px-8 pt-7 pb-2">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {t("job.disclaimerTitle")}
                  </h2>
                  <p className="text-sm text-foreground/70 mt-0.5">
                    {t("job.disclaimerSubtitle")}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-8 pb-7 pt-4 space-y-4">
              <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
                {locale === "en" ? (
                  <>
                    <p>
                      The resumes and cover letters generated by Merlin use artificial
                      intelligence (AI) in an <strong>experimental</strong> capacity.
                      AI can present <strong>&quot;hallucinations&quot;</strong> — this
                      means the system may <strong>invent facts, experiences, dates,
                      companies, positions, or qualifications that never existed</strong> in
                      your professional history.
                    </p>
                    <p>
                      <strong>You are entirely responsible</strong> for reviewing, validating,
                      and correcting all generated content before sending it to any employer
                      or using it in any selection process. Submitting a resume with false
                      information can have serious legal and professional consequences.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ella Executive Search Ltda is not responsible for the content of
                      generated documents, for lost opportunities, or for any damages
                      arising from the use of inaccurate information produced by AI.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Os curriculos e cartas de apresentacao gerados pelo Merlin utilizam
                      inteligencia artificial (IA) em carater <strong>experimental</strong>.
                      A IA pode apresentar <strong>&quot;alucinacoes&quot;</strong> — isto
                      significa que o sistema pode <strong>inventar fatos, experiencias,
                      datas, empresas, cargos ou qualificacoes que nunca existiram</strong> no
                      seu historico profissional.
                    </p>
                    <p>
                      <strong>Voce e inteiramente responsavel</strong> por revisar, validar e
                      corrigir todo o conteudo gerado antes de envia-lo a qualquer empregador
                      ou utilizá-lo em qualquer processo seletivo. Enviar um curriculo com
                      informacoes falsas pode ter consequencias legais e profissionais graves.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A Ella Executive Search Ltda nao se responsabiliza pelo conteudo dos
                      documentos gerados, por oportunidades perdidas, ou por quaisquer danos
                      decorrentes do uso de informacoes imprecisas produzidas pela IA.
                    </p>
                  </>
                )}
              </div>
              <label
                htmlFor="disclaimer-accept"
                className="flex items-start gap-3 cursor-pointer group pt-1"
              >
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    id="disclaimer-accept"
                    checked={disclaimerAccepted}
                    onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-5 rounded-md border-2 border-yellow-600/30 peer-checked:border-foreground peer-checked:bg-foreground transition-all duration-200" />
                  <svg
                    className="absolute inset-0 h-5 w-5 text-background opacity-0 peer-checked:opacity-100 transition-opacity duration-200 p-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-foreground leading-relaxed">
                  {t("job.disclaimerAccept")}
                </span>
              </label>
            </div>
          </div>

          {/* Generate button */}
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={generating || !disclaimerAccepted}
              className="h-12 px-8 rounded-full text-sm font-semibold"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("job.generating")}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("job.generate")}
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function VagaPage() {
  return (
    <Suspense>
      <VagaPageContent />
    </Suspense>
  );
}
