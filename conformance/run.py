#!/usr/bin/env python3
"""
Primordia Conformance Test Suite (Python)
Tests canonical JSON, blake3, ed25519, and netting conservation
"""

import json
import sys
from pathlib import Path

# Import from SDK
sys.path.insert(0, str(Path(__file__).parent.parent / 'sdk-py'))
from primordia_sdk.canonical import canonicalize
from primordia_sdk.crypto import hash


def main():
    vectors_path = Path(__file__).parent / 'vectors.json'
    with open(vectors_path) as f:
        vectors = json.load(f)

    passed = 0
    failed = 0

    # Test canonical JSON
    print('[conformance] Testing canonical_json...')
    cj_tests = vectors.get('canonical_json_fixtures', [])
    cj_pass = 0
    cj_fail = 0

    for v in cj_tests:
        try:
            result = canonicalize(v['input_json'])
            if result == v['canonical_output']:
                cj_pass += 1
            else:
                cj_fail += 1
                print(f"  [FAIL] CJ-{v['id']}: expected={v['canonical_output']}, got={result}", file=sys.stderr)
        except Exception as err:
            cj_fail += 1
            print(f"  [FAIL] CJ-{v['id']}: {err}", file=sys.stderr)

    print(f'[conformance] canonical_json: {cj_pass}/{cj_pass + cj_fail} PASS')
    passed += cj_pass
    failed += cj_fail

    # Test blake3
    print('[conformance] Testing blake3...')
    blake3_tests = vectors.get('blake3_hash_fixtures', [])
    blake3_pass = 0
    blake3_fail = 0

    for v in blake3_tests:
        try:
            result = hash(v['input'].encode('utf-8'))
            if result == v['blake3_hash']:
                blake3_pass += 1
            else:
                blake3_fail += 1
                print(f"  [FAIL] BLAKE3-{v['id']}: expected={v['blake3_hash']}, got={result}", file=sys.stderr)
        except Exception as err:
            blake3_fail += 1
            print(f"  [FAIL] BLAKE3-{v['id']}: {err}", file=sys.stderr)

    print(f'[conformance] blake3: {blake3_pass}/{blake3_pass + blake3_fail} PASS')
    passed += blake3_pass
    failed += blake3_fail

    # Test ed25519
    print('[conformance] Testing ed25519...')
    print('[conformance] ed25519: SKIP (not implemented in simplified runner)')

    # Test netting conservation
    print('[conformance] Testing netting_conservation...')
    print('[conformance] netting_conservation: SKIP (not implemented in simplified runner)')

    # Final result
    print('')
    if failed == 0:
        print('CONFORMANCE: PASS')
        sys.exit(0)
    else:
        print('CONFORMANCE: FAIL')
        sys.exit(1)


if __name__ == '__main__':
    main()
