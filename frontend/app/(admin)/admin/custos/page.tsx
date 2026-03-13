"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface CostData {
  unitCosts: Record<string, number>;
  generationsToday: number;
  generationsMonth: number;
  estimatedCostToday: number;
  estimatedCostMonth: number;
  dailyChart: { date: string; count: number }[];
}

const COST_LABELS: Record<string, string> = {
  resume_gen: "Geração de currículo (Pro)",
  job_analysis: "Análise de vaga (Flash)",
  tts: "Text-to-Speech (Flash TTS)",
  interview: "Perguntas de entrevista (Pro)",
  transcription: "Transcrição (Flash)",
};

export default function AdminCustos() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.get<CostData>("/api/admin/costs");
        setData(result);
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Carregando custos...</p>;
  }

  if (!data) {
    return <p className="text-xs text-muted-foreground">Erro ao carregar dados.</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Custos</h1>

      {/* Projections */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CostCard label="Gerações hoje" value={data.generationsToday} />
        <CostCard
          label="Custo estimado hoje"
          value={`$${data.estimatedCostToday.toFixed(2)}`}
        />
        <CostCard label="Gerações no mês" value={data.generationsMonth} />
        <CostCard
          label="Custo estimado mês"
          value={`$${data.estimatedCostMonth.toFixed(2)}`}
        />
      </div>

      {/* Unit Costs Table */}
      <div className="rounded-xl border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-4">Custo unitário por tipo de API</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground">
              <th className="text-left py-2 font-medium">Tipo</th>
              <th className="text-right py-2 font-medium">Custo/chamada (USD)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.unitCosts).map(([key, cost]) => (
              <tr key={key} className="border-b border-border/30">
                <td className="py-2">{COST_LABELS[key] || key}</td>
                <td className="py-2 text-right font-mono">${cost.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily Cost Chart */}
      <div className="rounded-xl border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-4">
          Custo diário estimado (últimos 30 dias)
        </h2>
        <div className="flex items-end gap-[2px] h-32">
          {data.dailyChart.map((d) => {
            const cost = d.count * data.unitCosts.resume_gen;
            const maxCost = Math.max(
              ...data.dailyChart.map((x) => x.count * data.unitCosts.resume_gen),
              0.01
            );
            return (
              <div
                key={d.date}
                className="flex-1 group relative"
                title={`${d.date}: $${cost.toFixed(2)} (${d.count} gerações)`}
              >
                <div
                  className="w-full bg-amber-500/70 rounded-t-sm transition-all group-hover:bg-amber-500"
                  style={{
                    height: `${Math.max(
                      (cost / maxCost) * 100,
                      cost > 0 ? 4 : 0
                    )}%`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{data.dailyChart[0]?.date.slice(5)}</span>
          <span>{data.dailyChart[data.dailyChart.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </div>
  );
}

function CostCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </p>
    </div>
  );
}
