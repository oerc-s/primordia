/**
 * Crypto primitives (shared with SDK)
 */

import * as ed from '@noble/ed25519';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export function hash(data: Uint8Array): string {
  return bytesToHex(blake3(data));
}

export async function generateKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey: bytesToHex(privateKey), publicKey: bytesToHex(publicKey) };
}

export async function sign(messageHash: string, privateKeyHex: string): Promise<string> {
  const signature = await ed.signAsync(hexToBytes(messageHash), hexToBytes(privateKeyHex));
  return bytesToHex(signature);
}

export async function verify(messageHash: string, signatureHex: string, publicKeyHex: string): Promise<boolean> {
  try {
    return await ed.verifyAsync(hexToBytes(signatureHex), hexToBytes(messageHash), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

export { bytesToHex, hexToBytes };
