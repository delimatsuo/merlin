import { apiGet } from "./api-client";

interface ProfileData {
  knowledge: Record<string, any>;
  daily_llm_calls: number;
  daily_llm_limit: number;
}

let cachedProfile: ProfileData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadProfile(forceRefresh = false): Promise<ProfileData> {
  if (!forceRefresh && cachedProfile && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProfile;
  }

  const data = await apiGet<ProfileData>("/api/autoapply");
  cachedProfile = data;
  cacheTimestamp = Date.now();
  return data;
}

export function getCachedProfile(): ProfileData | null {
  if (cachedProfile && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProfile;
  }
  return null;
}

export function invalidateProfileCache(): void {
  cachedProfile = null;
  cacheTimestamp = 0;
}
