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
  // Tu arkusz leży w repo, nie w node_modules — landingi zostawiają domyślną ścieżkę.
  sciezkaArkusza: 'src/baner-zgody.css',
  // Udawany landing po migracji z paska: nie może w nim zostać ślad po rezerwie.
  plikiBezSladu: ['src/__tests__/fixture-globals.css'],
});
