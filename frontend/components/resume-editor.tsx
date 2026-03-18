"use client";

import { useState, useRef } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useVersionStore, type ResumeVersion } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Mail,
  List,
  Download,
  Pencil,
  Save,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";

interface ResumeEditorProps {
  applicationId: string;
  onDownload: (versionId: string, type: "resume" | "cover-letter") => void;
  onRegenerate: (instructions: string) => void;
  regenerating: boolean;
  downloading: boolean;
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  keyword: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", label: "editor.changeKeyword" },
  ats: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", label: "editor.changeAts" },
  impact: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", label: "editor.changeImpact" },
  structure: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", label: "editor.changeStructure" },
};

export function ResumeEditor({
  applicationId,
  onDownload,
  onRegenerate,
  regenerating,
  downloading,
}: ResumeEditorProps) {
  const { t } = useTranslation();
  const { versions, activeVersionId, updateVersion } = useVersionStore();
  const [activeTab, setActiveTab] = useState<"resume" | "cover-letter" | "changes">("resume");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerateInstructions, setRegenerateInstructions] = useState("");
  const coverLetterWarningShown = useRef(false);

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  const content =
    activeTab === "resume"
      ? activeVersion?.resumeContent || ""
      : activeTab === "cover-letter"
        ? activeVersion?.coverLetterText || ""
        : "";

  const handleStartEdit = () => {
    setEditContent(content);
    setEditing(true);
    if (activeTab === "resume" && activeVersion?.coverLetterText && !coverLetterWarningShown.current) {
      toast.info(t("editor.coverLetterWontUpdate"));
      coverLetterWarningShown.current = true;
    }
  };

  const handleSave = async () => {
    if (!activeVersion) return;
    setSaving(true);
    try {
      await api.put(`/api/tailor/version/${applicationId}/${activeVersion.id}`, {
        content: editContent,
        field: activeTab === "resume" ? "resumeContent" : "coverLetterText",
      });
      const updateField = activeTab === "resume" ? "resumeContent" : "coverLetterText";
      updateVersion(activeVersion.id, { [updateField]: editContent } as Partial<ResumeVersion>);
      setEditing(false);
      toast.success(t("editor.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("editor.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!activeVersion) return;
    setSaving(true);
    try {
      // Copy first, then update the copy
      const result = await api.post<{ versionId: string }>(
        `/api/tailor/version/${applicationId}/${activeVersion.id}/copy`
      );
      await api.put(`/api/tailor/version/${applicationId}/${result.versionId}`, {
        content: editContent,
        field: activeTab === "resume" ? "resumeContent" : "coverLetterText",
      });
      // Reload versions
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      useVersionStore.getState().setVersions(versionsResult.versions);
      setEditing(false);
      toast.success(t("editor.newVersionCreated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("editor.errorSaveNew"));
    } finally {
      setSaving(false);
    }
  };

  const changelog = activeVersion?.changelog ?? [];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab Switcher + Actions */}
      <div className="px-6 py-3 border-b border-border flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-secondary rounded-xl">
          <button
            onClick={() => { setActiveTab("resume"); setEditing(false); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] active:opacity-80",
              activeTab === "resume"
                ? "bg-card apple-shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            {t("editor.resume")}
          </button>
          <button
            onClick={() => { setActiveTab("cover-letter"); setEditing(false); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] active:opacity-80",
              activeTab === "cover-letter"
                ? "bg-card apple-shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            {t("editor.coverLetter")}
          </button>
          <button
            onClick={() => { setActiveTab("changes"); setEditing(false); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] active:opacity-80",
              activeTab === "changes"
                ? "bg-card apple-shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-3.5 w-3.5" />
            {t("editor.changes")}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                className="h-8 rounded-lg text-xs"
              >
                <X className="mr-1 h-3 w-3" /> {t("common.cancel")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAsNew}
                disabled={saving}
                className="h-8 rounded-lg text-xs"
              >
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                {t("editor.saveAsNew")}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-8 rounded-lg text-xs"
              >
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                {t("editor.save")}
              </Button>
            </>
          ) : activeTab !== "changes" ? (
            <>
              {activeVersion && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartEdit}
                    className="h-8 rounded-lg text-xs"
                  >
                    <Pencil className="mr-1 h-3 w-3" /> {t("editor.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onDownload(activeVersion.id, activeTab === "resume" ? "resume" : "cover-letter")
                    }
                    disabled={downloading}
                    className="h-8 rounded-lg text-xs"
                  >
                    {downloading ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3 w-3" />
                    )}
                    {downloading ? t("editor.downloading") : t("editor.downloadDocx")}
                  </Button>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {!activeVersion ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <p className="text-sm text-muted-foreground">
              {t("editor.noVersions")}
            </p>
          </div>
        ) : activeTab === "changes" ? (
          changelog.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <p className="text-sm text-muted-foreground">
                {t("editor.noChanges")}
              </p>
            </div>
          ) : (
            <div className="max-w-[720px] mx-auto space-y-3">
              {changelog.map((item, i) => {
                const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.impact;
                return (
                  <div
                    key={i}
                    className="rounded-xl bg-white dark:bg-card p-5 apple-shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 mt-0.5",
                          style.bg,
                          style.text
                        )}
                      >
                        {t(style.label)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">
                          {item.section}
                        </p>
                        <p className="text-sm font-medium text-foreground mt-1">
                          {item.what}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.why}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : editing ? (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[500px] rounded-xl bg-secondary border-0 text-sm leading-relaxed font-mono p-5 focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : (
          <div className="rounded-2xl bg-white dark:bg-card p-10 min-h-[400px] apple-shadow-sm max-w-[720px] mx-auto">
            <div className="resume-content">
              {content ? <Markdown>{content}</Markdown> : t("editor.emptyContent")}
            </div>
          </div>
        )}
      </div>

      {/* Regenerate */}
      {!editing && activeVersion && activeTab !== "changes" && (
        <div className="px-6 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder={t("editor.regeneratePlaceholder")}
              value={regenerateInstructions}
              onChange={(e) => setRegenerateInstructions(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && regenerateInstructions.trim()) {
                  onRegenerate(regenerateInstructions);
                  setRegenerateInstructions("");
                }
              }}
              className="flex-1 h-9 rounded-lg bg-secondary border-0 text-sm px-4 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (regenerateInstructions.trim()) {
                  onRegenerate(regenerateInstructions);
                  setRegenerateInstructions("");
                }
              }}
              disabled={regenerating || !regenerateInstructions.trim()}
              className="h-9 px-4 rounded-lg text-xs"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="mr-1 h-3 w-3" />
                  {t("editor.regenerate")}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
