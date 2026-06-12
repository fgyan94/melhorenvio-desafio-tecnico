import { sha256 } from './hash.util';

describe('sha256', () => {
  it('produces a 64-character hex string', () => {
    const result = sha256('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always produces same hash', () => {
    const input = 'same input string';
    expect(sha256(input)).toBe(sha256(input));
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('input-a')).not.toBe(sha256('input-b'));
  });
});
