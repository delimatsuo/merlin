import Link from "next/link";

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Merlin
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Política de Privacidade
          </h1>
          <p className="text-sm text-muted-foreground mt-3">
            Última atualização: Março de 2026
          </p>
        </header>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              1. Introdução
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              A Merlin (&quot;nós&quot;, &quot;nosso&quot;) está comprometida com
              a proteção dos seus dados pessoais em conformidade com a Lei Geral
              de Proteção de Dados (LGPD — Lei nº 13.709/2018). Esta Política de
              Privacidade descreve como coletamos, usamos, armazenamos e
              protegemos suas informações.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              2. Dados Coletados
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed mb-3">
              Coletamos os seguintes dados pessoais:
            </p>
            <ul className="space-y-2">
              {[
                "Nome, email e foto de perfil (via cadastro ou Google)",
                "Dados do currículo enviado (experiência, formação, competências)",
                "Gravações de voz durante a entrevista (processadas em tempo real, não armazenadas)",
                "Descrições de vagas fornecidas por você",
                "Dados de uso da plataforma (logs de acesso)",
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
              3. Finalidade do Tratamento
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed mb-3">
              Seus dados são utilizados exclusivamente para:
            </p>
            <ul className="space-y-2">
              {[
                "Criar e enriquecer seu perfil profissional",
                "Personalizar currículos e cartas de apresentação para vagas específicas",
                "Analisar compatibilidade entre seu perfil e vagas de emprego",
                "Melhorar a qualidade do serviço",
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
              4. Compartilhamento com Terceiros
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed mb-4">
              Para fornecer o serviço, compartilhamos dados limitados com os
              seguintes provedores:
            </p>
            <div className="space-y-3">
              {[
                {
                  name: "Anthropic (Claude AI)",
                  desc: "Texto do currículo e descrições de vagas para processamento de IA. Não inclui dados pessoais além do que consta no currículo.",
                },
                {
                  name: "Google (Gemini)",
                  desc: "Áudio da entrevista por voz, processado em tempo real e não armazenado pelo Google.",
                },
                {
                  name: "Brave Search",
                  desc: "Apenas nomes de empresas para pesquisa pública. Nenhum dado pessoal é enviado.",
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
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              5. Seus Direitos (LGPD)
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed mb-3">
              Você tem direito a:
            </p>
            <div className="space-y-3">
              {[
                {
                  right: "Acesso",
                  desc: "Baixar todos os seus dados pessoais em formato JSON pelo painel.",
                },
                {
                  right: "Correção",
                  desc: "Editar seus dados a qualquer momento pelo painel.",
                },
                {
                  right: "Exclusão",
                  desc: 'Excluir sua conta e todos os dados associados através do botão "Excluir minha conta" no painel.',
                },
                {
                  right: "Portabilidade",
                  desc: "Exportar seus dados em formato estruturado.",
                },
                {
                  right: "Revogação",
                  desc: "Retirar seu consentimento a qualquer momento, resultando na exclusão dos seus dados.",
                },
              ].map((item) => (
                <div key={item.right} className="flex items-start gap-3 text-sm">
                  <span className="font-medium text-foreground whitespace-nowrap">
                    {item.right}
                  </span>
                  <span className="text-foreground/60">—</span>
                  <span className="text-foreground/80">{item.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              6. Segurança dos Dados
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Seus dados são armazenados no Google Cloud Platform com
              criptografia em repouso (AES-256) e em trânsito (TLS 1.3). O
              acesso é restrito por regras de segurança que garantem que apenas
              você pode acessar seus próprios dados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              7. Retenção de Dados
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Contas inativas por mais de 12 meses serão sinalizadas. Após 18
              meses de inatividade, todos os dados serão excluídos
              automaticamente. Arquivos enviados (currículos originais) são
              excluídos após 90 dias.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              8. Contato
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Para dúvidas sobre esta política ou para exercer seus direitos,
              entre em contato pelo email:{" "}
              <a
                href="mailto:privacidade@merlin.com.br"
                className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
              >
                privacidade@merlin.com.br
              </a>
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
