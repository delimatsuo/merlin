"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProcessingStore } from "@/lib/store";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProcessingBar() {
  const router = useRouter();
  const { tasks, removeTask, clearDone } = useProcessingStore();

  // Auto-remove completed tasks after 6 seconds (enough time to click the link)
  useEffect(() => {
    const doneTasks = tasks.filter((t) => t.status === "done");
    if (doneTasks.length === 0) return;
    const timer = setTimeout(() => clearDone(), 6000);
    return () => clearTimeout(timer);
  }, [tasks, clearDone]);

  if (tasks.length === 0) return null;

  const handleTaskClick = (task: (typeof tasks)[0]) => {
    if (task.status === "done" && task.link) {
      removeTask(task.id);
      router.push(task.link);
    }
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="glass apple-shadow-lg rounded-2xl overflow-hidden">
        <div className="px-4 py-3 space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "flex items-center gap-3 text-sm",
                task.status === "done" && task.link && "cursor-pointer hover:bg-foreground/5 -mx-2 px-2 py-0.5 rounded-lg transition-colors"
              )}
              onClick={() => handleTaskClick(task)}
            >
              {task.status === "running" && (
                <Loader2 className="h-4 w-4 animate-spin text-foreground/60 shrink-0" />
              )}
              {task.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              )}
              {task.status === "error" && (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <span
                className={cn(
                  "flex-1 truncate",
                  task.status === "done" && "text-muted-foreground",
                  task.status === "done" && task.link && "underline underline-offset-2",
                  task.status === "error" && "text-red-600"
                )}
              >
                {task.status === "done" && task.doneLabel
                  ? task.doneLabel
                  : task.status === "error"
                    ? task.error || task.label
                    : task.label}
              </span>
              {task.status !== "running" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTask(task.id);
                  }}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {tasks.some((t) => t.status === "running") && (
          <div className="h-0.5 bg-secondary overflow-hidden">
            <div className="h-full bg-foreground/40 animate-processing-bar" />
          </div>
        )}
      </div>
    </div>
  );
}
