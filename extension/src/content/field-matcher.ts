/**
 * Field matcher — 3-tier strategy for filling form fields.
 *
 * Tier 1 (PII):          Client-side matching from chrome.storage.local — no network calls
 * Tier 2 (Conservative): Hardcoded "Não" for family/former-employee questions
 * Tier 3 (LLM):          Unmatched fields sent to backend /api/autoapply/answer-fields
 */

import type { PiiProfile } from "../lib/types";
import { getPiiProfile } from "../lib/pii-store";
import { apiPost } from "../lib/api-client";
import type { ScrapedField } from "./dom/helpers";

/**
 * Result of matching a single field.
 */
export interface FieldMatchResult {
  field: ScrapedField;
  value: string | null; // The answer value, null if needs human
  source: "pii" | "conservative" | "llm" | "needs_human";
}

// --- Tier 1: PII field patterns (case-insensitive label matching) ---

interface PiiPattern {
  patterns: string[]; // Substrings to match in the label (case-insensitive)
  exclude?: string[]; // If any of these substrings are present, skip this matcher
  getValue: (pii: PiiProfile) => string;
}

/** Convert YYYY-MM-DD (HTML date input) to DD/MM/YYYY (Brazilian format). */
function toBrazilianDate(dateStr: string): string {
  if (!dateStr) return "";
  // Already in DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  // Convert from YYYY-MM-DD
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return dateStr;
}

const PII_MATCHERS: PiiPattern[] = [
  { patterns: ["cpf"], getValue: (pii) => pii.cpf },
  {
    // Match "RG" only when it's the document number itself, not issuing authority or date
    patterns: ["rg ", " rg", "identidade"],
    exclude: ["órgão", "orgao", "emissão", "emissao", "estado de emissão", "expedição", "expedicao", "data de"],
    getValue: (pii) => pii.rg,
  },
  {
    patterns: [
      "nome da mãe",
      "nome da mae",
      "nome materno",
      "filiação materna",
      "filiacao materna",
    ],
    getValue: (pii) => pii.motherName,
  },
  {
    // Match birth DATE specifically, not "nascimento" in general (which could mean birthplace)
    patterns: ["data de nascimento", "data nascimento", "date of birth"],
    exclude: ["cidade", "naturalidade", "local de nascimento", "estado de nascimento"],
    getValue: (pii) => toBrazilianDate(pii.birthDate),
  },
  {
    patterns: ["deficiência", "deficiencia", "pcd", "pessoa com deficiência"],
    getValue: (pii) => pii.disability,
  },
  {
    patterns: ["gênero", "genero", "sexo"],
    getValue: (pii) => pii.gender,
  },
  {
    patterns: ["etnia", "raça", "raca", "cor"],
    getValue: (pii) => pii.ethnicity,
  },
  { patterns: ["estado civil"], getValue: (pii) => pii.maritalStatus },
  {
    patterns: ["telefone", "celular", "whatsapp", "phone"],
    getValue: (pii) => pii.phone,
  },
  {
    patterns: ["cep", "código postal", "codigo postal", "zip"],
    getValue: (pii) => pii.address.zip,
  },
  { patterns: ["cidade", "city"], exclude: ["nascimento", "naturalidade"], getValue: (pii) => pii.address.city },
  { patterns: ["estado", "uf", "state"], exclude: ["nascimento", "civil", "emissão", "emissao"], getValue: (pii) => pii.address.state },
  {
    patterns: [
      "endereço",
      "endereco",
      "rua",
      "logradouro",
      "street",
      "address",
    ],
    getValue: (pii) => pii.address.street,
  },
];

// --- Tier 2: Conservative hardcoded answers ---

interface ConservativePattern {
  patterns: string[];
  value: string;
}

const CONSERVATIVE_MATCHERS: ConservativePattern[] = [
  {
    patterns: [
      "parente",
      "familiar na empresa",
      "familiar empregado",
      "algum parente",
    ],
    value: "Não",
  },
  {
    patterns: [
      "ex-funcionário",
      "ex-funcionario",
      "trabalhou anteriormente",
      "já trabalhou",
      "ja trabalhou",
      "ex funcionário",
    ],
    value: "Não",
  },
  {
    // "Someone who works at this company referred you?" / "Alguém indicou?"
    patterns: [
      "referred",
      "indicou",
      "indicação",
      "indicacao",
      "referr",
    ],
    value: "No",
  },
  {
    // "Do you work at [company]?" / "Você trabalha na"
    patterns: [
      "do you work at",
      "you work at",
      "trabalha na",
      "trabalha no",
      "trabalha em",
      "funcionário da",
      "funcionario da",
    ],
    value: "No",
  },
];

