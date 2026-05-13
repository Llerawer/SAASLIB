import { cn } from "@/lib/utils";

type Props = {
  text: string;
  word: string;
  /** Accepted for API compat with the deck player. Currently a no-op:
   *  the audio loop + progress scrubber already communicate "starting
   *  over"; a visual pulse on the highlighted word added flicker on
   *  remount with no net signal. */
  pulseKey?: number;
};

export function Highlighted({ text, word }: Props) {
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
            key={i}
            className={cn(
              // --captured is the project token for "captured word in reader"
              // — same semantic as the target word in this deck. Inherit text
              // color from surrounding prose so the highlight signals via bg
              // alone, keeping reading flow intact.
              "bg-captured text-foreground",
              "rounded px-0.5 font-medium",
              "[box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
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
