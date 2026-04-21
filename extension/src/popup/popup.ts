/**
 * Popup script — renders extension status and controls.
 * Handles auth flow, PII profile management, and pre-check status.
 */

import { getPiiProfile, savePiiProfile, isPiiComplete } from "../lib/pii-store";
import type { PiiProfile } from "../lib/types";

// --- Helper Functions ---

function showSection(id: string): void {
  const sections = ["loading", "login-section", "main-section"];
  for (const sectionId of sections) {
    const el = document.getElementById(sectionId);
    if (el) el.style.display = sectionId === id ? "block" : "none";
  }
}

function displayUserInfo(user: { email: string | null; displayName: string | null }): void {
  const emailEl = document.getElementById("user-email");
  if (emailEl) {
    emailEl.textContent = user.email || "Sem email";
  }
}

function updatePiiStatus(pii: PiiProfile | null): void {
  const statusEl = document.getElementById("pii-status");
  const detailEl = document.getElementById("pii-detail");
  const toggleBtn = document.getElementById("toggle-pii-form");

  if (isPiiComplete(pii)) {
    if (statusEl) {
      statusEl.textContent = "Completo";
      statusEl.className = "status-badge status-ok";
    }
    if (detailEl) {
      detailEl.textContent = `CPF: ${maskCpf(pii!.cpf)} | Tel: ${pii!.phone}`;
    }
    if (toggleBtn) {
      toggleBtn.textContent = "Editar perfil";
    }
  } else {
    if (statusEl) {
      statusEl.textContent = "Incompleto";
      statusEl.className = "status-badge status-pending";
    }
    if (detailEl) {
      detailEl.textContent = "Preencha seus dados para candidaturas automaticas.";
    }
    if (toggleBtn) {
      toggleBtn.textContent = "Configurar perfil";
    }
  }
}

function maskCpf(cpf: string): string {
  // Show only last 4 digits: ***.***. 1234
  if (cpf.length >= 4) {
    return "***.***.***-" + cpf.replace(/\D/g, "").slice(-2);
  }
  return cpf;
}

function populatePiiForm(pii: PiiProfile): void {
  const form = document.getElementById("pii-form") as HTMLFormElement | null;
  if (!form) return;

  const fields: Array<[string, string]> = [
    ["cpf", pii.cpf],
    ["rg", pii.rg],
    ["motherName", pii.motherName],
    ["birthDate", pii.birthDate],
    ["gender", pii.gender],
    ["ethnicity", pii.ethnicity],
    ["disability", pii.disability],
    ["maritalStatus", pii.maritalStatus],
    ["phone", pii.phone],
    ["street", pii.address.street],
    ["city", pii.address.city],
    ["state", pii.address.state],
    ["zip", pii.address.zip],
  ];

  for (const [name, value] of fields) {
    const el = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = value || "";
  }
}

function togglePiiForm(show: boolean): void {
  const container = document.getElementById("pii-form-container");
  if (container) {
    container.style.display = show ? "block" : "none";
  }
}

let professionalProfileLoaded = false;

async function loadProfessionalProfile(): Promise<void> {
  const statusEl = document.getElementById("profile-status");
  const detailEl = document.getElementById("profile-detail");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "API_REQUEST",
      method: "GET",
      path: "/api/autoapply",
    });

    if (response?.error || response?.status === 401) {
      if (statusEl) {
        statusEl.textContent = "Erro";
        statusEl.className = "status-badge status-error";
      }
      if (detailEl) {
        detailEl.textContent = response?.status === 401
          ? "Sessao expirada. Faca login novamente."
          : "Erro ao carregar perfil.";
      }
      professionalProfileLoaded = false;
      return;
    }

    // Update usage from the same response
    updateUsageFromProfile(response.data?.daily_llm_calls, response.data?.daily_llm_limit);

    const knowledge = response?.data?.knowledge;
    if (knowledge && Object.keys(knowledge).length > 0) {
      if (statusEl) {
        statusEl.textContent = "OK";
        statusEl.className = "status-badge status-ok";
      }
      const skills = knowledge.skills?.length || 0;
      if (detailEl) {
        detailEl.textContent = `${skills} competencias carregadas.`;
      }
      professionalProfileLoaded = true;
    } else {
      if (statusEl) {
        statusEl.textContent = "Ausente";
        statusEl.className = "status-badge status-pending";
      }
      if (detailEl) {
        detailEl.textContent = "Configure seu perfil no merlincv.com primeiro.";
      }
      professionalProfileLoaded = false;
    }
  } catch {
    if (statusEl) {
      statusEl.textContent = "Erro";
      statusEl.className = "status-badge status-error";
    }
    if (detailEl) {
      detailEl.textContent = "Falha ao conectar com o servidor.";
    }
    professionalProfileLoaded = false;
  }
}

