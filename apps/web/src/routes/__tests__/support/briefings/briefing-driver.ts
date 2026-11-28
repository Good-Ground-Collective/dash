import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

/** The Briefing card as the person sees it, and the stub's control over what Mission Control says. */
export class BriefingDriver {
  private readonly page: Page;
  private readonly missionControl: string;

  constructor(props: { page: Page; missionControl: string }) {
    this.page = props.page;
    this.missionControl = props.missionControl;
  }

  region(): ReturnType<Page['getByRole']> {
    return this.page.getByRole('region', { name: 'Briefing', exact: true });
  }

  regenerate(): ReturnType<Page['getByRole']> {
    return this.region().getByRole('button', { name: /^Regenerat/u });
  }

  async scenario(name: string): Promise<void> {
    await this.page.request.post(
      `${this.missionControl}/briefing/__stub/scenario?name=${name}`,
    );
  }

  async control(action: string): Promise<void> {
    await this.page.request.post(
      `${this.missionControl}/briefing/__stub/${action}`,
    );
  }

  /** Waits until the page's live event stream is open, so no frame is sent before it listens. */
  async listening(): Promise<void> {
    await expect
      .poll(async () => {
        const response = await this.page.request.get(
          `${this.missionControl}/briefing/__stub/listeners`,
        );
        return z.object({ count: z.number() }).parse(await response.json())
          .count;
      })
      .toBeGreaterThan(0);
  }
}
