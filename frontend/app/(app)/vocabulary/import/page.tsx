"use client";

import { useState } from "react";
import { Copy, Sparkles, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";

import {
  useCapturesList,
  useBatchPrompt,
  useParseAi,
  usePromoteCaptures,
  type Capture,
  type ParsedAiCard,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";

type EditableCard = ParsedAiCard & { _accepted: boolean };

export default function ImportPage() {
  const captures = useCapturesList({ promoted: false, limit: 200 });
  const batchPrompt = useBatchPrompt();
  const parseAi = useParseAi();
  const promote = usePromoteCaptures();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiText, setAiText] = useState("");
  const [previewCards, setPreviewCards] = useState<EditableCard[]>([]);

  function toggleSelect(id: string) {
    setSelected((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generatePrompt() {
    if (selected.size === 0) {
      toast.error("Selecciona al menos una palabra");
      return;
    }
    try {
      const r = await batchPrompt.mutateAsync({ capture_ids: [...selected] });
      await navigator.clipboard.writeText(r.markdown);
      toast.success(`Prompt copiado (${r.count} palabras)`);
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  async function parseResponse() {
    if (!aiText.trim()) {
      toast.error("Pega la respuesta de la IA primero");
      return;
    }
    setPreviewCards([]);
    try {
      const r = await parseAi.mutateAsync({ text: aiText, language: "en" });
      // Show progressively (chunked via setTimeout) — feels less janky on big lists.
      let i = 0;
      const step = () => {
        if (i >= r.cards.length) return;
        const slice = r.cards.slice(i, i + 5).map((c) => ({ ...c, _accepted: true }));
        setPreviewCards((prev) => [...prev, ...slice]);
        i += 5;
        if (i < r.cards.length) setTimeout(step, 30);
      };
      step();
      if (r.errors.length > 0) {
        toast.warning(
          `${r.cards.length} parseadas, ${r.errors.length} con error`,
        );
      } else {
        toast.success(`${r.cards.length} tarjetas listas para revisar`);
      }
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  function updateCard(idx: number, patch: Partial<EditableCard>) {
    setPreviewCards((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  }

  const accepted = previewCards.filter((c) => c._accepted);
  const invalid = accepted.filter((c) => !c.word || !c.translation);

  async function createCards() {
    if (accepted.length === 0 || invalid.length > 0) return;
    if (selected.size === 0) {
      toast.error(
        "Necesitas seleccionar las captures correspondientes en la lista",
      );
      return;
    }
    try {
      const r = await promote.mutateAsync({
        capture_ids: [...selected],
        ai_data: accepted.map((c) => ({
          word: c.word,
          translation: c.translation,
          definition: c.definition,
          ipa: c.ipa,
          cefr: c.cefr,
          mnemonic: c.mnemonic,
          examples: c.examples,
          tip: c.tip,
        })),
      });
      toast.success(
        `${r.created_count} nuevas + ${r.merged_count} mergeadas`,
      );
      setSelected(new Set());
      setAiText("");
      setPreviewCards([]);
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Enriquecer con IA externa</h1>
      <p className="text-sm text-muted-foreground mb-6">
        1) Selecciona palabras y copia el prompt 2) Pégalo en Claude/ChatGPT
        3) Pega la respuesta abajo y crea las tarjetas.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: select captures + generate prompt */}
        <section className="space-y-3">
          <h2 className="font-semibold">1. Palabras a procesar</h2>
          <div className="border rounded-lg max-h-[300px] overflow-y-auto divide-y">
            {(captures.data ?? []).map((c) => (
              <CaptureRow
                key={c.id}
                capture={c}
                selected={selected.has(c.id)}
                onToggle={() => toggleSelect(c.id)}
              />
            ))}
            {captures.data?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground text-center">
                Inbox vacío.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={generatePrompt}
              disabled={selected.size === 0 || batchPrompt.isPending}
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-1" /> Copiar prompt ({selected.size})
            </Button>
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-1" /> Claude
              </Button>
            </a>
          </div>
        </section>

        {/* RIGHT: paste response + parse + preview */}
        <section className="space-y-3">
          <h2 className="font-semibold">2. Respuesta de la IA</h2>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Pega aquí la respuesta YAML de Claude/ChatGPT…"
            rows={8}
            className="w-full border rounded p-3 text-sm font-mono"
          />
          <Button
            onClick={parseResponse}
            disabled={!aiText.trim() || parseAi.isPending}
            className="w-full"
          >
            <Sparkles className="h-4 w-4 mr-1" /> Parsear respuesta
          </Button>
        </section>
      </div>

      {/* Preview */}
      {previewCards.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              3. Preview ({accepted.length} aceptadas
              {invalid.length > 0 ? ` · ${invalid.length} inválidas` : ""})
            </h2>
            <Button
              onClick={createCards}
              disabled={
                accepted.length === 0 ||
                invalid.length > 0 ||
                selected.size === 0 ||
                promote.isPending
              }
            >
              <Check className="h-4 w-4 mr-1" /> Crear {accepted.length} tarjetas
            </Button>
          </div>
          {invalid.length > 0 && (
            <p className="text-sm text-red-600 mb-3">
              Hay {invalid.length} tarjetas sin word o translation. Corrígelas o
              desmárcalas para continuar.
            </p>
          )}
          <div className="space-y-3">
            {previewCards.map((c, idx) => (
              <PreviewCardRow
                key={idx}
                card={c}
                onChange={(patch) => updateCard(idx, patch)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CaptureRow({
  capture,
  selected,
  onToggle,
}: {
  capture: Capture;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-accent ${selected ? "bg-accent" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{capture.word}</div>
        {capture.context_sentence && (
          <div className="text-xs text-muted-foreground line-clamp-1">
            {capture.context_sentence}
          </div>
        )}
      </div>
      {capture.tags.map((t) => (
        <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">
          [{t}]
        </span>
      ))}
    </label>
  );
}

function PreviewCardRow({
  card,
  onChange,
}: {
  card: EditableCard;
  onChange: (patch: Partial<EditableCard>) => void;
}) {
  const invalid = !card.word || !card.translation;
  return (
    <div
      className={`border rounded-lg p-3 ${invalid ? "border-red-400 bg-red-50/30" : ""} ${!card._accepted ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          checked={card._accepted}
          onChange={(e) => onChange({ _accepted: e.target.checked })}
        />
        <input
          type="text"
          value={card.word}
          onChange={(e) => onChange({ word: e.target.value })}
          className="font-semibold border rounded px-2 py-1 text-sm flex-1"
          placeholder="palabra"
        />
        {card.cefr && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {card.cefr}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div>
          <label className="text-xs text-muted-foreground">Traducción</label>
          <input
            type="text"
            value={card.translation ?? ""}
            onChange={(e) => onChange({ translation: e.target.value })}
            className={`w-full border rounded px-2 py-1 ${!card.translation ? "border-red-400" : ""}`}
            placeholder="traducción al español"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">IPA</label>
          <input
            type="text"
            value={card.ipa ?? ""}
            onChange={(e) => onChange({ ipa: e.target.value })}
            className="w-full border rounded px-2 py-1"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Definición</label>
          <textarea
            value={card.definition ?? ""}
            onChange={(e) => onChange({ definition: e.target.value })}
            rows={2}
            className="w-full border rounded px-2 py-1 resize-none"
          />
        </div>
        {card.mnemonic && (
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Mnemotecnia</label>
            <textarea
              value={card.mnemonic ?? ""}
              onChange={(e) => onChange({ mnemonic: e.target.value })}
              rows={2}
              className="w-full border rounded px-2 py-1 resize-none"
            />
          </div>
        )}
      </div>
      {card.examples.length > 0 && (
        <ul className="mt-2 text-xs text-muted-foreground space-y-1">
          {card.examples.slice(0, 3).map((ex, i) => (
            <li key={i} className="italic">
              · {ex}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
