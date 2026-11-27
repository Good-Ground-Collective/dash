import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CustomFieldReader } from '#src/contracts/custom-fields.ts';
import type { TaskTracker } from '#src/contracts/task-tracker.ts';
import {
  customFieldsCapability,
  taskTrackerCapability,
} from '#src/definitions/capabilities/capabilities.ts';
import { Capability } from '#src/definitions/capabilities/capability.ts';
import { DuplicateCapabilityError } from '#src/errors.ts';
import { CapabilitySet } from '#src/services/capability-set/capability-set.ts';

class EmptyTaskTracker implements TaskTracker {
  async listInitiatives(): Promise<[]> {
    return [];
  }

  async listEpics(): Promise<[]> {
    return [];
  }

  async listTickets(): Promise<[]> {
    return [];
  }
}

describe('CapabilitySet', () => {
  const tracker = new EmptyTaskTracker();
  const capabilities = new CapabilitySet().with(taskTrackerCapability, tracker);

  it('returns the implementation registered for a capability', () => {
    expect(capabilities.get(taskTrackerCapability)).toBe(tracker);
  });

  it('returns undefined for a capability it does not offer', () => {
    expect(capabilities.get(customFieldsCapability)).toBeUndefined();
  });

  it('matches capabilities by name, not by key instance', () => {
    const sameName = new Capability<TaskTracker>({ name: 'task-tracker' });
    expect(capabilities.get(sameName)).toBe(tracker);
  });

  it('types the result as the capability interface or undefined', () => {
    expectTypeOf(capabilities.get(customFieldsCapability)).toEqualTypeOf<
      CustomFieldReader | undefined
    >();
  });

  it('leaves the original set unchanged when extended', () => {
    expect(new CapabilitySet().get(taskTrackerCapability)).toBeUndefined();
    expect(capabilities.get(taskTrackerCapability)).toBe(tracker);
  });

  it('rejects a second implementation of the same capability', () => {
    expect(() =>
      capabilities.with(taskTrackerCapability, new EmptyTaskTracker()),
    ).toThrow(DuplicateCapabilityError);
  });
});