function updateUsageFromProfile(count?: number, limit?: number): void {
  const countEl = document.getElementById("usage-count");
  if (countEl && count !== undefined) {
    const max = limit || 50;
    countEl.textContent = `${count}/${max}`;
    if (count >= max) {
      countEl.style.color = "#dc2626";
    }
  }
}

async function loadApplicationHistory(): Promise<void> {
  const listEl = document.getElementById("history-list");
  if (!listEl) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "API_REQUEST",
      method: "GET",
      path: "/api/autoapply/logs?limit=10",
    });

    if (response?.error || !response?.data?.logs) {
      listEl.innerHTML = '<p class="card-detail">Nenhuma candidatura registrada.</p>';
      return;
    }

    const logs = response.data.logs as Array<{
      id: string;
      company: string;
      job_title: string;
      status: string;
      fields_answered: number;
      questions_answered: number;
      duration_seconds: number;
      timestamp: string;
      job_url: string;
    }>;

    if (logs.length === 0) {
      listEl.innerHTML = '<p class="card-detail">Nenhuma candidatura registrada.</p>';
      return;
    }

    listEl.innerHTML = logs.map(log => {
      const statusBadge = {
        "success": '<span class="history-badge badge-success">Enviada</span>',
        "dry-run": '<span class="history-badge badge-dryrun">Dry-run</span>',
        "failed": '<span class="history-badge badge-failed">Falhou</span>',
      }[log.status] || '<span class="history-badge">' + escapeHtml(log.status) + '</span>';

      const company = log.company || "\u2014";
      const title = log.job_title || "Vaga";
      const time = formatRelativeTime(log.timestamp);
      const stats = `${log.fields_answered || 0} campos, ${log.questions_answered || 0} perguntas`;

      return `
        <div class="history-item">
          <div class="history-main">
            <span class="history-title">${escapeHtml(title)}</span>
            ${statusBadge}
          </div>
          <div class="history-meta">
            <span>${escapeHtml(company)}</span>
            <span>&middot;</span>
            <span>${stats}</span>
            <span>&middot;</span>
            <span>${time}</span>
          </div>
        </div>
      `;
    }).join("");

  } catch {
    listEl.innerHTML = '<p class="card-detail">Erro ao carregar historico.</p>';
  }
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "agora";
    if (diffMins < 60) return `${diffMins}min atras`;
    if (diffHours < 24) return `${diffHours}h atras`;
    if (diffDays < 7) return `${diffDays}d atras`;
    return date.toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updatePreChecks(pii: PiiProfile | null): void {
  const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
  if (!startBtn) return;

  const piiOk = isPiiComplete(pii);
  const allOk = piiOk && professionalProfileLoaded;

  startBtn.disabled = !allOk;
  startBtn.title = !piiOk
    ? "Complete seus dados pessoais primeiro"
    : !professionalProfileLoaded
      ? "Configure seu perfil profissional no merlincv.com"
      : "Iniciar candidatura automatica";

  if (allOk) {
    startBtn.textContent = "Iniciar candidatura";
  }
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type: "success" | "error"): void {
  const toast = document.getElementById("toast");
  if (!toast) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.style.display = "block";

  toastTimeout = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function showError(message: string): void {
  showToast(message, "error");
}

function showSuccess(message: string): void {
  showToast(message, "success");
}

// --- CPF Mask ---

function applyCpfMask(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 9) {
      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
    } else if (v.length > 6) {
      v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    } else if (v.length > 3) {
      v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    }
    input.value = v;
  });
}

