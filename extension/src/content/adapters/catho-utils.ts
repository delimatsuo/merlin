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

export function classifyCathoScreen(signals: CathoScreenSignals): CathoScreenKind {
  if (signals.successVisible) return "complete";
  if (signals.failureVisible) return "error";
  if (signals.questionnaireVisible) return "questionnaire";
  if (signals.applyButtonVisible) return "welcome";
  return "idle";
}
