import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/adminAuth';
import PayoutSandboxClient from './PayoutSandboxClient';

export const dynamic = 'force-dynamic';

export default async function PayoutSandboxPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const preview = process.env.NODE_ENV === 'development' && (await searchParams)?.preview === '1';
  if (!preview && !await currentAdmin()) redirect('/admin');
  return <PayoutSandboxClient preview={preview} />;
}
