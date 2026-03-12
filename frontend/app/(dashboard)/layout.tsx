import { AuthGuard } from "@/components/auth-guard";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardFooter } from "@/components/dashboard-footer";
import { MobileNav } from "@/components/mobile-nav";
import { ProcessingBar } from "@/components/processing-bar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background flex flex-col">
        <DashboardNav />
        <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 pb-28 md:pb-10">
          {children}
        </main>
        <DashboardFooter />
        <ProcessingBar />
        <MobileNav />
      </div>
    </AuthGuard>
  );
}
