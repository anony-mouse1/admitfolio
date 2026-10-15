'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { META_CONSENT_COOKIE, metaPixelUrl, publicMetaPath, validMetaPurchase } from '@/lib/metaTracking';
import { INTERNAL_ANALYTICS_STORAGE_KEY } from '@/lib/analyticsPolicy';
import styles from './MetaConsent.module.css';

function cookie(name: string): string {
  return document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function writeCookie(name: string, value: string, age = 180 * 86400) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
function blocked() {
  try {
    return Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)
      || navigator.doNotTrack === '1'
      || localStorage.getItem(INTERNAL_ANALYTICS_STORAGE_KEY) === '1'
      || new URL(location.href).searchParams.get('internal') === '1';
  } catch { return true; }
}
function allowed() { return !blocked() && cookie(META_CONSENT_COOKIE) === 'v1.allowed'; }
function clearMetaCookies() {
  for (const name of ['_fbp', '_fbc']) {
    writeCookie(name, '', 0);
    if (location.hostname.endsWith('admitfolio.com')) {
      document.cookie = `${name}=; Path=/; Domain=admitfolio.com; Max-Age=0; SameSite=Lax; Secure`;
    }
  }
}

// No third-party script can inspect the DOM or automatically capture form
// fields. Meta's documented image pixel receives only the allowlisted URL.
// Attach to the DOM so Meta's in-app browser can observe the IMG pixel too.
const inFlight = new Set<string>();
const sentViews = new Set<string>();
function sendPixel(url: string, key: string, persist = true) {
  if (!allowed() || inFlight.has(key) || sentViews.has(key)) return;
  try { if (persist && localStorage.getItem(key)) return; } catch { return; }
  inFlight.add(key);
  const img = document.createElement('img');
  img.width = 1; img.height = 1; img.alt = ''; img.style.display = 'none';
  img.referrerPolicy = 'no-referrer';
  img.dataset.metaEvent = new URL(url).searchParams.get('ev') || '';
  const cleanup = () => { img.remove(); inFlight.delete(key); };
  const timer = window.setTimeout(cleanup, 15_000);
  img.onload = () => {
    clearTimeout(timer);
    if (persist) {
      try { localStorage.setItem(key, String(Date.now())); } catch { /* no product dependency */ }
    } else sentViews.add(key);
    cleanup();
  };
  img.onerror = () => { clearTimeout(timer); cleanup(); };
  img.src = url;
  document.body.appendChild(img);
}

export default function MetaConsent() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState('');
  const [privacySignal, setPrivacySignal] = useState(false);
  const eligible = publicMetaPath(path) || path === '/purchase/success';

  useEffect(() => {
    const sync = () => {
      const signal = blocked();
      setPrivacySignal(signal);
      if (signal) { clearMetaCookies(); setChoice('v1.denied'); setOpen(false); }
      else {
        const saved = cookie(META_CONSENT_COOKIE);
        setChoice(saved); setOpen(saved !== 'v1.allowed' && saved !== 'v1.denied');
      }
      setReady(true);
    };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [path]);

  useEffect(() => {
    if (!eligible || choice !== 'v1.allowed' || !allowed()) return;
    // Local previews never contact Meta. Production is explicitly allowlisted
    // again by metaPixelUrl, independently of this early exit.
    if (!['https://admitfolio.com', 'https://www.admitfolio.com'].includes(location.origin)) return;
    if (!cookie('_fbp')) {
      writeCookie('_fbp', `fb.1.${Date.now()}.${crypto.getRandomValues(new Uint32Array(1))[0]}`, 90 * 86400);
    }
    const clickId = new URL(location.href).searchParams.get('fbclid');
    if (clickId && /^[A-Za-z0-9_-]{1,500}$/.test(clickId)) {
      writeCookie('_fbc', `fb.1.${Date.now()}.${clickId}`, 90 * 86400);
    }
    const base = { origin: location.origin, path, fbp: cookie('_fbp'), fbc: cookie('_fbc') };
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    if (path === '/purchase/success') {
      const sessionId = new URL(location.href).searchParams.get('session_id');
      if (!sessionId || !/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) return;
      let attempts = 0;
      const poll = async () => {
        if (cancelled || !allowed()) return;
        try {
          const response = await fetch('/api/meta-purchase', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }), cache: 'no-store', signal: controller.signal,
          });
          if (response.status === 403 || response.status === 400) return;
          const data = response.ok ? await response.json() : null;
          if (!cancelled && allowed() && validMetaPurchase(data?.purchase)) {
            const url = metaPixelUrl({ ...base, purchase: data.purchase });
            if (url) sendPixel(url, `meta_sent_${data.purchase.eventId}`);
            return;
          }
        } catch { /* webhook/connection may not be ready; never block checkout */ }
        if (!cancelled && ++attempts < 12) timer = setTimeout(poll, 5000);
      };
      void poll();
    } else {
      const url = metaPixelUrl(base);
      // Once per route per document, including Strict Mode effect replays.
      const key = `meta_view_${performance.timeOrigin}_${path}`;
      if (url) sendPixel(url, key, false);
    }
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [path, choice, eligible]);

  if (!ready || !eligible) return null;
  function choose(accept: boolean) {
    const next = accept && !blocked() ? 'v1.allowed' : 'v1.denied';
    writeCookie(META_CONSENT_COOKIE, next);
    if (next !== 'v1.allowed') clearMetaCookies();
    setChoice(next); setOpen(false);
  }
  return <>
    {!open && <button className={styles.choices} onClick={() => setOpen(true)}>Privacy choices</button>}
    {open && <section className={styles.panel} aria-label="Advertising privacy choices">
      <h2>A quick privacy choice</h2>
      <p>Can we use Meta cookies to see whether our Instagram and Facebook ads lead to visits and purchases? This shares browser information and purchase totals with Meta. Your essays and payment details stay private.</p>
      <details><summary>Privacy details</summary><p>This optional tracking sends Meta your browser and device information, ad identifiers, and purchase value and currency. Meta may connect these events to your account to measure and improve advertising. We do not send your email, essay contents, seller details, or private reading links.</p><p>You can decline or change your choice here at any time. We respect Global Privacy Control and Do Not Track. This choice is separate from essential cookies and existing cookieless analytics. <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">Meta privacy policy</a></p></details>
      {privacySignal && <p className={styles.notice}>Your browser privacy setting keeps advertising tracking off.</p>}
      <div className={styles.actions}><button onClick={() => choose(false)}>No thanks</button>{!privacySignal && <button className={styles.allow} onClick={() => choose(true)}>Allow</button>}</div>
    </section>}
  </>;
}
