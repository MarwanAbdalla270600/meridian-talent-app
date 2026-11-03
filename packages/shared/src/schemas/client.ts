import { z } from 'zod';
import { optionalText, requiredText } from './common';

export const ClientInputSchema = z
  .object({
    name: requiredText(200),
    contactName: optionalText(160),
    contactEmail: z
      .email()
      .max(254)
      .nullish()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
    note: optionalText(4000),
  })
  .strict();
export type ClientInput = z.infer<typeof ClientInputSchema>;

export const ClientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  note: z.string().nullable(),
  requestCount: z.number().int(),
  openRequestCount: z.number().int(),
  createdAt: z.string(),
});
export type Client = z.infer<typeof ClientSchema>;
