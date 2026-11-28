import { describe, expect, it } from 'vitest';
import { TimeZoneWording } from '#lib/time-zone/time-zone-wording.ts';

describe('TimeZoneWording', () => {
  it('names a zone the way people say it', () => {
    expect(TimeZoneWording.label('America/New_York')).toBe('Eastern Time');
  });

  it.each(['UTC', 'Mars/Olympus_Mons'])(
    'has no name for %s, which only has an offset or is unknown',
    (timeZone) => {
      expect(TimeZoneWording.label(timeZone)).toBeNull();
    },
  );
});
