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
  const [featureCounts, setFeatureCounts] = useState<Record<string, number>>({});
  const [emailStats, setEmailStats] = useState<{
    subscribers: number;
    totalWithPrefs: number;
    dailyStats: { date: string; emails_sent: number; unsubscribes: number }[];
  } | null>(null);

  // Always fetch fresh stats on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{
          stats: AdminStats;
          dailyChart: { date: string; count: number }[];
          recentGenerations: { id: string; uid: string; userEmail: string; company: string; type?: string; createdAt: string }[];
          globalGenerations: number;
          globalLimit: number;
          aiQuality: Record<string, number | string>;
          featureCounts: Record<string, number>;
        }>("/api/admin/stats");
        setStats(data.stats);
        setDailyChart(data.dailyChart);
        setRecentGenerations(data.recentGenerations);
        setGlobalGenerations(data.globalGenerations);
        setGlobalLimit(data.globalLimit);
        if (data.aiQuality) setAiQuality(data.aiQuality);
        if (data.featureCounts) setFeatureCounts(data.featureCounts);
        // Fetch email stats in parallel
        try {
          const es = await api.get<typeof emailStats>("/api/admin/email-stats");
          setEmailStats(es);
        } catch { /* non-critical */ }
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

      {/* Feature Breakdown */}
      {Object.keys(featureCounts).length > 0 && (
        <div className="rounded-xl border border-border/50 p-6">
          <h2 className="text-sm font-medium mb-4">Chamadas de IA por feature</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left py-2 font-medium">Feature</th>
                  <th className="text-right py-2 font-medium">Chamadas</th>
                  <th className="text-right py-2 font-medium">Custo est. (USD)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(featureCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([feature, count]) => {
                    const costMap: Record<string, number> = {
                      resume_rewrite: 0.020, cover_letter: 0.012, job_analysis: 0.006,
                      interview_questions: 0.004, voice_processing: 0.006, followup_questions: 0.004,
                      cv_recommendations: 0.012, linkedin_analysis: 0.015,
                      resume_structuring: 0.003, linkedin_structuring: 0.003,
                    };
                    const labelMap: Record<string, string> = {
                      resume_rewrite: "Reescrita de currículo", cover_letter: "Carta de apresentação",
                      job_analysis: "Análise de vaga", interview_questions: "Perguntas de entrevista",
                      voice_processing: "Processamento de respostas", followup_questions: "Perguntas complementares",
                      cv_recommendations: "Recomendações CV", linkedin_analysis: "Análise LinkedIn",
                      resume_structuring: "Estruturação currículo", linkedin_structuring: "Estruturação LinkedIn",
                    };
                    const cost = (costMap[feature] || 0.005) * count;
                    return (
                      <tr key={feature} className="border-b border-border/30">
                        <td className="py-2">{labelMap[feature] || feature}</td>
                        <td className="py-2 text-right font-mono">{count}</td>
                        <td className="py-2 text-right font-mono">${cost.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                <tr className="border-t border-border/50 font-medium">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right font-mono">
                    {Object.values(featureCounts).reduce((a, b) => a + b, 0)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    ${Object.entries(featureCounts).reduce((sum, [f, c]) => {
                      const costMap: Record<string, number> = {
                        resume_rewrite: 0.020, cover_letter: 0.012, job_analysis: 0.006,
                        interview_questions: 0.004, voice_processing: 0.006, followup_questions: 0.004,
                        cv_recommendations: 0.012, linkedin_analysis: 0.015,
                        resume_structuring: 0.003, linkedin_structuring: 0.003,
                      };
                      return sum + (costMap[f] || 0.005) * c;
                    }, 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <th className="text-left py-2 font-medium">Ação</th>
                  <th className="text-left py-2 font-medium">Empresa</th>
                  <th className="text-left py-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentGenerations.map((g) => {
                  const typeLabel: Record<string, string> = {
                    generation: "Geração",
                    upload: "Upload CV",
                    job_analysis: "Análise de vaga",
                    interview: "Entrevista",
                  };
                  return (
                  <tr key={g.id} className="border-b border-border/30">
                    <td className="py-2 font-mono">{g.userEmail}</td>
                    <td className="py-2">{typeLabel[g.type || "generation"] || g.type || "Geração"}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Email Digest Stats */}
      {emailStats && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">E-mail de Vagas</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Inscritos" value={emailStats.subscribers} />
            <StatCard label="Com preferências" value={emailStats.totalWithPrefs} />
            <StatCard
              label="E-mails hoje"
              value={emailStats.dailyStats[emailStats.dailyStats.length - 1]?.emails_sent ?? 0}
            />
          </div>
          <div className="rounded-xl border border-border/50 p-4">
            <p className="text-xs text-muted-foreground mb-3">E-mails enviados / Cancelamentos (14 dias)</p>
            <div className="flex items-end gap-1.5 h-24">
              {emailStats.dailyStats.map((d) => {
                const maxE = Math.max(...emailStats.dailyStats.map((s) => s.emails_sent), 1);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex flex-col justify-end" style={{ height: 64 }}>
                      {d.emails_sent > 0 && (
                        <div
                          className="w-full rounded-t bg-foreground/70"
                          style={{ height: Math.max((d.emails_sent / maxE) * 64, 2) }}
                        />
                      )}
                    </div>
                    <span className="text-[8px] text-muted-foreground tabular-nums">
                      {d.emails_sent > 0 ? d.emails_sent : ""}
                    </span>
                    {d.unsubscribes > 0 && (
                      <span className="text-[8px] text-red-500 tabular-nums">-{d.unsubscribes}</span>
                    )}
                    <span className="text-[7px] text-muted-foreground/50">
                      {d.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
