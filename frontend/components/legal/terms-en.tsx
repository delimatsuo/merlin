import Link from "next/link";

export default function TermsEN() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          1. Acceptance of Terms
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          By creating an account or using the Merlin platform (&quot;Service&quot;),
          you agree to these Terms of Service and our{" "}
          <Link href="/privacy" className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors">
            Privacy Policy
          </Link>
          . If you do not agree with any of these terms, do not use the Service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          2. About the Service
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Merlin is an artificial intelligence platform that helps candidates tailor
          resumes and cover letters for specific job openings. The Service is provided
          by <strong>Ella Executive Search Ltda</strong> (CNPJ 44.891.922/0001-01).
          The Service includes: resume upload and analysis; text-based profile
          interview; job compatibility analysis; generation of tailored resumes and
          cover letters; and export in DOCX format.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          3. Eligibility
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          You must be at least 18 years of age to use the Service. By creating an
          account, you represent that you have the legal capacity to enter into this
          agreement.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          4. User Account
        </h2>
        <ul className="space-y-2">
          {[
            "You are responsible for maintaining the confidentiality of your login credentials.",
            "You are responsible for all activities conducted under your account.",
            "Notify us immediately if you suspect unauthorized use of your account.",
            "We reserve the right to suspend or terminate accounts that violate these terms.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          5. Acceptable Use
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          By using the Service, you agree to:
        </p>
        <ul className="space-y-2">
          {[
            "Provide truthful and accurate information in your resume and profile.",
            "Not use the Service to generate fraudulent or misleading content.",
            "Not attempt to access other users' data.",
            "Not use the Service for illegal or unauthorized purposes.",
            "Not overload the Service with excessive automated requests.",
            "Not submit offensive, discriminatory, or illegal content in job descriptions or resumes.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          6. AI-Generated Content
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          The Service uses artificial intelligence (Google Gemini) to generate
          tailored resumes and cover letters. You acknowledge and agree that:
        </p>
        <ul className="space-y-2">
          {[
            "Generated content is a suggestion based on your data and the job description. You are responsible for reviewing and validating all content before use.",
            "AI may occasionally generate inaccurate or incomplete information. Merlin does not guarantee the accuracy of generated content.",
            "You retain full responsibility for the resume and cover letter you submit to employers.",
            "The Service does not guarantee approval in hiring processes or job placement.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          7. Intellectual Property
        </h2>
        <ul className="space-y-2">
          {[
            "You retain all rights to the personal and professional data you provide to the Service.",
            "Resumes and cover letters generated by the Service are your property for personal and professional use.",
            "The Merlin brand, platform design, and source code are the property of Ella Executive Search Ltda.",
            "You may not copy, modify, distribute, or resell any part of the platform.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          8. Limitation of Liability
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          The Service is provided &quot;as is&quot;. To the maximum extent permitted by
          law, Ella Executive Search Ltda shall not be liable for: indirect,
          incidental, or consequential damages arising from the use of the Service;
          loss of employment opportunities; inaccuracies in AI-generated content;
          temporary unavailability of the Service; or actions by third parties based
          on generated resumes.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          9. Availability and Modifications
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          We strive to keep the Service available 24/7 but do not guarantee
          uninterrupted availability. We reserve the right to modify, suspend, or
          discontinue the Service at any time, with reasonable prior notice when
          possible.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          10. Termination
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          You may delete your account at any time through the platform&apos;s Settings.
          Upon account deletion, all your data will be permanently removed as
          described in the Privacy Policy. We reserve the right to terminate or
          suspend accounts that violate these terms, with prior notification.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          11. Governing Law and Jurisdiction
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          The governing law and jurisdiction depend on your location:
        </p>
        <div className="space-y-3">
          <div className="rounded-xl bg-secondary/70 p-4">
            <p className="text-sm font-medium text-foreground">
              For users in the United States
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              These terms are governed by the laws of the State of California, without
              regard to conflict of law provisions. Any disputes arising under these
              terms shall be resolved through binding arbitration administered under the
              rules of the American Arbitration Association (AAA) in San Francisco,
              California. You agree to waive your right to a jury trial and to
              participate in a class action.
            </p>
          </div>
          <div className="rounded-xl bg-secondary/70 p-4">
            <p className="text-sm font-medium text-foreground">
              For users in Brazil
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              These terms are governed by the laws of the Federative Republic of Brazil.
              The courts of the Comarca de Barueri/SP are elected to resolve any
              disputes arising from these terms, waiving any other, however privileged.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          12. Regional Availability
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          The Service is designed for and available to users in the{" "}
          <strong>United States</strong> and <strong>Brazil</strong>. Users from
          other regions may access the Service at their own discretion, subject
          to these Terms and applicable local laws.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          13. Contact
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          For questions about these terms, contact us:{" "}
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contact@ellaexecutivesearch.com
          </a>
        </p>
      </section>

      <section className="border-t border-border pt-8">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ella Executive Search Ltda — CNPJ 44.891.922/0001-01
          <br />
          Calcada das Margaridas, 163, Sala 02, Cond. Centro Comercial Alphaville, Barueri/SP, Brazil
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          Last updated: March 2026
        </p>
      </section>
    </div>
  );
}
