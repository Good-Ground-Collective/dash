import { z } from 'zod';

export const homeGreetingPropsSchema = z.object({
  now: z.date(),
  name: z
    .string()
    .nullable()
    .describe('The viewer’s full name, or `null` when nobody is signed in.'),
});

export type HomeGreetingProps = z.input<typeof homeGreetingPropsSchema>;

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** The line that heads Home: “Good morning, Seth” by the viewer's local time, and today's date. */
export class HomeGreeting {
  private readonly now: Date;
  private readonly firstName: string | null;

  constructor(props: HomeGreetingProps) {
    const valid = homeGreetingPropsSchema.parse(props);
    this.now = valid.now;
    const first = valid.name?.trim().split(/\s+/u)[0] ?? '';
    this.firstName = first === '' ? null : first;
  }

  get salutation(): string {
    const greeting = `Good ${HomeGreeting.partOfDay(this.now.getHours())}`;
    return this.firstName === null
      ? greeting
      : `${greeting}, ${this.firstName}`;
  }

  /** “Friday 28 November”. */
  get date(): string {
    return dateFormat.format(this.now);
  }

  private static partOfDay(hour: number): string {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    return 'evening';
  }
}
