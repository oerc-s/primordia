# Primordia SDK

Inter-Agent Settlement Primitives for Python.

## Install

```bash
pip install primordia-sdk
```

## Usage

```python
from primordia_sdk import make_msr, verify_msr, net_receipts, generate_keypair

# Generate keypair
private_key, public_key = generate_keypair()

# Create MSR
msr = make_msr(
    payer_agent_id="a1b2...",
    payee_agent_id="b2c3...",
    resource_type="compute",
    units=1000,
    unit_type="gpu_seconds",
    price_usd_micros=50000000,
    scope_hash="0" * 64,
    request_hash="1" * 64,
    response_hash="2" * 64,
    private_key=private_key,
)

# Verify MSR
valid, hash, error = verify_msr(msr, public_key)

# Net receipts
result = net_receipts([msr1, msr2, msr3])
print(result.obligations)
```
