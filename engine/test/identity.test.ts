import { generateKeyPair, signMessage, verifySignature } from '../src/identity/index.js';

describe('identity', () => {
  it('signs and verifies', async () => {
    const kp = await generateKeyPair();
    const msg = 'test message';
    const sig = await signMessage(kp.secretKey, msg);
    const ok = await verifySignature(kp.publicKey, msg, sig);
    expect(ok).toBe(true);
  });
});
