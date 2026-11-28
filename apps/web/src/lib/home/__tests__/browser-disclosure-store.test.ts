import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserDisclosureStore } from '#lib/home/browser-disclosure-store.ts';

class FakeArea {
  readonly items = new Map<string, string>();
  blocked = false;

  getItem(key: string): string | null {
    if (this.blocked) throw new DOMException('blocked', 'SecurityError');
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.blocked) throw new DOMException('full', 'QuotaExceededError');
    this.items.set(key, value);
  }
}

describe('BrowserDisclosureStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads back what it wrote', () => {
    const storage = new FakeArea();
    vi.stubGlobal('localStorage', storage);
    const store = new BrowserDisclosureStore({ key: 'open' });

    store.writeOpenIds(['epic:E_1', 'releases']);

    expect(store.readOpenIds()).toEqual(['epic:E_1', 'releases']);
  });

  it('starts with nothing expanded', () => {
    vi.stubGlobal('localStorage', new FakeArea());
    const store = new BrowserDisclosureStore({ key: 'open' });

    expect(store.readOpenIds()).toEqual([]);
  });

  it('treats a stored value it cannot read as nothing expanded', () => {
    for (const raw of ['{not json', '{"a":1}', '[1,2]']) {
      const storage = new FakeArea();
      storage.setItem('open', raw);
      vi.stubGlobal('localStorage', storage);

      expect(new BrowserDisclosureStore({ key: 'open' }).readOpenIds()).toEqual(
        [],
      );
    }
  });

  it('keeps working when storage refuses reads and writes', () => {
    const storage = new FakeArea();
    storage.blocked = true;
    vi.stubGlobal('localStorage', storage);
    const store = new BrowserDisclosureStore({ key: 'open' });

    expect(() => {
      store.writeOpenIds(['releases']);
    }).not.toThrow();
    expect(store.readOpenIds()).toEqual([]);
  });

  it('keeps working when the browser has no storage', () => {
    vi.stubGlobal('localStorage', undefined);
    const store = new BrowserDisclosureStore({ key: 'open' });

    expect(() => {
      store.writeOpenIds(['releases']);
    }).not.toThrow();
    expect(store.readOpenIds()).toEqual([]);
  });
});
