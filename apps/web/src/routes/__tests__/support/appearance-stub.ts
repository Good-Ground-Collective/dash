import { z } from 'zod';

const appearanceSchema = z.object({
  theme: z.enum(['characters']),
  mode: z.enum(['light', 'dark']),
});

export interface AppearanceStubAnswer {
  status: number;
  body: object;
}

/** Mission Control's saved appearance for the e2e tests' one person, in memory. */
export class AppearanceStub {
  private colorMode: 'light' | 'dark' | null = null;

  reset(): void {
    this.colorMode = null;
  }

  save(body: string): AppearanceStubAnswer {
    const input = appearanceSchema.parse(JSON.parse(body || '{}'));
    this.colorMode = input.mode;
    return { status: 200, body: input };
  }

  /** The person as the session lookup returns them, with their appearance. */
  withAppearance<T extends object>(
    person: T,
  ): T & { theme: 'characters'; colorMode: 'light' | 'dark' | null } {
    return { ...person, theme: 'characters', colorMode: this.colorMode };
  }
}
