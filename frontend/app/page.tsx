"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import {
  FileText,
  Sparkles,
  Target,
  MessageSquareText,
  ArrowRight,
} from "lucide-react";
import { auth } from "@/lib/firebase";

export default function LandingPage() {
  const router = useRouter();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) router.replace("/dashboard");
    });
    return unsubscribe;
  }, [router]);
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-5xl mx-auto">
        <span className="text-xl font-bold tracking-tight text-foreground">
          Merlin
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="h-9 px-5 inline-flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Criar conta
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-12 pt-20 pb-24 max-w-3xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
          Seu currículo sob
          <br />
          medida com IA
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          O Merlin analisa a vaga, identifica o que o recrutador procura, e
          reescreve seu currículo para maximizar suas chances — tudo em minutos.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/cadastro"
            className="h-12 px-8 inline-flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Começar agora
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="h-12 px-8 inline-flex items-center justify-center rounded-full border border-border text-foreground text-sm font-semibold hover:bg-secondary transition-colors"
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 py-20 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-14">
          Como funciona
        </h2>
        <div className="grid md:grid-cols-4 gap-8">
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              1. Envie seu currículo
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upload do seu PDF ou DOCX. A IA estrutura seus dados automaticamente.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <MessageSquareText className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              2. Entrevista rápida
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Responda perguntas sobre sua experiência para enriquecer o perfil.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <Target className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              3. Cole a vaga
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cole a descrição da vaga e receba uma análise completa com score ATS.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <Sparkles className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              4. Currículo pronto
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Receba currículo e carta de apresentação personalizados para a vaga.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-12 py-20 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="apple-shadow rounded-2xl bg-card p-7 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Otimizado para ATS
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Keywords estratégicas posicionadas nos pontos de maior scan dos
              sistemas de triagem automática.
            </p>
          </div>
          <div className="apple-shadow rounded-2xl bg-card p-7 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Bilíngue PT-BR / EN
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Detecta o idioma da vaga e gera o currículo na língua correta
              automaticamente.
            </p>
          </div>
          <div className="apple-shadow rounded-2xl bg-card p-7 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Seus dados protegidos
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Infraestrutura Google Cloud, autenticação Firebase, e conformidade
              com a LGPD.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-20 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          Pronto para personalizar seu currículo?
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Crie sua conta gratuita e gere seu primeiro currículo em minutos.
        </p>
        <Link
          href="/cadastro"
          className="mt-8 h-12 px-8 inline-flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Criar conta gratuita
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-12 py-10 max-w-5xl mx-auto border-t border-border">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Merlin</span>
            <span className="text-muted-foreground/30">·</span>
            <span>
              por{" "}
              <a
                href="https://ellaexecutivesearch.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-medium hover:underline underline-offset-2"
              >
                Ella Executive Search
              </a>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/privacidade"
              className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              Privacidade
            </Link>
            <span className="text-muted-foreground/30">·</span>
            <Link
              href="/termos"
              className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              Termos de Uso
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
