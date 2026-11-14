/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buttonClass } from './buttonClass';
import type { ButtonSize } from './buttonClass';
import { CRITICAL_COLOR } from './colors';

/** Strict WCAG AA (docs/DESIGN.md): colour pairs are read from the real tokens in index.css. */

function token(name: string): string {
  const m = new RegExp(String.raw`--color-${name}:\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`Token ${name} is not a plain hex value in index.css.`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

const WHITE = '#ffffff';
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

describe('white text on purple fills', () => {
  it('the brand value accent-500 is below AA, so it is never a text fill', () => {
    expect(contrast(WHITE, token('accent-500'))).toBeLessThan(4.5);
  });

  it('primary buttons of every size use accent-600 or darker, at least 4.5:1 with white', () => {
    for (const size of SIZES) {
      const cls = buttonClass('primary', size);
      const fill = /bg-accent-(\d+)/.exec(cls)?.[1];
      expect(fill, `${size}: ${cls}`).toBeDefined();
      expect(Number(fill)).toBeGreaterThanOrEqual(600);
      expect(contrast(WHITE, token(`accent-${fill}`))).toBeGreaterThanOrEqual(4.5);
      // The hover state must keep the contrast too.
      const hover = /hover:bg-accent-(\d+)/.exec(cls)?.[1];
      expect(Number(hover)).toBeGreaterThanOrEqual(600);
      expect(contrast(WHITE, token(`accent-${hover}`))).toBeGreaterThanOrEqual(4.5);
      expect(cls).toContain('text-white');
    }
  });

  it('the large primary button uses accent-700 (white 7.1:1)', () => {
    expect(buttonClass('primary', 'lg')).toContain('bg-accent-700');
  });

  it('the critical path colour carries the light task labels at 4.5:1 or more', () => {
    const name = /--color-(accent-\d+)\)/.exec(CRITICAL_COLOR)?.[1] ?? '';
    expect(contrast(token('surface'), token(name))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('purple text and chart labels', () => {
  it('accent-700 text is at least 4.5:1 on every light surface it is used on', () => {
    for (const bg of ['surface', 'sand-100', 'sand-200', 'sand-300', 'accent-50', 'accent-100']) {
      expect(contrast(token('accent-700'), token(bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent-800 and accent-900 text on the purple tints are at least 4.5:1', () => {
    expect(contrast(token('accent-800'), token('accent-50'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('accent-800'), token('accent-100'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('accent-900'), token('accent-100'))).toBeGreaterThanOrEqual(4.5);
  });

  it('accent-200 text on forest green is at least 4.5:1', () => {
    expect(contrast(token('accent-200'), token('brand-green-900'))).toBeGreaterThanOrEqual(4.5);
  });

  it('light labels on every epic chart colour are at least 4.5:1', () => {
    for (let i = 1; i <= 8; i++) {
      const m = new RegExp(
        String.raw`--color-epic-${i}:\s*(?:#([0-9a-fA-F]{6})|var\(--color-([a-z0-9-]+)\))`,
      ).exec(css);
      const hex = m?.[1] ? `#${m[1]}` : token(m?.[2] ?? '');
      expect(contrast(token('surface'), hex), `epic-${i}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('muted text on the sand surfaces is at least 4.5:1', () => {
    for (const bg of ['surface', 'sand-100', 'sand-300']) {
      expect(contrast(token('muted'), token(bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });
});
