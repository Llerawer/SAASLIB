"""Generate the markdown prompt the user pastes into Claude/ChatGPT.

The output asks the LLM to return YAML in a specific shape, which
ai_response_parser.py then ingests.
"""
from __future__ import annotations

PROMPT_HEADER = """Eres un profesor experto de inglés para hispanohablantes. \
Para cada palabra que sigue, devuelve **YAML** con esta forma EXACTA:

```yaml
- word: gleaming
  translation: brillante, reluciente
  definition: shining brightly with reflected light
  ipa: /ˈɡliːmɪŋ/
  cefr: B2
  mnemonic: <solo si la palabra tiene [MNEMO]>
  examples:
    - "The lake was gleaming under the moonlight."
    - "Her gleaming eyes betrayed her excitement."
  tip: <consejo memorable, breve>
```

Reglas estrictas:
- Devuelve SOLO YAML. Sin texto antes ni después.
- Una entrada por palabra de la lista.
- Si la palabra tiene [MNEMO], incluye `mnemonic` con una imagen mental clara.
- Si tiene [EJEMPLOS], devuelve 5 ejemplos en lugar de 2.
- Si tiene [ETIMOLOGIA], añade campo `etymology`.
- Si tiene [GRAMATICA], añade campo `grammar` con análisis de la frase.
- `translation`: 1-3 traducciones separadas por coma.
- `definition`: en inglés, una sola línea.

Palabras:
"""


def build_prompt(captures: list[dict]) -> str:
    """captures: list of {word, word_normalized, context_sentence, tags, page_or_location}."""
    lines = [PROMPT_HEADER.rstrip(), ""]
    for i, c in enumerate(captures, start=1):
        word = c.get("word") or c.get("word_normalized") or ""
        tags = c.get("tags") or []
        tag_str = " ".join(f"[{t}]" for t in tags)
        ctx = c.get("context_sentence") or ""
        loc = c.get("page_or_location") or ""
        loc_str = f" (loc: {loc})" if loc else ""
        ctx_str = f' — contexto: "{ctx}"' if ctx else ""
        prefix = f"{i}. **{word}**"
        if tag_str:
            prefix += f" {tag_str}"
        lines.append(f"{prefix}{ctx_str}{loc_str}")
    return "\n".join(lines)
