# Primordia Seal (SEAL) v0.1

## Version
0.1.0

## Overview

The Primordia Seal is a cryptographic verification mechanism that attests to the integrity and authenticity of Primordia protocol messages. Any message type (MSR, IAN, FC, MBS, DBP, CMR, EMR) can be sealed.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "seal_id", "timestamp", "message_type", "message_hash", "sealer_id", "seal_hash", "signature"],
  "properties": {
    "version": {
      "type": "string",
      "const": "0.1.0"
    },
    "seal_id": {
      "type": "string",
      "pattern": "^SEAL-[0-9a-f]{64}$"
    },
    "timestamp": {
      "type": "integer",
      "description": "Unix timestamp in milliseconds"
    },
    "message_type": {
      "type": "string",
      "enum": ["MSR", "IAN", "FC", "MBS", "DBP", "CMR", "EMR", "SEAL"]
    },
    "message_id": {
      "type": "string",
      "description": "ID of the message being sealed"
    },
    "message_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 hash of the sealed message"
    },
    "sealer_id": {
      "type": "string",
      "description": "Entity creating the seal (agent DID, oracle, auditor)"
    },
    "sealer_role": {
      "type": "string",
      "enum": ["agent", "oracle", "auditor", "validator", "notary", "registry"]
    },
    "seal_purpose": {
      "type": "string",
      "enum": ["attestation", "audit", "registration", "verification", "timestamping", "archival"]
    },
    "chain_of_trust": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entity_id", "role", "signature"],
        "properties": {
          "entity_id": { "type": "string" },
          "role": { "type": "string" },
          "signature": { "type": "string" },
          "timestamp": { "type": "integer" }
        }
      },
      "description": "Optional chain of endorsements"
    },
    "attestation": {
      "type": "object",
      "properties": {
        "method": {
          "type": "string",
          "enum": ["cryptographic", "TEE", "multi-sig", "threshold", "oracle"]
        },
        "threshold": {
          "type": "integer",
          "description": "Required signatures (for multi-sig/threshold)"
        },
        "participants": {
          "type": "array",
          "items": { "type": "string" }
        },
        "proof": { "type": "string" }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "registry_url": { "type": "string" },
        "revocation_list": { "type": "string" },
        "expiry": { "type": "integer" },
        "jurisdiction": { "type": "string" },
        "compliance_framework": { "type": "string" }
      }
    },
    "seal_hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "Hash of this seal structure"
    },
    "signature": {
      "type": "string",
      "description": "Sealer's cryptographic signature"
    },
    "counter_signatures": {
      "type": "object",
      "description": "Additional endorsing signatures",
      "patternProperties": {
        ".*": { "type": "string" }
      }
    }
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `seal_id`: Unique identifier SEAL-{sha256}
- `timestamp`: Unix timestamp (ms)
- `message_type`: Type of message being sealed
- `message_hash`: Hash of the sealed message
- `sealer_id`: Entity creating the seal
- `seal_hash`: SHA-256 hash of seal data
- `signature`: Sealer's cryptographic signature

## Signature Requirements

1. Signature algorithm: Ed25519 or ECDSA (secp256k1)
2. Primary signer: Sealer (`sealer_id`) private key (REQUIRED)
3. Counter-signers: Additional endorsers (OPTIONAL)
4. Signature input: Seal hash (see Hash Computation)
5. Format: Hex-encoded signature bytes
6. Multi-sig seals require threshold number of signatures

## Hash Computation

```
# First: Hash of the sealed message (already computed by message type)
message_hash = message['hash']

# Second: Hash of the seal structure
seal_canonical = {
  version,
  seal_id,
  timestamp,
  message_type,
  message_id (if present),
  message_hash,
  sealer_id,
  sealer_role (if present),
  seal_purpose (if present),
  chain_of_trust (if present, canonicalized),
  attestation (if present, canonicalized),
  metadata (if present, canonicalized JSON)
}

seal_hash = SHA256(JSON.stringify(seal_canonical, sort_keys=true, separators=(',', ':')))
```

## Verification Algorithm

