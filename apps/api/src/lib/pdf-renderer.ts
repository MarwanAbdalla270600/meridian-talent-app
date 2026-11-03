import { chromium, type Browser } from 'playwright';
import { AppError } from './errors';
import type { Logger } from './logger';

export interface PdfRenderer {
  render(html: string): Promise<Uint8Array>;
  close(): Promise<void>;
  stats(): { running: number; queued: number };
}

export interface PdfRendererOptions {
  concurrency: number;
  timeoutMs: number;
  queueMax: number;
  /** Relaunch the browser after this many renders to bound memory growth. */
  recycleAfter?: number;
  logger: Logger;
}

/**
 * Chromium-based HTML→PDF renderer:
 *  - one shared browser instance (lazy start, auto relaunch on crash / after N jobs)
 *  - a fresh, isolated context per job (closed in `finally` → no leaks)
 *  - bounded concurrency + bounded queue (503 PDF_BUSY when full) + per-job timeout
 *  - JavaScript disabled and all network requests blocked (templates are self-contained)
 */
export function createPdfRenderer(opts: PdfRendererOptions): PdfRenderer {
  let browser: Promise<Browser> | null = null;
  let renders = 0;
  let running = 0;
  const queue: (() => void)[] = [];
  const recycleAfter = opts.recycleAfter ?? 200;

  const getBrowser = () => {
    browser ??= chromium
      .launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-zygote'] })
      .then((b) => {
        b.on('disconnected', () => {
          browser = null;
        });
        return b;
      })
      .catch((err) => {
        browser = null;
        throw err;
      });
    return browser;
  };

  const acquire = () =>
    new Promise<void>((resolve, reject) => {
      if (running < opts.concurrency) {
        running++;
        resolve();
      } else if (queue.length >= opts.queueMax) {
        reject(new AppError(503, 'PDF_BUSY', 'PDF service busy, please retry'));
      } else {
        queue.push(() => {
          running++;
          resolve();
        });
      }
    });

  const release = () => {
    running--;
    queue.shift()?.();
  };

  async function renderOnce(html: string): Promise<Uint8Array> {
    const b = await getBrowser();
    const context = await b.newContext({ javaScriptEnabled: false, offline: true });
    try {
      await context.route('**/*', (route) =>
        route.request().url().startsWith('data:') ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: opts.timeoutMs });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      });
      return new Uint8Array(pdf);
    } finally {
      await context.close().catch(() => {});
    }
  }

  return {
    async render(html) {
      await acquire();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AppError(504, 'PDF_TIMEOUT', 'PDF rendering timed out')),
            opts.timeoutMs,
          );
        });
        const out = await Promise.race([renderOnce(html), timeout]);
        renders++;
        if (renders >= recycleAfter && running === 1) {
          renders = 0;
          const old = browser;
          browser = null;
          old?.then((b) => b.close()).catch(() => {});
        }
        return out;
      } catch (err) {
        if (err instanceof AppError) throw err;
        opts.logger.error('pdf render failed', { error: err });
        throw new AppError(500, 'PDF_FAILED', 'PDF rendering failed');
      } finally {
        clearTimeout(timer);
        release();
      }
    },
    async close() {
      const b = browser;
      browser = null;
      if (b) await (await b).close().catch(() => {});
    },
    stats: () => ({ running, queued: queue.length }),
  };
}
