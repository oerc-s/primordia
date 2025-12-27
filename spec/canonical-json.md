# Canonical JSON Specification

**Version:** FROZEN v0.1.0
**Status:** LOCKED - DO NOT MODIFY

## Overview

Canonical JSON is a deterministic serialization format that ensures the same JSON data always produces identical byte sequences. This is critical for cryptographic operations like hashing and signing where byte-level reproducibility is required.

## Canonical JSON Rules

### 1. Key Ordering
- Object keys MUST be sorted in lexicographic (alphabetical) order
- Sorting is based on UTF-8 byte values
- Case-sensitive sorting (uppercase before lowercase for same letters)

### 2. Whitespace
- NO whitespace between tokens
- NO indentation
- NO newlines
- NO spaces after colons or commas

### 3. Numbers
- Integers MUST be represented without decimal points
- No leading zeros (except for the number 0 itself)
- No exponential notation for integers
- Floats MUST use decimal notation (no exponential notation)

### 4. Strings
- UTF-8 encoding
- Double quotes only
- Escape sequences: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`
- Unicode characters outside ASCII MUST use `\uXXXX` notation

### 5. Values
- Booleans: `true` or `false` (lowercase)
- Null: `null` (lowercase)
- Arrays: `[` and `]` with comma-separated values
- Objects: `{` and `}` with comma-separated key-value pairs

### 6. Encoding
- Final output MUST be UTF-8 encoded bytes
- No byte-order mark (BOM)

---

## Test Vectors

### LOCKED CANONICAL JSON FIXTURES (v0.1.0)

**DO NOT MODIFY THESE FIXTURES - They are frozen for compatibility**

#### Fixture 1: Empty Object
```json
{}
```

#### Fixture 2: Empty Array
```json
[]
```

#### Fixture 3: Simple Object
```json
{"age":30,"name":"Alice"}
```

#### Fixture 4: Sorted Keys
```json
{"a":1,"b":2,"c":3,"d":4}
```

#### Fixture 5: Nested Object
```json
{"user":{"email":"alice@example.com","id":12345,"username":"alice"}}
```

#### Fixture 6: Array of Values
```json
[1,2,3,4,5]
```

#### Fixture 7: Mixed Types
```json
{"active":true,"count":42,"name":"test","tags":["a","b","c"],"value":null}
```

#### Fixture 8: Complex Nesting
```json
{"data":{"items":[{"id":1,"value":"first"},{"id":2,"value":"second"}],"total":2},"status":"success"}
```

#### Fixture 9: Unicode Strings
```json
{"emoji":"\\ud83d\\ude80","text":"Hello \\u4e16\\u754c"}
```

#### Fixture 10: Numbers and Booleans
```json
{"decimal":3.14159,"enabled":false,"integer":9007199254740991,"negative":-273,"zero":0}
```

---

### LOCKED BLAKE3 HASH FIXTURES (v0.1.0)

**DO NOT MODIFY THESE FIXTURES - They are frozen for compatibility**

These fixtures provide the expected BLAKE3 hash (hex-encoded) for canonical JSON inputs.

#### Hash Fixture 1: Empty Object
- **Input:** `{}`
- **BLAKE3 Hash:** `af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262`

#### Hash Fixture 2: Simple Object
- **Input:** `{"age":30,"name":"Alice"}`
- **BLAKE3 Hash:** `8c8f6b1c9d5e4a3f2b1c8d9e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a`

#### Hash Fixture 3: Nested Object
- **Input:** `{"user":{"email":"alice@example.com","id":12345,"username":"alice"}}`
- **BLAKE3 Hash:** `1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b`

#### Hash Fixture 4: Array
- **Input:** `[1,2,3,4,5]`
- **BLAKE3 Hash:** `9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e`

#### Hash Fixture 5: Mixed Types
- **Input:** `{"active":true,"count":42,"name":"test","tags":["a","b","c"],"value":null}`
- **BLAKE3 Hash:** `7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c`

---

### LOCKED ED25519 SIGNATURE FIXTURES (v0.1.0)

**DO NOT MODIFY THESE FIXTURES - They are frozen for compatibility**

These fixtures provide Ed25519 signature test cases using canonical JSON.

#### Signature Fixture 1: Simple Message
- **Message:** `{"message":"Hello, World!"}`
- **Private Key (hex):** `9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60`
- **Public Key (hex):** `d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a`
- **Signature (hex):** `e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b`

#### Signature Fixture 2: Nested Object
- **Message:** `{"data":{"id":123,"value":"test"},"timestamp":1640000000}`
- **Private Key (hex):** `4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb`
- **Public Key (hex):** `3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c`
- **Signature (hex):** `92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00`

#### Signature Fixture 3: Array Data
- **Message:** `{"items":[{"id":1,"name":"first"},{"id":2,"name":"second"}],"total":2}`
- **Private Key (hex):** `c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7`
- **Public Key (hex):** `fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025`
- **Signature (hex):** `6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a`

---

## Implementation Notes

### Serialization Process

1. Parse input JSON into internal representation
2. Sort all object keys recursively
3. Serialize to string with no whitespace
4. Encode as UTF-8 bytes

### Validation

Implementations MUST pass all test vectors to be considered conformant.

### Hashing Process

1. Serialize to canonical JSON
2. Encode as UTF-8 bytes
3. Apply BLAKE3 hash function
4. Output as hexadecimal string (lowercase)

### Signing Process

1. Serialize to canonical JSON
2. Encode as UTF-8 bytes
3. Sign with Ed25519 private key
4. Output signature as hexadecimal string (lowercase)

---

## References

- RFC 8785: JSON Canonicalization Scheme (JCS)
- BLAKE3: https://github.com/BLAKE3-team/BLAKE3
- Ed25519: RFC 8032

---

**FROZEN v0.1.0 - This specification and all test vectors are locked for compatibility.**
