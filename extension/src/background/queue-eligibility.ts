type QueueEligibilityEntry = {
  source?: string | null;
  job_url?: string | null;
};

const SUPPORTED_SOURCES = new Set(["gupy", "catho"]);

function hostnameFromUrl(jobUrl?: string | null): string {
  if (!jobUrl) return "";
  try {
    return new URL(jobUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function getQueueEntryRejectionReason(entry: QueueEligibilityEntry): string | null {
  const source = (entry.source || "").toLowerCase();
  if (!SUPPORTED_SOURCES.has(source)) return "unsupported_source";

  const host = hostnameFromUrl(entry.job_url);
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

export function isQueueEntryAutoApplySupported(entry: QueueEligibilityEntry): boolean {
  return getQueueEntryRejectionReason(entry) === null;
}
