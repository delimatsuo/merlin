export default function PrivacyEN() {
  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm text-foreground/80 leading-relaxed italic mb-6">
          This policy applies to users in Brazil and the United States.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          1. Data Controller
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          The data controller for personal data processed by the Merlin platform is{" "}
          <strong>Ella Executive Search Ltda</strong>, registered under CNPJ
          44.891.922/0001-01, located at Calcada das Margaridas, 163, Sala 02,
          Condominio Centro Comercial Alphaville, Barueri/SP, Brazil.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          2. Data Protection Officer (DPO)
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          To exercise your rights or clarify any questions about the processing
          of your data, contact our Data Protection Officer:{" "}
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contact@ellaexecutivesearch.com
          </a>
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          3. Data Collected
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          We collect the following personal data:
        </p>
        <ul className="space-y-2">
          {[
            "Identification data: name, email, and profile photo (via registration or Google OAuth)",
            "Professional data: uploaded resume (work experience, education, skills, certifications, languages)",
            "Interview data: text responses to profile questions and voice audio (processed in real time via Google Cloud Speech-to-Text, not stored after transcription)",
            "Application data: job descriptions you provide, generated tailored resumes, cover letters, ATS analysis results",
            "LinkedIn data: LinkedIn profile text or PDF uploaded for optimization suggestions (processed, not stored separately)",
            "Job preferences: desired job titles, locations, work mode, seniority level, and email digest frequency",
            "Usage data: access logs, operation timestamps",
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
          4. Legal Basis and Purpose
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          Your data is processed based on your <strong>consent</strong> (LGPD Art. 7, I),
          collected at the time of registration. Under the CCPA, we collect the following
          categories of personal information: identifiers, professional information,
          and internet activity. Your data is used exclusively to:
        </p>
        <ul className="space-y-2">
          {[
            "Create and enrich your consolidated professional profile (knowledge file)",
            "Tailor resumes and cover letters for specific job openings",
            "Analyze compatibility between your profile and job requirements (ATS score)",
            "Generate follow-up questions to improve personalization",
            "Analyze your LinkedIn profile and provide optimization suggestions",
            "Match job openings to your profile and deliver them via dashboard or email digest",
            "Improve service quality (aggregated and anonymized analytics)",
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
          5. Third-Party Sharing
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          To provide the service, we share limited data with the following processors:
        </p>
        <div className="space-y-3">
          {[
            {
              name: "Google Cloud Platform (Firebase, Cloud Run, Firestore)",
              desc: "Storage and processing of your data. Data stored in the southamerica-east1 region (Sao Paulo). Subject to Google Cloud's privacy policy and DPA.",
            },
            {
              name: "Google Gemini AI",
              desc: "Resume structuring, keyword extraction, and skill matching. Audio is processed in real time via Speech-to-Text and not stored. The Gemini API does not use customer data for model training.",
            },
            {
              name: "Anthropic Claude AI",
              desc: "Resume rewriting, cover letter generation, job analysis, interview questions, and LinkedIn analysis. Resume text and job descriptions are sent for content generation. Anthropic does not use customer data for model training.",
            },
            {
              name: "Firebase Authentication",
              desc: "Identity management and authentication. Stores email, name, and profile photo.",
            },
            {
              name: "Brave Search",
              desc: "Only company names extracted from your resume are sent for public search. No personally identifiable data is transmitted.",
            },
          ].map((provider) => (
            <div
              key={provider.name}
              className="rounded-xl bg-secondary/70 p-4"
            >
              <p className="text-sm font-medium text-foreground">
                {provider.name}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {provider.desc}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed mt-4">
          We do not sell, rent, or share your personal data with third parties for
          marketing or advertising purposes.{" "}
          <strong>We do not sell personal information</strong> as defined under the
          California Consumer Privacy Act (CCPA).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          6. International Data Transfers
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Data stored in Firestore and Cloud Storage remains in the{" "}
          <strong>southamerica-east1</strong> region (Sao Paulo, Brazil). However,
          AI processing via Google Gemini, Anthropic Claude, and Speech-to-Text may occur
          on servers outside of Brazil. This transfer is carried out pursuant to LGPD Art.
          33, II (standard contractual clauses) and the respective data processing policies
          of Google Cloud and Anthropic, which ensure an adequate level of protection. Data
          may also be processed in the United States through these providers&apos; infrastructure.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          7. Your Rights
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          You have the following rights, which you may exercise at any time:
        </p>
        <div className="space-y-3">
          {[
            {
              right: "Access & Confirmation",
              desc: "Confirm the existence of data processing and access all your data. Available in Settings > Export Data. (LGPD Art. 18; CCPA right to know)",
            },
            {
              right: "Correction",
              desc: "Correct incomplete, inaccurate, or outdated data. Available by editing your resume or profile. (LGPD Art. 18)",
            },
            {
              right: "Anonymization or Deletion",
              desc: "Request deletion of your data. Available in Settings > Delete Account. (LGPD Art. 18; CCPA right to delete)",
            },
            {
              right: "Portability",
              desc: "Export your data in a structured format (JSON). Available in Settings > Export Data. (LGPD Art. 18)",
            },
            {
              right: "Deletion",
              desc: "Delete all data processed based on your consent. Deletion is permanent and irreversible. (CCPA right to delete)",
            },
            {
              right: "Consent Revocation",
              desc: "Withdraw your consent at any time, without affecting prior processing. Revocation results in account and data deletion. (LGPD Art. 18)",
            },
            {
              right: "Sharing Information",
              desc: "Know which third parties your data is shared with (detailed in section 5 above). (LGPD Art. 18; CCPA right to know)",
            },
            {
              right: "Opt-Out of Sale",
              desc: "We do not sell your personal information. You may still submit an opt-out request at any time. (CCPA right to opt-out)",
            },
            {
              right: "Non-Discrimination",
              desc: "You will not be discriminated against for exercising your privacy rights. (CCPA)",
            },
          ].map((item) => (
            <div key={item.right} className="flex items-start gap-3 text-sm">
              <span className="font-medium text-foreground whitespace-nowrap min-w-[140px]">
                {item.right}
              </span>
              <span className="text-foreground/80">{item.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed mt-4">
          To exercise any right, use the platform&apos;s dashboard features or contact
          the DPO at{" "}
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contact@ellaexecutivesearch.com
          </a>
          . We will respond within 15 business days. In compliance with CalOPPA, a
          conspicuous link to this privacy policy is provided on every page of the platform.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          8. Data Security
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          We adopt technical and organizational measures to protect your data,
          including: encryption at rest (AES-256) and in transit (TLS 1.3);
          Firestore security rules ensuring per-user data isolation;
          Firebase Auth authentication with JWT tokens; secrets stored via
          GCP Secret Manager; and audit logs for sensitive operations.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          9. Data Retention
        </h2>
        <div className="space-y-3">
          {[
            {
              item: "Account and profile data",
              period: "Retained while the account is active.",
            },
            {
              item: "Original resumes (PDF/DOCX)",
              period: "Retained in Cloud Storage while the associated profile exists. Deleted along with the profile.",
            },
            {
              item: "Inactive accounts",
              period: "Flagged after 12 months of inactivity. All data automatically deleted after 18 months.",
            },
            {
              item: "Account deletion",
              period: "All data (Firestore, Cloud Storage, Firebase Auth) is permanently and irreversibly deleted.",
            },
          ].map((row) => (
            <div key={row.item} className="rounded-xl bg-secondary/70 p-4">
              <p className="text-sm font-medium text-foreground">
                {row.item}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {row.period}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          10. Cookies and Tracking Technologies
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          The Merlin platform uses only strictly necessary cookies for service
          operation (Firebase authentication). We do not use marketing,
          advertising, or third-party tracking cookies. We do not use Google
          Analytics or similar tracking tools.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          11. Minors
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          The Merlin platform is not directed at individuals under 18 years of age.
          We do not knowingly collect data from minors. If we identify data belonging
          to a minor, it will be deleted immediately.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          12. Policy Changes
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          This policy may be updated periodically. We will notify you of relevant
          changes by email or through the platform. The date of the last update
          will always be indicated at the top of this page.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          13. Contact and Complaints
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          For questions, requests, or complaints about the processing of your
          personal data, contact our DPO:{" "}
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contact@ellaexecutivesearch.com
          </a>
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed mt-3">
          For users in Brazil, you also have the right to file a complaint with the
          Autoridade Nacional de Protecao de Dados (ANPD) if you believe your data
          processing violates the LGPD. For users in California, you may file a
          complaint with the California Attorney General regarding CCPA violations
          at{" "}
          <a
            href="https://oag.ca.gov/contact/consumer-complaint-against-business-702-service"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            oag.ca.gov
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          14. Chrome Extension (Gupy AutoApply)
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          The official Merlin Chrome extension automates filling out job
          application forms on the Gupy portal using your Merlin profile.
          This section details data handling specific to the extension.
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          <strong>Single purpose:</strong> automate form-filling for job
          listings hosted on gupy.io. No other use is offered.
        </p>

        <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
          Data stored locally in your browser
        </h3>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          The following data is kept exclusively in
          <code className="font-mono mx-1">chrome.storage.local</code>
          on your machine and <strong>is never sent to our servers nor
          processed by AI</strong>:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            "Brazilian tax ID (CPF), state ID (RG), and mother's name",
            "Date of birth, gender, marital status, ethnicity/race, disability status",
            "Full home address (street, city, state, ZIP)",
            "Phone number",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          This data is used solely by the extension to fill matching
          fields in Gupy forms. It remains on the user&apos;s machine until
          edited or until the extension is uninstalled.
        </p>

        <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
          Data transmitted to Merlin servers
        </h3>
        <ul className="space-y-2 mb-4">
          {[
            "Jobs selected for batch application (ID, URL, title, company)",
            "Status of each application (pending, running, completed, needs attention, failed)",
            "User-provided answers to custom questions (saved so the system does not ask again on future applications)",
            "Text of custom questions that require AI assistance — sent to Gemini to generate a suggested answer based on your existing professional profile in the platform",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
          Data read from Gupy pages
        </h3>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          The extension reads form labels and structure on Gupy job
          pages to identify which fields to fill. Gupy page content is
          not stored or transmitted outside the context of the user&apos;s
          own active application.
        </p>

        <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
          Authentication
        </h3>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          The extension uses
          <code className="font-mono mx-1">chrome.identity.launchWebAuthFlow</code>
          to sign in with Google, exchanging the result for a Firebase
          ID Token. The session token is stored in
          <code className="font-mono mx-1">chrome.storage.session</code>
          (cleared automatically when the browser closes). It is not
          shared with third parties.
        </p>

        <h3 className="text-base font-semibold text-foreground mt-6 mb-2">
          Requested permissions and purpose
        </h3>
        <div className="space-y-3">
          {[
            { p: "tabs", d: "Open, focus, and manage application tabs in parallel." },
            { p: "storage", d: "Persist personal data and extension settings locally." },
            { p: "identity", d: "Authenticate via Google/Firebase." },
            { p: "scripting", d: "Inject form-filling logic into Gupy job pages." },
            { p: "alarms", d: "Periodically poll the Merlin server for the application queue." },
            { p: "Access to *.gupy.io", d: "Read form labels and fill fields during an application." },
            { p: "Access to merlincv.com", d: "Sync the application queue and status with the Merlin dashboard." },
          ].map((row) => (
            <div key={row.p} className="rounded-xl bg-secondary/70 p-4">
              <p className="text-sm font-medium text-foreground font-mono">{row.p}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{row.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          15. Regional Availability
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          The Merlin platform is currently available for users in the{" "}
          <strong>United States</strong> and <strong>Brazil</strong>. Users from
          other regions may access the Service, but should be aware that local
          privacy laws outside these jurisdictions may not be specifically
          addressed by this policy.
        </p>
      </section>

      <section className="border-t border-border pt-8">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ella Executive Search Ltda — CNPJ 44.891.922/0001-01
          <br />
          Calcada das Margaridas, 163, Sala 02, Cond. Centro Comercial Alphaville, Barueri/SP, Brazil
        </p>
      </section>
    </div>
  );
}
