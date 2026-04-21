"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore, useAdminStore } from "@/lib/store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Briefcase,
  User as UserIcon,
  LogOut,
  User,
  Settings,
  Linkedin,
  Search,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useEffect } from "react";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { LanguageToggle } from "@/components/language-toggle";

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard/vagas", label: t("nav.search"), icon: Search },
    { href: "/dashboard", label: t("nav.jobs"), icon: Briefcase },
    { href: "/dashboard/candidaturas", label: t("nav.pipeline"), icon: Zap },
    { href: "/dashboard/profile", label: t("nav.profile"), icon: UserIcon },
    { href: "/dashboard/linkedin", label: "LinkedIn", icon: Linkedin },
  ];
  const { user } = useAuthStore();
  const { isAdmin, setIsAdmin } = useAdminStore();

  // Check admin status once on mount (lightweight endpoint, retry once on network error)
  useEffect(() => {
    if (!user || isAdmin !== null) return;
    let cancelled = false;
    const check = async (attempt = 0) => {
      try {
        await api.get("/api/admin/check");
        if (!cancelled) setIsAdmin(true);
      } catch {
        if (!cancelled) {
          if (attempt === 0) {
            // Retry once after 2s (handles cold start)
            setTimeout(() => check(1), 2000);
          } else {
            setIsAdmin(false);
          }
        }
      }
    };
    check();
    return () => { cancelled = true; };
  }, [user, isAdmin]);

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
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard" || pathname?.startsWith("/dashboard/application") || pathname?.startsWith("/dashboard/job")
                    : pathname === item.href || pathname?.startsWith(item.href + "/");
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
              {isAdmin && (
                <Link
                  href="/admin"
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                    pathname?.startsWith("/admin")
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Admin
                </Link>
              )}
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
                  onClick={() => router.push("/dashboard/settings")}
                  className="rounded-lg text-xs py-2.5 px-3 cursor-pointer"
                >
                  <Settings className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  {t("nav.settings")}
                </DropdownMenuItem>
                <div className="px-3 py-2">
                  <LanguageToggle />
                </div>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="rounded-lg text-xs py-2.5 px-3 text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2.5 h-3.5 w-3.5" />
                  {t("nav.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
