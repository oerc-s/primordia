/**
 * Cryptographic primitives: ed25519 + blake3
 */

import * as ed from '@noble/ed25519';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export function hash(data: Uint8Array): string {
  return bytesToHex(blake3(data));
}

export function hashHex(hexData: string): string {
  return hash(hexToBytes(hexData));
}

export async function generateKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey)
  };
}

export async function sign(messageHash: string, privateKeyHex: string): Promise<string> {
  const messageBytes = hexToBytes(messageHash);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const signature = await ed.signAsync(messageBytes, privateKeyBytes);
  return bytesToHex(signature);
}

export async function verify(
  messageHash: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const messageBytes = hexToBytes(messageHash);
    const signatureBytes = hexToBytes(signatureHex);
    const publicKeyBytes = hexToBytes(publicKeyHex);
    return await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

export { bytesToHex, hexToBytes };
