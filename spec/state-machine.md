# Protocol State Machine

## States
```
RECEIPT_CREATED → INDEXED → PROVED → NETTED → CLOSED
                                   ↘ DEFAULTED → RESOLVED
```

## State Object
```json
{
  "state_version": "0.1",
  "receipt_hash": "...",
  "current_state": "INDEXED",
  "transitions": [
    {
      "from": "RECEIPT_CREATED",
      "to": "INDEXED",
      "trigger": "INDEX_SUBMIT",
      "timestamp_ms": 1703289600000,
      "proof": "window_id:position"
    }
  ],
  "state_hash": "blake3(canonical(transitions))"
}
```

## Transition Rules (Deterministic)

| From | To | Trigger | Requires |
|------|-----|---------|----------|
| RECEIPT_CREATED | INDEXED | INDEX_SUBMIT | window open |
| INDEXED | PROVED | WINDOW_CLOSE | window closed + proof generated |
| PROVED | NETTED | NET_EXECUTE | credit sufficient + netting computed |
| NETTED | CLOSED | EPOCH_CLOSE | all receipts netted + proofpack |
| PROVED | DEFAULTED | DEFAULT_TRIGGER | obligation missed |
| DEFAULTED | RESOLVED | DEFAULT_RESOLVE | credit deducted + resolution |

## Epoch State Machine
```
EPOCH_OPEN → EPOCH_CLOSING → EPOCH_CLOSED
          ↘ EPOCH_BLOCKED (insufficient credit)
```

## Determinism Guarantee
Same inputs → Same state transitions → Same outputs
Hash of all transitions = epoch_state_hash
Signed by kernel = canonical
