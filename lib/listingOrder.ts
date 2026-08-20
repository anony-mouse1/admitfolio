export function spreadRepeatedKeys<T>(
  rankedItems: readonly T[],
  keyOf: (item: T) => string,
  minimumGap = 3,
): T[] {
  const remaining = [...rankedItems];
  const spread: T[] = [];

  while (remaining.length > 0) {
    const recentKeys = new Set(spread.slice(-minimumGap).map(keyOf));
    const differentKeyIndex = remaining.findIndex((item) => !recentKeys.has(keyOf(item)));
    const nextIndex = differentKeyIndex >= 0 ? differentKeyIndex : 0;
    const [next] = remaining.splice(nextIndex, 1);
    spread.push(next);
  }

  return spread;
}
