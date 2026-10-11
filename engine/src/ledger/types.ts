export type Signature = {
  publicKeyHex: string;
  signatureHex: string;
};

export type Claim = {
  text: string;
  falsifiable: string;
  area: string;
  predictedEffectBp: number;
};

export type ChangePayload = {
  parentChangeId: string | null;
  buildId: string;
  suiteId: string;
  claim: Claim;
  recordingId: string | null;
  authorPublicKeyHex: string;
  timestamp: number;
};

export type Change = {
  id: string;
  type: 'change';
  payload: ChangePayload;
  signature: Signature;
};

export type AttestationPayload = {
  changeId: string;
  buildId: string;
  suiteId: string;
  verifierPublicKeyHex: string;
  parentDeltaBp: number;
  parentCiLowerBp: number;
  parentCiUpperBp: number;
  changeDeltaBp: number;
  changeCiLowerBp: number;
  changeCiUpperBp: number;
  nSeeds: number;
  paired: boolean;
  sealedUsed: boolean;
  timestamp: number;
};

export type Attestation = {
  id: string;
  type: 'attestation';
  payload: AttestationPayload;
  signature: Signature;
};

export type Recording = {
  id: string;
  type: 'recording';
  payload: any;
};
