// Copies the shared brand assets (logo, font, brand.json) into public/brand.
// Single source of truth: packages/shared/brand (also used by the PDF templates).
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../../packages/shared/brand', import.meta.url));
const dest = fileURLToPath(new URL('../public/brand', import.meta.url));
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