// --- Matching Logic ---

function matchPii(label: string, pii: PiiProfile): string | null {
  const lower = label.toLowerCase();
  for (const matcher of PII_MATCHERS) {
    // Check exclusions first — if any exclude pattern matches, skip this matcher
    if (matcher.exclude?.some((ex) => lower.includes(ex))) continue;

    for (const pattern of matcher.patterns) {
      if (lower.includes(pattern)) {
        const value = matcher.getValue(pii);
        return value || null; // Return null if PII field is empty
      }
    }
  }
  return null;
}

function matchConservative(label: string): string | null {
  const lower = label.toLowerCase();
  for (const matcher of CONSERVATIVE_MATCHERS) {
    for (const pattern of matcher.patterns) {
      if (lower.includes(pattern)) {
        return matcher.value;
      }
    }
  }
  return null;
}

/**
 * Match and fill all form fields using the 3-tier strategy.
 * Returns results for each field with the source of the answer.
 */
export async function matchAndFillFields(
  fields: ScrapedField[],
  jobUrl: string,
  companyName: string,
): Promise<FieldMatchResult[]> {
  const results: FieldMatchResult[] = [];
  const unmatchedFields: ScrapedField[] = [];

  // Load PII profile from local storage
  const pii = await getPiiProfile();

  // --- Pass 1: Tier 1 (PII) + Tier 2 (Conservative) ---
  for (const field of fields) {
    // Skip file inputs — out of scope
    if ((field.type as string) === "file") {
      results.push({ field, value: null, source: "needs_human" });
      continue;
    }

    // Tier 1: PII matching
    if (pii) {
      const piiValue = matchPii(field.label, pii);
      if (piiValue !== null) {
        results.push({ field, value: piiValue, source: "pii" });
        continue;
      }
    }

    // Tier 2: Conservative hardcoded
    const conservativeValue = matchConservative(field.label);
    if (conservativeValue !== null) {
      results.push({ field, value: conservativeValue, source: "conservative" });
      continue;
    }

    // Unmatched — queue for Tier 3
    unmatchedFields.push(field);
  }

  // --- Pass 2: Tier 3 (LLM via backend) ---
  if (unmatchedFields.length > 0) {
    try {
      const llmFields = unmatchedFields.map((f) => ({
        label: f.label,
        type: f.type,
        options: f.options,
        required: f.required,
      }));

      const response = await apiPost<{
        answers: Record<string, string>;
        needs_human: string[];
      }>("/api/autoapply/answer-fields", {
        fields: llmFields,
        job_url: jobUrl,
        company_name: companyName,
      });

      for (const field of unmatchedFields) {
        if (response.needs_human.includes(field.label)) {
          results.push({ field, value: null, source: "needs_human" });
        } else if (response.answers[field.label]) {
          results.push({
            field,
            value: response.answers[field.label],
            source: "llm",
          });
        } else {
          results.push({ field, value: null, source: "needs_human" });
        }
      }
    } catch (error) {
      // LLM call failed — mark all unmatched as needs_human
      console.error("[FieldMatcher] LLM call failed:", error);
      for (const field of unmatchedFields) {
        results.push({ field, value: null, source: "needs_human" });
      }
    }
  }

  return results;
}

/**
 * For select/radio fields, find the best matching option from the available options.
 * Handles slight text variations (case, whitespace, accents).
 */
export function findBestOption(
  options: string[],
  targetValue: string,
): string | null {
  if (!options.length || !targetValue) return null;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Remove accents

  const normalizedTarget = normalize(targetValue);

  // Exact match (normalized)
  for (const opt of options) {
    if (normalize(opt) === normalizedTarget) return opt;
  }

  // Substring match
  for (const opt of options) {
    if (
      normalize(opt).includes(normalizedTarget) ||
      normalizedTarget.includes(normalize(opt))
    ) {
      return opt;
    }
  }

  return null;
}
