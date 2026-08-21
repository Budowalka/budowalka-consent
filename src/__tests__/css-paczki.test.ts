/**
 * Kontrakt arkusza paczki. W jsdom nie ma kaskady, więc czytamy źródło —
 * inaczej można cicho odwrócić układ przycisków albo skasować zapas przed
 * hydracją i mieć zielony zestaw.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ZAPAS_DOMYSLNY } from '../stale';

const css = readFileSync(path.resolve(process.cwd(), 'src/baner-zgody.css'), 'utf8');

describe('arkusz paczki', () => {
  it('daje wartość domyślną zmiennej, żeby calc() nie padł bez JavaScriptu', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--consent-h:\s*0px/);
  });

  it('trzyma zapas przed hydracją jako fallback, nie jako sztywną definicję', () => {
    const regula = css.match(/html:not\(\[data-consent='decided'\]\)\s*\{([^}]*)\}/);
    expect(regula, 'brak reguły z zapasem przed hydracją').not.toBeNull();
    expect(regula![1]).toContain(`var(--consent-zapas, ${ZAPAS_DOMYSLNY}px)`);
  });

  it('chowa baner powracającemu jeszcze przed pierwszym malowaniem', () => {
    expect(css).toMatch(/html\[data-consent='decided'\]\s+\.consent-banner\s*\{[^}]*display:\s*none/);
  });

  it('baner stoi przy dolnej krawędzi i leży nad treścią', () => {
    const regula = css.match(/\n\.consent-banner\s*\{([^}]*)\}/);
    expect(regula).not.toBeNull();
    expect(regula![1]).toContain('position: fixed');
    expect(regula![1]).toContain('bottom: 0');
  });

  it('w rzędzie zgoda ląduje po prawej, w kolumnie zostaje na górze', () => {
    const rzad = css.match(/\n\.consent-przyciski\s*\{([^}]*)\}/);
    expect(rzad, 'brak bazowej reguły .consent-przyciski').not.toBeNull();
    expect(rzad![1]).toContain('flex-direction: row-reverse');

    const kolumna = css.match(/@media \(max-width: 620px\)[\s\S]*?\.consent-przyciski\s*\{([^}]*)\}/);
    expect(kolumna, 'brak reguły .consent-przyciski dla telefonu').not.toBeNull();
    expect(kolumna![1]).toContain('flex-direction: column');
    expect(kolumna![1]).not.toContain('column-reverse');
  });
});
