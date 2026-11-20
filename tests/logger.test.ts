import { describe, it, expect } from 'vitest';
import { redact } from '../src/core/logging/logger';

describe('logger redact (privacy safety)', () => {
  it('redacts common secret-bearing keys', () => {
    const out = redact({
      token: 'abc123',
      authorization: 'Bearer xyz',
      cookie: 'session=1',
      password: 'hunter2',
      apiKey: 'k',
      runId: 'org/proj/1',
    });
    expect(out).toEqual({
      token: '[redacted]',
      authorization: '[redacted]',
      cookie: '[redacted]',
      password: '[redacted]',
      apiKey: '[redacted]',
      runId: 'org/proj/1',
    });
  });

  it('redacts nested sensitive keys', () => {
    const out = redact({ context: { pat: 'secret', buildId: 5 } });
    expect(out).toEqual({ context: { pat: '[redacted]', buildId: 5 } });
  });

  it('passes through non-sensitive values unchanged', () => {
    const out = redact({ status: 200, op: 'getBuild' });
    expect(out).toEqual({ status: 200, op: 'getBuild' });
  });

  it('handles undefined context', () => {
    expect(redact(undefined)).toBeUndefined();
  });
});
