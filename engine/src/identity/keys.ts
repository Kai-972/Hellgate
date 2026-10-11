import * as ed from '@noble/ed25519';
import { sha256 } from '../core/hash.js';

export type KeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyHex: string;
  secretKeyHex: string;
};

export async function generateKeyPair(): Promise<KeyPair> {
  const secretKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(secretKey);
  return {
    publicKey,
    secretKey,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
    secretKeyHex: Buffer.from(secretKey).toString('hex'),
  };
}

export async function signMessage(secretKey: Uint8Array, message: string): Promise<string> {
  const sig = await ed.signAsync(sha256(message), secretKey);
  return Buffer.from(sig).toString('hex');
}

export async function verifySignature(publicKey: Uint8Array, message: string, signatureHex: string): Promise<boolean> {
  const sig = Buffer.from(signatureHex, 'hex');
  return ed.verifyAsync(sig, sha256(message), publicKey);
}
