import { type CDPSession, expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let cdp: CDPSession;
let missionControl = '';

/** Chromium's virtual authenticators: this computer's, plus a phone reached over the hybrid transport. */
class Authenticators {
  static async platform(): Promise<void> {
    await Authenticators.add({ transport: 'internal', verifies: true });
  }

  /** A phone for as long as `use` runs. With `verifies` off, it declines, as when the person dismisses the prompt on it. */
  static async withPhone(
    props: { verifies: boolean },
    use: () => Promise<void>,
  ): Promise<void> {
    const authenticatorId = await Authenticators.add({
      transport: 'cable',
      verifies: props.verifies,
    });
    try {
      await use();
    } finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId,
      });
    }
  }

  private static async add(props: {
    transport: 'internal' | 'cable';
    verifies: boolean;
  }): Promise<string> {
    const { authenticatorId } = await cdp.send(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: props.transport,
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: props.verifies,
          automaticPresenceSimulation: true,
        },
      },
    );
    return authenticatorId;
  }
}

/** The step as the person sees it. */
class Step {
  static title(): ReturnType<Page['getByRole']> {
    return page.getByRole('heading', { name: 'Add a second passkey' });
  }

  static rows(): ReturnType<Page['getByRole']> {
    return page
      .getByRole('list', { name: 'Your passkeys' })
      .getByRole('listitem');
  }

  static addButton(): ReturnType<Page['getByRole']> {
    return page.getByRole('button', {
      name: 'Add a passkey on another device',
    });
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  page = await context.newPage();
  await page.clock.install();
  cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await Authenticators.platform();
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
});

test('saving codes during setup leads to the optional second passkey step', async () => {
  await page.goto('/setup');
  await page.getByLabel('Setup token').fill('stub-setup-token');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Display name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByRole('button', { name: 'Register passkey' }).click();
  await page.getByLabel('I’ve saved these codes somewhere safe').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL('/setup/second-passkey');
  await expect(Step.title()).toBeFocused();
  await expect(Step.title()).toHaveAccessibleDescription(
    'Step 4 of 4 · optional',
  );
  await expect(Step.rows()).toHaveCount(1);
  await expect(Step.rows()).toContainText('Added just now');
  await page.clock.fastForward('03:00');
  await expect(Step.rows()).toContainText('Added 3 minutes ago');
  await expect(Step.addButton()).toHaveAccessibleDescription(
    'Your browser shows a QR code to scan with your phone.',
  );
});

test('the step fits a phone without scrolling sideways', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('a declined prompt puts focus back on the add button', async () => {
  await Authenticators.withPhone({ verifies: false }, async () => {
    await Step.addButton().click();

    await expect(page.getByRole('alert')).toHaveText(
      'The passkey prompt was closed or timed out. Try again.',
    );
    await expect(Step.addButton()).toBeFocused();
    await expect(Step.rows()).toHaveCount(1);
  });
});

test('adds a passkey on another device, names it, and continues home', async () => {
  await expect(page.getByRole('status')).toBeEmpty();
  const asked = page.waitForRequest((request) =>
    request.url().includes('/passkey/generate-register-options'),
  );
  await Authenticators.withPhone({ verifies: true }, async () => {
    await Step.addButton().click();
    await expect(Step.rows()).toHaveCount(2);
  });

  expect(
    new URL((await asked).url()).searchParams.get('authenticatorAttachment'),
  ).toBe('cross-platform');
  await expect(page.getByRole('status')).toHaveText(/Added\. Name it/u);
  await expect(page.getByLabel('Name this passkey')).toBeFocused();
  await page.getByLabel('Name this passkey').fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByLabel('Name this passkey')).toHaveJSProperty(
    'validity.patternMismatch',
    true,
  );
  await page.getByLabel('Name this passkey').fill('Phone');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(Step.rows().filter({ hasText: 'Phone' })).toHaveCount(1);
  const next = page.getByRole('link', { name: 'Continue' });
  await expect(next).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip for now' })).toHaveCount(0);
  await next.click();
  await expect(page).toHaveURL('/');

  await page.goto('/settings');
  await expect(
    page.getByRole('list', { name: 'Your passkeys' }).getByText('Phone'),
  ).toBeVisible();
});

test('Skip for now goes home without adding one', async () => {
  await page.goto('/setup/second-passkey');
  await page.getByRole('link', { name: 'Skip for now' }).click();

  await expect(page).toHaveURL('/');
});