// --- Phone Mask ---

function applyPhoneMask(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 6) {
      v = v.replace(/(\d{2})(\d{5})(\d{1,4})/, "($1) $2-$3");
    } else if (v.length > 2) {
      v = v.replace(/(\d{2})(\d{1,5})/, "($1) $2");
    }
    input.value = v;
  });
}

// --- CEP Mask ---

function applyCepMask(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 5) {
      v = v.replace(/(\d{5})(\d{1,3})/, "$1-$2");
    }
    input.value = v;
  });
}

// --- Main Init ---

document.addEventListener("DOMContentLoaded", async () => {
  showSection("loading");

  // Apply input masks
  const cpfInput = document.getElementById("cpf") as HTMLInputElement | null;
  if (cpfInput) applyCpfMask(cpfInput);

  const phoneInput = document.getElementById("phone") as HTMLInputElement | null;
  if (phoneInput) applyPhoneMask(phoneInput);

  const zipInput = document.getElementById("zip") as HTMLInputElement | null;
  if (zipInput) applyCepMask(zipInput);

  // 1. Check auth — also check storage directly in case SW hasn't restored yet
  try {
    // First try the service worker
    let authResponse = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" });

    // If SW says not authenticated, double-check storage directly
    // (SW may have been killed and not restored state yet)
    if (!authResponse?.isAuthenticated) {
      const stored = await chrome.storage.session.get("authState");
      const storedAuth = stored.authState as { token?: string; user?: any } | undefined;
      if (storedAuth?.token) {
        authResponse = { isAuthenticated: true, user: storedAuth.user };
      }
    }

    if (!authResponse?.isAuthenticated) {
      showSection("login-section");
      return;
    }

    showSection("main-section");

    // 2. Display user info
    if (authResponse.user) {
      displayUserInfo(authResponse.user);
    }

    // 3. Check PII profile
    const pii = await getPiiProfile();
    updatePiiStatus(pii);
    if (pii) populatePiiForm(pii);

    // 4. Load professional profile from backend + history in parallel
    await Promise.all([
      loadProfessionalProfile(),
      loadApplicationHistory(),
    ]);

    // 5. Update pre-check status
    updatePreChecks(pii);

    // 6. Refresh history button
    document.getElementById("refresh-history")?.addEventListener("click", () => {
      loadApplicationHistory();
    });

    // 7. Load mode setting
    await loadModeSetting();

    // 8. If a previous run paused waiting for user input, restore the panel.
    try {
      const stored = await chrome.storage.session.get("autoapply_active_session");
      const session = stored.autoapply_active_session as
        | { pendingFields?: HumanField[]; running?: boolean }
        | undefined;
      if (session?.pendingFields?.length) {
        showHumanInputPanel(session.pendingFields);
      }
    } catch {
      // Ignore — session storage may be unavailable.
    }
  } catch {
    showSection("login-section");
  }
});

// --- Event Listeners ---

// Sign in
document.getElementById("sign-in-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("sign-in-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Entrando...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "SIGN_IN" });
    if (response?.success) {
      location.reload();
    } else {
      btn.disabled = false;
      btn.textContent = "Entrar com Google";
      showError("Erro ao fazer login: " + (response?.error || "Tente novamente"));
    }
  } catch {
    btn.disabled = false;
    btn.textContent = "Entrar com Google";
    showError("Erro ao fazer login. Tente novamente.");
  }
});

// Sign out
document.getElementById("sign-out-btn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  await chrome.runtime.sendMessage({ type: "SIGN_OUT" });
  location.reload();
});

// Open batch dashboard in a new tab
document.getElementById("open-dashboard")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "QUEUE_OPEN_DASHBOARD" });
  window.close();
});

// Toggle PII form
document.getElementById("toggle-pii-form")?.addEventListener("click", async () => {
  const container = document.getElementById("pii-form-container");
  const isVisible = container?.style.display !== "none";

  if (!isVisible) {
    // Load existing values into form before showing
    const pii = await getPiiProfile();
    if (pii) populatePiiForm(pii);
  }

  togglePiiForm(!isVisible);
});

