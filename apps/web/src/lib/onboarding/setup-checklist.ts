import type { SetupChecklistReport } from '#lib/api/mission-control.ts';
import { connectGithubPath } from '#lib/auth/onboarding-route.ts';

/** Where adding a passkey outside setup happens: the settings panel, which isn't a numbered setup step. */
export const passkeySettingsPath = '/settings#passkeys-title';

/** One row of the card, in the words home shows. */
export interface SetupChecklistRow {
  id: string;
  title: string;
  body: string;
  action: { label: string; href: string };
  done: boolean;
}

interface RowCopy {
  title: string;
  body: string;
  action: { label: string; href: string };
}

/** The copy for each item Mission Control reports, by id. Unknown ids are left out, so a newer Mission Control can add items first. */
const copy: ReadonlyMap<string, RowCopy> = new Map([
  [
    'connectGitHub',
    {
      title: 'Connect GitHub',
      body: 'Choose which accounts Dash can read. Access is read-only.',
      action: { label: 'Connect GitHub', href: connectGithubPath },
    },
  ],
  [
    'secondPasskey',
    {
      title: 'Add a second passkey',
      body: 'A passkey on another device, like your phone, gets you in if this one is lost or wiped.',
      action: { label: 'Add a passkey', href: passkeySettingsPath },
    },
  ],
]);

/** The “Finish setting up” card on home: its rows, how many are done, and whether it shows at all. */
export class SetupChecklist {
  readonly rows: readonly SetupChecklistRow[];

  constructor(props: { report: SetupChecklistReport }) {
    this.rows = props.report.items.flatMap((item) => {
      const words = copy.get(item.id);
      return words === undefined ? [] : [{ ...words, ...item }];
    });
  }

  get doneCount(): number {
    return this.rows.filter((row) => row.done).length;
  }

  /** “1 of 2 done”. */
  get progress(): string {
    return `${this.doneCount} of ${this.rows.length} done`;
  }

  /** The card goes away once everything on it is done. */
  get visible(): boolean {
    return this.doneCount < this.rows.length;
  }

  /** The card for a report, or `null` when there's nothing left to do or Mission Control couldn't say. */
  static from(report: SetupChecklistReport | null): SetupChecklist | null {
    if (report === null) return null;
    const checklist = new SetupChecklist({ report });
    return checklist.visible ? checklist : null;
  }
}
