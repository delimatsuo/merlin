"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { LanguageToggle } from "@/components/language-toggle";

export default function CadastroPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setError(t("signup.errorConsent"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      await updateProfile(result.user, { displayName: name });
      router.push("/dashboard");
    } catch {
      setError(t("signup.errorCreate"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (!consent) {
      setError(t("signup.errorConsent"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/dashboard");
    } catch {
      setError(t("signup.errorGoogle"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2 hover:opacity-80 transition-opacity">
              Merlin
            </h1>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            {t("signup.title")}
          </h2>
          <p className="text-base text-muted-foreground">
            {t("signup.subtitle")}
          </p>
        </div>

        {/* Card */}
        <div className="apple-shadow rounded-2xl bg-card p-8 space-y-6">
          {error && (
            <div className="rounded-xl bg-destructive/8 border border-destructive/15 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 h-12 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors duration-200 text-sm font-medium text-foreground disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {t("common.continueWithGoogle")}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">
                {t("common.or")}
              </span>
            </div>
          </div>

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="name"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("signup.fullName")}
              </Label>
              <Input
                id="name"
                type="text"
                placeholder={t("signup.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-12 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("signup.email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t("signup.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("signup.password")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={t("signup.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                className="h-12 rounded-xl bg-secondary border-0 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <label
              htmlFor="consent"
              className="flex items-start gap-3 cursor-pointer group"
            >
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-5 rounded-md border-2 border-border peer-checked:border-foreground peer-checked:bg-foreground transition-all duration-200" />
                <svg
                  className="absolute inset-0 h-5 w-5 text-background opacity-0 peer-checked:opacity-100 transition-opacity duration-200 p-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="text-xs text-muted-foreground leading-relaxed">
                {t("signup.consent")}{" "}
                <Link
                  href="/privacy"
                  className="text-foreground font-medium underline underline-offset-2"
                  target="_blank"
                >
                  {t("signup.privacyPolicy")}
                </Link>{" "}
                {t("signup.and")}{" "}
                <Link
                  href="/terms"
                  className="text-foreground font-medium underline underline-offset-2"
                  target="_blank"
                >
                  {t("signup.termsOfService")}
                </Link>
                {t("signup.consentSuffix")}
              </span>
            </label>
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-sm font-semibold"
              disabled={loading}
            >
              {loading ? t("signup.creatingAccount") : t("signup.createAccount")}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("signup.haveAccount")}{" "}
            <Link
              href="/login"
              className="text-foreground font-medium hover:underline underline-offset-4"
            >
              {t("signup.signIn")}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground/50">
            {t("footer.by")}{" "}
            <a
              href="https://ellaexecutivesearch.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              Ella Executive Search
            </a>
          </p>
          <div className="mt-2">
            <LanguageToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
