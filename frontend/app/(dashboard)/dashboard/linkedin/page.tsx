"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { api } from "@/lib/api";
import { useLinkedInStore } from "@/lib/store";
import {
  Upload,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  AlertCircle,
  Linkedin,
  MapPin,
  Briefcase,
  GraduationCap,
  RefreshCw,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_TEXT_LENGTH = 300;
const MAX_TEXT_LENGTH = 50000;

export default function LinkedInPage() {
  const { t, locale } = useTranslation();
  const {
    structured,
    suggestions,
    crossRef,
    loading,
    analyzing,
    setStructured,
    setSuggestions,
    setCrossRef,
    setLoading,
    setAnalyzing,
    reset,
  } = useLinkedInStore();

  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Check for existing profile on mount
  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const result = await api.get<{
          structured: typeof structured;
          suggestions: typeof suggestions;
          crossRef: typeof crossRef;
        }>("/api/linkedin/current");
        if (result.structured) {
          setStructured(result.structured);
        }
        if (result.suggestions) {
          setSuggestions(result.suggestions);
        }
        if (result.crossRef) {
          setCrossRef(result.crossRef);
        }
      } catch {
        // No profile yet — show input state
      } finally {
        setInitialLoading(false);
      }
    };
    fetchExisting();
  }, []);

  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError(t("profile.errorFileSize"));
        return;
      }

      setError("");
      setLoading(true);

      try {
        const result = await api.upload<{
          structured: typeof structured;
          status: string;
        }>("/api/linkedin/upload", file);
        setStructured(result.structured);
        setSuggestions([]);
        setCrossRef([]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("linkedin.errorUpload")
        );
      } finally {
        setLoading(false);
      }
    },
    [setStructured, setSuggestions, setCrossRef, setLoading, t]
  );

  const handlePaste = async () => {
    if (pasteText.length < MIN_TEXT_LENGTH) return;

    setError("");
    setLoading(true);

    try {
      const result = await api.post<{
        structured: typeof structured;
        status: string;
      }>("/api/linkedin/paste", { text: pasteText });
      setStructured(result.structured);
      setSuggestions([]);
      setCrossRef([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("linkedin.errorPaste")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (force = false) => {
    setError("");
    setAnalyzing(true);

    try {
      const result = await api.post<{
        suggestions: typeof suggestions;
        crossRef: typeof crossRef;
      }>("/api/linkedin/analyze", { locale, force });
      setSuggestions(result.suggestions || []);
      setCrossRef(result.crossRef || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("linkedin.errorAnalyze")
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReanalyze = async () => {
    setSuggestions([]);
    setCrossRef([]);
    await handleAnalyze(true);
  };

  const handleSendNew = () => {
    reset();
    setPasteText("");
    setError("");
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: loading,
  });

  if (initialLoading) {
    return (
      <div className="max-w-2xl mx-auto flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasProfile = !!structured;
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("linkedin.title")}
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          {t("linkedin.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* State A: Input */}
      {!hasProfile && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          {/* Tab Switcher */}
          <div className="px-8 pt-8 pb-4">
            <div className="flex gap-1 p-1 bg-secondary rounded-xl">
              <button
                onClick={() => setActiveTab("upload")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                  activeTab === "upload"
                    ? "bg-card text-foreground apple-shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("linkedin.tabUpload")}
              </button>
              <button
                onClick={() => setActiveTab("paste")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                  activeTab === "paste"
                    ? "bg-card text-foreground apple-shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("linkedin.tabPaste")}
              </button>
            </div>
          </div>

          {/* Upload Tab */}
          {activeTab === "upload" && (
            <div className="px-8 pb-8">
              <p className="text-xs text-muted-foreground mb-4">
                {t("linkedin.uploadHelp")}
              </p>
              <div
                {...getRootProps()}
                className={cn(
                  "rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300",
                  isDragActive
                    ? "border-foreground/30 bg-secondary"
                    : "border-border hover:border-foreground/20 hover:bg-secondary/50",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              >
                <input {...getInputProps()} />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative h-14 w-14">
                      <div className="absolute inset-0 rounded-full border-2 border-muted" />
                      <div className="absolute inset-0 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("linkedin.processing")}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {t("linkedin.processingTime")}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {isDragActive
                          ? t("linkedin.uploadDropActive")
                          : t("linkedin.uploadDrop")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("linkedin.uploadFormat")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Paste Tab */}
          {activeTab === "paste" && (
            <div className="px-8 pb-8 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("linkedin.pasteLabel")}
                </label>
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                  placeholder={t("linkedin.pastePlaceholder")}
                  className="mt-2 min-h-[200px] resize-y rounded-xl"
                  disabled={loading}
                />
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-muted-foreground">
                    {t("linkedin.pasteMinChars")}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      pasteText.length < MIN_TEXT_LENGTH
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {pasteText.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} {t("common.characters")}
                  </p>
                </div>
              </div>
              <Button
                onClick={handlePaste}
                disabled={loading || pasteText.length < MIN_TEXT_LENGTH}
                className="w-full rounded-xl"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {loading ? t("linkedin.processing") : t("linkedin.submit")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* State B: Profile loaded */}
      {hasProfile && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#0A66C2]/10 flex items-center justify-center shrink-0">
                <Linkedin className="h-6 w-6 text-[#0A66C2]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  {structured?.name || t("linkedin.profileLoaded")}
                </h2>
                {structured?.headline && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {structured.headline}
                  </p>
                )}
                {structured?.location && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {structured.location}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-4 mt-5">
              {(structured?.experience?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5" />
                  {structured?.experience?.length} {t("linkedin.experience")}
                </div>
              )}
              {(structured?.education?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {structured?.education?.length}
                </div>
              )}
              {(structured?.skills?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {structured?.skills?.length} {t("linkedin.skills")}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 flex gap-3">
            {!hasSuggestions ? (
              <Button
                onClick={() => handleAnalyze()}
                disabled={analyzing}
                className="flex-1 rounded-xl"
              >
                {analyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {analyzing ? t("linkedin.analyzing") : t("linkedin.analyzeButton")}
              </Button>
            ) : (
              <Button
                onClick={handleReanalyze}
                disabled={analyzing}
                variant="outline"
                className="rounded-xl"
              >
                {analyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {t("linkedin.reanalyze")}
              </Button>
            )}
            <Button
              onClick={handleSendNew}
              variant="outline"
              className="rounded-xl"
            >
              {t("linkedin.sendNew")}
            </Button>
          </div>

          {analyzing && !hasSuggestions && (
            <div className="px-8 pb-8">
              <div className="rounded-xl bg-secondary/50 px-5 py-4 flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">{t("linkedin.analyzing")}</p>
                  <p className="text-xs text-muted-foreground">{t("linkedin.analyzingTime")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* State C: Suggestions */}
      {hasSuggestions && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-lg font-semibold text-foreground">
              {t("linkedin.suggestionsTitle")}
            </h2>
          </div>
          <div className="px-8 pb-8 pt-4 space-y-3">
            {suggestions.map((sug) => {
              const isExpanded = expandedSuggestion === sug.id;
              const severityStyles = {
                high: {
                  bg: "bg-red-100 dark:bg-red-900/30",
                  text: "text-red-700 dark:text-red-300",
                  Icon: AlertCircle,
                },
                medium: {
                  bg: "bg-amber-100 dark:bg-amber-900/30",
                  text: "text-amber-700 dark:text-amber-300",
                  Icon: AlertTriangle,
                },
                low: {
                  bg: "bg-blue-100 dark:bg-blue-900/30",
                  text: "text-blue-700 dark:text-blue-300",
                  Icon: Info,
                },
              };
              const severity = severityStyles[sug.severity] || severityStyles.medium;
              return (
                <div key={sug.id} className="rounded-xl bg-secondary/50 overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedSuggestion(isExpanded ? null : sug.id)
                    }
                    className="w-full px-5 py-4 flex items-start gap-3 text-left"
                  >
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 mt-0.5",
                        severity.bg,
                        severity.text
                      )}
                    >
                      {t(`linkedin.severity${sug.severity.charAt(0).toUpperCase() + sug.severity.slice(1)}`)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {sug.title}
                        </p>
                        {sug.linkedinSpecific && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#0A66C2]/10 text-[#0A66C2]">
                            {t("linkedin.linkedinOnly")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {sug.section}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {sug.detail}
                      </p>
                    </div>
                    {sug.examples.length > 0 &&
                      (isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      ))}
                  </button>
                  {isExpanded && sug.examples.length > 0 && (
                    <div className="px-5 pb-4 space-y-3">
                      {sug.examples.map((ex, i) => (
                        <div
                          key={i}
                          className="rounded-lg overflow-hidden text-sm"
                        >
                          <div className="bg-red-50 dark:bg-red-950/20 px-4 py-2.5 border-l-2 border-red-300 dark:border-red-700">
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                              {t("linkedin.before")}
                            </p>
                            <p className="text-foreground/80">{ex.before}</p>
                          </div>
                          <div className="bg-green-50 dark:bg-green-950/20 px-4 py-2.5 border-l-2 border-green-300 dark:border-green-700">
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                              {t("linkedin.after")}
                            </p>
                            <p className="text-foreground/80">{ex.after}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-Reference Section */}
      {crossRef.length > 0 && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-lg font-semibold text-foreground">
              {t("linkedin.crossRefTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("linkedin.crossRefDesc")}
            </p>
          </div>
          <div className="px-8 pb-8 pt-4 space-y-3">
            {crossRef.map((cr, i) => (
              <div
                key={i}
                className="rounded-xl bg-secondary/50 px-5 py-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-muted-foreground capitalize">
                    {cr.section}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {t("linkedin.crossRefSource")}: {cr.source}
                  </span>
                </div>
                <p className="text-sm text-foreground">{cr.insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
