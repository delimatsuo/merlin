"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdminStore, type AdminStats } from "@/lib/store";

export default function AdminDashboard() {
  const storeStats = useAdminStore((s) => s.stats);
  const storeDailyChart = useAdminStore((s) => s.dailyChart);
  const storeRecentGens = useAdminStore((s) => s.recentGenerations);
  const storeGlobalGens = useAdminStore((s) => s.globalGenerations);
  const storeGlobalLimit = useAdminStore((s) => s.globalLimit);
  const { setStats, setDailyChart, setRecentGenerations, setGlobalGenerations, setGlobalLimit } = useAdminStore();

  const [loading, setLoading] = useState(!storeStats);
  const [aiQuality, setAiQuality] = useState<Record<string, number | string>>({});

  // Always fetch fresh stats on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{
          stats: AdminStats;
          dailyChart: { date: string; count: number }[];
          recentGenerations: { id: string; uid: string; userEmail: string; company: string; createdAt: string }[];
          globalGenerations: number;
          globalLimit: number;
          aiQuality: Record<string, number | string>;
        }>("/api/admin/stats");
        setStats(data.stats);
        setDailyChart(data.dailyChart);
        setRecentGenerations(data.recentGenerations);
        setGlobalGenerations(data.globalGenerations);
        setGlobalLimit(data.globalLimit);
        if (data.aiQuality) setAiQuality(data.aiQuality);
      } catch {
        // Use cached data if fetch fails
      } finally {
        setLoading(false);
      }
    })();
  }, [setStats, setDailyChart, setRecentGenerations, setGlobalGenerations, setGlobalLimit]);

  const stats = storeStats;
  const dailyChart = storeDailyChart;
  const recentGenerations = storeRecentGens;

  const maxCount = Math.max(...dailyChart.map((d) => d.count), 1);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Carregando dashboard...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total de usuários" value={stats?.totalUsers ?? 0} />
        <StatCard label="Gerações hoje" value={stats?.generationsToday ?? 0} />
        <StatCard label="Gerações no mês" value={stats?.generationsMonth ?? 0} />
        <StatCard label="Signups no mês" value={stats?.signupsMonth ?? 0} />
        <div className="rounded-xl border border-border/50 p-4">
          <p className="text-xs text-muted-foreground">Gerações globais</p>
          <p className="text-2xl font-semibold mt-1">
            {storeGlobalGens.toLocaleString("pt-BR")}
            <span className="text-sm font-normal text-muted-foreground">
              {" / "}
              {storeGlobalLimit.toLocaleString("pt-BR")}
            </span>
          </p>
          {storeGlobalGens >= storeGlobalLimit && (
            <p className="text-xs text-amber-500 mt-1 font-medium">Limite atingido</p>
          )}
        </div>
      </div>

      {/* Bar Chart */}
      <div className="rounded-xl border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-4">Gerações diárias (últimos 30 dias)</h2>
        <div className="flex items-end gap-[2px] h-40">
          {dailyChart.map((d) => (
            <div
              key={d.date}
              className="flex-1 group relative"
              title={`${d.date}: ${d.count}`}
            >
              <div
                className="w-full bg-foreground/80 rounded-t-sm transition-all group-hover:bg-foreground"
                style={{
                  height: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 0)}%`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{dailyChart[0]?.date.slice(5)}</span>
          <span>{dailyChart[dailyChart.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* AI Quality */}
      {(aiQuality.malformed_entries || aiQuality.repair_failed) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="text-sm font-medium mb-4">Qualidade da IA (estruturação)</h2>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">Entradas malformadas</p>
              <p className="text-lg font-semibold mt-1">{Number(aiQuality.malformed_entries || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Reparos falharam</p>
              <p className="text-lg font-semibold mt-1">{Number(aiQuality.repair_failed || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Última ocorrência</p>
              <p className="text-sm mt-1 text-muted-foreground">
                {aiQuality.lastOccurrence
                  ? new Date(aiQuality.lastOccurrence as string).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="rounded-xl border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-4">Atividade recente</h2>
        {recentGenerations.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma geração registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left py-2 font-medium">Email</th>
                  <th className="text-left py-2 font-medium">Empresa</th>
                  <th className="text-left py-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentGenerations.map((g) => (
                  <tr key={g.id} className="border-b border-border/30">
                    <td className="py-2 font-mono">{g.userEmail}</td>
                    <td className="py-2">{g.company || "—"}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(g.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
