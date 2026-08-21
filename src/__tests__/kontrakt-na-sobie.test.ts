/**
 * Paczka uruchamia własny zestaw kontraktowy na sobie i na udawanym landingu.
 * Dzięki temu zestaw jest sprawdzony, zanim ktokolwiek wpnie go u siebie —
 * a przy okazji te same testy pilnują komponentu.
 */
import { createElement } from 'react';
import { BanerZgody } from '../BanerZgody';
import { kontraktBaneraZgody } from '../../testy/kontrakt';

kontraktBaneraZgody({
  element: () => createElement(BanerZgody, { klucz: 'fixture_consent' }),
  klucz: 'fixture_consent',
  sciezkaZapasu: 'src/__tests__/fixture-globals.css',
  rezerwa: [
    { plik: 'src/__tests__/fixture-globals.css', selektor: '.quiz' },
    { plik: 'src/__tests__/fixture-globals.css', selektor: '.quiz-nawigacja' },
    // Wariant tailwindowy — klasa arbitralna w JSX zamiast reguły CSS.
    { plik: 'src/__tests__/fixture-strona.tsx', wzorzec: /pb-\[calc\([^\]]*var\(--consent-h[^\]]*\]/ },
  ],
  wysokoscNaTelefonie: 87,
});
