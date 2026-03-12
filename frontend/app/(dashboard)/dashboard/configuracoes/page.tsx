"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Download,
  Trash2,
  Loader2,
  Shield,
  FileJson,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");

  const handleExportData = async () => {
    setExporting(true);
    setError("");
    try {
      const data = await api.get<Record<string, unknown>>("/api/profile/data-export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `merlin-dados-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao exportar dados. Tente novamente."
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== "EXCLUIR") return;
    setDeleting(true);
    setError("");
    try {
      await api.delete("/api/profile/account/delete");
      await signOut(auth);
      router.push("/login");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao excluir conta. Tente novamente."
      );
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Configuracoes
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          Gerencie sua conta e seus dados pessoais.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-5 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Account Info */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Sua Conta</h2>
        </div>
        <div className="px-8 pb-8 pt-4 space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Nome</span>
            <span className="text-sm font-medium text-foreground">
              {user?.displayName || "—"}
            </span>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium text-foreground">
              {user?.email || "—"}
            </span>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Autenticacao</span>
            <span className="text-sm font-medium text-foreground">
              {user?.providerData?.[0]?.providerId === "google.com"
                ? "Google"
                : "Email/Senha"}
            </span>
          </div>
        </div>
      </div>

      {/* LGPD Rights */}
      <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
              <Shield className="h-5 w-5 text-foreground/70" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Privacidade e Dados (LGPD)
              </h2>
              <p className="text-sm text-muted-foreground">
                Seus direitos conforme a Lei Geral de Protecao de Dados
              </p>
            </div>
          </div>
        </div>
        <div className="px-8 pb-8 pt-6 space-y-4">
          {/* Export Data */}
          <div className="rounded-xl bg-secondary/50 p-5">
            <div className="flex items-start gap-4">
              <FileJson className="h-5 w-5 text-foreground/60 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Exportar Dados
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Baixe todos os seus dados pessoais em formato JSON (direito de
                  acesso e portabilidade — Art. 18, II e V da LGPD).
                </p>
                <Button
                  onClick={handleExportData}
                  disabled={exporting}
                  variant="outline"
                  className="h-9 px-4 rounded-full text-xs mt-3"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Download className="mr-1.5 h-3 w-3" />
                      Baixar meus dados
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Privacy Policy Link */}
          <Link
            href="/privacidade"
            target="_blank"
            className="flex items-center gap-4 rounded-xl bg-secondary/50 p-5 hover:bg-secondary/70 transition-colors"
          >
            <Shield className="h-5 w-5 text-foreground/60 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Politica de Privacidade
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Como coletamos, usamos e protegemos seus dados
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground/50" />
          </Link>

          {/* Terms of Service Link */}
          <Link
            href="/termos"
            target="_blank"
            className="flex items-center gap-4 rounded-xl bg-secondary/50 p-5 hover:bg-secondary/70 transition-colors"
          >
            <Shield className="h-5 w-5 text-foreground/60 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Termos de Uso
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Regras de uso da plataforma Merlin
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground/50" />
          </Link>

          {/* DPO Contact */}
          <div className="rounded-xl bg-secondary/50 p-5">
            <div className="flex items-start gap-4">
              <Shield className="h-5 w-5 text-foreground/60 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Encarregado de Dados (DPO)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para exercer qualquer direito LGPD ou esclarecer duvidas:
                </p>
                <a
                  href="mailto:contact@ellaexecutivesearch.com"
                  className="text-xs text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors mt-1 inline-block"
                >
                  contact@ellaexecutivesearch.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl border border-destructive/20 bg-card overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Zona de Perigo
              </h2>
              <p className="text-sm text-muted-foreground">
                Acoes irreversiveis
              </p>
            </div>
          </div>
        </div>
        <div className="px-8 pb-8 pt-6">
          <div className="rounded-xl bg-destructive/5 border border-destructive/10 p-5">
            <div className="flex items-start gap-4">
              <Trash2 className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Excluir Conta
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Remove permanentemente sua conta e todos os dados associados:
                  perfis, curriculos, candidaturas, versoes geradas e dados de
                  entrevista. Esta acao e <strong>irreversivel</strong> (Art. 18,
                  VI da LGPD — direito de eliminacao).
                </p>
                {!confirmDelete ? (
                  <Button
                    onClick={() => setConfirmDelete(true)}
                    variant="destructive"
                    className="h-9 px-4 rounded-full text-xs mt-3"
                  >
                    <Trash2 className="mr-1.5 h-3 w-3" />
                    Excluir minha conta
                  </Button>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-destructive font-medium">
                      Digite EXCLUIR para confirmar:
                    </p>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                      placeholder="EXCLUIR"
                      className="h-10 w-full max-w-[200px] rounded-lg bg-background border border-destructive/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive/50"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleDeleteAccount}
                        disabled={confirmText !== "EXCLUIR" || deleting}
                        variant="destructive"
                        className="h-9 px-4 rounded-full text-xs"
                      >
                        {deleting ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Excluindo...
                          </>
                        ) : (
                          "Confirmar exclusao"
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setConfirmDelete(false);
                          setConfirmText("");
                        }}
                        variant="outline"
                        className="h-9 px-4 rounded-full text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