// Start auto-apply
document.getElementById("start-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("start-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Iniciando...";

  try {
    // Send START_AUTOAPPLY to content script in the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError("Nenhuma aba ativa encontrada.");
      btn.disabled = false;
      btn.textContent = "Iniciar candidatura";
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "START_AUTOAPPLY" });
    if (response?.success) {
      showSuccess("Candidatura iniciada!");
      btn.textContent = "Em andamento...";
      // Show automation status card
      const automationCard = document.getElementById("automation-card");
      if (automationCard) automationCard.style.display = "block";
      // Start listening for status updates
      startStatusListener();
    } else {
      showError(response?.error || "Erro ao iniciar.");
      btn.disabled = false;
      btn.textContent = "Iniciar candidatura";
    }
  } catch {
    showError("Erro: a pagina pode nao ser do Gupy.");
    btn.disabled = false;
    btn.textContent = "Iniciar candidatura";
  }
});

// Confirm submit (review flow)
document.getElementById("confirm-submit")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: "CONFIRM_SUBMIT" });
    showSuccess("Candidatura enviada!");
    const reviewPanel = document.getElementById("review-panel");
    if (reviewPanel) reviewPanel.style.display = "none";
  }
});

// Cancel submit (review flow)
document.getElementById("cancel-submit")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: "CANCEL_SUBMIT" });
    showToast("Candidatura cancelada.", "error");
    const reviewPanel = document.getElementById("review-panel");
    if (reviewPanel) reviewPanel.style.display = "none";

    const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Iniciar candidatura";
    }
  }
});

// PII form submission
document.getElementById("pii-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;

  const pii: PiiProfile = {
    cpf: (form.querySelector("[name=cpf]") as HTMLInputElement).value,
    rg: (form.querySelector("[name=rg]") as HTMLInputElement).value,
    motherName: (form.querySelector("[name=motherName]") as HTMLInputElement).value,
    birthDate: (form.querySelector("[name=birthDate]") as HTMLInputElement).value,
    gender: (form.querySelector("[name=gender]") as HTMLSelectElement).value,
    ethnicity: (form.querySelector("[name=ethnicity]") as HTMLSelectElement).value,
    disability: (form.querySelector("[name=disability]") as HTMLSelectElement).value,
    maritalStatus: (form.querySelector("[name=maritalStatus]") as HTMLSelectElement).value,
    phone: (form.querySelector("[name=phone]") as HTMLInputElement).value,
    address: {
      street: (form.querySelector("[name=street]") as HTMLInputElement).value,
      city: (form.querySelector("[name=city]") as HTMLInputElement).value,
      state: (form.querySelector("[name=state]") as HTMLSelectElement).value,
      zip: (form.querySelector("[name=zip]") as HTMLInputElement).value,
    },
  };

  await savePiiProfile(pii);
  updatePiiStatus(pii);
  updatePreChecks(pii);
  togglePiiForm(false);
  showSuccess("Perfil salvo com sucesso!");
});

// --- Mode Toggle ---

async function loadModeSetting(): Promise<void> {
  const { getSettings } = await import("../lib/settings");
  const settings = await getSettings();
  const toggle = document.getElementById("mode-toggle") as HTMLInputElement | null;

  if (toggle) {
    toggle.checked = settings.mode === "auto";
  }
  updateModeDisplay(settings.mode === "auto");
}

function updateModeDisplay(isAuto: boolean): void {
  const label = document.getElementById("mode-label");
  const desc = document.getElementById("mode-desc");

  if (label) label.textContent = isAuto ? "Modo: Auto" : "Modo: Dry-run";
  if (desc) desc.textContent = isAuto
    ? "Candidaturas enviadas automaticamente"
    : "Pausa antes de enviar para revisão";
}

document.getElementById("mode-toggle")?.addEventListener("change", async (e) => {
  const toggle = e.target as HTMLInputElement;
  const newMode = toggle.checked ? "auto" : "dry-run";

  if (newMode === "auto") {
    // Confirmation dialog
    const confirmed = confirm(
      "Tem certeza?\n\nNo modo Auto, as candidaturas serão enviadas automaticamente sem pausa para revisão.\n\nVocê não poderá revisar as respostas antes do envio."
    );

    if (!confirmed) {
      toggle.checked = false;
      return;
    }
  }

  const { saveSettings } = await import("../lib/settings");
  await saveSettings({ mode: newMode });
  updateModeDisplay(toggle.checked);
  showSuccess(newMode === "auto" ? "Modo Auto ativado" : "Modo Dry-run ativado");
});

