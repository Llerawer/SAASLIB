/**
 * LLM-generated enrichment payload attached to a card by the backend
 * worker (see `backend/app/services/enrichment/`). Shape mirrors the
 * JSON in `supabase/migrations/00000000000022_card_enrichment.sql`.
 *
 * All fields are optional / nullable so the UI degrades gracefully:
 *   - card with no enrichment yet  → no chips, normal card
 *   - card with partial enrichment → renders only the chips it has
 *   - card with unknown enum value → renders the raw string
 *
 * The backend prompt forces lowercase enums but UI must NOT break on
 * unexpected values from future prompt revisions.
 */

export type EnrichmentPos =
  | "verb"
  | "noun"
  | "adj"
  | "adv"
  | "prep"
  | "pronoun"
  | "conj"
  | "interj"
  | "det"
  | "other"
  | string; // tolerate unknown values from prompt drift

export type EnrichmentTense =
  | "past_simple"
  | "past_perfect"
  | "present_simple"
  | "present_continuous"
  | "present_perfect"
  | "future_simple"
  | "conditional"
  | "imperative"
  | "infinitive"
  | "gerund"
  | "past_participle"
  | string;

export type EnrichmentRegister =
  | "neutral"
  | "formal"
  | "informal"
  | "slang"
  | "vulgar"
  | "literary"
  | "archaic"
  | string;

export type EnrichmentCefr = "a1" | "a2" | "b1" | "b2" | "c1" | "c2" | string;

export type EnrichmentPhrasal = {
  head: string;
  particle: string;
  meaning_es: string;
};

export type Enrichment = {
  pos?: EnrichmentPos | null;
  tense?: EnrichmentTense | null;
  lemma?: string | null;
  phrasal?: EnrichmentPhrasal | null;
  cefr?: EnrichmentCefr | null;
  register?: EnrichmentRegister | null;
  is_idiom?: boolean | null;
  false_friend_warning?: string | null;
  synonyms?: string[] | null;
  notes?: string | null;
  // Backend-stamped, not from model:
  model?: string;
  version?: number;
};

// ---------------------------------------------------------------------------
// Display helpers — keep mapping logic here so chip components stay dumb.
// ---------------------------------------------------------------------------

const POS_LABEL_ES: Record<string, string> = {
  verb: "verbo",
  noun: "sustantivo",
  adj: "adjetivo",
  adv: "adverbio",
  prep: "preposición",
  pronoun: "pronombre",
  conj: "conjunción",
  interj: "interjección",
  det: "determinante",
};

const TENSE_LABEL_ES: Record<string, string> = {
  past_simple: "pasado simple",
  past_perfect: "pasado perfecto",
  present_simple: "presente",
  present_continuous: "presente continuo",
  present_perfect: "presente perfecto",
  future_simple: "futuro",
  conditional: "condicional",
  imperative: "imperativo",
  infinitive: "infinitivo",
  gerund: "gerundio",
  past_participle: "participio",
};

const REGISTER_LABEL_ES: Record<string, string> = {
  neutral: "neutro",
  formal: "formal",
  informal: "informal",
  slang: "argot",
  vulgar: "vulgar",
  literary: "literario",
  archaic: "arcaico",
};

export function posLabel(pos: string | null | undefined): string | null {
  if (!pos) return null;
  return POS_LABEL_ES[pos] ?? pos;
}

export function tenseLabel(tense: string | null | undefined): string | null {
  if (!tense) return null;
  return TENSE_LABEL_ES[tense] ?? tense.replace(/_/g, " ");
}

export function registerLabel(reg: string | null | undefined): string | null {
  if (!reg) return null;
  return REGISTER_LABEL_ES[reg] ?? reg;
}
