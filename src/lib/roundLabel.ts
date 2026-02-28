export function roundLabel(round: number) {
  const n = Math.max(1, Math.trunc(round || 1))
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}
