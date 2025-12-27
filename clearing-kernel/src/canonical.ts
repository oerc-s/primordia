/**
 * Canonical JSON (shared with SDK)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

function escapeString(s: string): string {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) result += '\\"';
    else if (c === 0x5c) result += '\\\\';
    else if (c === 0x08) result += '\\b';
    else if (c === 0x0c) result += '\\f';
    else if (c === 0x0a) result += '\\n';
    else if (c === 0x0d) result += '\\r';
    else if (c === 0x09) result += '\\t';
    else if (c < 0x20) result += '\\u' + c.toString(16).padStart(4, '0');
    else result += s[i];
  }
  return result + '"';
}

export function canonicalize(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('Floats forbidden');
    return String(value);
  }
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) return '[' + value.map(v => canonicalize(v)).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => escapeString(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported type');
}

export function canonicalizeBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
