import { expect, type Locator, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { EpicGeometries } from './support/objectives/epic-geometry.ts';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** Drives the stub's GitHub and objectives state, and finds the objectives on home. */
class Objectives {
  static async scenario(name: string): Promise<void> {
    await page.request.post(
      `${missionControl}/objectives/__stub/scenario?name=${name}`,
    );
  }

  static async connectGithub(): Promise<void> {
    for (const stub of ['scenario?name=linked', 'feed?name=populated']) {
      await page.request.post(
        `${missionControl}/integrations/github/__stub/${stub}`,
      );
    }
  }

  static panel(): Locator {
    return page.getByRole('region', { name: 'Today’s focus' });
  }

  static initiativeTitles(): Locator {
    return Objectives.panel().getByRole('heading', { level: 3 });
  }

  static epics(initiative: string): Locator {
    return page.getByRole('list', { name: `Epics in ${initiative}` });
  }

  /** The epic's summary row, the one button whose text is the epic's title. */
  static epicToggle(title: string): Locator {
    return Objectives.panel().getByRole('button').filter({ hasText: title });
  }

  static async expand(title: string): Promise<void> {
    await Objectives.epicToggle(title).click();
  }

  static async openMenu(title: string): Promise<Locator> {
    await page.getByRole('button', { name: `Change ${title}` }).click();
    return page.getByRole('dialog');
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
});

test('without GitHub, objectives point to Connect GitHub', async () => {
  await page.goto('/');

  await expect(Objectives.panel()).toContainText(
    'Connect GitHub to see your objectives',
  );
  await expect(
    Objectives.panel().getByRole('link', { name: 'Connect GitHub' }),
  ).toHaveAttribute('href', '/setup/github');
});

test('while the first read runs, objectives say so', async () => {
  await Objectives.connectGithub();
  await Objectives.scenario('first-sync');
  await page.goto('/');

  await expect(Objectives.panel().getByRole('status')).toContainText(
    'Reading your Projects for the first time',
  );
});

test('with no initiatives, home explains how to make one', async () => {
  await Objectives.scenario('empty');
  await page.goto('/');

  const panel = Objectives.panel();
  await expect(panel).toContainText('No initiatives yet');
  await expect(panel).toContainText('Project in a GitHub organisation');
  await expect(panel).toContainText('Priority');
  await expect(panel).toContainText('Target date');
  await expect(panel).toContainText(
    'Only Projects owned by an organisation can be read for now.',
  );
});

test('when objectives fail, the rest of home still renders', async () => {
  await Objectives.scenario('failing');
  await page.goto('/');

  await expect(Objectives.panel()).toContainText('Objectives didn’t load');
  await expect(
    page.getByRole('region', { name: 'Needs you', exact: true }),
  ).toContainText('Rate-limit the public search endpoint');
});

test('an expanded epic lists its tasks, open first, with who has them', async () => {
  await Objectives.scenario('populated');
  await page.goto('/');

  const epic = Objectives.panel().locator('[data-objective="E_passkeys"]');
  const list = epic.getByRole('list', { name: /^Tasks in/u });
  await expect(list).toHaveCount(0);

  await Objectives.expand('Sign-in with passkeys');
  const tasks = list.getByRole('listitem');
  await expect(tasks).toHaveCount(3);
  await expect(tasks.nth(0)).toContainText('Rate-limit sign-in attempts');
  await expect(tasks.nth(0)).toContainText('ada');
  await expect(tasks.nth(0)).toContainText('To do');
  await expect(tasks.nth(1)).toContainText('Show a passkey nickname');
  await expect(tasks.nth(1)).toContainText('—');
  await expect(tasks.nth(2)).toContainText('Hash recovery codes');
  await expect(tasks.nth(2)).toContainText('grace');
  await expect(tasks.nth(2)).toContainText('Done');
  await expect(
    tasks.nth(0).getByRole('link', { name: 'Rate-limit sign-in attempts' }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/api/issues/101');
});

test('active initiatives lead home, in Mission Control’s order, with their epics', async () => {
  await Objectives.scenario('populated');
  await page.goto('/');

  await expect(Objectives.initiativeTitles()).toHaveText([
    /^Public launch/u,
    /^Docs refresh/u,
  ]);
  const epics = Objectives.epics('Public launch');
  await expect(epics.getByRole('listitem')).toHaveCount(3);
  await expect(epics.getByRole('listitem').first()).toContainText(
    'Sign-in with passkeys',
  );
  await expect(epics.getByRole('listitem').first()).toContainText(
    '4 of 6 done',
  );
  await expect(Objectives.epicToggle('Billing page')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(Objectives.epicToggle('Billing page')).toContainText(
    'Due after its initiative',
  );
  await expect(Objectives.panel()).toContainText('No activity in 14 days');
  await Objectives.expand('Sign-in with passkeys');
  await expect(epics).toContainText('Next Rate-limit sign-in attempts');
  await expect(epics).toContainText('grace closed “Hash recovery codes”');
  await expect(
    Objectives.panel().getByRole('link', { name: /^Public launch/u }),
  ).toHaveAttribute('href', 'https://github.com/orgs/acme-labs/projects/1');
  await expect(Objectives.panel()).not.toContainText('Private beta');
});

test('Today’s focus sits below Needs you', async () => {
  const objectives = await Objectives.panel().boundingBox();
  const needsYou = await page
    .getByRole('region', { name: 'Needs you', exact: true })
    .boundingBox();

  expect(needsYou?.y ?? 0).toBeLessThan(objectives?.y ?? 0);
});

test('the filter shows done initiatives and keeps the choice in the URL', async () => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Show done/u }).click();

  await expect(page).toHaveURL(/\?show=done$/u);
  await expect(Objectives.panel()).toContainText('Private beta');
  await page.reload();
  await expect(Objectives.panel()).toContainText('Private beta');

  await page.getByRole('link', { name: /^Show done/u }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(Objectives.panel()).not.toContainText('Private beta');
});

test('parking an epic hides it until parked ones are shown, and unparking brings it back', async () => {
  await page.goto('/');
  const menu = await Objectives.openMenu('Status page');
  await menu.getByRole('button', { name: 'Park' }).click();

  await expect(Objectives.epics('Public launch')).not.toContainText(
    'Status page',
  );
  await page.getByRole('link', { name: /^Show parked/u }).click();
  const parked = Objectives.epics('Public launch')
    .getByRole('listitem')
    .filter({ hasText: 'Status page' });
  await expect(parked).toContainText('Parked');

  const again = await Objectives.openMenu('Status page');
  await again.getByRole('button', { name: 'Unpark' }).click();
  await expect(parked).not.toContainText('Parked');
});

test('Dash sets and clears what the tracker leaves empty, and hides what it owns', async () => {
  await page.goto('/');
  const menu = await Objectives.openMenu('Status page');
  await menu.getByLabel('Progress (%)').fill('40');
  await menu.getByRole('button', { name: 'Save' }).last().click();

  const status = Objectives.epics('Public launch')
    .getByRole('listitem')
    .filter({ hasText: 'Status page' });
  await expect(status).toContainText('40%');
  const clearing = await Objectives.openMenu('Status page');
  await clearing.getByRole('button', { name: 'Clear progress (%)' }).click();
  await expect(status).toContainText('No progress yet');

  const prioritising = await Objectives.openMenu('Status page');
  await prioritising.getByLabel('Priority').selectOption('P2');
  await prioritising.getByRole('button', { name: 'Save' }).first().click();
  const toggle = Objectives.epicToggle('Status page');
  await expect(toggle.getByTitle('Set in Dash')).toHaveText(
    /^P2\s*, set in Dash$/u,
  );
  const unsetting = await Objectives.openMenu('Status page');
  await unsetting.getByRole('button', { name: 'Clear priority' }).click();
  await expect(toggle).not.toContainText('set in Dash');

  const owned = await Objectives.openMenu('Sign-in with passkeys');
  await expect(owned.getByLabel('Priority')).toHaveCount(0);
  await expect(owned.getByLabel('Due date')).toHaveCount(0);
  await expect(owned).toContainText(
    'GitHub sets priority, due date and progress here.',
  );
  await page.keyboard.press('Escape');
});

test('a field the tracker took over since the page loaded is explained, not saved', async () => {
  await page.goto('/');
  await page.request.post(
    `${missionControl}/objectives/__stub/claim?id=PVT_docs`,
  );
  const menu = await Objectives.openMenu('Docs refresh');
  await menu.getByLabel('Priority').selectOption('P2');
  await menu.getByRole('button', { name: 'Save' }).first().click();

  await expect(menu.getByRole('alert')).toContainText(
    'GitHub already sets this, so change it there.',
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(
    Objectives.panel()
      .getByRole('listitem')
      .filter({ hasText: 'Docs refresh' })
      .first(),
  ).toContainText('P1');
});

test('progress bars and the actions button line up whatever the count or due date', async () => {
  await Objectives.scenario('populated');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const docs = Objectives.epics('Docs refresh').getByRole('listitem');
  await expect(docs).toHaveCount(3);
  await expect(docs.filter({ hasText: 'No progress yet' })).toHaveCount(1);
  await expect(docs.filter({ hasText: '12 of 12 done' })).toHaveCount(1);
  await expect(docs.filter({ hasText: '3 of 5 done' })).toHaveCount(1);
  await expect(docs.filter({ hasText: 'Refresh API reference' })).toHaveCount(
    1,
  );

  const boxes = await EpicGeometries.trackBoxes(Objectives.panel());
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  expect(new Set(boxes.map((box) => box.x)).size).toBe(1);
  expect(new Set(boxes.map((box) => box.width)).size).toBe(1);

  const geometry = await EpicGeometries.measure(Objectives.panel());
  const passkeys = geometry.find(
    (candidate) => candidate.title === 'Sign-in with passkeys',
  );
  expect(passkeys?.chipBesideTitle, 'passkeys title sits beside its chip').toBe(
    true,
  );
  expect(passkeys?.rowHeight, 'passkeys row stays one line').toBeLessThan(60);

  const count = await EpicGeometries.initiativeCount(
    Objectives.panel(),
    'PVT_docs',
  );
  expect(count.text).toBe('100 of 120 done');
  expect(count.fits, 'a 3-figure count stays inside its progress box').toBe(
    true,
  );

  const menuX = async (title: string) =>
    (
      await Objectives.panel()
        .getByRole('button', { name: `Change ${title}` })
        .boundingBox()
    )?.x;
  const withDue = await menuX('Refresh API reference');
  expect(withDue).toBeDefined();
  expect(await menuX('Publish the changelog')).toBe(withDue);
  expect(await menuX('Rewrite the guides')).toBe(withDue);

  for (const width of [1024, 900]) {
    await page.setViewportSize({ width, height: 800 });
    const height = async (title: string) =>
      (await docs.filter({ hasText: title }).boundingBox())?.height;
    expect(
      await height('Publish the changelog'),
      `no-due row height at ${String(width)}px`,
    ).toBe(await height('Refresh API reference'));
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('home fits a phone and keeps Needs you clear of the last panel', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(Objectives.panel()).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const pill = await page
    .getByRole('button', { name: /^Needs you/u })
    .boundingBox();
  const last = await page
    .getByRole('region', { name: 'Since yesterday', exact: true })
    .boundingBox();
  expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual(
    pill?.y ?? 0,
  );
  await page.setViewportSize({ width: 1280, height: 800 });
});
