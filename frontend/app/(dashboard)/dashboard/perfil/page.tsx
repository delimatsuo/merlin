"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { api } from "@/lib/api";
import { useProfileStore, useWorkflowStore, useProcessingStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

export default function PerfilPage() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const { profile, setProfile, setLoading } = useProfileStore();
  const { setProfileId, markStep } = useWorkflowStore();
  const { addTask, completeTask, failTask } = useProcessingStore();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("Arquivo muito grande. O tamanho máximo é 10MB.");
        return;
      }

      setError("");
      setUploading(true);
      setLoading(true);

      try {
        const result = await api.upload<{
          profileId: string;
          profile: Record<string, unknown>;
        }>("/api/resume/upload", file);
        setUploadedFile(file.name);
        setProfile(result.profile as never);
        setProfileId(result.profileId);
        markStep("upload");
        // Trigger background company research
        addTask("research", "Pesquisando empresas do seu perfil...");
        api.post(`/api/research/enrich/${result.profileId}`)
          .then(() => completeTask("research"))
          .catch(() => failTask("research", "Pesquisa de empresas falhou"));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não conseguimos processar seu currículo. Tente outro arquivo."
        );
      } finally {
        setUploading(false);
        setLoading(false);
      }
    },
    [setProfile, setLoading, setProfileId, markStep]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Meu Currículo
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Envie seu currículo para começarmos a análise inteligente.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Upload Zone */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Upload</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            PDF ou DOCX, máximo 10MB
          </p>
        </div>
        <div className="p-8 pt-4">
          <div
            {...getRootProps()}
            className={cn(
              "rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300",
              isDragActive
                ? "border-foreground/30 bg-secondary"
                : "border-border hover:border-foreground/20 hover:bg-secondary/50",
              uploading && "opacity-50 cursor-not-allowed"
            )}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative h-14 w-14">
                  <div className="absolute inset-0 rounded-full border-2 border-muted" />
                  <div className="absolute inset-0 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Processando seu currículo...
                </p>
              </div>
            ) : uploadedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-foreground/5 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {uploadedFile}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique ou arraste para substituir
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isDragActive
                      ? "Solte o arquivo aqui"
                      : "Arraste seu currículo ou clique para selecionar"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF ou DOCX
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Parsed Profile */}
      {profile && (
        <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
                <FileText className="h-5 w-5 text-foreground/70" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Perfil Extraído
                </h2>
                <p className="text-sm text-muted-foreground">
                  Revise os dados. Você poderá editar depois.
                </p>
              </div>
            </div>
          </div>
          <div className="px-8 pb-8 pt-6 space-y-6">
            {profile.name && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nome
                </p>
                <p className="text-base font-medium text-foreground mt-1">
                  {profile.name}
                </p>
              </div>
            )}
            {profile.summary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Resumo
                </p>
                <p className="text-sm text-foreground/80 mt-1 leading-relaxed">
                  {profile.summary}
                </p>
              </div>
            )}
            {profile.skills && profile.skills.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
                  Competências
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill: string) => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-secondary text-foreground/80"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {profile.experience && profile.experience.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Experiência
                </p>
                <div className="space-y-4">
                  {profile.experience.map((exp, i) => (
                    <div key={i} className="relative pl-5">
                      <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-foreground/20" />
                      <p className="text-sm font-semibold text-foreground">
                        {exp.role}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {exp.company}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {exp.startDate} — {exp.endDate || "Atual"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
