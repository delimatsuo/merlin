# Chrome Web Store — Submission Cheat Sheet

The actual Web Store form is simpler than expected. This doc is now organized
to match the form **field-by-field**, in the order the dashboard shows them.

| | |
|---|---|
| Item name (from manifest) | **Gupy AutoApply** |
| Status | Draft |
| **Published extension ID** | `gpnbdjkdalnalehhfajgapalhlogbbbd` |
| Dev-unpacked extension ID | `pckpedgciidgclkelofcicgaeelcicea` (kept by `key` field in `manifest.json`) |
| Publisher | Ella Executive Search Ltda |

---

## Sidebar: Store listing

### Product details

**Description** (16,000 char limit) — paste the block below:

```
Automatize o preenchimento de candidaturas em vagas hospedadas no portal Gupy. Selecione varias vagas no painel Merlin, clique em "Aplicar em lote" e a extensao abre as paginas Gupy em segundo plano e preenche os formularios usando seu perfil profissional e seus dados pessoais.

COMO FUNCIONA

1. Faca login com sua conta Merlin (ou crie uma em merlincv.com)
2. Cadastre seus dados pessoais (CPF, telefone, endereco) na extensao — eles ficam apenas no seu navegador, nunca sao enviados aos nossos servidores nem a IA
3. No painel Merlin, navegue ate a pagina Vagas e selecione as posicoes em que deseja se candidatar
4. Clique em "Aplicar em lote" — a extensao executa cada candidatura em uma aba separada, ate 4 em paralelo
5. Acompanhe o progresso na pagina Candidaturas; receba um resumo por email quando o lote terminar

PRIVACIDADE PRIMEIRO

- Seus dados pessoais sensiveis (CPF, RG, nome da mae, endereco) ficam exclusivamente no seu navegador. Nunca enviados aos servidores Merlin nem processados por IA.
- A extensao tem acesso apenas a paginas gupy.io e ao painel Merlin (merlincv.com).
- Politica de privacidade completa em https://merlincv.com/privacidade

RECURSOS

- Preenchimento automatico de campos pessoais, profissionais e perguntas customizadas
- Respostas geradas por IA (Gemini) para perguntas que ainda nao foram respondidas, com base no seu perfil profissional ja existente na plataforma
- Detecao automatica de modais e bloqueios do Gupy
- Fila gerenciada de aplicacoes — pause, cancele ou continue a qualquer momento
- Sistema de aprendizado: respostas a perguntas customizadas sao salvas para nao serem repetidas em vagas futuras

REQUER CONTA MERLIN

A extensao depende de uma conta gratuita em https://merlincv.com. O cadastro inclui o envio do seu curriculo, que e analisado pela plataforma para criar seu perfil profissional consolidado.

SUPORTE

Duvidas, problemas ou sugestoes: contact@ellaexecutivesearch.com
```

**Category**: `Tools` (the form labels what was Productivity in earlier docs as "Tools" — same thing)

**Language**: `Portuguese (Brazil) — pt-BR`

### Graphic assets

All in `extension/store-screenshots/webstore/` (RGB, no alpha — Web Store-compliant):

| Field | File | Specs |
|---|---|---|
| **Store icon** | `store-icon-128.png` | 128×128 |
| **Screenshots** (1–5; ours are 3) | `01-popup.png`, `02-candidaturas.png`, `03-email-digest.png` | 1280×800 each |
| **Small promo tile** | `promo-tile-440x280.png` | 440×280 |
| **Marquee promo tile** | `marquee-tile-1400x560.png` | 1400×560 |
| Global promo video | _(skip — optional)_ | YouTube URL |

---

## Sidebar: Privacy (a.k.a. "Privacy practices" tab)

This is where most of the work is. The form requires a justification for
**every** permission and host pattern declared in the manifest, plus
single-purpose, remote-code declaration, and a compliance certification.

### Privacy policy URL

```
https://merlincv.com/privacidade
```

(Section 14 of the policy is dedicated to the extension specifically.)

### Single purpose description

```
Automatiza o preenchimento de formularios de candidatura em vagas hospedadas no portal Gupy. Selecione vagas no painel Merlin e a extensao preenche os formularios usando seu perfil profissional e dados pessoais salvos localmente.
```

### Permission justifications (one field per permission)

Paste each block into the matching field:

**`activeTab`**
```
Necessario para a extensao interagir com a aba ativa quando o usuario abre o popup, identificando se a pagina atual e Gupy ou o painel Merlin.
```

**`alarms`**
```
Necessario para verificar periodicamente (a cada 90 segundos) se ha novas candidaturas pendentes na fila do servidor Merlin. Sem isso, o usuario teria que abrir a extensao manualmente para iniciar cada lote de candidaturas.
```

**`identity`**
```
Necessario para autenticacao Google OAuth via chrome.identity.launchWebAuthFlow. Este e o unico metodo recomendado pelo Chrome para extensoes MV3 que se autenticam contra um backend Firebase. O token resultante e armazenado em chrome.storage.session e nao e compartilhado com terceiros.
```

**`scripting`**
```
Necessario para injetar a logica de preenchimento de formularios em paginas de vagas Gupy. A injecao ocorre apenas em paginas em *.gupy.io durante uma candidatura ativa do proprio usuario.
```

