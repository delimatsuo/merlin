"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore, useAdminStore, type AdminStats } from "@/lib/store";
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

    // If already verified admin, load stats if needed
    if (isAdmin === true) {
      setChecking(false);
      return;
    }
    if (isAdmin === false) {
      router.replace("/dashboard");
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Step 1: lightweight admin check
        await api.get("/api/admin/check");
        if (cancelled) return;
        setIsAdmin(true);

        // Step 2: load stats for the dashboard (non-blocking for guard)
        try {
          const data = await api.get<{
            stats: AdminStats;
            dailyChart: { date: string; count: number }[];
            recentGenerations: {
              id: string;
              uid: string;
              userEmail: string;
              company: string;
              createdAt: string;
            }[];
          }>("/api/admin/stats");
          if (!cancelled) {
            setStats(data.stats);
            setDailyChart(data.dailyChart);
            setRecentGenerations(data.recentGenerations);
          }
        } catch {
          // Stats load failure is non-fatal
        }
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
  }, [user, authLoading, isAdmin, router, setIsAdmin, setStats, setDailyChart, setRecentGenerations]);

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
