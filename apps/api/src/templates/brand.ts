import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Brand assets shared with the web app (packages/shared/brand) – replaceable without code changes. */
const dir = fileURLToPath(new URL('../../../../packages/shared/brand/', import.meta.url));

interface BrandConfig {
  name: string;
  city: { de: string; en: string };
  primaryColor: string;
  primaryDarkColor: string;
  navColor: string;
  logo: string;
  font: string;
}

const config = JSON.parse(readFileSync(`${dir}brand.json`, 'utf8')) as BrandConfig;

export const brand = {
  ...config,
  logoSvg: readFileSync(`${dir}${config.logo}`, 'utf8'),
  fontBase64: readFileSync(`${dir}${config.font}`).toString('base64'),
};

export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** CSS string literal (for @page margin boxes). */
export const cssString = (v: string) =>
  `"${v.replace(/[\\"]/g, (c) => `\\${c}`).replace(/\n/g, ' ')}"`;

/** Base document with embedded font (no network access during rendering). */
export function documentShell(
  lang: string,
  title: string,
  css: string,
  body: string,
  footer?: { left: string; right: string },
): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@font-face{font-family:'Inter';font-weight:100 900;src:url(data:font/woff2;base64,${brand.fontBase64}) format('woff2');}
@page{size:A4;margin:14mm 14mm 18mm${footer ? `;@bottom-left{content:${cssString(footer.left)};font:7.5pt 'Inter',sans-serif;color:#5b6475}@bottom-right{content:${cssString(footer.right)} " · " counter(page) "/" counter(pages);font:7.5pt 'Inter',sans-serif;color:#5b6475}` : ''}}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter',sans-serif;color:#111827;font-size:10pt;line-height:1.45;
  /* keep PDF text copyable/searchable: no contextual alternates, ligatures or kerning */
  font-feature-settings:'calt' 0,'liga' 0;font-variant-ligatures:none;font-kerning:none}
${css}
</style></head><body>${body}</body></html>`;
}
