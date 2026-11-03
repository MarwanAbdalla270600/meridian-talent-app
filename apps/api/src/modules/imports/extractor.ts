import type { CvExtraction } from '@meridian/shared';

export interface CvExtractorInput {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

export interface CvExtractorResult {
  model: string;
  extraction: CvExtraction;
}

/** Error codes surfaced to the user with a manual fallback. */
export class ExtractionError extends Error {
  constructor(
    readonly code: 'IMPORT_UNREADABLE' | 'IMPORT_TIMEOUT' | 'IMPORT_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface CvExtractor {
  extract(input: CvExtractorInput): Promise<CvExtractorResult>;
}
