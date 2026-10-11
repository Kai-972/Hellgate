import { decide } from '../src/verdict/index.js';

describe('verdict', () => {
  it('returns pending if < 2 verifiers', () => {
    const res = decide({
      change: { id: 'c1', type: 'change', payload: {} as any, signature: { publicKeyHex: '', signatureHex: '' } },
      attestations: [
        { id: 'a1', type: 'attestation', payload: { changeId: 'c1', verifierPublicKeyHex: 'v1' } as any, signature: { publicKeyHex: '', signatureHex: '' } }
      ],
    });
    expect(res.status).toBe('pending');
    expect(res.distinctVerifiers).toBe(1);
  });
});
