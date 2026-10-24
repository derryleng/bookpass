// The rules for which addresses the picture fetcher will contact and trust.
import { describe, expect, it } from 'vitest';
import { canFetch, sameSite } from '../../src/fetch-pictures';

describe('canFetch', () => {
  it('allows https and addresses on this computer', () => {
    expect(canFetch('https://example.org/page')).toBe(true);
    expect(canFetch('http://localhost:3000/')).toBe(true);
    expect(canFetch('http://127.0.0.1:8080/x')).toBe(true);
  });

  it('refuses plain http to other computers and anything that is not a web address', () => {
    expect(canFetch('http://example.org/')).toBe(false);
    expect(canFetch('http://127.0.0.1.example.org/')).toBe(false);
    expect(canFetch('ftp://example.org/')).toBe(false);
    expect(canFetch('javascript:alert(1)')).toBe(false);
    expect(canFetch('not a url')).toBe(false);
  });
});

describe('sameSite', () => {
  it('accepts www and other subdomains of the same site', () => {
    expect(sameSite('https://example.org/a', 'https://www.example.org/b')).toBe(true);
    expect(sameSite('https://www.example.org/', 'https://example.org/')).toBe(true);
    expect(sameSite('https://example.org/', 'https://cdn.example.org/x')).toBe(true);
  });

  it('refuses a different site, including one that only looks similar', () => {
    expect(sameSite('https://example.org/', 'https://tracker.example.net/')).toBe(false);
    expect(sameSite('https://example.org/', 'https://badexample.org/')).toBe(false);
    expect(sameSite('https://example.org/', 'https://example.org.evil.test/')).toBe(false);
  });
});
