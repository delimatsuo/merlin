/**
 * Firebase Auth integration for the extension.
 * Uses the offscreen document to perform auth operations.
 */

export async function getAuthToken(): Promise<string | null> {
  // TODO: Request auth token via offscreen document
  return null;
}

export async function signIn(): Promise<void> {
  // TODO: Trigger sign-in flow
}

export async function signOut(): Promise<void> {
  // TODO: Clear auth state
}
