"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Mic,
  Briefcase,
  BarChart3,
  Download,
  LayoutDashboard,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/perfil", label: "Currículo", icon: FileText },
  { href: "/dashboard/entrevista", label: "Entrevista", icon: Mic },
  { href: "/dashboard/vaga", label: "Vaga", icon: Briefcase },
  { href: "/dashboard/analise", label: "Análise", icon: BarChart3 },
  { href: "/dashboard/resultado", label: "Resultado", icon: Download },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <nav className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between h-12">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              Merlin
            </Link>
            <div className="hidden md:flex items-center">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
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
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger className="relative h-7 w-7 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform hover:scale-105">
                <Avatar className="h-7 w-7">
                  <AvatarImage
                    src={user?.photoURL || undefined}
                    alt={user?.displayName || ""}
                  />
                  <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground font-medium">
                    {user?.displayName?.charAt(0) ||
                      user?.email?.charAt(0) ||
                      "U"}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 glass apple-shadow-lg border-border/50 rounded-xl p-1"
              >
                <DropdownMenuItem className="rounded-lg text-xs py-2.5 px-3 font-medium cursor-default">
                  <User className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  {user?.displayName || user?.email}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="rounded-lg text-xs py-2.5 px-3 text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2.5 h-3.5 w-3.5" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
