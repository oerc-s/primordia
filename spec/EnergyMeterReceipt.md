# Energy Meter Receipt (EMR) v0.1

## Version
0.1.0

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "receipt_id", "timestamp", "provider_id", "consumer_id", "epoch", "energy_consumed", "peak_power", "unit", "rate", "total_cost", "hash", "signature"],
  "properties": {
    "version": {
      "type": "string",
      "const": "0.1.0"
    },
    "receipt_id": {
      "type": "string",
      "pattern": "^EMR-[0-9a-f]{64}$"
    },
    "timestamp": {
      "type": "integer",
      "description": "Unix timestamp in milliseconds"
    },
    "provider_id": {
      "type": "string",
      "description": "Energy provider agent DID or public key"
    },
    "consumer_id": {
      "type": "string",
      "description": "Energy consumer agent DID or public key"
    },
    "epoch": {
      "type": "object",
      "required": ["epoch_id", "start_time", "end_time", "duration_ms"],
      "properties": {
        "epoch_id": { "type": "string" },
        "start_time": { "type": "integer" },
        "end_time": { "type": "integer" },
        "duration_ms": { "type": "integer" }
      }
    },
    "energy_consumed": {
      "type": "string",
      "description": "Total energy consumed in kWh (decimal string)"
    },
    "peak_power": {
      "type": "string",
      "description": "Peak power demand in kW (decimal string)"
    },
    "unit": {
      "type": "string",
      "enum": ["kWh", "MWh", "Wh"],
      "description": "Unit of energy measurement"
    },
    "rate": {
      "type": "string",
      "description": "Price per unit (decimal string)"
    },
    "currency": {
      "type": "string",
      "description": "Currency for pricing"
    },
    "total_cost": {
      "type": "string",
      "description": "Total cost = energy_consumed * rate + demand_charge (decimal string)"
    },
    "demand_charge": {
      "type": "string",
      "description": "Additional charge based on peak power (decimal string)"
    },
    "power_profile": {
      "type": "object",
      "properties": {
        "average_power_kw": { "type": "string" },
        "min_power_kw": { "type": "string" },
        "max_power_kw": { "type": "string" },
        "power_factor": { "type": "number" },
        "samples": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["timestamp", "power_kw"],
            "properties": {
              "timestamp": { "type": "integer" },
              "power_kw": { "type": "string" }
            }
          }
        }
      }
    },
    "energy_source": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["grid", "solar", "wind", "hydro", "nuclear", "battery", "mixed"]
        },
        "renewable_pct": { "type": "number" },
        "carbon_intensity_gco2_kwh": { "type": "number" }
      }
    },
    "meter_info": {
      "type": "object",
      "properties": {
        "meter_id": { "type": "string" },
        "location": { "type": "string" },
        "calibration_date": { "type": "integer" },
        "accuracy_class": { "type": "string" }
      }
    },
    "attestation": {
      "type": "object",
      "properties": {
        "method": {
          "type": "string",
          "enum": ["smart_meter", "IoT_device", "oracle", "self-reported"]
        },
        "proof": { "type": "string" },
        "verifier": { "type": "string" }
      }
    },
    "carbon_credits": {
      "type": "object",
      "properties": {
        "total_emissions_kgco2": { "type": "string" },
        "credits_retired": { "type": "string" },
        "credit_registry": { "type": "string" }
      }
    },
    "metadata": {
      "type": "object"
    },
    "hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "signature": {
      "type": "string",
      "description": "Provider's signature"
    },
    "consumer_signature": {
      "type": "string",
      "description": "Optional consumer acknowledgment"
    }
  }
}
```

## Required Fields

- `version`: Protocol version (0.1.0)
- `receipt_id`: Unique identifier EMR-{sha256}
- `timestamp`: Unix timestamp (ms)
- `provider_id`: Energy provider identifier
- `consumer_id`: Energy consumer identifier
- `epoch`: Time period of energy provision
- `energy_consumed`: Total energy consumed (kWh)
- `peak_power`: Peak power demand (kW)
- `unit`: Unit of measurement
- `rate`: Price per unit
- `total_cost`: Total cost
- `hash`: SHA-256 hash of canonical data
- `signature`: Provider's cryptographic signature

## Signature Requirements

1. Signature algorithm: Ed25519 or ECDSA (secp256k1)
2. Primary signer: Provider (`provider_id`) private key (REQUIRED)
3. Consumer signer: Consumer (`consumer_id`) private key (OPTIONAL)
4. Signature input: Canonical hash (see Hash Computation)
5. Format: Hex-encoded signature bytes
6. Consumer signature recommended for dispute prevention

## Hash Computation

```
canonical_data = {
  version,
  receipt_id,
  timestamp,
  provider_id,
  consumer_id,
  epoch,
  energy_consumed,
  peak_power,
  unit,
  rate,
  currency (if present),
  total_cost,
  demand_charge (if present),
  power_profile (if present, canonicalized),
  energy_source (if present, canonicalized),
  meter_info (if present, canonicalized),
  attestation (if present, canonicalized),
  carbon_credits (if present, canonicalized),
  metadata (if present, canonicalized JSON)
}

