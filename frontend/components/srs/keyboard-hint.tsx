import { Kbd } from "./kbd";

export function KeyboardHint() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Kbd>Espacio</Kbd> voltear
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>1</Kbd>–<Kbd>4</Kbd> calificar
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>U</Kbd> deshacer
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>E</Kbd> editar
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>S</Kbd>
        <Kbd>R</Kbd>
        <Kbd>F</Kbd>
        <Kbd>B</Kbd>
        menú
      </span>
    </div>
  );
}
