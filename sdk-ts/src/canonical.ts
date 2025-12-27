/**
 * Canonical JSON serialization per canonical-json.md spec
 * Deterministic, sorted keys, no floats, no whitespace
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

function escapeString(s: string): string {
  let result = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) result += '\\"';        // "
    else if (c === 0x5c) result += '\\\\';  // \
    else if (c === 0x08) result += '\\b';   // backspace
    else if (c === 0x0c) result += '\\f';   // form feed
    else if (c === 0x0a) result += '\\n';   // newline
    else if (c === 0x0d) result += '\\r';   // carriage return
    else if (c === 0x09) result += '\\t';   // tab
    else if (c < 0x20) {
      result += '\\u' + c.toString(16).padStart(4, '0');
    } else {
      result += s[i];
    }
  }
  return result + '"';
}

export function canonicalize(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('Floats forbidden in canonical JSON');
    }
    if (!Number.isSafeInteger(value)) {
      throw new Error('Number outside safe integer range');
    }
    return String(value);
  }

  if (typeof value === 'string') {
    return escapeString(value);
  }

  if (Array.isArray(value)) {
    const elements = value.map(v => canonicalize(v));
    return '[' + elements.join(',') + ']';
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map(k => escapeString(k) + ':' + canonicalize(value[k]));
    return '{' + pairs.join(',') + '}';
  }

  throw new Error('Unsupported type in canonical JSON');
}

export function canonicalizeBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
