"""
Cryptographic primitives: ed25519 + blake3
"""

import blake3
from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError
from typing import Tuple


def hash(data: bytes) -> str:
    """Compute blake3 hash of data, return hex string."""
    return blake3.blake3(data).hexdigest()


def hash_bytes(data: bytes) -> str:
    """Deprecated: use hash() instead. Compute blake3 hash of data, return hex string."""
    return hash(data)


def generate_keypair() -> Tuple[str, str]:
    """Generate ed25519 keypair, return (private_key_hex, public_key_hex)."""
    signing_key = SigningKey.generate()
    private_key = signing_key.encode().hex()
    public_key = signing_key.verify_key.encode().hex()
    return private_key, public_key


def sign(message_hash: str, private_key_hex: str) -> str:
    """Sign a message hash with ed25519 private key, return signature hex."""
    message_bytes = bytes.fromhex(message_hash)
    private_key_bytes = bytes.fromhex(private_key_hex)
    signing_key = SigningKey(private_key_bytes)
    signed = signing_key.sign(message_bytes)
    # PyNaCl returns message + signature, we just want signature
    signature = signed.signature
    return signature.hex()


def verify(message_hash: str, signature_hex: str, public_key_hex: str) -> bool:
    """Verify ed25519 signature, return True if valid."""
    try:
        message_bytes = bytes.fromhex(message_hash)
        signature_bytes = bytes.fromhex(signature_hex)
        public_key_bytes = bytes.fromhex(public_key_hex)
        verify_key = VerifyKey(public_key_bytes)
        verify_key.verify(message_bytes, signature_bytes)
        return True
    except (BadSignatureError, ValueError, Exception):
        return False
