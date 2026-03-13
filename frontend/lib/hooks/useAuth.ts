"use client";

import { useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  useAuthStore,
  useProfileStore,
  useApplicationStore,
  useWorkflowStore,
  useKnowledgeStore,
  useApplicationsListStore,
  useVersionStore,
  useProcessingStore,
} from "@/lib/store";

function clearAllStores() {
  useProfileStore.setState({ profile: null, loading: false });
  useApplicationStore.getState().reset();
  useWorkflowStore.setState({
    profileId: "",
    applicationId: "",
    steps: { upload: false, interview: false, job: false, analysis: false, result: false },
    loading: true,
  });
  useKnowledgeStore.setState({ knowledge: null, loading: false });
  useApplicationsListStore.setState({ applications: [], loading: false, hasMore: false, nextCursor: "" });
  useVersionStore.setState({ versions: [], activeVersionId: "", loading: false });
  useProcessingStore.setState({ tasks: [] });
}

export function useAuth() {
  const { user, loading, setAuth } = useAuthStore();
  const prevUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setAuth(null);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const newUid = firebaseUser?.uid ?? null;
      const prevUid = prevUidRef.current;

      // Clear stores on sign-out or user switch
      if (prevUid && prevUid !== newUid) {
        clearAllStores();
      }

      prevUidRef.current = newUid;
      setAuth(firebaseUser);
    });
    return unsubscribe;
  }, [setAuth]);

  return { user, loading };
}
