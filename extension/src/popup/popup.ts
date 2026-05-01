/**
 * Merlin popup — minimal shell.
 *
 * Three views:
 *   - loading      initial fetch of auth + profile
 *   - auth         not signed in → "Entrar com Google"
 *   - main         signed in; shows pii-setup OR ready based on state
 *
 * Everything that used to live here (mode toggle, manual start, live
 * application status, review panel, human-input panel, history, LLM usage
 * counter) is either irrelevant to the batch workflow or surfaced in the
 * web dashboard. The popup is now a setup + shortcut — nothing else.
 */

import { getPiiProfile, savePiiProfile, isPiiComplete } from "../lib/pii-store";
import type { PiiProfile } from "../lib/types";

type View = "loading" | "auth" | "main";
type SubView = "pii" | "ready";

let currentView: View = "loading";
let currentSubView: SubView | null = null;

/** Does this user already have PII saved? Cached so edit→cancel restores. */
let piiWasCompleteOnOpen = false;

const BR_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ---------- View switching ----------

function showView(view: View): void {
  currentView = view;
  for (const id of ["view-loading", "view-auth", "view-main"]) {
    document.getElementById(id)!.hidden = id !== `view-${view}`;
  }
}

function showSubView(sub: SubView): void {
  currentSubView = sub;
  document.getElementById("view-pii")!.hidden = sub !== "pii";
  document.getElementById("view-ready")!.hidden = sub !== "ready";
  const cancelBtn = document.getElementById("pii-cancel") as HTMLButtonElement;
  // Cancel only makes sense if there's a ready view to return to (i.e. PII
  // was already complete when the popup opened).
  cancelBtn.hidden = !(sub === "pii" && piiWasCompleteOnOpen);
}

// ---------- Toast ----------

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function toast(message: string, kind: "success" | "error" = "success"): void {
  const el = document.getElementById("toast")!;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function toBrazilianDateInput(value: string): string {
  if (!value) return "";
  if (BR_DATE_RE.test(value)) return value;
  const match = value.match(ISO_DATE_RE);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isValidBrazilianDate(value: string): boolean {
  if (!value) return true;
  const match = value.match(BR_DATE_RE);
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > new Date().getFullYear()) return false;

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// ---------- User bar ----------

function setUserEmail(email: string | null): void {
  document.getElementById("user-email")!.textContent = email ?? "";
}

// ---------- PII form ----------

function piiToForm(pii: PiiProfile): void {
  const form = document.getElementById("pii-form") as HTMLFormElement;
  const set = (name: string, value: string) => {
    const el = form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (el) el.value = value || "";
  };
  set("cpf", pii.cpf);
  set("rg", pii.rg);
  set("motherName", pii.motherName);
  set("birthDate", toBrazilianDateInput(pii.birthDate));
  set("gender", pii.gender);
  set("ethnicity", pii.ethnicity);
  set("disability", pii.disability);
  set("maritalStatus", pii.maritalStatus);
  set("phone", pii.phone);
  set("street", pii.address.street);
  set("city", pii.address.city);
  set("state", pii.address.state);
  set("zip", pii.address.zip);
}

function formToPii(): PiiProfile {
  const form = document.getElementById("pii-form") as HTMLFormElement;
  const read = (name: string) =>
    ((form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement)?.value ?? "").trim();
  return {
    cpf: read("cpf"),
    rg: read("rg"),
    motherName: read("motherName"),
    birthDate: toBrazilianDateInput(read("birthDate")),
    gender: read("gender"),
    ethnicity: read("ethnicity"),
    disability: read("disability"),
    maritalStatus: read("maritalStatus"),
    phone: read("phone"),
    address: {
      street: read("street"),
      city: read("city"),
      state: read("state"),
      zip: read("zip"),
    },
  };
}

// ---------- Input masks ----------

function applyCpfMask(el: HTMLInputElement): void {
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 9) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
    else if (v.length > 6) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
    else if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
    el.value = v;
  });
}

function applyPhoneMask(el: HTMLInputElement): void {
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 10) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    else if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    el.value = v;
  });
}

function applyCepMask(el: HTMLInputElement): void {
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
    el.value = v;
  });
}

function applyBirthDateMask(el: HTMLInputElement): void {
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 8);
    if (v.length > 4) v = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
    el.value = v;
  });
}

// ---------- Knowledge-profile status (backend) ----------

interface ProfileResponse {
  knowledge?: { skills?: string[] } | null;
}

