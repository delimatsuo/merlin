"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Bug, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackEntry {
  id: string;
  uid: string;
  userEmail: string;
  type: "bug" | "suggestion";
  message: string;
  page: string;
  status: "new" | "seen" | "resolved";
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  seen: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  resolved: "bg-green-500/10 text-green-600 dark:text-green-400",
};

const statusLabels: Record<string, string> = {
  new: "Novo",
  seen: "Visto",
  resolved: "Resolvido",
};

export default function FeedbackPage() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{ feedback: FeedbackEntry[] }>("/api/feedback");
        setEntries(data.feedback);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cycleStatus = async (id: string) => {
    try {
      const result = await api.patch<{ status: string }>(`/api/feedback/${id}/status`);
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: result.status as FeedbackEntry["status"] } : e))
      );
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground">Carregando feedback...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Feedback</h1>
        <p className="text-xs text-muted-foreground">{entries.length} entradas</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum feedback recebido ainda.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border/50 p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  {entry.type === "bug" ? (
                    <span className="flex items-center gap-1 text-red-500">
                      <Bug className="h-3 w-3" /> Bug
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-500">
                      <Lightbulb className="h-3 w-3" /> Sugestão
                    </span>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-muted-foreground">{entry.userEmail}</span>
                  {entry.page && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{entry.page}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => cycleStatus(entry.id)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                      statusStyles[entry.status]
                    )}
                  >
                    {statusLabels[entry.status]}
                  </button>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{entry.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
