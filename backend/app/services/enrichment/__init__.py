"""LLM-powered card enrichment pipeline.

Pulls cards with NULL `enrichment` and asks a configured provider
(Gemini Flash / Groq Llama / future) to attach grammatical and
pedagogical metadata: POS, tense, phrasal verb detection, CEFR level,
register, false-friend warnings, and so on.

Capture and study flow are NEVER blocked by enrichment availability.
If every provider key is exhausted, cards stay NULL and the next cron
run retries — natural daily quota renewal restores service without
operator intervention.
"""
