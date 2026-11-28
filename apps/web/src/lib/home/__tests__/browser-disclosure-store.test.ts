import { describe, expect, it } from 'vitest';
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
  it('reads back what it wrote', () => {
    const storage = new FakeArea();
    const store = new BrowserDisclosureStore({ key: 'open', storage });

    store.writeOpenIds(['epic:E_1', 'releases']);

    expect(store.readOpenIds()).toEqual(['epic:E_1', 'releases']);
  });

  it('starts with nothing expanded', () => {
    const store = new BrowserDisclosureStore({
      key: 'open',
      storage: new FakeArea(),
    });

    expect(store.readOpenIds()).toEqual([]);
  });

  it('treats a stored value it cannot read as nothing expanded', () => {
    for (const raw of ['{not json', '{"a":1}', '[1,2]']) {
      const storage = new FakeArea();
      storage.setItem('open', raw);

      expect(
        new BrowserDisclosureStore({ key: 'open', storage }).readOpenIds(),
      ).toEqual([]);
    }
  });

  it('keeps working when storage refuses reads and writes', () => {
    const storage = new FakeArea();
    storage.blocked = true;
    const store = new BrowserDisclosureStore({ key: 'open', storage });

    expect(() => {
      store.writeOpenIds(['releases']);
    }).not.toThrow();
    expect(store.readOpenIds()).toEqual([]);
  });

  it('keeps working when the browser has no storage', () => {
    const store = new BrowserDisclosureStore({ key: 'open' });

    expect(() => {
      store.writeOpenIds(['releases']);
    }).not.toThrow();
    expect(store.readOpenIds()).toEqual([]);
  });
});
