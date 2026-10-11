import type { Change, Attestation } from '../ledger/types.js';

export type VerdictStatus = 'pending' | 'accepted' | 'rejected' | 'contested' | 'void';

export interface DecideInput {
  change: Change;
  attestations: Attestation[];
}

export interface DecideResult {
  status: VerdictStatus;
  reason: string;
  distinctVerifiers: number;
}

function distinctKeyCount(atts: Attestation[]): number {
  const keys = new Set<string>();
  for (const a of atts) {
    keys.add(a.payload.verifierPublicKeyHex);
  }
  return keys.size;
}

export function decide(input: DecideInput): DecideResult {
  const { change, attestations } = input;
  const relevant = attestations.filter(a => a.payload.changeId === change.id);
  const distinct = distinctKeyCount(relevant);

  if (distinct < 2) {
    return {
      status: 'pending',
      reason: 'Needs >= 2 distinct verifier attestations',
      distinctVerifiers: distinct,
    };
  }

  return {
    status: 'rejected',
    reason: 'Insufficient evidence per protocol (placeholder)',
    distinctVerifiers: distinct,
  };
}
