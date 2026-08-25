'use client';

import { useEffect, useRef, useState } from 'react';

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
// covers those cases: the copy they extract carries a private purchase
// fingerprint that maps back to its delivery record. See lib/watermark.ts.

type Props = {
  essayId: string;
  token: string;
  label: string;
};

export default function EssayReader({ essayId, token, label }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pages, setPages] = useState(0);
  const [accessiblePages, setAccessiblePages] = useState<Array<{ page: number; text: string }>>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null;

    (async () => {
      setState('loading');
      setAccessiblePages([]);
      try {
        // Bundling pdf.js's browser ESM build through the framework runtime
        // has caused worker/module corruption in past releases. Load the unchanged browser build from
        // our own public assets instead. It stays on our origin and is still
        // fetched only after the buyer clicks "Read essay".
        const moduleUrl = '/vendor/pdfjs/pdf.min.mjs';
        const pdfjs: typeof import('pdfjs-dist') = await import(
          /* webpackIgnore: true */ moduleUrl
        );
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

        loadingTask = pdfjs.getDocument({
          url: `/api/essay/${essayId}?t=${encodeURIComponent(token)}`,
          // Do not let pdf.js keep its own copy around longer than needed.
          disableAutoFetch: false,
          disableStream: false,
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPages(doc.numPages);
        const host = holder.current;
        if (!host) return;
        host.innerHTML = '';

        // Cap the render width so a large monitor doesn't request enormous
        // canvases; devicePixelRatio keeps it sharp on retina screens.
        const targetWidth = Math.min(host.clientWidth || 720, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const extractedPages: Array<{ page: number; text: string }> = [];

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (targetWidth / base.width) * dpr });
          const textContent = await page.getTextContent();
          const text = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          extractedPages.push({ page: n, text });

          const canvas = document.createElement('canvas');
          canvas.draggable = false;
          canvas.setAttribute('aria-hidden', 'true');
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
        if (!cancelled) {
          setAccessiblePages(extractedPages);
          setState('ready');
        }
      } catch (e) {
        console.error('essay render failed:', e);
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [open, essayId, token]);

  return (
    <div
      className="essay-reader"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="essay-reader-head">
        <span>{label}</span>
        {!open && (
          <button type="button" onClick={() => setOpen(true)}>
            Read essay
          </button>
        )}
      </div>

      {open && (
        <>
          {state === 'loading' && <p className="essay-reader-note">Preparing your copy…</p>}
          {state === 'error' && (
            <p className="essay-reader-note">
              This essay couldn&apos;t be displayed. Reply to your purchase email and we&apos;ll sort
              it out.
            </p>
          )}
          {state === 'ready' && pages > 0 && (
            <p className="essay-reader-note">
              {pages} page{pages === 1 ? '' : 's'} · watermarked for your account
            </p>
          )}
          {state === 'ready' && accessiblePages.length > 0 && (
            <div
              className="essay-reader-accessible sr-only"
              role="document"
              aria-label={`${label}. Accessible text of purchased essay.`}
            >
              {accessiblePages.map((page) => (
                <section key={page.page} aria-label={`Page ${page.page} of ${pages}`}>
                  <h3>Page {page.page}</h3>
                  <p>{page.text || 'This page has no extractable text.'}</p>
                </section>
              ))}
            </div>
          )}
          {/* onContextMenu is a speed bump, not a control - it stops the
              right-click "Save image as" reflex and nothing more. */}
          <div
            ref={holder}
            className="essay-reader-pages"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
