import { z } from 'zod';
import { LOCALES, PDF_VARIANTS } from '../enums';

const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const PdfQuerySchema = z.object({
  variant: z.enum(PDF_VARIANTS).default('short'),
  lang: z.enum(LOCALES).default('de'),
  /** Anonymised is the default; must be explicitly disabled. */
  anonymized: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
  showRate: bool,
});
export type PdfOptions = z.infer<typeof PdfQuerySchema>;
