import Link from "next/link";

export default function TermsPTBR() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          1. Aceitacao dos Termos
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Ao criar uma conta ou utilizar a plataforma Merlin (&quot;Servico&quot;),
          voce concorda com estes Termos de Uso e com a nossa{" "}
          <Link href="/privacy" className="text-foreground font-medium underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground transition-colors">
            Politica de Privacidade
          </Link>
          . Se voce nao concorda com algum destes termos, nao utilize o
          Servico.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          2. Sobre o Servico
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          O Merlin e uma plataforma de inteligencia artificial que auxilia
          candidatos a personalizar curriculos e cartas de apresentacao para
          vagas especificas. O Servico e oferecido pela{" "}
          <strong>Ella Executive Search Ltda</strong> (CNPJ 44.891.922/0001-01).
          O Servico inclui: upload e analise de curriculos; entrevista de
          perfil por texto; analise de compatibilidade com vagas; geracao de
          curriculos e cartas personalizados; e exportacao em formato DOCX.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          3. Elegibilidade
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Voce deve ter pelo menos 18 anos de idade para utilizar o Servico.
          Ao criar uma conta, voce declara que tem capacidade legal para
          celebrar este contrato.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          4. Conta do Usuario
        </h2>
        <ul className="space-y-2">
          {[
            "Voce e responsavel por manter a confidencialidade das suas credenciais de acesso.",
            "Voce e responsavel por todas as atividades realizadas na sua conta.",
            "Notifique-nos imediatamente caso suspeite de uso nao autorizado da sua conta.",
            "Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos.",
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
          5. Uso Aceitavel
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          Ao utilizar o Servico, voce concorda em:
        </p>
        <ul className="space-y-2">
          {[
            "Fornecer informacoes verdadeiras e precisas no seu curriculo e perfil.",
            "Nao utilizar o Servico para gerar conteudo fraudulento ou enganoso.",
            "Nao tentar acessar dados de outros usuarios.",
            "Nao utilizar o Servico para fins ilegais ou nao autorizados.",
            "Nao sobrecarregar o Servico com requisicoes automatizadas excessivas.",
            "Nao inserir conteudo ofensivo, discriminatorio ou ilegal nas descricoes de vagas ou curriculos.",
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
          6. Conteudo Gerado por IA
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          O Servico utiliza inteligencia artificial (Google Gemini) para gerar
          curriculos e cartas personalizados. Voce reconhece e concorda que:
        </p>
        <ul className="space-y-2">
          {[
            "O conteudo gerado e uma sugestao baseada nos seus dados e na descricao da vaga. Voce e responsavel por revisar e validar todo o conteudo antes de utiliza-lo.",
            "A IA pode ocasionalmente gerar informacoes imprecisas ou incompletas. O Merlin nao garante a exatidao do conteudo gerado.",
            "Voce mantem total responsabilidade pelo curriculo e carta que enviar a empregadores.",
            "O Servico nao garante aprovacao em processos seletivos ou obtencao de emprego.",
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
          7. Propriedade Intelectual
        </h2>
        <ul className="space-y-2">
          {[
            "Voce mantem todos os direitos sobre os dados pessoais e profissionais que fornece ao Servico.",
            "Os curriculos e cartas gerados pelo Servico sao de sua propriedade para uso pessoal e profissional.",
            "A marca Merlin, o design da plataforma e o codigo-fonte sao propriedade da Ella Executive Search Ltda.",
            "Voce nao pode copiar, modificar, distribuir ou revender qualquer parte da plataforma.",
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
          8. Limitacao de Responsabilidade
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          O Servico e fornecido &quot;como esta&quot; (as is). Na maxima extensao
          permitida pela lei, a Ella Executive Search Ltda nao se
          responsabiliza por: danos indiretos, incidentais ou consequenciais
          decorrentes do uso do Servico; perda de oportunidades de emprego;
          imprecisoes no conteudo gerado pela IA; indisponibilidade temporaria
          do Servico; ou acoes de terceiros com base nos curriculos gerados.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          9. Disponibilidade e Modificacoes
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Nos esforçamos para manter o Servico disponivel 24/7, mas nao
          garantimos disponibilidade ininterrupta. Reservamo-nos o direito de
          modificar, suspender ou descontinuar o Servico a qualquer momento,
          com aviso previo razoavel quando possivel.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          10. Rescisao
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Voce pode encerrar sua conta a qualquer momento atraves das
          Configuracoes da plataforma. Ao excluir sua conta, todos os seus
          dados serao permanentemente removidos conforme descrito na Politica
          de Privacidade. Reservamo-nos o direito de encerrar ou suspender
          contas que violem estes termos, mediante notificacao.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          11. Legislacao Aplicavel e Foro
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Estes termos sao regidos pelas leis da Republica Federativa do
          Brasil. Fica eleito o foro da Comarca de Barueri/SP para dirimir
          quaisquer controversias decorrentes destes termos, com renuncia a
          qualquer outro, por mais privilegiado que seja.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          12. Contato
        </h2>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Para duvidas sobre estes termos, entre em contato:{" "}
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
          Calcada das Margaridas, 163, Sala 02, Cond. Centro Comercial Alphaville, Barueri/SP
        </p>
      </section>
    </div>
  );
}
