import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { CvExtractionSchema } from '@meridian/shared';
import mammoth from 'mammoth';
import type { Env } from '../../config/env';
import type { Logger } from '../../lib/logger';
import { ExtractionError, type CvExtractor } from './extractor';

const SYSTEM_PROMPT = `You extract structured data from a software developer's CV for an internal staffing tool.

Rules:
- Only use information that is present in the CV. Never invent employers, dates, skills or certificates.
- If a value is not in the CV, return null (or an empty list) with confidence 0.
- "confidence" (0-1) states how sure you are that the value is correct and complete.
- "source" is a short verbatim quote (max. 200 characters) from the CV that supports the value, or null.
- Dates use the format YYYY-MM; if only a year is given, use YYYY-01 and lower the confidence. Current positions have toDate null.
- Skill "level" is 1-5 (1 = basics, 3 = solid professional use, 5 = expert), estimated from years and responsibilities; "years" is the hands-on experience.
- Use common skill names (e.g. "Spring Boot", "PostgreSQL", "Kubernetes").
- Seniority: junior (<3 years), mid (3-6), senior (>6 or clear senior role), lead (team/tech lead).
- Language codes are ISO 639-1 (de, en, ar, ...); levels are CEFR (A1-C2) or NATIVE.
- Write summaryDe in German and summaryEn in English (3-4 factual sentences about focus and experience, no marketing language). Translate descriptions where only one language is available and lower the confidence of translated fields.
- Do not include contact data of third parties (references, former managers).
A human reviewer checks every field before anything is saved.`;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * CV extraction via the Claude API with structured outputs (JSON schema derived from the
 * shared Zod schema). Only the CV content is sent; no internal data is added to the request.
 */
export function createAnthropicExtractor(env: Env, logger: Logger): CvExtractor {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
    timeout: env.CV_IMPORT_TIMEOUT_MS,
    maxRetries: 1,
  });

  return {
    async extract({ bytes, mime }) {
      let content: Anthropic.Beta.BetaContentBlockParam[];
      if (mime === 'application/pdf') {
        content = [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: Buffer.from(bytes).toString('base64'),
            },
          },
          { type: 'text', text: 'Extract the profile from this CV.' },
        ];
      } else if (mime === DOCX_MIME) {
        let text: string;
        try {
          text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.trim();
        } catch {
          throw new ExtractionError('IMPORT_UNREADABLE', 'Document could not be read');
        }
        if (text.length < 50)
          throw new ExtractionError('IMPORT_UNREADABLE', 'Document contains no readable text');
        content = [
          { type: 'text', text: `Extract the profile from this CV:\n\n<cv>\n${text}\n</cv>` },
        ];
      } else {
        throw new ExtractionError('IMPORT_UNREADABLE', 'Unsupported file type');
      }

      try {
        const response = await client.beta.messages.parse({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          output_config: { effort: 'medium', format: betaZodOutputFormat(CvExtractionSchema) },
          ...(env.ANTHROPIC_FALLBACKS
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
          ...(env.ANTHROPIC_INFERENCE_GEO ? { inference_geo: env.ANTHROPIC_INFERENCE_GEO } : {}),
          messages: [{ role: 'user', content }],
        });
        if (response.stop_reason === 'refusal') {
          logger.warn('cv extraction refused', {
            category: response.stop_details?.category ?? null,
          });
          throw new ExtractionError('IMPORT_FAILED', 'The model declined to process the document');
        }
        if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
          throw new ExtractionError('IMPORT_FAILED', 'Extraction result incomplete');
        }
        logger.info('cv extracted', {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });
        return { model: response.model, extraction: response.parsed_output };
      } catch (err) {
        if (err instanceof ExtractionError) throw err;
        if (err instanceof Anthropic.APIConnectionTimeoutError) {
          throw new ExtractionError('IMPORT_TIMEOUT', 'Extraction timed out');
        }
        if (err instanceof Anthropic.BadRequestError) {
          // e.g. password-protected or corrupt PDF
          logger.warn('cv extraction rejected', { status: err.status });
          throw new ExtractionError('IMPORT_UNREADABLE', 'Document could not be processed');
        }
        if (err instanceof Anthropic.APIError) {
          logger.error('cv extraction api error', { status: err.status });
          throw new ExtractionError('IMPORT_FAILED', 'Extraction service unavailable');
        }
        logger.error('cv extraction failed', { error: err });
        throw new ExtractionError('IMPORT_FAILED', 'Extraction failed');
      }
    },
  };
}
