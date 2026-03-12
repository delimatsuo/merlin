"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useVersionStore, type ResumeVersion } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Download,
  Pencil,
  Copy,
  Type,
  Trash2,
  Plus,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface VersionSidebarProps {
  applicationId: string;
  collapsed: boolean;
  onToggle: () => void;
  onDownload: (versionId: string, type: "resume" | "cover-letter") => void;
  onEdit: (versionId: string) => void;
  onNewVersion: () => void;
}

export function VersionSidebar({
  applicationId,
  collapsed,
  onToggle,
  onDownload,
  onEdit,
  onNewVersion,
}: VersionSidebarProps) {
  const { versions, activeVersionId, setActiveVersion, updateVersion, removeVersion } =
    useVersionStore();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleCopy = async (versionId: string) => {
    setActionLoading(versionId);
    try {
      await api.post<{ versionId: string }>(
        `/api/tailor/version/${applicationId}/${versionId}/copy`
      );
      // Reload versions
      const versionsResult = await api.get<{ versions: ResumeVersion[] }>(
        `/api/tailor/versions/${applicationId}`
      );
      useVersionStore.getState().setVersions(versionsResult.versions);
      toast.success("Versao copiada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao copiar versao.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRename = async (versionId: string) => {
    if (!renameValue.trim()) {
      setRenaming(null);
      return;
    }
    try {
      await api.patch(`/api/tailor/version/${applicationId}/${versionId}/rename`, {
        name: renameValue.trim(),
      });
      updateVersion(versionId, { name: renameValue.trim() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao renomear.");
    }
    setRenaming(null);
  };

  const handleDelete = async (versionId: string) => {
    setActionLoading(versionId);
    try {
      await api.delete(`/api/tailor/version/${applicationId}/${versionId}`);
      removeVersion(versionId);
      toast.success("Versao excluida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir versao.");
    } finally {
      setActionLoading(null);
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-30 h-12 w-6 rounded-r-lg bg-card border border-l-0 border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors md:static md:h-full md:w-8 md:rounded-r-xl"
      >
        <ChevronLeft className="h-4 w-4 rotate-180" />
      </button>
    );
  }

  return (
    <div className="w-64 shrink-0 border-r border-border bg-card/50 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
          Versoes
        </h3>
        <button
          onClick={onToggle}
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {versions.map((version) => (
          <div
            key={version.id}
            className={cn(
              "rounded-lg p-3 cursor-pointer transition-colors group",
              version.id === activeVersionId
                ? "bg-primary/10 ring-1 ring-primary/20"
                : "hover:bg-foreground/[0.03]"
            )}
            onClick={() => setActiveVersion(version.id)}
          >
            {renaming === version.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(version.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(version.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="w-full text-xs font-medium bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {version.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {version.atsScore ? `${Math.round(version.atsScore)}% ATS` : ""}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {actionLoading === version.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onDownload(version.id, "resume")}>
                      <Download className="mr-2 h-3.5 w-3.5" /> Baixar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(version.id)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCopy(version.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Copiar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenaming(version.id);
                        setRenameValue(version.name);
                      }}
                    >
                      <Type className="mr-2 h-3.5 w-3.5" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(version.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New Version Button */}
      <div className="p-3 border-t border-border">
        <Button
          variant="outline"
          onClick={onNewVersion}
          className="w-full h-8 rounded-lg text-xs"
        >
          <Plus className="mr-1.5 h-3 w-3" />
          Gerar Nova Versao
        </Button>
      </div>
    </div>
  );
}
