import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FORMULA_VERSION = '2026-10-11-tiered-acceptances-v1';
const MIN_PRICE = 9;
const MAX_PRICE = 49;

const planArg = process.argv.find((arg) => arg.startsWith('--plan='));
const applyArg = process.argv.find((arg) => arg.startsWith('--apply='));
const verifyArg = process.argv.find((arg) => arg.startsWith('--verify='));

function parseSchools(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed
      .map((school) => String(school || '').trim())
      .filter(Boolean)
      .map((school) => school.toLocaleLowerCase('en-US')))];
  } catch {
    return [];
  }
}

function discountFor(admitCount) {
  if (admitCount >= 5) return 0.5;
  if (admitCount >= 2) return 0.55;
  return 0.6;
}

function newPriceFor(oldPrice, admitCount) {
  const discounted = Math.round(oldPrice * (1 - discountFor(admitCount)));
  return Math.min(oldPrice, Math.max(MIN_PRICE, Math.min(MAX_PRICE, discounted)));
}

function percentile(sorted, percent) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percent))];
}

function summarize(listings) {
  const oldPrices = listings.map((listing) => listing.oldPrice).sort((a, b) => a - b);
  const newPrices = listings.map((listing) => listing.newPrice).sort((a, b) => a - b);
  const tiers = listings.reduce((counts, listing) => {
    const key = listing.admitCount >= 5 ? '5+' : listing.admitCount >= 2 ? '2-4' : '1';
    counts[key] += 1;
    return counts;
  }, { '1': 0, '2-4': 0, '5+': 0 });
  return {
    listings: listings.length,
    sellers: new Set(listings.map((listing) => listing.sellerEmail)).size,
    changed: listings.filter((listing) => listing.oldPrice !== listing.newPrice).length,
    tiers,
    oldPrices: {
      min: oldPrices[0] ?? null,
      median: percentile(oldPrices, 0.5),
      p75: percentile(oldPrices, 0.75),
      max: oldPrices.at(-1) ?? null,
    },
    newPrices: {
      min: newPrices[0] ?? null,
      median: percentile(newPrices, 0.5),
      p75: percentile(newPrices, 0.75),
      max: newPrices.at(-1) ?? null,
    },
  };
}

async function createPlan(filePath) {
  const rows = await prisma.listing.findMany({
    where: { status: 'approved', pricingMode: 'package', packagePrice: { not: null } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      targetSchool: true,
      school: true,
      admitTags: true,
      packagePrice: true,
      seller: { select: { email: true, name: true } },
      essays: { select: { id: true } },
    },
  });
  const listings = rows.map((row) => {
    const admitCount = Math.max(1, parseSchools(row.admitTags).length);
    return {
      listingId: row.id,
      sellerEmail: row.seller.email.trim().toLowerCase(),
      sellerName: row.seller.name,
      targetSchool: row.targetSchool || row.school,
      essayCount: row.essays.length,
      admitCount,
      discountPercent: Math.round(discountFor(admitCount) * 100),
      oldPrice: row.packagePrice,
      newPrice: newPriceFor(row.packagePrice, admitCount),
    };
  });
  const plan = {
    formulaVersion: FORMULA_VERSION,
    createdAt: new Date().toISOString(),
    rules: {
      oneAcceptanceDiscountPercent: 60,
      twoToFourAcceptancesDiscountPercent: 55,
      fivePlusAcceptancesDiscountPercent: 50,
      minimumPrice: MIN_PRICE,
      maximumPrice: MAX_PRICE,
      neverIncreasePrice: true,
    },
    summary: summarize(listings),
    listings,
  };
  await writeFile(filePath, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ mode: 'plan', path: filePath, ...plan.summary }, null, 2));
}

async function loadPlan(filePath) {
  const plan = JSON.parse(await readFile(filePath, 'utf8'));
  if (plan.formulaVersion !== FORMULA_VERSION || !Array.isArray(plan.listings) || !plan.listings.length) {
    throw new Error('The pricing plan is missing, empty, or uses an unexpected formula version');
  }
  const ids = plan.listings.map((listing) => listing.listingId);
  if (new Set(ids).size !== ids.length) throw new Error('The pricing plan contains duplicate listing IDs');
  return plan;
}

async function currentPrices(plan) {
  const rows = await prisma.listing.findMany({
    where: { id: { in: plan.listings.map((listing) => listing.listingId) } },
    select: { id: true, status: true, pricingMode: true, packagePrice: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

function inspectState(plan, current) {
  const state = { old: 0, new: 0, missing: 0, unexpected: [] };
  for (const listing of plan.listings) {
    const row = current.get(listing.listingId);
    if (!row) {
      state.missing += 1;
      continue;
    }
    if (row.status !== 'approved' || row.pricingMode !== 'package') {
      state.unexpected.push({ listingId: listing.listingId, status: row.status, pricingMode: row.pricingMode });
    } else if (row.packagePrice === listing.oldPrice) {
      state.old += 1;
    } else if (row.packagePrice === listing.newPrice) {
      state.new += 1;
    } else {
      state.unexpected.push({ listingId: listing.listingId, expectedOld: listing.oldPrice, expectedNew: listing.newPrice, actual: row.packagePrice });
    }
  }
  return state;
}

async function applyPlan(filePath) {
  const plan = await loadPlan(filePath);
  const before = inspectState(plan, await currentPrices(plan));
  if (before.missing || before.unexpected.length || (before.old && before.new)) {
    throw new Error(`Refusing to apply a stale or mixed plan: ${JSON.stringify(before)}`);
  }
  if (before.new === plan.listings.length) {
    console.log(JSON.stringify({ mode: 'apply', result: 'already-applied', state: before }, null, 2));
    return;
  }
  if (before.old !== plan.listings.length) throw new Error(`Refusing unexpected pre-apply state: ${JSON.stringify(before)}`);

  await prisma.$transaction(async (tx) => {
    for (const listing of plan.listings) {
      const updated = await tx.listing.updateMany({
        where: {
          id: listing.listingId,
          status: 'approved',
          pricingMode: 'package',
          packagePrice: listing.oldPrice,
        },
        data: { packagePrice: listing.newPrice },
      });
      if (updated.count !== 1) throw new Error(`Listing ${listing.listingId} changed while the pricing plan was being applied`);
    }
  }, { maxWait: 20_000, timeout: 120_000 });

  const after = inspectState(plan, await currentPrices(plan));
  if (after.new !== plan.listings.length || after.old || after.missing || after.unexpected.length) {
    throw new Error(`Post-apply verification failed: ${JSON.stringify(after)}`);
  }
  console.log(JSON.stringify({ mode: 'apply', result: 'applied-and-verified', state: after, summary: plan.summary }, null, 2));
}

async function verifyPlan(filePath) {
  const plan = await loadPlan(filePath);
  const state = inspectState(plan, await currentPrices(plan));
  const verified = state.new === plan.listings.length && !state.old && !state.missing && !state.unexpected.length;
  console.log(JSON.stringify({ mode: 'verify', verified, state, summary: plan.summary }, null, 2));
  if (!verified) process.exitCode = 1;
}

async function main() {
  const modes = [planArg, applyArg, verifyArg].filter(Boolean);
  if (modes.length !== 1) throw new Error('Pass exactly one of --plan=/absolute/path, --apply=/absolute/path, or --verify=/absolute/path');
  if (planArg) await createPlan(resolve(planArg.slice('--plan='.length)));
  if (applyArg) await applyPlan(resolve(applyArg.slice('--apply='.length)));
  if (verifyArg) await verifyPlan(resolve(verifyArg.slice('--verify='.length)));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
