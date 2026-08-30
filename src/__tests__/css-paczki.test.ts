/**
 * Kontrakt arkusza paczki — to, czego nie pilnuje wspólny zestaw kontraktowy,
 * bo dotyczy tylko tego pliku, nie każdego landingu. W jsdom nie ma kaskady,
 * więc czytamy źródło.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve(process.cwd(), 'src/baner-zgody.css'), 'utf8');

describe('arkusz paczki', () => {
  it('kolory idą przez zmienne z wartościami zapasowymi — landing bez mapowania dostaje działającą kartę', () => {
    for (const zmienna of [
      '--consent-przyciemnienie',
      '--consent-tlo',
      '--consent-kolor-tekstu',
      '--consent-akcent',
      '--consent-akcent-tekst',
      '--consent-obwodka-przycisku',
    ]) {
      expect(css, `brak fallbacku dla ${zmienna}`).toMatch(
        new RegExp(`var\\(${zmienna}, [^)]+\\)`),
      );
    }
  });

  it('na telefonie karta dosuwa się do dołu — kciuk ma sięgać przycisków', () => {
    const media = css.match(/@media \(max-width: 620px\)[\s\S]*$/);
    expect(media, 'brak media query dla telefonu').not.toBeNull();
    expect(media![0]).toMatch(/\.consent-overlay\s*\{[^}]*align-items:\s*flex-end/);
    // Dolna krawędź karty musi uwzględniać pasek gestów iPhone'a.
    expect(media![0]).toContain('env(safe-area-inset-bottom)');
  });
});
