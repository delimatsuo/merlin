"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminGuard } from "@/components/admin-guard";
import { cn } from "@/lib/utils";
import { BarChart3, Users, DollarSign, Settings, ArrowLeft, MessageCircle, Activity } from "lucide-react";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/feedback", label: "Feedback", icon: MessageCircle },
  { href: "/admin/custos", label: "Custos", icon: DollarSign },
  { href: "/admin/retencao", label: "Retenção", icon: Activity },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AdminGuard>
      <head>
        <meta name="robots" content="noindex" />
      </head>
      <div className="min-h-screen bg-background">
        <nav className="sticky top-0 z-50 glass border-b border-border/50">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between h-12">
              <div className="flex items-center gap-6">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </Link>
                <span className="text-base font-semibold tracking-tight text-foreground">
                  Admin
                </span>
                <div className="hidden md:flex items-center">
                  {adminNav.map((item) => {
                    const isActive =
                      item.href === "/admin"
                        ? pathname === "/admin"
                        : pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                          isActive
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto w-full px-6 py-8">
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}
