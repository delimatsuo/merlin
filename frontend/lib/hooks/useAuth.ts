"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";

export function useAuth() {
  const { user, loading, setAuth } = useAuthStore();

  useEffect(() => {
    if (!auth) {
      setAuth(null);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuth(firebaseUser);
    });
    return unsubscribe;
  }, [setAuth]);

  return { user, loading };
}
