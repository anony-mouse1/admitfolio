'use client';

import Link from 'next/link';
import { useState } from 'react';

export function GuideHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="nav" aria-label="Main navigation">
      <Link className="logo" href="/">
        <div className="logo-word">Admitfolio</div>
        <div className="logo-dot" aria-hidden="true" />
      </Link>
      <div className="nav-links">
        <Link href="/#browse">Browse essays</Link>
        <Link href="/#featured">High schooler?</Link>
        <Link href="/#sell">In college?</Link>
      </div>
      <div className="nav-cta">
        <Link className="login" href="/?login=1"><span className="login-prefix">Seller </span>login</Link>
        <button className="btn-primary nav-guide-primary" type="button" onClick={() => window.location.assign('/?matches=1')}>
          Find my matches
        </button>
        <Link className="btn-primary nav-mobile-browse" href="/#browse">Browse essays</Link>
        <button
          type="button"
          className={`nav-burger${menuOpen ? ' open' : ''}`}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
      </div>
      {menuOpen && (
        <>
          <div className="nav-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="nav-menu" role="navigation" aria-label="Mobile navigation">
            <div className="nav-menu-group">
              <div className="nav-menu-label">For applicants</div>
              <Link href="/#browse" onClick={() => setMenuOpen(false)}>
                <span>Browse essays</span><span className="nav-menu-arrow" aria-hidden="true">→</span>
              </Link>
              <Link href="/?matches=1" onClick={() => setMenuOpen(false)}>
                <span>Find my matches</span><span className="nav-menu-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="nav-menu-divider" aria-hidden="true"></div>
            <div className="nav-menu-group">
              <div className="nav-menu-label">For sellers</div>
              <Link href="/?login=1" onClick={() => setMenuOpen(false)}>
                <span>Seller login</span><span className="nav-menu-arrow" aria-hidden="true">→</span>
              </Link>
              <Link className="nav-menu-signup" href="/?sell=1" onClick={() => setMenuOpen(false)}>
                <span>Start selling</span><span className="nav-menu-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

export function GuideFooter() {
  return (
    <footer>
      <div className="foot-inner">
        <div className="foot-grid">
          <div>
            <Link className="foot-logo" href="/">
              <span className="w">admitfolio</span>
              <span className="d" aria-hidden="true" />
            </Link>
            <p className="foot-tag">Read the essays that got them in.</p>
          </div>
          <div>
            <div className="foot-col-title">Product</div>
            <div className="foot-links">
              <Link href="/#browse">Browse essays</Link>
              <Link href="/#sell">Sell your essay</Link>
            </div>
          </div>
          <div>
            <div className="foot-col-title">Legal</div>
            <div className="foot-links">
              <Link href="/guides">Blog</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 Admitfolio. For inspiration, never to copy.</span>
          <span>Made for the overwhelmed applicant.</span>
        </div>
      </div>
    </footer>
  );
}