// --- Status Listener ---

function startStatusListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATUS_UPDATE") {
      updateStatusDisplay(message);
    }
    if (message.type === "NEEDS_HUMAN_INPUT") {
      showHumanInputPanel(message.fields);
    }
  });
}

function updateStatusDisplay(status: {
  step: string;
  error?: string;
  detail?: string;
  fieldsAnswered?: number;
  questionsAnswered?: number;
}): void {
  const statusEl = document.getElementById("automation-status");
  const automationCard = document.getElementById("automation-card");
  const reviewPanel = document.getElementById("review-panel");

  // Show automation card
  if (automationCard) automationCard.style.display = "block";

  if (statusEl) {
    const stepNames: Record<string, string> = {
      PRE_CHECK: "Verificando pre-requisitos...",
      WELCOME: "Tela de boas-vindas...",
      ADDITIONAL_INFO: "Preenchendo informacoes...",
      CUSTOM_QUESTIONS_DETECT: "Detectando perguntas...",
      CUSTOM_QUESTIONS_FILL: "Respondendo perguntas...",
      PERSONALIZATION: "Gerando personalizacao...",
      REVIEW: "Aguardando confirmacao",
      COMPLETE: "Candidatura finalizada!",
      ERROR: "",
    };

    if (status.step === "ERROR") {
      const errorMessages: Record<string, string> = {
        VALIDATION_ERROR: "Erro de validacao no formulario",
        NEEDS_HUMAN: "Pergunta precisa de resposta manual",
        BUDGET_EXCEEDED: "Limite diario de IA atingido",
        LLM_FAILED: "Erro no servico de IA",
        AUTH_REQUIRED: "Faca login novamente",
        GUPY_LOGIN_REQUIRED: "Faca login no Gupy",
        TIMEOUT: "Tempo esgotado aguardando a pagina",
      };

      const errorBase = errorMessages[status.error || ""] || "Erro desconhecido";
      statusEl.textContent = `\u2715 ${errorBase}`;
      if (status.detail) {
        statusEl.textContent += `: ${status.detail}`;
      }
      statusEl.style.color = "#dc2626";
    } else {
      statusEl.textContent = stepNames[status.step] || status.step;
      statusEl.style.color = status.step === "COMPLETE" ? "#16a34a" : "#4b5563";

      // Refresh history and profile (includes usage) when complete
      if (status.step === "COMPLETE") {
        loadApplicationHistory();
        loadProfessionalProfile();
      }
    }

    if (status.fieldsAnswered || status.questionsAnswered) {
      statusEl.textContent += ` (${status.fieldsAnswered || 0} campos, ${status.questionsAnswered || 0} perguntas)`;
    }

    statusEl.style.display = "block";
  }

  // Show review panel when in REVIEW state
  if (reviewPanel) {
    reviewPanel.style.display = status.step === "REVIEW" ? "block" : "none";
  }

  // Update start button
  const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
  if (startBtn) {
    if (status.step === "COMPLETE") {
      startBtn.disabled = false;
      startBtn.textContent = "Iniciar outra candidatura";
    } else if (status.step === "ERROR") {
      startBtn.disabled = false;
      startBtn.textContent = "Tentar novamente";
    } else if (status.step !== "REVIEW") {
      startBtn.disabled = true;
      startBtn.textContent = "Em andamento...";
    }
  }
}

// --- Human Input Panel ---

interface HumanField {
  label: string;
  type: string;
  options?: string[];
}

