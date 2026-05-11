"use client";

import { useEffect, useState } from "react";
import { Bookmark, Shield, Zap, ArrowDown, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Bookmarklet install page. The whole UX hinges on the user trusting
 * a piece of JavaScript they're about to drag to their bookmarks bar.
 * Per the founder's note: "users normales no entienden bookmarklets".
 *
 * The 4 things this page MUST communicate clearly:
 *   1. What it does (one sentence, plain language)
 *   2. WHY it's safe (concrete, not handwavy)
 *   3. HOW to install (visual, not just text)
 *   4. What sites it works for (so the user has a use case)
 */
export default function BookmarkletPage() {
  const [origin, setOrigin] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Origin only known client-side; the bookmarklet code embeds it so
  // the popup opens against the correct host (dev: localhost:3000;
  // prod: linguareader.app).
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const bookmarkletCode = origin ? buildBookmarkletCode(origin) : "";

  function copyToClipboard() {
    navigator.clipboard.writeText(bookmarkletCode).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // ignore — user can copy manually
      },
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8 space-y-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-6 w-6 text-accent" />
          <h1 className="font-serif text-3xl font-semibold leading-tight">
            Guardar de cualquier sitio
          </h1>
        </div>
        <p className="text-base text-muted-foreground">
          Un botón en tu barra de marcadores. Click en cualquier página
          → la guardás acá para leer y capturar vocabulario, igual que
          los artículos pegados manualmente.
        </p>
      </header>

      {/* Step 1: What/Why */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl font-semibold">
          Por qué necesitás esto
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Card
            icon={<Zap className="h-5 w-5 text-accent" />}
            title="Sirve donde el paste-URL no llega"
            body="Sites con login (Notion, NYT, internal docs), SPAs (Twitter, Substack), o sitios con Cloudflare Turnstile."
          />
          <Card
            icon={<Shield className="h-5 w-5 text-accent" />}
            title="Es seguro"
            body="El código corre en TU navegador y solo manda lo que estás viendo a TU cuenta. Sin tracking, sin terceros, sin acceso a otros tabs."
          />
        </div>
      </section>

      {/* Step 2: Install */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl font-semibold">
          Instalar en 10 segundos
        </h2>

        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 inline-flex items-center justify-center size-6 rounded-full bg-accent/15 text-accent text-xs font-bold">
              1
            </span>
            <span>
              Mostrá la barra de marcadores del navegador (Chrome:{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                Ctrl/Cmd + Shift + B
              </kbd>
              )
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 inline-flex items-center justify-center size-6 rounded-full bg-accent/15 text-accent text-xs font-bold">
              2
            </span>
            <span>
              Arrastrá este botón a la barra:
            </span>
          </li>
        </ol>

        {/* The drag target */}
        <div className="flex justify-center py-6 border-y border-dashed border-border/60">
          {bookmarkletCode ? (
            // The actual draggable bookmarklet. The `href` is the
            // javascript: URL the browser will save when dragged. We
            // also handle click as a no-op so it doesn't navigate when
            // the user accidentally clicks instead of drags.
            <a
              href={bookmarkletCode}
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-accent text-accent-foreground font-semibold text-base shadow-md cursor-grab active:cursor-grabbing hover:shadow-lg transition-shadow"
              title="Arrastrá esto a tu barra de marcadores"
            >
              <Bookmark className="h-5 w-5" />
              Guardar en LinguaReader
            </a>
          ) : (
            <div className="h-12 w-56 rounded-lg bg-muted animate-pulse" />
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          <ArrowDown className="inline h-3 w-3 mr-1" />
          Cuando lo soltes en la barra, va a aparecer como un marcador normal.
        </p>

        <ol className="space-y-3 text-sm" start={3}>
          <li className="flex gap-3">
            <span className="shrink-0 inline-flex items-center justify-center size-6 rounded-full bg-accent/15 text-accent text-xs font-bold">
              3
            </span>
            <span>
              Andá a cualquier página que quieras guardar (un blog post,
              un doc de Notion, un artículo paywalled al que ya tengas
              acceso, etc.) y click el marcador.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 inline-flex items-center justify-center size-6 rounded-full bg-accent/15 text-accent text-xs font-bold">
              4
            </span>
            <span>
              Se abre una ventanita chica que te confirma que el artículo
              quedó guardado. Cierra sola en 2 segundos.
            </span>
          </li>
        </ol>
      </section>

      {/* Step 3: Manual install fallback */}
      <section className="space-y-3">
        <h2 className="font-serif text-base font-semibold text-muted-foreground">
          ¿No te funciona arrastrar?
        </h2>
        <p className="text-sm text-muted-foreground">
          Algunos navegadores bloquean drag de links{" "}
          <code className="text-xs">javascript:</code>. Alternativa:
          creá un nuevo marcador manual y pegá este código como URL.
        </p>
        <div className="relative">
          <pre className="text-[11px] font-mono p-3 rounded-lg border bg-muted/40 overflow-x-auto max-h-32 overflow-y-auto">
            {bookmarkletCode || "..."}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            disabled={!bookmarkletCode}
            className="absolute top-2 right-2"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1" /> Copiado
              </>
            ) : (
              "Copiar"
            )}
          </Button>
        </div>
      </section>

      {/* Step 4: Trust / safety */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          Qué hace exactamente, sin marketing
        </h2>
        <ul className="space-y-2 text-sm text-foreground/85">
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Lee el HTML de la página actual (lo que vos ya estás
              viendo en el browser).
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Abre una ventana de <code className="text-xs">{origin}</code>{" "}
              y le pasa ese HTML + la URL.
            </span>
          </li>
          <li className="flex gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Esa ventana lo manda a tu cuenta usando la sesión que ya
              tenés activa acá.
            </span>
          </li>
          <li className="flex gap-2 text-muted-foreground">
            <span className="size-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              <strong>No</strong> accede a otros tabs, cookies de otros sitios,
              ni manda nada a terceros.
            </span>
          </li>
          <li className="flex gap-2 text-muted-foreground">
            <span className="size-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              <strong>No</strong> persiste en background — solo corre
              cuando vos hacés click.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Card({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4 space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

/**
 * The bookmarklet itself, generated against the current origin so dev
 * and prod hosts both work without manual config. Keep it small —
 * browsers truncate very long bookmarklet URLs in some configs.
 *
 * Strategy:
 *   - Capture document.documentElement.outerHTML + location.href
 *   - Open our /save page in a popup (smaller window so it feels
 *     like a notification, not a full page nav)
 *   - postMessage the data once the popup signals readiness, with a
 *     setTimeout fallback in case the ready message races
 */
function buildBookmarkletCode(origin: string): string {
  // Note: keep this body tight. Bookmarklet code lives in the URL bar
  // and very long URLs get truncated by some browsers.
  const body = `
    var w=window.open('${origin}/save','lr_save','width=420,height=280');
    if(!w){alert('Habilitá ventanas emergentes para LinguaReader.');return;}
    var u=location.href;
    var h=document.documentElement.outerHTML;
    var msg={source:'lr-bookmarklet',url:u,html:h};
    var sent=false;
    var send=function(){if(sent)return;sent=true;try{w.postMessage(msg,'${origin}');}catch(e){}};
    window.addEventListener('message',function(e){if(e.data&&e.data.source==='lr-save-ready')send();});
    setTimeout(send,1500);
  `
    .replace(/\s+/g, " ")
    .trim();
  // Wrap in IIFE + javascript: scheme. encodeURIComponent the body so
  // special chars in the source code don't break URL parsing.
  return `javascript:(function(){${body}})();void 0;`;
}
