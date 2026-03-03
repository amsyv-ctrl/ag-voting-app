export type DemoChoice = {
  id: string
  label: string
}

export type DemoMajorityRule = 'SIMPLE' | 'TWO_THIRDS'

export const demoBallot = {
  id: 'demo-ballot-1',
  title: 'Demo Vote: Superintendent Election',
  description: 'This is a simulated ballot for product walkthroughs. Votes are not stored.',
  incumbentName: 'John Smith',
  majorityRule: 'TWO_THIRDS' as DemoMajorityRule,
  choices: [
    { id: 'opt-a', label: 'Candidate A' },
    { id: 'opt-b', label: 'Candidate B' },
    { id: 'opt-c', label: 'Candidate C' }
  ] satisfies DemoChoice[]
}

export function demoMajorityLabel(rule: DemoMajorityRule) {
  if (rule === 'TWO_THIRDS') return 'Requires 2/3 majority'
  return 'Requires simple majority (>50%)'
}

