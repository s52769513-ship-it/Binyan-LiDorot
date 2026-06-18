export function normName(s: string): string {
  return (s ?? '')
    .replace(/["'`״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nameSimilarity(a: string, b: string): number {
  const na = normName(a).toLowerCase()
  const nb = normName(b).toLowerCase()
  if (!na || !nb) return 0
  if (na === nb) return 1

  // token overlap (word-level)
  const ta = new Set(na.split(' ').filter(Boolean))
  const tb = new Set(nb.split(' ').filter(Boolean))
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  const tokenScore = (2 * common) / (ta.size + tb.size)
  if (tokenScore >= 0.5) return tokenScore

  // bigram overlap (character-level)
  const bigrams = (str: string) => {
    const bg = new Set<string>()
    for (let i = 0; i < str.length - 1; i++) bg.add(str.slice(i, i + 2))
    return bg
  }
  const bga = bigrams(na.replace(/\s/g, ''))
  const bgb = bigrams(nb.replace(/\s/g, ''))
  let bgCommon = 0
  for (const bg of bga) if (bgb.has(bg)) bgCommon++
  const bigramScore = (2 * bgCommon) / (bga.size + bgb.size)

  return Math.max(tokenScore, bigramScore)
}
