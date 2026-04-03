"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface RetentionCurvePoint {
  days: number;
  users: number;
  pct: number;
}

interface RetentionData {
  total_users: number;
  activated: number;
  found_value: number;
  active_this_week: number;
  retention_curve: RetentionCurvePoint[];
}

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle: string }) {
  return (
    <div className="apple-shadow rounded-2xl bg-card p-6">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

export default function AdminRetencao() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.get<RetentionData>("/api/admin/retention");
        setData(result);
      } catch (e) {
        console.error("Failed to load retention data", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-secondary rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-card animate-pulse apple-shadow" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-card animate-pulse apple-shadow" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Erro ao carregar dados de retenção.</p>;
  }

  const maxPct = Math.max(...data.retention_curve.map((p) => p.pct), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Retenção</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Usuários que retornam e extraem valor da plataforma
        </p>
      </div>

      {/* Headline stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total de Usuários" value={data.total_users} subtitle="Cadastrados na plataforma" />
        <StatCard label="Ativados" value={data.activated} subtitle="Completaram o onboarding" />
        <StatCard label="Encontraram Valor" value={data.found_value} subtitle="3+ dias ativos" />
        <StatCard label="Ativos esta Semana" value={data.active_this_week} subtitle="Últimos 7 dias" />
      </div>

      {/* Retention curve chart */}
      <div className="apple-shadow rounded-2xl bg-card p-6">
        <h2 className="text-sm font-semibold mb-1">Curva de Retenção</h2>
        <p className="text-xs text-muted-foreground mb-6">
          % de usuários que atingiram N dias ativos
        </p>
        <div className="flex gap-3">
          {data.retention_curve.map((point) => {
            const barHeight = maxPct > 0 ? (point.pct / maxPct) * 160 : 0;
            return (
              <div key={point.days} className="flex-1 flex flex-col items-center">
                <span className="text-[10px] font-medium text-muted-foreground tabular-nums mb-1">
                  {point.users}
                </span>
                <div className="w-full flex flex-col justify-end" style={{ height: 160 }}>
                  {barHeight > 0 && (
                    <div
                      className="w-full rounded-t-lg bg-foreground/80"
                      style={{ height: Math.max(barHeight, 4) }}
                    />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums mt-1">{point.pct}%</span>
                <span className="text-[10px] font-medium text-foreground">
                  {point.days}d
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
