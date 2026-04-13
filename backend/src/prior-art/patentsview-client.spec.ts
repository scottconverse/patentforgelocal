import { setPatentSearchApiKey, getPatentSearchApiKey } from './patentsview-client';

describe('patentsview-client (API key management)', () => {
  afterEach(() => {
    setPatentSearchApiKey('');
  });

  it('stores and retrieves an API key', () => {
    setPatentSearchApiKey('test-key-123');
    expect(getPatentSearchApiKey()).toBe('test-key-123');
  });

  it('defaults to empty string', () => {
    expect(getPatentSearchApiKey()).toBe('');
  });

  it('overwrites previous key', () => {
    setPatentSearchApiKey('key-1');
    setPatentSearchApiKey('key-2');
    expect(getPatentSearchApiKey()).toBe('key-2');
  });
});
