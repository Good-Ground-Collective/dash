import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** The setup checklist card as the person sees it. */
class Card {
  static region(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'Finish setting up' });
  }

  static row(title: string): ReturnType<Page['getByRole']> {
    return Card.region().getByRole('listitem').filter({ hasText: title });
  }
}

/** Today's focus and the epics in it. */
class Focus {
  static region(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'Today’s focus' });
  }

  /** The summary row that expands an epic: the one button whose text is its title. */
  static toggle(title: string): ReturnType<Page['getByRole']> {
    return Focus.region().getByRole('button').filter({ hasText: title });
  }
}

/** Where each Home section sits on the page. */
class Sections {
  static async box(name: string) {
    return page.getByRole('region', { name, exact: true }).boundingBox();
  }
}

/** Puts the stub's person into the state an item checks. */
class Progress {
  static async connectGitHub(): Promise<void> {
    await page.request.post(
      `${missionControl}/integrations/github/__stub/scenario?name=linked`,
    );
  }

  /** The GitHub feed Needs you and Since yesterday read from. */
  static async feed(scenario: string): Promise<void> {
    await page.request.post(
      `${missionControl}/integrations/github/__stub/feed?name=${scenario}`,
    );
  }

  /** `empty` before the first initiative, `populated` after. */
  static async objectives(scenario: string): Promise<void> {
    await page.request.post(
      `${missionControl}/objectives/__stub/scenario?name=${scenario}`,
    );
  }

  /** Registers a passkey through the stub, which trusts any credential. */
  static async addPasskey(id: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/auth/passkey/verify-registration`,
      { data: { response: { id }, name: id } },
    );
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  page = await context.newPage();
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  await Progress.addPasskey('this-computer');
});

test('a fresh account sees both items open, with where to do each', async () => {
  await page.goto('/');

  await expect(Card.region()).toContainText('0 of 2 done');
  await expect(Card.region()).toContainText(
    'This list disappears once everything is done.',
  );
  await expect(
    Card.row('Connect GitHub').getByRole('link', { name: 'Connect GitHub' }),
  ).toHaveAttribute('href', '/setup/github');
  await expect(
    Card.row('Create your first initiative').getByRole('link', {
      name: 'Create a Project',
    }),
  ).toHaveAttribute('href', /^https:\/\/docs\.github\.com\//u);
  await expect(Card.region().getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Nothing here yet')).toHaveCount(0);
});

test('the card fits a phone without scrolling sideways', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(Card.region()).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('connecting GitHub ticks it off while the first initiative is still to do', async () => {
  await Progress.connectGitHub();
  await Progress.objectives('empty');
  await page.goto('/');

  await expect(Card.region()).toContainText('1 of 2 done');
  await expect(Card.row('Connect GitHub')).toContainText('Done');
  const card = await Card.region().boundingBox();
  const objectives = await Focus.region().boundingBox();
  expect(card?.y ?? 0).toBeLessThan(objectives?.y ?? 0);
});

test('the first initiative takes the card away', async () => {
  await Progress.objectives('populated');
  await page.goto('/');

  await expect(Card.region()).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Needs you', exact: true }),
  ).toBeVisible();
});

test('a greeting with the date heads home', async () => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Ada$/u,
  );
  await expect(page.getByRole('main')).toContainText(
    /(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d{1,2} [A-Z][a-z]+/u,
  );
});

test('wide screens split home into two columns, with placeholders for what isn’t built yet', async () => {
  await Progress.feed('populated');
  await page.goto('/');

  const briefing = await Sections.box('Briefing');
  const needsYou = await Sections.box('Needs you');
  const focus = await Sections.box('Today’s focus');
  const agents = await Sections.box('Agents now');
  const benches = await Sections.box('Benches');
  const since = await Sections.box('Since yesterday');

  expect(briefing?.y ?? 0).toBeLessThan(needsYou?.y ?? 0);
  expect(needsYou?.y ?? 0).toBeLessThan(focus?.y ?? 0);
  expect(needsYou?.x ?? 0).toBeLessThan(agents?.x ?? 0);
  expect(agents?.y ?? 0).toBeLessThan(benches?.y ?? 0);
  expect(benches?.y ?? 0).toBeLessThan(since?.y ?? 0);
  for (const name of ['Briefing', 'Agents now', 'Benches']) {
    await expect(page.getByRole('region', { name, exact: true })).toContainText(
      'Coming soon',
    );
  }
});

test('a phone stacks every section in one column', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const needsYou = await Sections.box('Needs you');
  const agents = await Sections.box('Agents now');
  expect(agents?.x).toBe(needsYou?.x);
  expect(agents?.y ?? 0).toBeGreaterThan(needsYou?.y ?? 0);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('epics start collapsed and expand to show what comes next', async () => {
  await page.goto('/');

  const passkeys = Focus.toggle('Sign-in with passkeys');
  await expect(passkeys).toHaveAttribute('aria-expanded', 'false');
  await expect(passkeys).toContainText('P1');
  await expect(passkeys).toContainText('4 of 6 done');
  await expect(passkeys).toContainText('Due 4 Dec');
  await expect(Focus.region()).not.toContainText(
    'Next Rate-limit sign-in attempts',
  );

  await passkeys.click();
  await expect(passkeys).toHaveAttribute('aria-expanded', 'true');
  const epic = Focus.region().locator('[data-objective="E_passkeys"]');
  await expect(epic).toContainText('Next Rate-limit sign-in attempts');
  await expect(
    epic.getByRole('link', { name: /^Open on GitHub/u }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/api/issues/10');
  await expect(Focus.toggle('Billing page')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await passkeys.click();
  await expect(passkeys).toHaveAttribute('aria-expanded', 'false');
  await expect(epic).not.toContainText('Next Rate-limit sign-in attempts');
});

test('a signed-out visitor sees no card', async () => {
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening)$/u,
  );
  await expect(Card.region()).toHaveCount(0);
});
