import { z } from 'zod';

export const customFieldSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.null()]),
});

export type CustomField = z.infer<typeof customFieldSchema>;

/** An extension for trackers with user-defined fields on their items. */
export interface CustomFieldReader {
  listCustomFields(query: {
    externalId: string;
  }): Promise<readonly CustomField[]>;
}
