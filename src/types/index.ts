export type MajorityRule = 'SIMPLE' | 'TWO_THIRDS'
export type BallotStatus = 'DRAFT' | 'OPEN' | 'CLOSED'
export type BallotType = 'YES_NO' | 'PICK_ONE'

export type BallotChoice = {
  id: string
  label: string
  sort_order: number
}

export type PublicBallot = {
  ballot_id: string
  event_name: string
  slug: string
  title: string
  description: string | null
  ballot_type: BallotType
  majority_rule: MajorityRule
  status: BallotStatus
  opens_at: string | null
  closes_at: string | null
  vote_round: number
  requires_pin: boolean
  choices: BallotChoice[]
}

export type BallotResultRow = {
  choice_id: string
  label: string
  votes: number
  pct: number
}

export type BallotResults = {
  ballot_id: string
  ballot_status?: 'DRAFT' | 'OPEN' | 'CLOSED'
  vote_round: number
  total_votes: number
  rows: BallotResultRow[]
  winner_choice_id: string | null
  winner_label: string | null
  top_pct: number | null
  has_tie: boolean
  majority_rule: MajorityRule
  results_visibility?: 'LIVE' | 'CLOSED_ONLY'
  hidden_until_closed?: boolean
}