**`storage`**
```
Necessario para guardar localmente os dados pessoais do usuario (CPF, telefone, endereco), suas configuracoes e o estado da fila de candidaturas. Dados pessoais sensiveis ficam exclusivamente em chrome.storage.local e nunca sao enviados aos nossos servidores.
```

**`tabs`**
```
Necessario para abrir, focar e gerenciar abas onde candidaturas estao rodando em paralelo (ate 4 simultaneas). A extensao apenas le URL e estado de carregamento de abas; nao le conteudo de abas fora de gupy.io e merlincv.com.
```

### Host permission justification (one field for all hosts)

The form lumps every host into one field. Paste this block:

```
A extensao requer acesso aos seguintes hosts:

- *://*.gupy.io/* — para ler rotulos de formularios de candidatura e preenche-los durante o fluxo de aplicacao do usuario. A extensao opera somente dentro do fluxo de candidatura.

- https://merlincv.com/* (e https://staging.merlincv.com/* para homologacao) — para sincronizar a fila de candidaturas e o status com o painel da plataforma Merlin via content script bridge. Sem isso, o painel nao consegue acionar a extensao em tempo real.

- https://merlin-backend-531233742939.southamerica-east1.run.app/* — backend Merlin (Cloud Run). Necessario para chamadas API autenticadas: perfil profissional do usuario, fila de candidaturas, e geracao de respostas por IA para perguntas customizadas em formularios.
```

### Remote code use

**Answer: No, I am not using remote code.**

Justification (if the form requires text):
```
A extensao nao executa codigo remoto. Todo o JavaScript e empacotado no ZIP enviado a Web Store. Nao usamos eval(), import dinamico, nem buscamos scripts hospedados externamente. Os unicos dados externos consumidos sao respostas JSON do nosso proprio backend Merlin (chamadas API autenticadas).
```

### Data usage — declare what you collect

Tick the categories that apply:

- [x] **Personally identifiable information** — name, email (auth via Google OAuth)
- [x] **Authentication information** — Firebase ID token (chrome.storage.session)
- [x] **Location** — postal address (voluntary, stored locally only)
- [x] **Website content** — Gupy form labels read locally; question text optionally sent to Merlin AI when user requests assistance

Tick the affirmations (mandatory):

- [x] I do not sell user data to third parties
- [x] I do not use or transfer user data for purposes unrelated to the item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### ⚠️ Final certification checkbox

At the bottom of the Privacy tab there's a **"I certify that my data usage complies with the Developer Program Policies"** checkbox. **Tick it.** Without this the submit button stays disabled.

---

## Sidebar: Distribution

- **Visibility**: Public
- **Distribution method**: Public listing
- **Regions**: All countries (or limit to Brazil — your call)
- **Pricing**: Free

---

## Sidebar: Access → Test instructions

The reviewer will need a Merlin account with at least one resume uploaded.
Paste this:

```
Test account:
  Email: [create a test account at https://merlincv.com and paste credentials here]
  Password: [paste]

Setup steps:
1. Sign in to the extension popup with the test account
2. Fill the PII form (CPF, phone — sample values are fine)
3. Visit https://merlincv.com/dashboard/vagas — there should be matched jobs
4. Select 1-2 jobs and click "Aplicar em lote"
5. The extension will open the Gupy job pages in background tabs and fill the application forms

Notes for reviewer:
- Personal data (CPF, RG, mother's name, address) is stored exclusively in chrome.storage.local. It never leaves the browser. Verify by opening the service worker console and inspecting requests — no PII keys appear in any payload to merlincv.com or merlin-backend.
- The extension's single purpose is automating Gupy job applications. It does not interact with any site other than gupy.io and merlincv.com.
```

---

# 🚨 BEFORE you click "Submit for review"

The extension will fail to sign in unless the OAuth + Firebase configs include
the new published ID. Do these in this order:

## 1. Add OAuth redirect URI

Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (the one used
for the extension).

Add to "Authorized redirect URIs":

```
https://gpnbdjkdalnalehhfajgapalhlogbbbd.chromiumapp.org/
```

(Keep the old `pckpedgci…` URI — it's still used by your local unpacked dev install.)

## 2. Add Firebase Auth authorized domain

Firebase Console → Authentication → Settings → Authorized domains → Add:

```
gpnbdjkdalnalehhfajgapalhlogbbbd.chromiumapp.org
```

## 3. Update backend CORS allowlist

The `CHROME_EXTENSION_ORIGIN` env var on Cloud Run now accepts a
comma-separated list (just shipped). Set it to both IDs:

```
CHROME_EXTENSION_ORIGIN=chrome-extension://pckpedgciidgclkelofcicgaeelcicea,chrome-extension://gpnbdjkdalnalehhfajgapalhlogbbbd
```

GCP Console → Cloud Run → `merlin-backend` → Edit & Deploy New Revision →
Variables & Secrets → update `CHROME_EXTENSION_ORIGIN` → Deploy.

## 4. (Optional, recommended) sync local dev to published ID

In the Web Store dashboard, find the **public key** Google generated for your
extension (sidebar: **Package** → look for "Public key" or "Show public key").
Copy that base64 string and replace the `key` field in `extension/manifest.json`.
After that, your local unpacked dev install will get the same ID
(`gpnbdjkdalnalehhfajgapalhlogbbbd`) as the published one.

You can skip this step initially and use both IDs in parallel — but
eventually consolidating to one ID simplifies everything.

## 5. Submit

Once #1, #2, #3 are done, hit "Submit for review". Typical review window:
1–3 business days.
