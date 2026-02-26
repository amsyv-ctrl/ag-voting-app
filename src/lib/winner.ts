import type { BallotResults, MajorityRule } from '../types'

function winnerThreshold(rule: MajorityRule) {
  return rule === 'SIMPLE' ? 0.5 : 2 / 3
}

export function computeWinner(results: BallotResults): BallotResults {
  if (results.total_votes === 0 || results.rows.length === 0) {
    return { ...results, winner_choice_id: null, winner_label: null, top_pct: null, has_tie: false }
  }

  const sorted = [...results.rows].sort((a, b) => b.votes - a.votes)
  const top = sorted[0]
  const ties = sorted.filter((row) => row.votes === top.votes)
  const topPct = top.votes / results.total_votes
  const threshold = winnerThreshold(results.majority_rule)
  const thresholdMet =
    results.majority_rule === 'SIMPLE' ? topPct > threshold : topPct >= threshold

  if (ties.length > 1 || !thresholdMet) {
    return { ...results, winner_choice_id: null, winner_label: null, top_pct: topPct, has_tie: ties.length > 1 }
  }

  return {
    ...results,
    winner_choice_id: top.choice_id,
    winner_label: top.label,
    top_pct: topPct,
    has_tie: false
  }
}
