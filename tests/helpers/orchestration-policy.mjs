import { readFile } from 'node:fs/promises'

const procedure = [
  'global-invariants-and-state.md',
  'o0-registration.md',
  'o1-intake.md',
  'o2-clause.md',
  'o3-analysis.md',
  'o4-reporting.md',
  'o5-human-gate.md',
  'o6-delivery.md',
  'delegate-and-handoffs.md',
  'receipt-audit.md',
  'integrity-and-checklist.md',
]

/** Source-contract view: the controller plus all lazy procedure references, in execution order. */
export async function readOrchestrationPolicy(root) {
  const paths = [
    'skills/review-orchestration/SKILL.md',
    ...procedure.map((name) => `skills/review-orchestration/references/procedure/${name}`),
  ]
  return (await Promise.all(paths.map((path) => readFile(new URL(path, root), 'utf8')))).join('\n\n')
}