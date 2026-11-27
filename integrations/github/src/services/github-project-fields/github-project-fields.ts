import type { CustomField, CustomFieldReader } from '@dash/integrations-core';

/** Reads a Project item's custom fields, such as Priority and Target date. A stub that reads nothing yet. */
export class GithubProjectFields implements CustomFieldReader {
  async listCustomFields(): Promise<readonly CustomField[]> {
    return [];
  }
}
