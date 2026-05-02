export type CathoScreenKind =
  | "complete"
  | "error"
  | "questionnaire"
  | "welcome"
  | "idle";

export interface CathoScreenSignals {
  successVisible: boolean;
  failureVisible: boolean;
  questionnaireVisible: boolean;
  applyButtonVisible: boolean;
}

export function isCathoHost(hostname: string): boolean {
  return hostname === "catho.com.br" || hostname.endsWith(".catho.com.br");
}

export function isCathoJobPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments[0] === "vagas" && segments.length >= 3;
}

function normalizeCathoText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCathoUpsellText(text: string): boolean {
  const normalized = normalizeCathoText(text);
  return [
    "destaque extra",
    "pule na frente",
    "mais chances de receber um contato",
    "concorrentes desta vaga",
    "sua posicao agora",
  ].some((marker) => normalized.includes(marker));
}

export function isCathoDismissActionText(text: string): boolean {
  const normalized = normalizeCathoText(text);
  const textDismisses = [
    "agora nao",
    "nao quero",
    "depois",
    "fechar",
    "close",
  ].some((marker) => normalized === marker || normalized.includes(marker));

  return textDismisses || normalized === "x" || normalized === "×";
}

export function classifyCathoScreen(signals: CathoScreenSignals): CathoScreenKind {
  if (signals.successVisible) return "complete";
  if (signals.failureVisible) return "error";
  if (signals.questionnaireVisible) return "questionnaire";
  if (signals.applyButtonVisible) return "welcome";
  return "idle";
}