function showHumanInputPanel(fields: HumanField[]): void {
  const panel = document.getElementById("human-input-panel");
  const container = document.getElementById("human-input-fields");
  const automationCard = document.getElementById("automation-card");

  if (!panel || !container) return;

  // Show the panel, hide automation status
  panel.style.display = "block";
  if (automationCard) {
    const statusEl = document.getElementById("automation-status");
    if (statusEl) statusEl.textContent = "Aguardando suas respostas...";
  }

  // Build input fields
  container.innerHTML = fields.map((field, i) => {
    if (field.type === "select" && field.options?.length) {
      const opts = field.options.map((o) =>
        `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`
      ).join("");
      return `
        <div class="form-group">
          <label>${escapeHtml(field.label)}</label>
          <select class="human-answer" data-label="${escapeHtml(field.label)}">
            <option value="">Selecione...</option>
            ${opts}
          </select>
        </div>`;
    }

    if (field.type === "radio" && field.options?.length) {
      const radios = field.options.map((o, j) => `
        <label class="radio-label">
          <input type="radio" name="human_radio_${i}" value="${escapeHtml(o)}" class="human-answer-radio" data-label="${escapeHtml(field.label)}">
          ${escapeHtml(o)}
        </label>`
      ).join("");
      return `
        <div class="form-group">
          <label>${escapeHtml(field.label)}</label>
          ${radios}
        </div>`;
    }

    const inputType = field.type === "textarea" ? "textarea" : "input";
    if (inputType === "textarea") {
      return `
        <div class="form-group">
          <label>${escapeHtml(field.label)}</label>
          <textarea class="human-answer" data-label="${escapeHtml(field.label)}" rows="2"></textarea>
        </div>`;
    }

    return `
      <div class="form-group">
        <label>${escapeHtml(field.label)}</label>
        <input type="text" class="human-answer" data-label="${escapeHtml(field.label)}">
      </div>`;
  }).join("");
}

function collectHumanAnswers(): Record<string, string> {
  const answers: Record<string, string> = {};

  // Text inputs, textareas, selects
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    ".human-answer"
  ).forEach((el) => {
    const label = el.dataset.label;
    if (label && el.value.trim()) {
      answers[label] = el.value.trim();
    }
  });

  // Radio buttons
  document.querySelectorAll<HTMLInputElement>(
    ".human-answer-radio:checked"
  ).forEach((el) => {
    const label = el.dataset.label;
    if (label) {
      answers[label] = el.value;
    }
  });

  return answers;
}

// Submit human answers
document.getElementById("submit-human-answers")?.addEventListener("click", async () => {
  const answers = collectHumanAnswers();
  if (Object.keys(answers).length === 0) {
    showError("Preencha pelo menos um campo.");
    return;
  }

  const btn = document.getElementById("submit-human-answers") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Preenchendo...";

  try {
    // Send answers to content script to fill the form
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: "SUBMIT_USER_ANSWERS",
        answers,
      });
    }

    // Optionally save to knowledge file
    const saveCheck = document.getElementById("save-answers-check") as HTMLInputElement;
    if (saveCheck?.checked) {
      try {
        await chrome.runtime.sendMessage({
          type: "API_REQUEST",
          method: "POST",
          path: "/api/autoapply/save-answers",
          body: { answers },
        });
        showSuccess(`${Object.keys(answers).length} respostas salvas!`);
      } catch {
        // Non-blocking — answers are already filled in the form
        console.warn("Failed to save answers to knowledge file");
      }
    }

    // Hide the panel
    const panel = document.getElementById("human-input-panel");
    if (panel) panel.style.display = "none";

    await clearPendingFields();
    showSuccess("Respostas preenchidas!");
  } catch {
    showError("Erro ao preencher respostas.");
    btn.disabled = false;
    btn.textContent = "Preencher";
  }
});

async function clearPendingFields(): Promise<void> {
  try {
    const stored = await chrome.storage.session.get("autoapply_active_session");
    const session = stored.autoapply_active_session as Record<string, unknown> | undefined;
    if (session) {
      session.pendingFields = [];
      await chrome.storage.session.set({ autoapply_active_session: session });
    }
  } catch {
    // Ignore.
  }
}

// Skip human answers
document.getElementById("skip-human-answers")?.addEventListener("click", async () => {
  const panel = document.getElementById("human-input-panel");
  if (panel) panel.style.display = "none";
  await clearPendingFields();

  const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = "Iniciar candidatura";
  }
});
