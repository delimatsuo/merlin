export const AUTOAPPLY_SESSION_KEY_PREFIX = "autoapply_active_session_";
export const LEGACY_AUTOAPPLY_SESSION_KEY = "autoapply_active_session";

export function isAutoApplySessionKey(key: string): boolean {
  return key === LEGACY_AUTOAPPLY_SESSION_KEY || key.startsWith(AUTOAPPLY_SESSION_KEY_PREFIX);
}
