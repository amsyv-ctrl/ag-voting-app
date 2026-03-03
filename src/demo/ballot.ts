export type DemoChoice = {
  id: string
  label: string
}

export const demoBallot = {
  id: 'demo-ballot-1',
  title: 'Demo Vote: Which option should win?',
  description: 'This is a simulated ballot for product walkthroughs. Votes are not stored.',
  majorityRule: 'SIMPLE' as const,
  choices: [
    { id: 'opt-a', label: 'Option A' },
    { id: 'opt-b', label: 'Option B' },
    { id: 'opt-c', label: 'Option C' }
  ] satisfies DemoChoice[]
}

