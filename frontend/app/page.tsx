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
import { useTranslation } from "@/lib/hooks/useTranslation";
import { LanguageToggle } from "@/components/language-toggle";

export default function LandingPage() {
  const router = useRouter();
  const { t } = useTranslation();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) router.replace("/dashboard");
    });
    return unsubscribe;
  }, [router]);

  useEffect(() => {
    document.title = t("meta.defaultTitle");
  }, [t]);
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
            {t("landing.signIn")}
          </Link>
          <LanguageToggle />
          <Link
            href="/signup"
            className="h-9 px-5 inline-flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t("landing.createAccount")}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-12 pt-20 pb-24 max-w-3xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
          {t("landing.heroTitle1")}
          <br />
          {t("landing.heroTitle2")}
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          {t("landing.heroSubtitle")}
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-5 py-2">
          <span className="text-sm font-semibold text-green-600">{t("landing.freeLabel")}</span>
          <span className="text-xs text-green-600/70">{t("landing.freeDetail")}</span>
        </div>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="h-12 px-8 inline-flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t("landing.getStarted")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="h-12 px-8 inline-flex items-center justify-center rounded-full border border-border text-foreground text-sm font-semibold hover:bg-secondary transition-colors"
          >
            {t("landing.haveAccount")}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 py-20 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-14">
          {t("landing.howItWorks")}
        </h2>
        <div className="grid md:grid-cols-4 gap-8">
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.step1Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.step1Desc")}
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <MessageSquareText className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.step2Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.step2Desc")}
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <Target className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.step3Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.step3Desc")}
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              <Sparkles className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.step4Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.step4Desc")}
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-12 py-20 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="apple-shadow rounded-2xl bg-card p-7 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.feature1Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.feature1Desc")}
            </p>
          </div>
          <div className="apple-shadow rounded-2xl bg-card p-7 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.feature2Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.feature2Desc")}
            </p>
          </div>
          <div className="apple-shadow rounded-2xl bg-card p-7 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("landing.feature3Title")}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("landing.feature3Desc")}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-20 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          {t("landing.ctaTitle")}
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          {t("landing.ctaSubtitle")}
        </p>
        <Link
          href="/signup"
          className="mt-8 h-12 px-8 inline-flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {t("landing.ctaButton")}
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
              {t("footer.by")}{" "}
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
              href="/privacy"
              className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              {t("footer.privacy")}
            </Link>
            <span className="text-muted-foreground/30">·</span>
            <Link
              href="/terms"
              className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              {t("footer.terms")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
