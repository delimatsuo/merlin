"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore, useKnowledgeStore } from "@/lib/store";

export function useOnboarding() {
  const { user } = useAuthStore();
  const { knowledge, setKnowledge, setLoading } = useKnowledgeStore();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    const check = async () => {
      setLoading(true);
      try {
        const result = await api.get<{ knowledge: Record<string, unknown> | null }>(
          "/api/profile/knowledge"
        );
        setKnowledge(result.knowledge);
        setNeedsOnboarding(result.knowledge === null);
      } catch {
        setNeedsOnboarding(true);
      } finally {
        setLoading(false);
        setChecking(false);
      }
    };

    check();
  }, [user, setKnowledge, setLoading]);

  return { needsOnboarding, loading: checking, knowledge };
}
