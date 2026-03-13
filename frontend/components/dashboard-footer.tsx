import Link from "next/link";

export function DashboardFooter() {
  return (
    <footer className="hidden md:block border-t border-border/50 bg-background">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground/60">
          {new Date().getFullYear()} Ella Executive Search Ltda. Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/privacidade"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Privacidade
          </Link>
          <Link
            href="/termos"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Termos de Uso
          </Link>
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Contato
          </a>
        </div>
      </div>
    </footer>
  );
}
