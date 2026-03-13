"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore, useAdminStore } from "@/lib/store";
import { api } from "@/lib/api";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthStore();
  const { isAdmin, setIsAdmin, setStats, setDailyChart, setRecentGenerations } =
    useAdminStore();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    // If already checked, skip
    if (isAdmin !== null) {
      if (!isAdmin) router.replace("/dashboard");
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{
          stats: Record<string, number>;
          dailyChart: { date: string; count: number }[];
          recentGenerations: {
            id: string;
            uid: string;
            userEmail: string;
            company: string;
            createdAt: string;
          }[];
        }>("/api/admin/stats");
        if (cancelled) return;
        setIsAdmin(true);
        setStats(data.stats as any);
        setDailyChart(data.dailyChart);
        setRecentGenerations(data.recentGenerations);
      } catch {
        if (cancelled) return;
        setIsAdmin(false);
        router.replace("/dashboard");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, isAdmin]);

  if (authLoading || checking || isAdmin === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 rounded-full border-2 border-muted" />
          <div className="absolute inset-0 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
