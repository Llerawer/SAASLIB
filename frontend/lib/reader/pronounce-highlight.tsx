import { cn } from "@/lib/utils";

type Props = {
  text: string;
  word: string;
  /** When this number changes, the highlighted <mark> re-mounts and the
   *  pulse CSS animation re-fires. The deck increments this on each loop
   *  to give a visible "vuelve a empezar" cue. The gallery omits it.
   */
  pulseKey?: number;
};

export function Highlighted({ text, word, pulseKey = 0 }: Props) {
  if (!word) return <>{text}</>;
  const lower = word.toLowerCase();
  const re = new RegExp(
    `\\b(${escapeRegex(lower)}(?:s|es|ed|ing|'s)?)\\b`,
    "gi",
  );
  const parts: Array<string | { match: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push({ match: m[0] });
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <mark
            key={`${i}-${pulseKey}`}
            className={cn(
              // Highlighter-yellow that reads in both themes:
              // light → solid yellow-200, dark → softened yellow-300/40
              // text-yellow-950 keeps contrast on both.
              "bg-yellow-200 dark:bg-yellow-300/40 text-yellow-950 dark:text-yellow-50",
              "rounded px-0.5 font-medium",
              "[box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
              pulseKey > 0 && "animate-pulse-once",
            )}
          >
            {p.match}
          </mark>
        ),
      )}
    </>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
