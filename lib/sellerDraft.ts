import { normalizeAnonymity } from '@/lib/anonymity';

export type SellerDraftEssay = {
  clientKey: string;
  sourceEssayId: string | null;
  sourceFileName: string | null;
  prompt: string;
  question: string | null;
  price: number | null;
};

export type SellerDraftState = {
  currentUniversity: string;
  currentMajor: string;
  graduationYear: string;
  targetSchool: string;
  applicationSystem: string;
  admits: string[];
  anonymity: 'anonymous' | 'revealOnPurchase' | 'full';
  packagePrice: number | null;
  teaser: string;
  appliedMajors: string;
  sellerNote: string;
  essays: SellerDraftEssay[];
};

const text = (value: unknown, max: number) =>
  String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

const finiteMoney = (value: unknown): number | null => {
  if (value === '' || value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
};

export function sanitizeSellerDraftState(value: unknown): SellerDraftState {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const admits = Array.isArray(input.admits)
    ? [...new Set(input.admits.map((item) => text(item, 80)).filter(Boolean))].slice(0, 20)
    : [];
  const essays = Array.isArray(input.essays)
    ? input.essays.slice(0, 30).map((raw, index) => {
      const essay = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      return {
        clientKey: text(essay.clientKey, 80) || `essay-${index + 1}`,
        sourceEssayId: text(essay.sourceEssayId, 80) || null,
        sourceFileName: text(essay.sourceFileName, 180) || null,
        prompt: text(essay.prompt, 200),
        question: text(essay.question, 500) || null,
        price: finiteMoney(essay.price),
      };
    })
    : [];

  return {
    currentUniversity: text(input.currentUniversity, 120),
    currentMajor: text(input.currentMajor, 120),
    graduationYear: text(input.graduationYear, 12),
    targetSchool: text(input.targetSchool, 120),
    applicationSystem: text(input.applicationSystem, 80),
    admits,
    anonymity: normalizeAnonymity(typeof input.anonymity === 'string' ? input.anonymity : undefined),
    packagePrice: finiteMoney(input.packagePrice),
    teaser: text(input.teaser, 90),
    appliedMajors: text(input.appliedMajors, 120),
    sellerNote: text(input.sellerNote, 500),
    essays,
  };
}

export function safeDraftStep(value: unknown): number {
  const step = Math.round(Number(value));
  return Number.isFinite(step) ? Math.min(8, Math.max(1, step)) : 1;
}

export function safeDraftClientKey(value: unknown): string | null {
  const key = String(value ?? '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(key) ? key : null;
}
