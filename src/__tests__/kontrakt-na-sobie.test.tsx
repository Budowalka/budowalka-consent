/**
 * Paczka uruchamia własny zestaw kontraktowy na sobie i na udawanym arkuszu
 * klienta. Dzięki temu zestaw jest sprawdzony, zanim ktokolwiek wpnie go
 * u siebie — a przy okazji te same testy pilnują komponentu.
 */
import { createElement } from 'react';
import { BanerZgody } from '../BanerZgody';
import { kontraktBaneraZgody } from '../../testy/kontrakt';

kontraktBaneraZgody({
  element: () => createElement(BanerZgody, { klucz: 'fixture_consent' }),
  klucz: 'fixture_consent',
  sciezkaCss: 'src/__tests__/fixture-globals.css',
  selektoryRezerwy: ['.quiz', '.quiz-nawigacja'],
  wysokoscNaTelefonie: 87,
});
