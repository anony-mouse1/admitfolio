import Link from 'next/link';

export function GuideHeader() {
  return (
    <header>
      <nav className="nav" aria-label="Main navigation">
        <Link className="logo" href="/">
          <span className="logo-word">Admitfolio</span>
          <span className="logo-dot" aria-hidden="true" />
        </Link>
        <div className="nav-links">
          <Link href="/#browse">Browse essays</Link>
          <Link href="/#featured">Featured</Link>
          <Link href="/#sell">Sell your essays</Link>
        </div>
        <div className="nav-cta">
          <Link className="login" href="/?login=1">Seller login</Link>
          <Link className="btn-primary" href="/#browse">Browse essays</Link>
        </div>
      </nav>
    </header>
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
