"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Bug, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type FeedbackType = "bug" | "suggestion";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  const handleSubmit = async () => {
    if (!message.trim() || message.trim().length < 5) return;
    try {
      setLoading(true);
      await api.post("/api/feedback", { type, message: message.trim(), page: pathname });
      toast.success("Obrigado pelo feedback!");
      setMessage("");
      setType("suggestion");
      setOpen(false);
    } catch {
      toast.error("Erro ao enviar feedback. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground/60 ring-1 ring-foreground/10 backdrop-blur-sm transition-all hover:bg-foreground/15 hover:text-foreground/80 hover:scale-105 active:scale-95"
        aria-label="Enviar feedback"
      >
        <MessageCircle className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
            <DialogDescription>
              Encontrou um problema ou tem uma sugestão?
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <button
              onClick={() => setType("bug")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                type === "bug"
                  ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                  : "border-border/50 text-muted-foreground hover:border-border"
              )}
            >
              <Bug className="h-3.5 w-3.5" />
              Bug
            </button>
            <button
              onClick={() => setType("suggestion")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                type === "suggestion"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-border/50 text-muted-foreground hover:border-border"
              )}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Sugestão
            </button>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              type === "bug"
                ? "Descreva o que aconteceu e o que esperava..."
                : "Sua ideia ou sugestão..."
            }
            className="min-h-[100px] w-full resize-none rounded-lg border border-border/50 bg-background p-3 text-sm placeholder:text-muted-foreground/60 focus:border-foreground/20 focus:outline-none"
            maxLength={2000}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!message.trim() || message.trim().length < 5 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
