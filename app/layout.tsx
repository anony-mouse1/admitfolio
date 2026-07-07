import type { Metadata } from 'next';
import './fonts.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admitfolio, Read the essays that got them in',
  description:
    'A marketplace of real college admissions essays, written by the students who got accepted. Browse by school and prompt, see why each one worked, and find the angle only you can write.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
