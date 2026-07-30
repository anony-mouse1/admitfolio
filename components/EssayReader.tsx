'use client';

import { useEffect, useRef, useState } from 'react';
// Type-only, so TypeScript erases it: pdf.js stays out of the initial bundle
// and the dynamic import below is still what loads it. We need the type to hold
// a document proxy across awaits so cleanup can destroy it.
import type { PDFDocumentProxy } from 'pdfjs-dist';

// In-browser essay reader that renders each PDF page to a <canvas>.
//
// Why canvas and not an <iframe> or <embed>: the browser's built-in PDF viewer
// builds a selectable text layer and shows a download button. Rendering to
// canvas produces pixels only - there is no text node to select, so Cmd-A /
// Cmd-C come back empty, and there is no viewer chrome to save from.
//
// What this does NOT do, and cannot: the watermarked PDF bytes still reach the
// browser, so anyone who opens devtools can pull the file out of the network
// tab, and no web page can prevent a screenshot, a screen recording, or OCR.
// That is not a gap in this implementation - it is a property of displaying
// something on a screen someone else controls. The per-buyer watermark is what
// covers those cases: the copy they extract is stamped with their own email, so
// a leak identifies the leaker. See lib/watermark.ts.

type Props = {
  essayId: string;
  token: string;
  label: string;
};

