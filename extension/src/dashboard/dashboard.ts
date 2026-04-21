/**
 * Dashboard controller. Reads queue state from the service worker, renders
 * the list, and relays user actions (enqueue, start, pause, remove) back.
 */

type QueueJobStatus =
  | "pending"
  | "running"
  | "needs_attention"
  | "completed"
  | "skipped"
  | "failed";

interface QueueJob {
  id: string;
  url: string;
  title?: string;
  company?: string;
  score?: number;
  status: QueueJobStatus;
  tabId?: number;
  attentionReason?: "confirmation" | "unknown_answer" | "error";
  errorMessage?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface QueueState {
  jobs: QueueJob[];
  maxConcurrent: number;
  active: boolean;
}

const STATUS_LABELS: Record<QueueJobStatus, string> = {
  pending: "Pendente",
  running: "Em andamento",
  needs_attention: "Aguardando você",
  completed: "Aplicada",
  skipped: "Ignorada",
  failed: "Erro",
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function send<T = unknown>(message: unknown): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T;
}

async function refresh(): Promise<void> {
  const state = await send<QueueState>({ type: "QUEUE_GET" });
  render(state);
}

function render(state: QueueState): void {
  // Summary counts
  const byStatus = {
    pending: 0,
    running: 0,
    needs_attention: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  } as Record<QueueJobStatus, number>;
  for (const j of state.jobs) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;

  $("count-pending").textContent = String(byStatus.pending);
  $("count-running").textContent = String(byStatus.running);
  $("count-attention").textContent = String(byStatus.needs_attention);
  $("count-completed").textContent = String(byStatus.completed);
  $("count-failed").textContent = String(byStatus.failed);

  // Concurrency input
  const concurrencyEl = $("concurrency") as HTMLInputElement;
  if (document.activeElement !== concurrencyEl) {
    concurrencyEl.value = String(state.maxConcurrent);
  }

  // Run status line
  const runStatus = $("run-status");
  if (state.active) {
    runStatus.textContent = `Processando ${byStatus.running}/${state.maxConcurrent} simultâneas…`;
  } else if (state.jobs.length > 0) {
    runStatus.textContent = "Fila pausada.";
  } else {
    runStatus.textContent = "";
  }
  ($("btn-start") as HTMLButtonElement).disabled = state.active || byStatus.pending === 0;
  ($("btn-pause") as HTMLButtonElement).disabled = !state.active;

  // Job list
  const jobsEl = $("jobs");
  const emptyEl = $("empty-state");
  if (state.jobs.length === 0) {
    jobsEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  // Sort: attention first, then running, then pending, then completed/skipped/failed
  const order: Record<QueueJobStatus, number> = {
    needs_attention: 0,
    running: 1,
    pending: 2,
    failed: 3,
    completed: 4,
    skipped: 5,
  };
  const sorted = [...state.jobs].sort((a, b) => order[a.status] - order[b.status]);

  jobsEl.innerHTML = sorted.map(jobRow).join("");

  // Wire per-row buttons
  jobsEl.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const action = btn.dataset.action!;
      if (action === "open" && btn.dataset.tab) {
        await chrome.tabs.update(parseInt(btn.dataset.tab, 10), { active: true });
      } else if (action === "remove") {
        await send({ type: "QUEUE_REMOVE", id });
        await refresh();
      }
    });
  });
}

function jobRow(job: QueueJob): string {
  const title = job.title ?? jobTitleFromUrl(job.url);
  const company = job.company ?? jobCompanyFromUrl(job.url);
  const attentionHint = attentionText(job);
  const primaryAction = job.status === "needs_attention" && job.tabId
    ? `<button data-action="open" data-id="${job.id}" data-tab="${job.tabId}" class="btn-primary">Abrir</button>`
    : "";
  return `
    <div class="job" data-status="${job.status}">
      <div class="job-info">
        <div class="title">${escapeHtml(title)}</div>
        <div class="url">${escapeHtml(job.url)}</div>
        <div class="meta">
          ${company ? escapeHtml(company) : ""}
          ${job.score !== undefined ? ` • match ${Math.round(job.score * 100)}%` : ""}
          ${attentionHint ? ` • ${escapeHtml(attentionHint)}` : ""}
          ${job.errorMessage ? ` • ${escapeHtml(job.errorMessage)}` : ""}
        </div>
      </div>
      <span class="status-badge" data-status="${job.status}">${STATUS_LABELS[job.status]}</span>
      <div class="job-actions">
        ${primaryAction}
        <button data-action="remove" data-id="${job.id}" class="btn-ghost">Remover</button>
      </div>
    </div>
  `;
}

function attentionText(job: QueueJob): string | null {
  if (job.status !== "needs_attention") return null;
  switch (job.attentionReason) {
    case "confirmation":
      return "precisa de 1 clique de confirmação";
    case "unknown_answer":
      return "precisa de novas informações";
    default:
      return "precisa da sua atenção";
  }
}

function jobTitleFromUrl(url: string): string {
  // Gupy URLs don't expose the title, but we can show the path for now.
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).slice(-1)[0] || u.hostname;
  } catch {
    return url;
  }
}

function jobCompanyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.hostname.split(".");
    if (parts[0] && parts[0] !== "www") return parts[0];
    return "";
  } catch {
    return "";
  }
}

// --- Events ---

document.addEventListener("DOMContentLoaded", async () => {
  await refresh();

  ($("btn-add") as HTMLButtonElement).addEventListener("click", async () => {
    const input = $("urls-input") as HTMLTextAreaElement;
    const urls = input.value
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /^https?:\/\//.test(s));
    if (urls.length === 0) return;
    await send({ type: "QUEUE_ENQUEUE", jobs: urls.map((url) => ({ url })) });
    input.value = "";
    await refresh();
  });

  ($("btn-start") as HTMLButtonElement).addEventListener("click", async () => {
    await send({ type: "QUEUE_START" });
    await refresh();
  });

  ($("btn-pause") as HTMLButtonElement).addEventListener("click", async () => {
    await send({ type: "QUEUE_PAUSE" });
    await refresh();
  });

  ($("btn-clear-completed") as HTMLButtonElement).addEventListener("click", async () => {
    await send({ type: "QUEUE_CLEAR_COMPLETED" });
    await refresh();
  });

  ($("concurrency") as HTMLInputElement).addEventListener("change", async (e) => {
    const n = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(n)) await send({ type: "QUEUE_SET_CONCURRENCY", n });
  });
});

// Live updates from the service worker.
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "QUEUE_UPDATED") {
    refresh().catch((err) => console.error("[Dashboard] refresh failed:", err));
  }
});

// Poll as fallback in case messages are missed during tab transitions.
setInterval(() => { refresh().catch(() => {}); }, 2000);
