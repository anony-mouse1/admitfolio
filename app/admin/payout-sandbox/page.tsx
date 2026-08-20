import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/adminAuth';
import PayoutSandboxClient from './PayoutSandboxClient';

export const dynamic = 'force-dynamic';

export default function PayoutSandboxPage({ searchParams }: { searchParams?: { preview?: string } }) {
  const preview = process.env.NODE_ENV === 'development' && searchParams?.preview === '1';
  if (!preview && !currentAdmin()) redirect('/admin');
  return <PayoutSandboxClient preview={preview} />;
}
