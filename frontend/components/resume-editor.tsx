"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useVersionStore, type ResumeVersion } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Mail,
  Download,
  Pencil,
  Save,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ResumeEditorProps {
  applicationId: string;
  onDownload: (versionId: string, type: "resume" | "cover-letter") => void;
  onRegenerate: (instructions: string) => void;
  regenerating: boolean;
}

export function ResumeEditor({
  applicationId,
  onDownload,
  onRegenerate,
  regenerating,
}: ResumeEditorProps) {
  const { versions, activeVersionId, updateVersion } = useVersionStore();
  const [activeTab, setActiveTab] = useState<"resume" | "cover-letter">("resume");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerateInstructions, setRegenerateInstructions] = useState("");

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  const content =
    activeTab === "resume"
      ? activeVersion?.resumeContent || ""
      : activeVersion?.coverLetterText || "";

  const handleStartEdit = () => {
    setEditContent(content);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!activeVersion) return;
    setSaving(true);
    try {
      await api.put(`/api/tailor/version/${applicationId}/${activeVersion.id}`, {
        content: editContent,
      });
      updateVersion(activeVersion.id, { resumeContent: editContent });
      setEditing(false);
    } catch {
      // ignore
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
      });
      // Reload versions
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      useVersionStore.getState().setVersions(versionsResult.versions);
      setEditing(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab Switcher + Actions */}
      <div className="px-6 py-3 border-b border-border flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-secondary rounded-xl">
          <button
            onClick={() => { setActiveTab("resume"); setEditing(false); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all",
              activeTab === "resume"
                ? "bg-card apple-shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Curriculo
          </button>
          <button
            onClick={() => { setActiveTab("cover-letter"); setEditing(false); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all",
              activeTab === "cover-letter"
                ? "bg-card apple-shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            Carta
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
                <X className="mr-1 h-3 w-3" /> Cancelar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAsNew}
                disabled={saving}
                className="h-8 rounded-lg text-xs"
              >
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Salvar como nova versao
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-8 rounded-lg text-xs"
              >
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Salvar
              </Button>
            </>
          ) : (
            <>
              {activeVersion && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartEdit}
                    className="h-8 rounded-lg text-xs"
                  >
                    <Pencil className="mr-1 h-3 w-3" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onDownload(activeVersion.id, activeTab === "resume" ? "resume" : "cover-letter")
                    }
                    className="h-8 rounded-lg text-xs"
                  >
                    <Download className="mr-1 h-3 w-3" /> Baixar .docx
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {!activeVersion ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <p className="text-sm text-muted-foreground">
              Nenhuma versao disponivel. Gere um curriculo primeiro.
            </p>
          </div>
        ) : editing ? (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[500px] rounded-xl bg-secondary border-0 text-sm leading-relaxed font-mono p-5 focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : (
          <div className="rounded-2xl bg-secondary/50 p-8 min-h-[400px]">
            <div className="prose prose-sm max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {content || "Conteudo vazio."}
            </div>
          </div>
        )}
      </div>

      {/* Regenerate */}
      {!editing && activeVersion && (
        <div className="px-6 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Instrucoes para regenerar..."
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
                  Regenerar
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
