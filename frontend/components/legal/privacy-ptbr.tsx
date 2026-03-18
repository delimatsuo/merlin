export default function PrivacyPTBR() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          1. Controlador dos Dados
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          O controlador dos dados pessoais tratados pela plataforma Merlin e
          a <strong>Ella Executive Search Ltda</strong>, inscrita no CNPJ sob
          o n. 44.891.922/0001-01, com sede em Calcada das Margaridas, 163,
          Sala 02, Condominio Centro Comercial Alphaville, Barueri/SP.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          2. Encarregado de Protecao de Dados (DPO)
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Para exercer seus direitos ou esclarecer duvidas sobre o
          tratamento dos seus dados, entre em contato com nosso Encarregado
          de Protecao de Dados:{" "}
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
          3. Dados Coletados
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          Coletamos os seguintes dados pessoais:
        </p>
        <ul className="space-y-2">
          {[
            "Dados de identificacao: nome, email e foto de perfil (via cadastro ou Google OAuth)",
            "Dados profissionais: curriculo enviado (experiencia, formacao, competencias, certificacoes, idiomas)",
            "Dados de entrevista: respostas textuais a perguntas de perfil e audio de voz (processado em tempo real via Google Cloud Speech-to-Text, nao armazenado apos transcricao)",
            "Dados de candidatura: descricoes de vagas fornecidas por voce, curriculos personalizados gerados, cartas de apresentacao",
            "Dados de uso: logs de acesso, timestamps de operacoes",
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
          4. Base Legal e Finalidade do Tratamento
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          Os dados sao tratados com base no seu <strong>consentimento</strong> (Art.
          7, I da LGPD), coletado no momento do cadastro. Os dados sao
          utilizados exclusivamente para:
        </p>
        <ul className="space-y-2">
          {[
            "Criar e enriquecer seu perfil profissional consolidado (knowledge file)",
            "Personalizar curriculos e cartas de apresentacao para vagas especificas",
            "Analisar compatibilidade entre seu perfil e requisitos de vagas (ATS score)",
            "Gerar perguntas complementares para melhorar a personalizacao",
            "Melhorar a qualidade do servico (analytics agregados e anonimizados)",
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
          5. Compartilhamento com Terceiros
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4">
          Para fornecer o servico, compartilhamos dados limitados com os
          seguintes operadores:
        </p>
        <div className="space-y-3">
          {[
            {
              name: "Google Cloud Platform (Firebase, Cloud Run, Firestore)",
              desc: "Armazenamento e processamento dos seus dados. Dados armazenados na regiao southamerica-east1 (Sao Paulo). Sujeito a politica de privacidade e DPA da Google Cloud.",
            },
            {
              name: "Google Gemini AI",
              desc: "Texto do curriculo, descricoes de vagas e transcricoes de entrevista sao enviados para geracao de conteudo personalizado. Audio processado em tempo real via Speech-to-Text e nao armazenado. O Gemini API nao utiliza dados de clientes para treinamento de modelos.",
            },
            {
              name: "Firebase Authentication",
              desc: "Gerenciamento de identidade e autenticacao. Armazena email, nome e foto de perfil.",
            },
            {
              name: "Brave Search",
              desc: "Apenas nomes de empresas extraidos do curriculo sao enviados para pesquisa publica. Nenhum dado pessoal identificavel e enviado.",
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
          Nao vendemos, alugamos ou compartilhamos seus dados pessoais com
          terceiros para fins de marketing ou publicidade.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          6. Transferencia Internacional de Dados
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Os dados armazenados no Firestore e Cloud Storage permanecem na
          regiao <strong>southamerica-east1</strong> (Sao Paulo, Brasil). No
          entanto, o processamento de IA via Google Gemini e Speech-to-Text
          pode ocorrer em servidores fora do Brasil. Esta transferencia e
          realizada com base no Art. 33, II da LGPD (clausulas contratuais
          padrao da Google Cloud) e na politica de processamento de dados da
          Google, que garante nivel adequado de protecao.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          7. Seus Direitos (LGPD Art. 18)
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          Voce tem os seguintes direitos, exerciveis a qualquer momento:
        </p>
        <div className="space-y-3">
          {[
            {
              right: "Confirmacao e Acesso",
              desc: "Confirmar a existencia de tratamento e acessar todos os seus dados. Disponivel em Configuracoes > Exportar Dados.",
            },
            {
              right: "Correcao",
              desc: "Corrigir dados incompletos, inexatos ou desatualizados. Disponivel editando seu curriculo ou perfil.",
            },
            {
              right: "Anonimizacao ou Eliminacao",
              desc: "Solicitar a exclusao dos seus dados. Disponivel em Configuracoes > Excluir Conta.",
            },
            {
              right: "Portabilidade",
              desc: "Exportar seus dados em formato estruturado (JSON). Disponivel em Configuracoes > Exportar Dados.",
            },
            {
              right: "Eliminacao",
              desc: "Excluir todos os dados tratados com base no seu consentimento. A exclusao e permanente e irreversivel.",
            },
            {
              right: "Revogacao do Consentimento",
              desc: "Retirar seu consentimento a qualquer momento, sem prejuizo do tratamento realizado anteriormente. A revogacao resulta na exclusao da conta e todos os dados.",
            },
            {
              right: "Informacao sobre Compartilhamento",
              desc: "Saber com quais terceiros seus dados sao compartilhados (detalhado na secao 5 acima).",
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
          Para exercer qualquer direito, utilize as funcionalidades do painel
          ou entre em contato com o DPO em{" "}
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contact@ellaexecutivesearch.com
          </a>
          . Responderemos em ate 15 dias uteis.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          8. Seguranca dos Dados
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Adotamos medidas tecnicas e organizacionais para proteger seus
          dados, incluindo: criptografia em repouso (AES-256) e em transito
          (TLS 1.3); regras de seguranca do Firestore que garantem isolamento
          por usuario; autenticacao via Firebase Auth com tokens JWT;
          armazenamento de secrets via GCP Secret Manager; e logs de auditoria
          para operacoes sensiveis.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          9. Retencao de Dados
        </h2>
        <div className="space-y-3">
          {[
            {
              item: "Dados da conta e perfil",
              period: "Mantidos enquanto a conta estiver ativa.",
            },
            {
              item: "Curriculos originais (PDF/DOCX)",
              period: "Mantidos no Cloud Storage enquanto o perfil associado existir. Excluidos junto com o perfil.",
            },
            {
              item: "Contas inativas",
              period: "Sinalizadas apos 12 meses de inatividade. Todos os dados excluidos automaticamente apos 18 meses.",
            },
            {
              item: "Exclusao de conta",
              period: "Todos os dados (Firestore, Cloud Storage, Firebase Auth) sao excluidos permanentemente e de forma irreversivel.",
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
          10. Cookies e Tecnologias de Rastreamento
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          A plataforma Merlin utiliza apenas cookies estritamente necessarios
          para o funcionamento do servico (autenticacao Firebase). Nao
          utilizamos cookies de marketing, publicidade ou rastreamento de
          terceiros. Nao utilizamos Google Analytics ou ferramentas similares
          de tracking.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          11. Menores de Idade
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          A plataforma Merlin nao e direcionada a menores de 18 anos. Nao
          coletamos intencionalmente dados de menores. Caso identifiquemos
          dados de menor, estes serao excluidos imediatamente.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          12. Alteracoes nesta Politica
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Esta politica pode ser atualizada periodicamente. Notificaremos
          sobre alteracoes relevantes por email ou por aviso na plataforma.
          A data da ultima atualizacao sera sempre indicada no topo desta
          pagina.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          13. Contato e Reclamacoes
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Para duvidas, solicitacoes ou reclamacoes sobre o tratamento dos
          seus dados pessoais, entre em contato com nosso DPO:{" "}
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contact@ellaexecutivesearch.com
          </a>
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed mt-3">
          Voce tambem tem o direito de peticionar perante a Autoridade
          Nacional de Protecao de Dados (ANPD) caso considere que o
          tratamento dos seus dados viola a LGPD.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          14. Disponibilidade Regional
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          A plataforma Merlin esta atualmente disponivel para usuarios nos{" "}
          <strong>Estados Unidos</strong> e no <strong>Brasil</strong>. Usuarios
          de outras regioes podem acessar o Servico, mas devem estar cientes de
          que as leis de privacidade locais fora dessas jurisdicoes podem nao
          ser especificamente abordadas por esta politica.
        </p>
      </section>

      <section className="border-t border-border pt-8">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ella Executive Search Ltda — CNPJ 44.891.922/0001-01
          <br />
          Calcada das Margaridas, 163, Sala 02, Cond. Centro Comercial Alphaville, Barueri/SP
        </p>
      </section>
    </div>
  );
}
