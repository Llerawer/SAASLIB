"""Single source of truth for the enrichment prompt.

Both Gemini and Groq use the same prompt. Keeping it here lets us iterate
on phrasing in one place + run apples-to-apples comparisons between
providers when we want to swap.

The output JSON shape is documented in
`supabase/migrations/00000000000022_card_enrichment.sql`. The schema is
permissive (JSONB) so we can extend without migrating.
"""
from __future__ import annotations

# Bumped when the prompt changes meaningfully. Stored under enrichment.version
# so we know which entries need re-enrich after a prompt revision.
PROMPT_VERSION = 1

SYSTEM_INSTRUCTION = """\
You are a linguist annotating English vocabulary for a Spanish-speaking
learner using an SRS app. Be concise, accurate, and pedagogically useful.
Return STRICT JSON only — no markdown fences, no commentary, no trailing
text. If a field doesn't apply, use null (not empty string, not "N/A").
"""

USER_PROMPT_TEMPLATE = """\
Annotate this English word for the learner's flashcard.

Word: "{word}"
Context sentence: {context}

Return a JSON object with exactly these keys:
- "pos": part of speech, one of: "verb" | "noun" | "adj" | "adv" | "prep" | "conj" | "interj" | "det" | "pron" | "other"
- "tense": if pos is "verb", one of: "past_simple" | "past_perfect" | "present_simple" | "present_progressive" | "present_perfect" | "future_simple" | "conditional" | "imperative" | "infinitive" | "gerund" | "past_participle". Otherwise null.
- "lemma": the dictionary base form (e.g. "wished" → "wish", "running" → "run", "geese" → "goose").
- "phrasal": if the context indicates this is part of a phrasal verb, an object {{"head": "<verb>", "particle": "<particle>", "meaning_es": "<short Spanish meaning>"}}. Otherwise null.
- "cefr": estimated CEFR level for this word (not the sentence): "A1" | "A2" | "B1" | "B2" | "C1" | "C2".
- "register": "neutral" | "formal" | "informal" | "slang" | "vulgar" | "literary" | "archaic".
- "is_idiom": boolean — true if the word is part of a fixed idiom in this context (e.g. "kick the bucket"), false otherwise.
- "false_friend_warning": short Spanish warning if this is a common Spanish-English false friend (e.g. "actually" / "actualmente"). Otherwise null.
- "synonyms": array of up to 3 close English synonyms, ordered by frequency. Empty array if none apply.
- "notes": optional 1-sentence pedagogical note in Spanish (e.g. "se confunde con X"). Null if nothing useful to add.

Output JSON only.
"""


def build_user_prompt(word: str, context: str | None) -> str:
    """Render the per-card user prompt. Empty/None context is rendered
    as "(no context)" so the model knows it has only the lemma to work
    with — accuracy on tense/phrasal will naturally be lower."""
    ctx = context.strip() if context else ""
    if not ctx:
        ctx = "(no context provided — analyze word in isolation)"
    return USER_PROMPT_TEMPLATE.format(word=word, context=ctx)
