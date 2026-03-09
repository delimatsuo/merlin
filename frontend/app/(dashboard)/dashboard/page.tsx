"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/store";
import { useWorkflow } from "@/lib/hooks/useWorkflow";
import {
  FileText,
  Mic,
  Briefcase,
  BarChart3,
  Download,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const steps: Array<{
  number: number;
  title: string;
  description: string;
  href: string;
  icon: typeof FileText;
}> = [
  {
    number: 1,
    title: "Upload do Currículo",
    description: "Envie seu currículo em PDF ou DOCX para análise inteligente",
    href: "/dashboard/perfil",
    icon: FileText,
  },
  {
    number: 2,
    title: "Entrevista por Voz",
    description: "Converse com IA para enriquecer seu perfil profissional",
    href: "/dashboard/entrevista",
    icon: Mic,
  },
  {
    number: 3,
    title: "Descrição da Vaga",
    description: "Cole a descrição da vaga que deseja se candidatar",
    href: "/dashboard/vaga",
    icon: Briefcase,
  },
  {
    number: 4,
    title: "Análise de Compatibilidade",
    description: "Veja o match entre seu perfil e a vaga com score ATS",
    href: "/dashboard/analise",
    icon: BarChart3,
  },
  {
    number: 5,
    title: "Currículo Personalizado",
    description: "Baixe seu currículo e carta otimizados para a vaga",
    href: "/dashboard/resultado",
    icon: Download,
  },
];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { steps: workflowSteps } = useWorkflow();

  const stepStatusMap: Record<number, boolean> = {
    1: workflowSteps.upload,
    2: workflowSteps.interview,
    3: workflowSteps.job,
    4: workflowSteps.analysis,
    5: workflowSteps.result,
  };
  const firstName = user?.displayName?.split(" ")[0] || "Candidato";

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Olá, {firstName}.
        </h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-lg">
          Siga os passos abaixo para criar seu currículo personalizado com
          inteligência artificial.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step) => {
          const Icon = step.icon;
          const isCompleted = stepStatusMap[step.number] || false;
          return (
            <Link key={step.number} href={step.href} className="block group">
              <div
                className={cn(
                  "apple-shadow-sm rounded-2xl bg-card p-6 transition-all duration-300",
                  "hover:apple-shadow hover:scale-[1.01]",
                  isCompleted && "bg-card"
                )}
              >
                <div className="flex items-center gap-5">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-300",
                      isCompleted
                        ? "bg-foreground"
                        : "bg-secondary group-hover:bg-foreground/5"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-background" />
                    ) : (
                      <Icon className="h-5 w-5 text-foreground/70" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Passo {step.number}
                      </span>
                      {isCompleted && (
                        <span className="text-[10px] font-semibold tracking-wide uppercase text-foreground bg-secondary px-2 py-0.5 rounded-full">
                          Concluído
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-foreground mt-0.5">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-300 shrink-0" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
