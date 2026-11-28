import { describe, expect, it } from 'vitest';
import { HomeGreeting } from '#lib/home/home-greeting.ts';

class Clock {
  static at(hour: number): Date {
    return new Date(2026, 10, 27, hour, 30);
  }
}

describe('HomeGreeting salutation', () => {
  it.each([
    [4, 'Good evening, Ada'],
    [5, 'Good morning, Ada'],
    [11, 'Good morning, Ada'],
    [12, 'Good afternoon, Ada'],
    [16, 'Good afternoon, Ada'],
    [17, 'Good evening, Ada'],
    [23, 'Good evening, Ada'],
  ])('at %i:30 local time reads “%s”', (hour, expected) => {
    const greeting = new HomeGreeting({
      now: Clock.at(hour),
      name: 'Ada Lovelace',
    });

    expect(greeting.salutation).toBe(expected);
  });

  it('leaves the name out when nobody is signed in or the name is blank', () => {
    expect(new HomeGreeting({ now: Clock.at(9), name: null }).salutation).toBe(
      'Good morning',
    );
    expect(new HomeGreeting({ now: Clock.at(9), name: '  ' }).salutation).toBe(
      'Good morning',
    );
  });
});

describe('HomeGreeting date', () => {
  it('names the weekday, day and month', () => {
    const greeting = new HomeGreeting({ now: Clock.at(9), name: 'Ada' });

    expect(greeting.date).toBe('Friday 27 November');
  });
});