```python
def verify_seal(seal, message, sealer_key, counter_keys=None):
    # 1. Extract signature and hash
    signature = bytes.fromhex(seal['signature'])
    claimed_seal_hash = seal['seal_hash']

    # 2. Verify message hash matches
    if message['hash'] != seal['message_hash']:
        return False

    # 3. Verify message type matches
    expected_prefix = seal['message_type'] + '-'
    if not message.get('receipt_id', message.get('commitment_id',
                       message.get('balance_sheet_id',
                       message.get('event_id',
                       message.get('netting_id', ''))))).startswith(expected_prefix):
        return False

    # 4. Recompute seal hash
    canonical = {
        'version': seal['version'],
        'seal_id': seal['seal_id'],
        'timestamp': seal['timestamp'],
        'message_type': seal['message_type'],
        'message_hash': seal['message_hash'],
        'sealer_id': seal['sealer_id']
    }

    if 'message_id' in seal:
        canonical['message_id'] = seal['message_id']
    if 'sealer_role' in seal:
        canonical['sealer_role'] = seal['sealer_role']
    if 'seal_purpose' in seal:
        canonical['seal_purpose'] = seal['seal_purpose']
    if 'chain_of_trust' in seal:
        canonical['chain_of_trust'] = seal['chain_of_trust']
    if 'attestation' in seal:
        canonical['attestation'] = seal['attestation']
    if 'metadata' in seal:
        canonical['metadata'] = seal['metadata']

    computed_seal_hash = sha256(
        json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()

    # 5. Verify seal hash matches
    if computed_seal_hash != claimed_seal_hash:
        return False

    # 6. Verify sealer signature
    seal_hash_bytes = bytes.fromhex(claimed_seal_hash)
    if not crypto.verify(sealer_key, seal_hash_bytes, signature):
        return False

    # 7. Verify counter-signatures if present
    if 'counter_signatures' in seal and counter_keys:
        for entity_id, sig in seal['counter_signatures'].items():
            if entity_id not in counter_keys:
                return False
            if not crypto.verify(
                counter_keys[entity_id],
                seal_hash_bytes,
                bytes.fromhex(sig)
            ):
                return False

    # 8. Verify threshold requirements for multi-sig
    if 'attestation' in seal:
        attestation = seal['attestation']
        if attestation['method'] in ['multi-sig', 'threshold']:
            threshold = attestation.get('threshold', len(attestation['participants']))
            sig_count = 1 + len(seal.get('counter_signatures', {}))
            if sig_count < threshold:
                return False

    # 9. Verify chain of trust if present
    if 'chain_of_trust' in seal:
        for link in seal['chain_of_trust']:
            # Each link should have valid signature
            # Implementation depends on trust model
            pass

    # 10. Check expiry if present
    if 'metadata' in seal and 'expiry' in seal['metadata']:
        if current_timestamp() > seal['metadata']['expiry']:
            return False

    # 11. Check revocation list if present
    if 'metadata' in seal and 'revocation_list' in seal['metadata']:
        if is_revoked(seal['seal_id'], seal['metadata']['revocation_list']):
            return False

    return True

def verify_message_with_seal(message, seal, sealer_key):
    """Verify both message and its seal"""
    # First verify the original message
    if not verify_message(message):
        return False

    # Then verify the seal
    if not verify_seal(seal, message, sealer_key):
        return False

    return True

def create_seal(message, sealer_id, sealer_key, purpose='attestation', role='agent'):
    """Create a seal for a message"""
    seal_id = 'SEAL-' + secrets.token_hex(32)
    timestamp = current_timestamp()

    seal = {
        'version': '0.1.0',
        'seal_id': seal_id,
        'timestamp': timestamp,
        'message_type': detect_message_type(message),
        'message_id': extract_message_id(message),
        'message_hash': message['hash'],
        'sealer_id': sealer_id,
        'sealer_role': role,
        'seal_purpose': purpose
    }

    # Compute seal hash
    seal_hash = sha256(
        json.dumps(seal, sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()
    seal['seal_hash'] = seal_hash

    # Sign seal
    signature = crypto.sign(sealer_key, bytes.fromhex(seal_hash))
    seal['signature'] = signature.hex()

    return seal
```

## Message Type Detection

```python
def detect_message_type(message):
    """Detect message type from structure"""
    if 'receipt_id' in message:
        prefix = message['receipt_id'].split('-')[0]
        if prefix in ['MSR', 'CMR', 'EMR']:
            return prefix
    elif 'commitment_id' in message:
        return 'FC'
    elif 'netting_id' in message:
        return 'IAN'
    elif 'balance_sheet_id' in message:
        return 'MBS'
    elif 'event_id' in message:
        return 'DBP'
    elif 'seal_id' in message:
        return 'SEAL'

    raise ValueError("Unknown message type")

def extract_message_id(message):
    """Extract message ID from various message types"""
    id_fields = ['receipt_id', 'commitment_id', 'netting_id',
                 'balance_sheet_id', 'event_id', 'seal_id']

    for field in id_fields:
        if field in message:
            return message[field]

    return None
```

## Use Cases

### 1. Oracle Attestation
Oracle seals a compute meter receipt to attest to its validity.

### 2. Auditor Verification
Third-party auditor seals a balance sheet after verification.

### 3. Registry Recording
Registry seals messages for permanent archival.

### 4. Multi-party Endorsement
Multiple parties counter-sign a seal for shared validation.

### 5. Chain of Custody
Seals create verifiable chain of trust through endorsements.

## Example

```json
{
  "version": "0.1.0",
  "seal_id": "SEAL-d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
  "timestamp": 1735065700000,
  "message_type": "CMR",
  "message_id": "CMR-f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3",
  "message_hash": "a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4",
  "sealer_id": "did:key:z6MkrJVnaZkeFzdQyMZWhC7ghWmP8XNkEqaS3sVZdvHBxpHL",
  "sealer_role": "oracle",
  "seal_purpose": "attestation",
  "attestation": {
    "method": "TEE",
    "proof": "tee_attestation_quote..."
  },
  "metadata": {
    "registry_url": "https://primordia.registry/seals",
    "expiry": 1766601600000,
    "jurisdiction": "global",
    "compliance_framework": "ISO27001"
  },
  "seal_hash": "e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
  "signature": "sig_from_oracle...",
  "counter_signatures": {
    "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK": "sig_from_provider..."
  }
}
```

## Seal Chains

Seals can themselves be sealed, creating chains of trust:

```
Message -> Seal_1 (Agent) -> Seal_2 (Oracle) -> Seal_3 (Registry)
```

Each seal in the chain references the previous seal's hash, creating an immutable chain of custody.
