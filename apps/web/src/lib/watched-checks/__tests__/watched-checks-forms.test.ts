import { describe, expect, it } from 'vitest';
import { WatchedChecksForms } from '#lib/watched-checks/watched-checks-forms.ts';

class Posted {
  static form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      data.set(name, value);
    }
    return data;
  }
}

describe('WatchedChecksForms.addRule', () => {
  it('trims the pattern', () => {
    expect(
      WatchedChecksForms.addRule(Posted.form({ pattern: '  Deploy* ' })),
    ).toEqual({ pattern: 'Deploy*' });
  });

  it.each(['', '  ', 'a*b', '*build'])('refuses %j', (pattern) => {
    expect(WatchedChecksForms.addRule(Posted.form({ pattern }))).toBeNull();
  });
});

describe('WatchedChecksForms.repository', () => {
  it('reads the repository and each check’s answer, whatever the check is called', () => {
    const form = WatchedChecksForms.repository(
      Posted.form({
        repository: 'acme-labs/api',
        [WatchedChecksForms.choiceField('Deploy to Staging')]: 'watch',
        [WatchedChecksForms.choiceField('codecov/patch')]: 'rules',
      }),
    );

    expect(form?.repository).toBe('acme-labs/api');
    expect([...(form?.choices ?? [])]).toEqual([
      ['Deploy to Staging', 'watch'],
      ['codecov/patch', 'rules'],
    ]);
  });

  it('refuses an unknown answer or a repository that is not owner/name', () => {
    expect(
      WatchedChecksForms.repository(
        Posted.form({
          repository: 'acme-labs/api',
          [WatchedChecksForms.choiceField('lint')]: 'mute',
        }),
      ),
    ).toBeNull();
    expect(
      WatchedChecksForms.repository(Posted.form({ repository: 'api' })),
    ).toBeNull();
  });
});
