import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });
const breakGlassSchema = z.object({ url: z.url() });

const email = 'ada@example.com';
const codes = ['k7m2-q9xp', 'w4hr-t8nc'];

let missionControl = '';

/** Mission Control's stub, through its own request context so its cookies never reach the browser. */
class Stub {
  static async freshAccount(request: APIRequestContext): Promise<void> {
    await request.post(`${missionControl}/api/auth/__stub/reset`);
    await request.post(`${missionControl}/api/auth/__stub/sign-in`);
    await request.post(`${missionControl}/api/auth/__stub/recovery-codes`, {
      data: { codes },
    });
  }

  static async breakGlassLink(request: APIRequestContext): Promise<string> {
    const answer = await request.post(
      `${missionControl}/api/auth/__stub/break-glass`,
    );
    return breakGlassSchema.parse(await answer.json()).url;
  }

  static async expireEnrolments(request: APIRequestContext): Promise<void> {
    await request.post(`${missionControl}/api/auth/__stub/expire-enrolments`);
  }
}

/** Chromium's virtual platform authenticator, so passkey prompts answer by themselves. */
class Authenticator {
  static async plugIn(context: BrowserContext, page: Page): Promise<void> {
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
  }
}

class RecoverPage {
  static async submit(
    page: Page,
    props: { email: string; code: string },
  ): Promise<void> {
    await page.getByLabel('Email', { exact: true }).fill(props.email);
    await page.getByLabel('Recovery code', { exact: true }).fill(props.code);
    await page.getByRole('button', { name: 'Continue to new passkey' }).click();
  }
}

test.beforeAll(({}, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
});

test.beforeEach(async ({ request, context, page }) => {
  await Stub.freshAccount(request);
  await Authenticator.plugIn(context, page);
});

test('sign-in reads as the board does and links to recovery', async ({
  page,
}) => {
  await page.goto('/sign-in');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute(
    'autocomplete',
    'username webauthn',
  );
  await expect(
    page.getByText('Your browser offers your passkey as you focus this field.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in with passkey' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Use a recovery code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Use a recovery code' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Recovery code', { exact: true }),
  ).toHaveAttribute('autocomplete', 'one-time-code');
});

test('a wrong code is refused the same way as an unknown email, back in the code field', async ({
  page,
}) => {
  await page.goto('/recover');
  const code = page.getByLabel('Recovery code', { exact: true });

  await RecoverPage.submit(page, { email, code: 'aaaa-aaaa' });
  const wrongCode = await page.getByRole('alert').textContent();
  await RecoverPage.submit(page, {
    email: 'nobody@example.com',
    code: codes[0] ?? '',
  });

  await expect(page.getByRole('alert')).toHaveText(wrongCode ?? '');
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(code).toHaveAccessibleDescription(wrongCode?.trim() ?? '');
});