async function renderProfileStatus(): Promise<void> {
  const row = document.getElementById("status-profile")!;
  const textEl = document.getElementById("profile-text")!;
  const check = row.querySelector(".check") as HTMLElement;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "API_REQUEST",
      method: "GET",
      path: "/api/autoapply",
    });

    const httpStatus: number | undefined = response?.status;
    const isError =
      response?.error ||
      (typeof httpStatus === "number" && httpStatus >= 400);

    if (isError) {
      check.dataset.state = "error";
      check.textContent = "!";
      if (httpStatus === 401) {
        textEl.textContent = "Sessão expirada. Faça login novamente.";
      } else if (httpStatus === 404) {
        textEl.textContent = "Complete o onboarding no painel Merlin.";
      } else {
        textEl.textContent = "Erro ao carregar perfil.";
      }
      return;
    }

    const data = response?.data as ProfileResponse | undefined;
    const skillCount = data?.knowledge?.skills?.length ?? 0;
    if (skillCount > 0) {
      check.dataset.state = "ok";
      check.textContent = "✓";
      textEl.textContent = `${skillCount} competências carregadas`;
    } else {
      check.dataset.state = "pending";
      check.textContent = "•";
      textEl.textContent = "Complete o onboarding no painel Merlin.";
    }
  } catch {
    check.dataset.state = "error";
    check.textContent = "!";
    textEl.textContent = "Erro ao carregar perfil.";
  }
}

function renderPiiStatus(pii: PiiProfile | null): void {
  const row = document.getElementById("status-pii")!;
  const check = row.querySelector(".check") as HTMLElement;
  const text = row.querySelector(".status-text") as HTMLElement;
  if (isPiiComplete(pii)) {
    check.dataset.state = "ok";
    check.textContent = "✓";
    text.textContent = "Dados pessoais completos";
  } else {
    check.dataset.state = "pending";
    check.textContent = "•";
    text.textContent = "Dados pessoais incompletos";
  }
}

// ---------- Flow ----------

async function enterMainView(): Promise<void> {
  showView("main");

  const pii = await getPiiProfile();
  piiWasCompleteOnOpen = isPiiComplete(pii);
  if (pii) piiToForm(pii);
  renderPiiStatus(pii);

  if (piiWasCompleteOnOpen) {
    showSubView("ready");
    void renderProfileStatus();
  } else {
    showSubView("pii");
  }
}

async function boot(): Promise<void> {
  try {
    // Ask the SW for auth state. Fall back to session storage — the SW may
    // have been torn down and not yet rehydrated.
    let authResponse = await chrome.runtime
      .sendMessage({ type: "GET_AUTH_STATE" })
      .catch(() => null);

    if (!authResponse?.isAuthenticated) {
      const stored = await chrome.storage.session.get("authState");
      const s = stored.authState as { token?: string; user?: { email?: string } } | undefined;
      if (s?.token) {
        authResponse = { isAuthenticated: true, user: s.user };
      }
    }

    if (!authResponse?.isAuthenticated) {
      showView("auth");
      return;
    }

    setUserEmail(authResponse.user?.email ?? null);
    await enterMainView();
  } catch {
    showView("auth");
  }
}

// ---------- Event wiring ----------

function wire(): void {
  // Sign in
  document.getElementById("sign-in-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("sign-in-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Entrando…";
    try {
      const resp = await chrome.runtime.sendMessage({ type: "SIGN_IN" });
      if (resp?.success) {
        location.reload();
      } else {
        btn.disabled = false;
        btn.textContent = "Entrar com Google";
        toast(resp?.error || "Não foi possível entrar.", "error");
      }
    } catch {
      btn.disabled = false;
      btn.textContent = "Entrar com Google";
      toast("Não foi possível entrar.", "error");
    }
  });

  // Sign out
  document.getElementById("sign-out-btn")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "SIGN_OUT" });
    location.reload();
  });

  // Open dashboard
  document.getElementById("open-dashboard")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "QUEUE_OPEN_DASHBOARD" });
    window.close();
  });

  // Edit PII from ready view
  document.getElementById("edit-pii")?.addEventListener("click", () => {
    showSubView("pii");
  });

  // Cancel edit (back to ready)
  document.getElementById("pii-cancel")?.addEventListener("click", () => {
    if (piiWasCompleteOnOpen) showSubView("ready");
  });

  // PII save
  document.getElementById("pii-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pii = formToPii();
    if (!isPiiComplete(pii)) {
      toast("CPF e telefone são obrigatórios.", "error");
      return;
    }
    if (!isValidBrazilianDate(pii.birthDate)) {
      toast("Use data de nascimento no formato dd/mm/yyyy.", "error");
      return;
    }
    await savePiiProfile(pii);
    piiWasCompleteOnOpen = true;
    renderPiiStatus(pii);
    showSubView("ready");
    void renderProfileStatus();
    toast("Dados salvos", "success");
  });

  // Input masks
  applyCpfMask(document.getElementById("cpf") as HTMLInputElement);
  applyPhoneMask(document.getElementById("phone") as HTMLInputElement);
  applyBirthDateMask(document.getElementById("birthDate") as HTMLInputElement);
  applyCepMask(document.getElementById("zip") as HTMLInputElement);
}

document.addEventListener("DOMContentLoaded", () => {
  wire();
  void boot();
});

// Reference currentView/currentSubView so TS doesn't flag them as unused —
// they are kept for future telemetry / keyboard-nav extensions.
void currentView;
void currentSubView;