export default function EssayReader({ essayId, token, label }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pages, setPages] = useState(0);
  const [open, setOpen] = useState(false);
  // The effect's re-run trigger, alongside open/essayId/token.
  //
  // Why a counter and not `state`: `state` used to be both a dependency of the
  // effect below and its entry guard, and the effect's first act was
  // setState('loading'). An async body runs synchronously up to its first
  // await, so that ran during the effect flush - React saw the dependency
  // change, ran the cleanup (setting that run's `cancelled` to true), then
  // re-entered and bailed on the guard. Every later `if (!cancelled)` in the
  // still-running closure then read true, so NEITHER outcome could reach the
  // UI: failures logged to the console only, and successes returned before a
  // single canvas was appended. Both ended on a spinner that never resolved.
  // Nothing here reads `state` any more, so that cannot recur.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;

    // `cancelled` now means exactly one thing: this run is stale because the
    // props changed, the buyer hit Try again, or the component unmounted. It is
    // never set as a side effect of our own state updates, so a failure that
    // happens while this run is current always reaches the buyer.
    let cancelled = false;
    let worker: Worker | null = null;
    let doc: PDFDocumentProxy | null = null;

    setState('loading');
    setPages(0);

    (async () => {
      try {
        // Loaded on demand so pdf.js is not in the page's initial bundle.
        //
        // Note the '/build/pdf.min.mjs' suffix - importing bare 'pdfjs-dist'
        // dies in `next dev` with "Object.defineProperty called on non-object".
        // pdfjs-dist's unminified build is itself a webpack bundle carrying a
        // top-level `var __webpack_exports__ = {}` (build/pdf.mjs line 49).
        // Next's dev devtool wraps every module in eval(); webpack renames the
        // nested bundle's other runtime identifiers but misses that one, so it
        // hoists and shadows the module factory's own __webpack_exports__
        // parameter, and pdf.mjs's first statement runs against undefined.
        // Terser mangles the variable out of the .min build, so the collision
        // cannot happen there. The real fix is webpack 5.103.0
        // (webpack/webpack#20095); Next 14.2.5 pins an older webpack and
        // reverts any devtool override in dev, so this is the lever we have.
        const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs');
        // Checked before the worker exists, so a run cancelled during the chunk
        // fetch never spawns one it would then have to clean up.
        if (cancelled) return;
        // Hand pdf.js a worker webpack bundles for us. `new URL(..., import.meta.url)`
        // is the form webpack 5 recognises, so the worker is emitted as a local
        // asset - no CDN, which matters because a CDN worker would be a third
        // party sitting in the path of every essay read.
        worker = new Worker(
          new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
          { type: 'module' },
        );
        pdfjs.GlobalWorkerOptions.workerPort = worker;

        const loaded = await pdfjs.getDocument({
          url: `/api/essay/${essayId}?t=${encodeURIComponent(token)}`,
          // Do not let pdf.js keep its own copy around longer than needed.
          disableAutoFetch: false,
          disableStream: false,
        }).promise;
        // If this run went stale while the PDF was downloading, the proxy that
        // just resolved is ours to dispose of - cleanup already ran, before
        // `doc` was ever assigned, so nothing else will free it.
        if (cancelled) {
          loaded.destroy().catch(() => {});
          return;
        }
        doc = loaded;

        setPages(doc.numPages);
        const host = holder.current;
        // Throw rather than return: a silent bail here strands `state` on
        // 'loading' forever, which is the same dead spinner in a different
        // disguise. Let it reach the catch and surface as something the buyer
        // can act on.
        if (!host) throw new Error('essay reader container missing');
        host.innerHTML = '';

        // Cap the render width so a large monitor doesn't request enormous
        // canvases; devicePixelRatio keeps it sharp on retina screens.
        const targetWidth = Math.min(host.clientWidth || 720, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (targetWidth / base.width) * dpr });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '14px';
          canvas.style.borderRadius = '8px';
          canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,.14)';
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas unavailable');
          host.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setState('ready');
      } catch (e) {
        // A stale run's rejection is expected noise, not a fault: destroying the
        // document in cleanup aborts any in-flight page render, and that abort
        // arrives here as a rejection. Only a live run's failure is worth
        // logging or showing.
        if (cancelled) return;
        // pdf.js puts the full request URL in its HTTP error text (e.g.
        // 'Unexpected server response (401) while retrieving PDF "<url>"'), and
        // that URL carries ?t=<accessToken>. Strip it before logging: the
        // console is the same principal as the address bar, so this is not an
        // escalation, but it keeps the token out of anything that later pipes
        // console output somewhere else (session replay, error reporting).
        const detail = e instanceof Error ? e.message.replace(/([?&]t=)[^&"\s]+/g, '$1[redacted]') : e;
        console.error('essay render failed:', detail);
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
      // pdf.js holds a dedicated worker and an open document per read. Without
      // this, every abandoned attempt - and every Try again - strands one of
      // each for the life of the page.
      doc?.destroy().catch(() => {});
      worker?.terminate();
    };
  }, [open, attempt, essayId, token]);

  return (
    <div className="essay-reader">
      <div className="essay-reader-head">
        <span>{label}</span>
        {(!open || state === 'error') && (
          <button
            type="button"
            onClick={() => {
              // One button, two jobs: open the reader the first time, and
              // re-arm the effect after a failure. Bumping `attempt` is what
              // actually restarts the load - `state` is deliberately not a
              // dependency of the effect, so setting it here would start
              // nothing.
              setOpen(true);
              setAttempt((n) => n + 1);
            }}
          >
            {state === 'error' ? 'Try again' : 'Read essay'}
          </button>
        )}
      </div>

      {open && (
        <>
          {state === 'loading' && <p className="essay-reader-note">Preparing your copy…</p>}
          {state === 'error' && (
            <p className="essay-reader-note">
              This essay couldn&apos;t be displayed. Try again, and if it still fails, reply to your
              purchase email and we&apos;ll sort it out.
            </p>
          )}
          {state === 'ready' && pages > 0 && (
            <p className="essay-reader-note">
              {pages} page{pages === 1 ? '' : 's'} · watermarked for your account
            </p>
          )}
          {/* onContextMenu is a speed bump, not a control - it stops the
              right-click "Save image as" reflex and nothing more. */}
          <div
            ref={holder}
            className="essay-reader-pages"
            onContextMenu={(e) => e.preventDefault()}
          />
        </>
      )}
    </div>
  );
}
