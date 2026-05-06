type JobAutomationInput = {
  source?: string | null;
  source_url?: string | null;
};

const SUPPORTED_SOURCES = new Set(["gupy", "catho"]);

function hostnameFromUrl(sourceUrl?: string | null): string {
  if (!sourceUrl) return "";
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function getAutoApplyRejectionReason(job: JobAutomationInput): string | null {
  const source = (job.source || "").toLowerCase();
  if (!SUPPORTED_SOURCES.has(source)) return "unsupported_source";

  const host = hostnameFromUrl(job.source_url);
  if (source === "gupy") {
    return host === "gupy.io" || host.endsWith(".gupy.io")
      ? null
      : "unsupported_apply_method";
  }
  if (source === "catho") {
    return host === "catho.com.br" || host.endsWith(".catho.com.br")
      ? null
      : "unsupported_apply_method";
  }

  return "unsupported_source";
}

export function isAutoApplySupported(job: JobAutomationInput): boolean {
  return getAutoApplyRejectionReason(job) === null;
}
