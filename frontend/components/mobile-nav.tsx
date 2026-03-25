"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/useTranslation";

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard/vagas", label: t("mobileNav.search"), icon: Search },
    { href: "/dashboard", label: t("mobileNav.jobs"), icon: Briefcase },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 md:hidden safe-area-bottom">
      <div className="grid grid-cols-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard" || pathname?.startsWith("/dashboard/application")
              : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center pt-2 pb-1 transition-colors duration-200",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground/60"
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] mb-0.5 transition-all duration-200",
                  isActive && "scale-110"
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
