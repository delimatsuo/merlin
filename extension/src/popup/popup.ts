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
      path: "/api/autoapply/profile",
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

    if (response?.data?.summary) {
      if (statusEl) {
        statusEl.textContent = "OK";
        statusEl.className = "status-badge status-ok";
      }
      const skills = response.data.skills?.length || 0;
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

async function loadDailyUsage(): Promise<void> {
  const countEl = document.getElementById("usage-count");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "API_REQUEST",
      method: "GET",
      path: "/api/autoapply/usage",
    });

    if (response?.data?.count !== undefined) {
      const count = response.data.count as number;
      const limit = response.data.limit || 50;
      if (countEl) {
        countEl.textContent = `${count}/${limit}`;
        if (count >= limit) {
          countEl.style.color = "#dc2626";
        }
      }
    }
  } catch {
    // Silently fail — usage is informational
  }
}

function updatePreChecks(pii: PiiProfile | null): void {
  const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
  if (!startBtn) return;

  const piiOk = isPiiComplete(pii);
  const allOk = piiOk && professionalProfileLoaded;

  // Phase 1: start button is always disabled (dry-run mode, not wired yet)
  startBtn.disabled = true;
  startBtn.title = !piiOk
    ? "Complete seus dados pessoais primeiro"
    : !professionalProfileLoaded
      ? "Configure seu perfil profissional no merlincv.com"
      : "Disponivel em breve (modo dry-run)";

  if (allOk) {
    startBtn.textContent = "Iniciar candidatura (em breve)";
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

  // 1. Check auth
  try {
    const authResponse = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" });

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

    // 4. Load professional profile from backend + usage in parallel
    await Promise.all([
      loadProfessionalProfile(),
      loadDailyUsage(),
    ]);

    // 5. Update pre-check status
    updatePreChecks(pii);
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
