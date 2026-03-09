import { AuthGuard } from "@/components/auth-guard";
import { DashboardNav } from "@/components/dashboard-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ProcessingBar } from "@/components/processing-bar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <main className="max-w-5xl mx-auto px-6 py-10 pb-28 md:pb-10">
          {children}
        </main>
        <ProcessingBar />
        <MobileNav />
      </div>
    </AuthGuard>
  );
}
