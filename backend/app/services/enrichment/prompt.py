"""Single source of truth for the enrichment prompt.

Both Gemini and Groq use the same SYSTEM + USER pair, so apples-to-apples
comparison stays clean when we swap providers. Iterate phrasing here in
one place.

The output JSON shape is documented in
`supabase/migrations/00000000000022_card_enrichment.sql`. Backend appends
`model` and `version` to the model's response before persisting — they
are NOT requested from the model itself.
"""
from __future__ import annotations

# Bumped when the prompt changes meaningfully. Persisted under
# `enrichment.version` so future runs can flag entries to re-enrich.
PROMPT_VERSION = 1

SYSTEM_INSTRUCTION = """\
You are a linguist annotating English vocabulary for a Spanish-speaking learner using an SRS flashcard app.

Your job is to analyze the target word IN CONTEXT and return concise, accurate, pedagogically useful annotations.

Return STRICT JSON ONLY.
Do not use markdown fences.
Do not explain your reasoning.
Do not add commentary before or after the JSON.
Do not output trailing text.

Rules:
- If a field does not apply, use null.
- All enum-like values MUST be lowercase.
- "synonyms" must contain at most 3 items.
- Keep "notes" to a single short sentence in Spanish.
- Infer meaning from the CONTEXT sentence, not the isolated word.
- Prefer practical learner usefulness over linguistic theory.
- Use straight ASCII quotes inside string values (avoid typographic curly quotes — they break JSON parsers).

Return a JSON object with EXACTLY these keys:

{
  "pos": string,
  "tense": string | null,
  "lemma": string,
  "phrasal": {
    "head": string,
    "particle": string,
    "meaning_es": string
  } | null,
  "cefr": string,
  "register": string,
  "is_idiom": boolean,
  "false_friend_warning": string | null,
  "synonyms": string[],
  "notes": string | null
}

Allowed examples:
- pos: "verb", "noun", "adj", "adv", "prep", "pronoun"
- tense: "past_simple", "present_simple", "present_continuous", "past_perfect", etc.
- cefr: "a1", "a2", "b1", "b2", "c1", "c2"
- register: "neutral", "formal", "informal", "slang"
"""

# Few-shot example anchors the model on a concrete output shape — measurably
# improves JSON consistency across providers.
EXAMPLE_INPUT = """\
Word: "wished"
Context sentence: I wished for a quieter house when I moved.\
"""

EXAMPLE_OUTPUT = """\
{
  "pos": "verb",
  "tense": "past_simple",
  "lemma": "wish",
  "phrasal": {
    "head": "wish",
    "particle": "for",
    "meaning_es": "desear algo"
  },
  "cefr": "a2",
  "register": "neutral",
  "is_idiom": false,
  "false_friend_warning": null,
  "synonyms": ["wanted", "desired", "hoped"],
  "notes": "'wish for' expresa un deseo que no necesariamente es real."
}\
"""

USER_PROMPT_TEMPLATE = """\
Annotate this English word for the learner's flashcard.

Word: "{word}"
Context sentence: {context}

Output JSON only.\
"""


def build_user_prompt(word: str, context: str | None) -> str:
    """Render the per-card user prompt. Empty/None context becomes
    "(no context provided ...)" so the model knows it has only the
    lemma to work with — accuracy on tense/phrasal naturally drops."""
    ctx = context.strip() if context else ""
    if not ctx:
        ctx = "(no context provided — analyze word in isolation)"
    return USER_PROMPT_TEMPLATE.format(word=word, context=ctx)
