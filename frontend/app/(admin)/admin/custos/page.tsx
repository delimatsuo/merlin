"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface CostData {
  unitCosts: Record<string, number>;
  generationsToday: number;
  generationsMonth: number;
  estimatedCostToday: number;
  estimatedCostMonth: number;
  costPerGeneration: number;
  dailyChart: { date: string; count: number }[];
}

const SONNET_COSTS: Record<string, string> = {
  resume_rewrite: "Reescrita de currículo",
  cover_letter: "Carta de apresentação",
  job_analysis: "Análise de vaga",
  interview_questions: "Perguntas de entrevista",
  voice_processing: "Processamento de respostas",
  followup_questions: "Perguntas complementares",
  cv_recommendations: "Recomendações do CV",
  linkedin_analysis: "Análise LinkedIn",
};

const FLASH_LITE_COSTS: Record<string, string> = {
  resume_structuring: "Estruturação de currículo",
  ats_keywords: "Extração de keywords ATS",
  skill_matching: "Match de competências",
  company_enrichment: "Enriquecimento empresa",
  linkedin_structuring: "Estruturação LinkedIn",
};

const OTHER_COSTS: Record<string, string> = {
  tts: "Text-to-Speech (TTS)",
  transcription: "Transcrição de áudio",
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

      {/* Pipeline cost */}
      {data.costPerGeneration > 0 && (
        <div className="rounded-xl border border-border/50 p-4">
          <p className="text-xs text-muted-foreground">Custo por pipeline de geração (reescrita + carta + análise + ATS + skills)</p>
          <p className="text-lg font-semibold mt-1 font-mono">${data.costPerGeneration.toFixed(3)}</p>
        </div>
      )}

      {/* Sonnet Tier */}
      <CostTable
        title="Claude Sonnet 4.6 — Escrita e Raciocínio"
        subtitle="~$3/M tokens entrada, $15/M tokens saída"
        costs={data.unitCosts}
        labels={SONNET_COSTS}
      />

      {/* Flash-Lite Tier */}
      <CostTable
        title="Gemini Flash-Lite — Extração"
        subtitle="~$0.075/M tokens entrada, $0.30/M tokens saída"
        costs={data.unitCosts}
        labels={FLASH_LITE_COSTS}
      />

      {/* Other AI */}
      <CostTable
        title="Outros Serviços de IA"
        subtitle="Gemini Flash TTS e transcrição"
        costs={data.unitCosts}
        labels={OTHER_COSTS}
      />

      {/* Daily Cost Chart */}
      <div className="rounded-xl border border-border/50 p-6">
        <h2 className="text-sm font-medium mb-4">
          Custo diário estimado (últimos 30 dias)
        </h2>
        <div className="flex items-end gap-[2px] h-32">
          {data.dailyChart.map((d) => {
            const cost = d.count * (data.costPerGeneration || 0.04);
            const maxCost = Math.max(
              ...data.dailyChart.map((x) => x.count * (data.costPerGeneration || 0.04)),
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

function CostTable({
  title,
  subtitle,
  costs,
  labels,
}: {
  title: string;
  subtitle: string;
  costs: Record<string, number>;
  labels: Record<string, string>;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-6">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-[10px] text-muted-foreground mb-4">{subtitle}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <th className="text-left py-2 font-medium">Tipo</th>
            <th className="text-right py-2 font-medium">Custo/chamada (USD)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(labels).map(([key, label]) => (
            <tr key={key} className="border-b border-border/30">
              <td className="py-2">{label}</td>
              <td className="py-2 text-right font-mono">
                ${(costs[key] ?? 0).toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