hash = SHA256(JSON.stringify(canonical_data, sort_keys=true, separators=(',', ':')))
```

## Verification Algorithm

```python
def verify_emr(receipt, provider_key, consumer_key=None):
    # 1. Extract signatures and hash
    signature = bytes.fromhex(receipt['signature'])
    claimed_hash = receipt['hash']

    # 2. Recompute hash
    canonical = {
        'version': receipt['version'],
        'receipt_id': receipt['receipt_id'],
        'timestamp': receipt['timestamp'],
        'provider_id': receipt['provider_id'],
        'consumer_id': receipt['consumer_id'],
        'epoch': receipt['epoch'],
        'energy_consumed': receipt['energy_consumed'],
        'peak_power': receipt['peak_power'],
        'unit': receipt['unit'],
        'rate': receipt['rate'],
        'total_cost': receipt['total_cost']
    }

    if 'currency' in receipt:
        canonical['currency'] = receipt['currency']
    if 'demand_charge' in receipt:
        canonical['demand_charge'] = receipt['demand_charge']
    if 'power_profile' in receipt:
        canonical['power_profile'] = receipt['power_profile']
    if 'energy_source' in receipt:
        canonical['energy_source'] = receipt['energy_source']
    if 'meter_info' in receipt:
        canonical['meter_info'] = receipt['meter_info']
    if 'attestation' in receipt:
        canonical['attestation'] = receipt['attestation']
    if 'carbon_credits' in receipt:
        canonical['carbon_credits'] = receipt['carbon_credits']
    if 'metadata' in receipt:
        canonical['metadata'] = receipt['metadata']

    computed_hash = sha256(
        json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()
    ).hexdigest()

    # 3. Verify hash matches
    if computed_hash != claimed_hash:
        return False

    # 4. Verify provider signature
    hash_bytes = bytes.fromhex(claimed_hash)
    if not crypto.verify(provider_key, hash_bytes, signature):
        return False

    # 5. Verify consumer signature if present
    if 'consumer_signature' in receipt and consumer_key:
        consumer_sig = bytes.fromhex(receipt['consumer_signature'])
        if not crypto.verify(consumer_key, hash_bytes, consumer_sig):
            return False

    # 6. Verify cost calculation
    energy = Decimal(receipt['energy_consumed'])
    rate = Decimal(receipt['rate'])
    demand_charge = Decimal(receipt.get('demand_charge', '0'))
    claimed_cost = Decimal(receipt['total_cost'])
    computed_cost = (energy * rate) + demand_charge

    if abs(computed_cost - claimed_cost) > Decimal('0.0001'):
        return False

    # 7. Verify epoch timing
    epoch = receipt['epoch']
    duration = epoch['end_time'] - epoch['start_time']
    if duration != epoch['duration_ms']:
        return False
    if epoch['end_time'] > receipt['timestamp']:
        return False

    # 8. Verify power profile consistency if present
    if 'power_profile' in receipt:
        profile = receipt['power_profile']
        if 'max_power_kw' in profile:
            if Decimal(profile['max_power_kw']) != Decimal(receipt['peak_power']):
                return False

        # Verify average power makes sense
        if 'average_power_kw' in profile:
            duration_hours = Decimal(epoch['duration_ms']) / Decimal(3600000)
            avg_power = Decimal(profile['average_power_kw'])
            expected_energy = avg_power * duration_hours
            actual_energy = Decimal(receipt['energy_consumed'])

            # Allow 5% tolerance
            if abs(expected_energy - actual_energy) / actual_energy > Decimal('0.05'):
                return False

    # 9. Verify carbon calculations if present
    if 'carbon_credits' in receipt and 'energy_source' in receipt:
        carbon = receipt['carbon_credits']
        source = receipt['energy_source']

        energy_kwh = Decimal(receipt['energy_consumed'])
        carbon_intensity = Decimal(source.get('carbon_intensity_gco2_kwh', 0))
        expected_emissions = (energy_kwh * carbon_intensity) / Decimal(1000)  # kg CO2
        claimed_emissions = Decimal(carbon['total_emissions_kgco2'])

        if abs(expected_emissions - claimed_emissions) > Decimal('0.001'):
            return False

    # 10. Verify attestation if present
    if 'attestation' in receipt:
        if not verify_energy_attestation(receipt['attestation'], receipt):
            return False

    return True

