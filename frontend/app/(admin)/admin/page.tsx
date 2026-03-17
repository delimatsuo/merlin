"use client";

import { useAdminStore } from "@/lib/store";

export default function AdminDashboard() {
  const { stats, dailyChart, recentGenerations } = useAdminStore();

  const maxCount = Math.max(...dailyChart.map((d) => d.count), 1);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total de usuários" value={stats?.totalUsers ?? 0} />
        <StatCard label="Gerações hoje" value={stats?.generationsToday ?? 0} />
        <StatCard label="Gerações no mês" value={stats?.generationsMonth ?? 0} />
        <StatCard label="Signups no mês" value={stats?.signupsMonth ?? 0} />
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
