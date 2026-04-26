"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  Sparkles,
  ExternalLink,
  Check,
  Wand2,
  ArrowLeft,
} from "lucide-react";
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
import { tagTone, sortTags } from "@/lib/vocabulary/tags";

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
      let i = 0;
      const step = () => {
        if (i >= r.cards.length) return;
        const slice = r.cards.slice(i, i + 5).map((c) => ({
          ...c,
          _accepted: true,
        }));
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
        "Necesitas seleccionar las capturas correspondientes en la lista",
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
        `${r.created_count} nuevas, ${r.merged_count} fusionadas`,
      );
      setSelected(new Set());
      setAiText("");
      setPreviewCards([]);
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  }

  const showPreview = previewCards.length > 0;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <Link
        href="/vocabulary"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a vocabulario
      </Link>

      <header className="relative mb-8 rounded-xl border bg-card overflow-hidden">
        <div
          className="absolute inset-0 opacity-50 dark:opacity-20 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, oklch(0.94 0.05 75 / 0.7) 0%, transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative px-5 sm:px-6 py-5 sm:py-6 flex items-start gap-4">
          <div className="shrink-0 inline-flex items-center justify-center size-10 rounded-md bg-accent/15 text-accent ring-1 ring-accent/30">
            <Wand2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-serif">
              Enriquecer con IA externa
            </h1>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xl">
              Selecciona capturas pendientes, copia el prompt, pégalo en Claude
              o ChatGPT y trae la respuesta para crear tarjetas.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Step number={1} title="Palabras a procesar">
          <div className="border rounded-lg max-h-[320px] overflow-y-auto divide-y bg-card">
            {(captures.data ?? []).map((c) => (
              <CaptureRow
                key={c.id}
                capture={c}
                selected={selected.has(c.id)}
                onToggle={() => toggleSelect(c.id)}
              />
            ))}
            {captures.data?.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground text-center">
                Inbox vacío. Captura palabras desde el reader primero.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={generatePrompt}
              disabled={selected.size === 0 || batchPrompt.isPending}
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Copiar prompt ({selected.size})
            </Button>
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink
                  className="h-4 w-4 mr-1.5"
                  aria-hidden="true"
                />
                Claude
              </Button>
            </a>
          </div>
        </Step>

        <Step number={2} title="Respuesta de la IA">
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Pega aquí la respuesta YAML de Claude o ChatGPT"
            rows={9}
            className="w-full border rounded-md p-3 text-sm font-mono bg-background focus-visible:ring-2 focus-visible:ring-ring outline-none"
            aria-label="Respuesta de la IA"
          />
          <Button
            onClick={parseResponse}
            disabled={!aiText.trim() || parseAi.isPending}
            className="w-full"
          >
            <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {parseAi.isPending ? "Parseando" : "Parsear respuesta"}
          </Button>
        </Step>
      </div>

      {showPreview && (
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <StepBadge number={3} />
              <div>
                <h2 className="font-semibold tracking-tight">Vista previa</h2>
                <p className="text-xs text-muted-foreground tabular">
                  {accepted.length} aceptadas
                  {invalid.length > 0 ? ` · ${invalid.length} inválidas` : ""}
                </p>
              </div>
            </div>
            <Button
              onClick={createCards}
              disabled={
                accepted.length === 0 ||
                invalid.length > 0 ||
                selected.size === 0 ||
                promote.isPending
              }
            >
              <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Crear {accepted.length} tarjetas
            </Button>
          </div>
          {invalid.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-md mb-3">
              Hay {invalid.length} tarjetas sin word o traducción. Corrígelas o
              desmárcalas para continuar.
            </div>
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

function StepBadge({ number }: { number: number }) {
  return (
    <span
      className="inline-flex items-center justify-center size-7 rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 text-sm font-bold tabular shrink-0"
      aria-hidden="true"
    >
      {number}
    </span>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <StepBadge number={number} />
        <h2 className="font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
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
      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/5 transition-colors ${
        selected ? "bg-accent/5" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="shrink-0 size-4 accent-accent"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{capture.word}</div>
        {capture.context_sentence && (
          <div className="text-xs text-muted-foreground line-clamp-1 font-serif italic">
            {capture.context_sentence}
          </div>
        )}
      </div>
      {sortTags(capture.tags).map((t) => (
        <span
          key={t}
          className={`text-xs px-1.5 py-0.5 rounded border ${tagTone(t)}`}
        >
          {t}
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
      className={`border rounded-lg p-3 bg-card ${
        invalid ? "border-destructive/50 bg-destructive/5" : ""
      } ${!card._accepted ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          checked={card._accepted}
          onChange={(e) => onChange({ _accepted: e.target.checked })}
          className="size-4 accent-accent"
          aria-label="Aceptar tarjeta"
        />
        <input
          type="text"
          value={card.word}
          onChange={(e) => onChange({ word: e.target.value })}
          className="font-semibold border rounded-md px-2 py-1.5 text-sm flex-1 bg-background focus-visible:ring-2 focus-visible:ring-ring outline-none"
          placeholder="palabra"
          aria-label="Palabra"
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
            className={`w-full border rounded-md px-2 py-1.5 bg-background focus-visible:ring-2 focus-visible:ring-ring outline-none ${
              !card.translation ? "border-destructive/50" : ""
            }`}
            placeholder="traducción al español"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">IPA</label>
          <input
            type="text"
            value={card.ipa ?? ""}
            onChange={(e) => onChange({ ipa: e.target.value })}
            className="w-full border rounded-md px-2 py-1.5 bg-background font-mono focus-visible:ring-2 focus-visible:ring-ring outline-none"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Definición</label>
          <textarea
            value={card.definition ?? ""}
            onChange={(e) => onChange({ definition: e.target.value })}
            rows={2}
            className="w-full border rounded-md px-2 py-1.5 resize-none bg-background font-serif focus-visible:ring-2 focus-visible:ring-ring outline-none"
          />
        </div>
        {card.mnemonic && (
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Mnemotecnia</label>
            <textarea
              value={card.mnemonic ?? ""}
              onChange={(e) => onChange({ mnemonic: e.target.value })}
              rows={2}
              className="w-full border rounded-md px-2 py-1.5 resize-none bg-background font-serif italic focus-visible:ring-2 focus-visible:ring-ring outline-none"
            />
          </div>
        )}
      </div>
      {card.examples.length > 0 && (
        <ul className="mt-2 text-xs text-muted-foreground space-y-1 font-serif">
          {card.examples.slice(0, 3).map((ex, i) => (
            <li key={i} className="italic pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-accent">
              {ex}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