def verify_energy_attestation(attestation, receipt):
    """Verify energy meter attestation based on method"""
    method = attestation['method']

    if method == 'smart_meter':
        # Verify smart meter signature/reading
        return verify_smart_meter_proof(attestation['proof'], receipt)

    elif method == 'IoT_device':
        # Verify IoT device signature
        return verify_iot_signature(attestation['proof'], receipt)

    elif method == 'oracle':
        # Verify oracle signature
        return verify_oracle_signature(
            attestation['verifier'],
            attestation['proof'],
            receipt
        )

    elif method == 'self-reported':
        # No additional verification
        return True

    return False
```

## Example

```json
{
  "version": "0.1.0",
  "receipt_id": "EMR-b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5",
  "timestamp": 1735065600000,
  "provider_id": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "consumer_id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
  "epoch": {
    "epoch_id": "epoch-2025-001",
    "start_time": 1735061000000,
    "end_time": 1735064600000,
    "duration_ms": 3600000
  },
  "energy_consumed": "85.5",
  "peak_power": "95.2",
  "unit": "kWh",
  "rate": "0.12",
  "currency": "USD",
  "total_cost": "12.76",
  "demand_charge": "2.50",
  "power_profile": {
    "average_power_kw": "85.5",
    "min_power_kw": "72.1",
    "max_power_kw": "95.2",
    "power_factor": 0.95,
    "samples": [
      {
        "timestamp": 1735061000000,
        "power_kw": "80.0"
      },
      {
        "timestamp": 1735062800000,
        "power_kw": "95.2"
      },
      {
        "timestamp": 1735064600000,
        "power_kw": "82.5"
      }
    ]
  },
  "energy_source": {
    "type": "mixed",
    "renewable_pct": 65.0,
    "carbon_intensity_gco2_kwh": 250.0
  },
  "meter_info": {
    "meter_id": "MTR-2025-00123",
    "location": "Datacenter-A-Rack-15",
    "calibration_date": 1704067200000,
    "accuracy_class": "0.5S"
  },
  "attestation": {
    "method": "smart_meter",
    "proof": "meter_signature_base64...",
    "verifier": "Siemens_7KT_PAC"
  },
  "carbon_credits": {
    "total_emissions_kgco2": "21.375",
    "credits_retired": "0",
    "credit_registry": "none"
  },
  "hash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "signature": "sig_from_provider...",
  "consumer_signature": "sig_from_consumer..."
}
```