test('a recovery code registers a new passkey for the named account, once', async ({
  page,
  context,
}) => {
  await page.goto('/recover');
  await RecoverPage.submit(page, { email, code: codes[0] ?? '' });

  const title = page.getByRole('heading', { name: 'Register a new passkey' });
  await expect(title).toBeFocused();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Register passkey' }).click();

  await expect(
    page.getByRole('button', { name: 'Account, signed in as Ada Lovelace' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/');

  await context.clearCookies();
  await page.goto('/recover');
  await RecoverPage.submit(page, {
    email,
    code: (codes[0] ?? '').toUpperCase(),
  });

  await expect(page.getByRole('alert')).toContainText(
    'don’t match an unused code',
  );
});

test('an enrolment that expires before the passkey sends you back to enter the code again', async ({
  page,
  request,
}) => {
  await page.goto('/recover');
  await RecoverPage.submit(page, { email, code: codes[1] ?? '' });
  await expect(page.getByText(email)).toBeVisible();

  await Stub.expireEnrolments(request);
  await page.getByRole('button', { name: 'Register passkey' }).click();

  await expect(page.getByRole('alert')).toContainText('your code wasn’t used');
  await expect(page.getByLabel('Recovery code', { exact: true })).toBeFocused();
  await expect(
    page.getByLabel('Recovery code', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', { name: 'Continue to new passkey' }).click();
  await page.getByRole('button', { name: 'Register passkey' }).click();
  await expect(page).toHaveURL('/');
});

test('too many tries holds the form until the wait is over', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/recover');
  const button = page.getByRole('button', { name: 'Continue to new passkey' });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await RecoverPage.submit(page, { email, code: 'aaaa-aaaa' });
    await expect(page.getByRole('alert')).toBeVisible();
  }

  await expect(page.getByRole('alert')).toHaveText(
    'Too many tries. Try again in 15 minutes.',
  );
  await expect(button).toBeDisabled();
  await page.clock.runFor('15:01');
  await expect(button).toBeEnabled();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('a failed passkey prompt keeps the person on the button', async ({
  page,
  context,
}) => {
  await page.goto('/recover');
  await RecoverPage.submit(page, { email, code: codes[0] ?? '' });
  await page.getByRole('button', { name: 'Register passkey' }).click();
  await expect(page).toHaveURL('/');
  await context.clearCookies();

  await page.goto('/recover');
  await RecoverPage.submit(page, { email, code: codes[1] ?? '' });
  const register = page.getByRole('button', { name: 'Register passkey' });
  await register.click();

  await expect(page.getByRole('alert')).toHaveText(
    'This device already has a passkey for Dash.',
  );
  await expect(register).toBeFocused();
});

test('a break-glass link names the account, leaves no trace of the enrolment and signs in', async ({
  page,
  request,
}) => {
  const link = await Stub.breakGlassLink(request);
  const enrolment = new URLSearchParams(new URL(link).hash.slice(1)).get(
    'enrolment',
  );
  const carried: string[] = [];
  page.on('request', (sent) => {
    const url = new URL(sent.url());
    const referer = sent.headers()['referer'] ?? '';
    const asContext =
      url.pathname === '/api/auth/passkey/generate-register-options' &&
      url.searchParams.get('context') === enrolment;
    const inUrl =
      !asContext && decodeURIComponent(sent.url()).includes(enrolment ?? '');
    if (inUrl || decodeURIComponent(referer).includes(enrolment ?? '')) {
      carried.push(sent.url());
    }
  });
  await page.goto('/sign-in');

  await page.goto(link);
  await expect(page.getByText(email)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Register passkey' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('button', { name: 'Account, signed in as Ada Lovelace' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/recover/passkey');
  expect(new URL(page.url()).hash).toBe('');
  await expect(
    page.getByRole('heading', { name: 'This link is incomplete' }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/sign-in');
  expect(carried).toEqual([]);
});

test('a break-glass link waits for a signed-in person to sign out', async ({
  page,
  request,
}) => {
  const link = await Stub.breakGlassLink(request);
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  const optionsRequests: string[] = [];
  page.on('request', (sent) => {
    if (sent.url().includes('/passkey/generate-register-options')) {
      optionsRequests.push(sent.url());
    }
  });

  await page.goto(link);
  await expect(
    page.getByRole('heading', { name: 'You’re signed in' }),
  ).toBeFocused();
  await expect(
    page.getByText(`You’re signed in as ${email}.`, { exact: false }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(optionsRequests).toEqual([]);

  await page.getByRole('button', { name: 'Sign out and continue' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Register passkey' }).click();
  await expect(page).toHaveURL('/');
});

test('an expired or incomplete break-glass link says what to do', async ({
  page,
  request,
}) => {
  const link = await Stub.breakGlassLink(request);
  await Stub.expireEnrolments(request);

  await page.goto(link);
  await expect(
    page.getByRole('heading', { name: 'This link has expired' }),
  ).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Use a recovery code' }),
  ).toBeVisible();

  await page.goto('/recover/passkey');
  await expect(
    page.getByRole('heading', { name: 'This link is incomplete' }),
  ).toBeVisible();
});
