import 'server-only';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';

export async function authenticatedSeller(): Promise<{ id: string; email: string } | null> {
  const session = currentSeller();
  if (!session) return null;
  return prisma.seller.findFirst({
    where: { email: { equals: session.email, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
}
