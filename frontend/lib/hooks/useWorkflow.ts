"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useWorkflowStore } from "@/lib/store";
import { useAuthStore } from "@/lib/store";

export function useWorkflow() {
  const { user } = useAuthStore();
  const { steps, profileId, applicationId, loading, setSteps, setProfileId, setApplicationId, setLoading } = useWorkflowStore();

  useEffect(() => {
    if (!user) return;

    const fetchStatus = async () => {
      try {
        const result = await api.get<{
          profileId: string;
          applicationId: string;
          steps: typeof steps;
        }>("/api/profile/status");

        setProfileId(result.profileId);
        setApplicationId(result.applicationId);
        setSteps(result.steps);
      } catch {
        // API not available yet, use defaults
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [user, setSteps, setProfileId, setApplicationId, setLoading]);

  return { steps, profileId, applicationId, loading };
}
