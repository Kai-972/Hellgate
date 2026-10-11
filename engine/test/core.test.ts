import { canonicalize, toCanonicalString, sha256, hashCanonical, makeRecordId } from '../src/core/index.js';

describe('core canonical JSON', () => {
  it('sorts keys', () => {
    const obj = { b: 2, a: 1 };
    expect(toCanonicalString(obj)).toBe('{"a":1,"b":2}');
  });

  it('rejects floats', () => {
    expect(() => toCanonicalString({ v: 1.5 })).toThrow();
  });

  it('rejects undefined', () => {
    expect(() => toCanonicalString({ v: undefined })).toThrow();
  });

  it('accepts integers and null/booleans', () => {
    const v = { a: 0, b: -1, c: true, d: null };
    expect(toCanonicalString(v)).toBe('{"a":0,"b":-1,"c":true,"d":null}');
  });
});

describe('hashing', () => {
  it('sha256 deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('hashCanonical depends on canonical form', () => {
    const h1 = hashCanonical({ b: 1, a: 2 });
    const h2 = hashCanonical({ a: 2, b: 1 });
    expect(h1).toBe(h2);
  });
});

describe('ids', () => {
  it('makes record id', () => {
    const id = makeRecordId('test', { x: 1 });
    expect(id).toHaveLength(64);
  });
});
