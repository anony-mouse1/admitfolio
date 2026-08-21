import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideFooter, GuideHeader } from '@/components/GuideShell';
import styles from './guides.module.css';

export const metadata: Metadata = {
  title: 'College Essay Blog, Guides, and Examples | Admitfolio',
  description:
    'Practical college essay guides grounded in real Common App essays, UC PIQs, and school supplements from verified students.',
  alternates: { canonical: 'https://admitfolio.com/guides' },
  openGraph: {
    title: 'College Essay Blog, Guides, and Examples | Admitfolio',
    description:
      'Practical college essay guides grounded in real Common App essays, UC PIQs, and school supplements.',
    url: 'https://admitfolio.com/guides',
    type: 'website',
  },
};

const upcomingGuides = [
  {
    category: 'UC applications',
    readTime: '10 min',
    title: 'UC PIQ examples and what makes each response work',
    description: 'A question-by-question guide to reading strong Personal Insight Questions with purpose.',
  },
  {
    category: 'Writing basics',
    readTime: '6 min',
    title: 'How to start a college essay without forcing the hook',
    description: 'Five practical ways into your story when the first sentence will not come.',
  },
  {
    category: 'Supplements',
    readTime: '8 min',
    title: 'Why this college essay examples: a better research method',
    description: 'Turn school research into a specific answer about fit, contribution, and curiosity.',
  },
  {
    category: 'Writing basics',
    readTime: '5 min',
    title: 'College essay format: a simple, readable structure',
    description: 'Paragraphs, dialogue, titles, spacing, and submission details explained clearly.',
  },
  {
    category: 'Common App',
    readTime: '4 min',
    title: 'Common App essay word count: what to cut and what to keep',
    description: 'A revision checklist for making every sentence earn its place.',
  },
];

export default function GuidesPage() {
  return (
    <div className={styles.page}>
      <GuideHeader />
      <main>
        <section className={styles.hero}>
          <div>
            <span className="pill"><span className="dot" />The Admitfolio blog</span>
            <h1>College essay advice, grounded in <em>real examples.</em></h1>
            <p className={styles.heroCopy}>
              Clear guides for Common App essays, UC PIQs, and school supplements. Learn what to notice in
              essays that worked, then make your own writing stronger.
            </p>
            <div className={styles.heroActions}>
              <a className="btn-primary" href="#guides">Explore the guides</a>
              <Link className="btn-ghost" href="/#browse">Browse real essays</Link>
            </div>
          </div>
          <aside className={styles.proofCard} aria-label="Admitfolio catalogue">
            <span className={styles.cardPrompt}>The essay library</span>
            <p className={styles.proofNumber}>400+</p>
            <p className={styles.proofLabel}>real application essays</p>
            <p className={styles.proofNote}>
              Our guides are shaped by the verified essay catalogue already on Admitfolio.
            </p>
          </aside>
        </section>

        <section className={styles.trustStrip} aria-label="Our standards">
          <div className={styles.trustInner}>
            <div className={styles.trustItem}><span className={styles.check}>✓</span>Based on verified listings</div>
            <div className={styles.trustItem}><span className={styles.check}>✓</span>No one-size-fits-all formulas</div>
            <div className={styles.trustItem}><span className={styles.check}>✓</span>Inspiration, never imitation</div>
          </div>
        </section>

        <section className={styles.library} id="guides">
          <div className={styles.sectionHead}>
            <div>
              <span className="pill"><span className="dot" />Start here</span>
              <h2 className={styles.sectionHeading}>Essay guides students actually need</h2>
            </div>
            <p>Focused answers to the questions students search before, during, and after drafting their college essays.</p>
          </div>
          <div className={styles.filters} aria-label="Guide topics">
            <span className={styles.activeFilter}>All guides</span>
            <span className={styles.filter}>Common App</span>
            <span className={styles.filter}>UC PIQs</span>
            <span className={styles.filter}>Supplements</span>
            <span className={styles.filter}>Writing basics</span>
          </div>
          <div className={styles.guideGrid}>
            <Link className={`${styles.guideCard} ${styles.featuredCard}`} href="/guides/common-app-essay-examples">
              <div className={styles.cardTop}>
                <span className={styles.category}>Common App</span>
                <span className={styles.readTime}>8 min read</span>
              </div>
              <h2>Common App essay examples: how to learn from essays that worked</h2>
              <p>Use real examples to study structure, reflection, and voice without copying someone else&apos;s story.</p>
              <div className={styles.dataChip}>Grounded in Admitfolio&apos;s verified essay catalogue</div>
              <span className={styles.cardLink}>Read the guide →</span>
            </Link>
            {upcomingGuides.map((guide) => (
              <article className={styles.guideCard} key={guide.title}>
                <div className={styles.cardTop}>
                  <span className={styles.category}>{guide.category}</span>
                  <span className={styles.readTime}>{guide.readTime}</span>
                </div>
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
                <span className={styles.comingSoon}>Coming next</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.principles}>
          <div className={styles.principlesInner}>
            <div>
              <span className={styles.eyebrow}>Our editorial promise</span>
              <h2>Useful before clever.</h2>
              <p className={styles.principlesLead}>Every guide should help a student make a real decision or improve a real draft.</p>
            </div>
            <div>
              <div className={styles.principle}><span>01</span><div><h3>Grounded in what students are writing</h3><p>We build from real prompt types and the verified essays already listed on Admitfolio.</p></div></div>
              <div className={styles.principle}><span>02</span><div><h3>Specific enough to use today</h3><p>Checklists, questions, and examples of the thinking process, without empty admissions clichés.</p></div></div>
              <div className={styles.principle}><span>03</span><div><h3>Clear about academic integrity</h3><p>Study craft and choices. Never copy a sentence, story, or identity that is not yours.</p></div></div>
            </div>
          </div>
        </section>
      </main>
      <GuideFooter />
    </div>
  );
}
