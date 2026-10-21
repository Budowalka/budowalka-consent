'use client';

import { createElement, useEffect, useState } from 'react';
import {
  ATRYBUT_ZGODY,
  ETYKIETA_ODMOWY_DOMYSLNA,
  ETYKIETA_ZGODY_DOMYSLNA,
  NAGLOWEK_DOMYSLNY,
  TEKST_DOMYSLNY,
  ZGODA_PODJETA,
  ladunekZgody,
} from './stale';
import { wyslijDecyzje } from './licznik';

export type WlasciwosciBanera = {
  /**
   * Klucz zapisu decyzji w `localStorage`, z prefiksem klienta
   * (np. `termofasady_consent`). Ta sama wartość musi trafić do
   * `skryptZgody({ klucz })` w layoucie — inaczej powracającemu baner mignie.
   */
  klucz: string;
  naglowek?: string;
  /** Nadpisanie tekstu. Musi się mieścić w limicie słów, pilnuje tego zestaw kontraktowy. */
  tekst?: string;
  etykietaZgody?: string;
  etykietaOdmowy?: string;
  /** Dodatkowa klasa na karcie dla landingów, które chcą dopiąć własne narzędzia (np. Tailwind). */
  klasa?: string;
};

/**
 * Baner zgody na ciasteczka (Consent Mode v2) dla landingów kalkulatorowych —
 * od 30.08.2026 pełnoekranowy overlay z kartą, celowo wymuszający decyzję.
 * Pasek na dole dawał za niski consent rate: dawało się go zignorować, więc
 * większość ruchu nie podejmowała żadnej decyzji i Google nie zbierał danych.
 *
 * ⚠ DWIE RZECZY, KTÓRYCH NIE WOLNO TU ZMIENIĆ BEZ ZROZUMIENIA, PO CO SĄ:
 *
 * 1. `useState(true)`, nie `false`. Overlay MUSI być w HTML z serwera. Wariant
 *    z doklejaniem po `useEffect` kosztował na dwóch landingach około dwóch
 *    sekund LCP: element na cały ekran pojawiał się po hydracji i przeglądarka
 *    brała go za kandydata na element LCP. Powracającego przed mignięciem chroni
 *    skrypt inline z layoutu (`data-consent="decided"` + `display:none` w CSS).
 *
 * 2. Obie opcje odblokowują stronę TAK SAMO. Scroll blokuje czysty CSS
 *    (`html:not([data-consent='decided']) body { overflow: hidden }`), a zdejmuje
 *    go atrybut `decided` — stawiany i po zgodzie, i po odmowie. Odmowa jest
 *    pełnowymiarowym przyciskiem, nie linkiem: cookie wall (dostęp tylko po
 *    zgodzie) jest nielegalny wg EDPB 05/2020, a ukryta odmowa kosztowała
 *    Google 325 mln € kary. Modal wymuszający DECYZJĘ z odmową o tym samym
 *    koszcie kliknięcia jest standardem rynkowym.
 *
 * Mechanizm pomiaru `--consent-h` zniknął razem z paskiem: overlay nie leży
 * trwale na treści, więc strona nie musi już rezerwować pod nim miejsca.
 */
export function BanerZgody({
  klucz,
  naglowek = NAGLOWEK_DOMYSLNY,
  tekst = TEKST_DOMYSLNY,
  etykietaZgody = ETYKIETA_ZGODY_DOMYSLNA,
  etykietaOdmowy = ETYKIETA_ODMOWY_DOMYSLNA,
  klasa,
}: WlasciwosciBanera) {
  const [widoczny, setWidoczny] = useState(true);

  useEffect(() => {
    let zapisana: string | null = null;
    try {
      zapisana = localStorage.getItem(klucz);
    } catch {
      // Tryb prywatny albo zablokowane ciasteczka. Lepiej zapytać drugi raz
      // niż wywalić layout — ten komponent renderuje się na każdej stronie.
      return;
    }

    if (zapisana) setWidoczny(false);

    // Stan zgody w gtag żyje w pamięci jednego załadowania strony. Zapisane
    // „zgadzam się" trzeba ponowić przy KAŻDYM wejściu, inaczej hity — w tym
    // konwersje — lecą w trybie odmowy mimo udzielonej zgody.
    if (zapisana === 'granted') przekazDoGtag('granted');
  }, [klucz]);

  function zdecyduj(wybor: 'granted' | 'denied') {
    try {
      localStorage.setItem(klucz, wybor);
    } catch {
      // Decyzja obowiązuje przynajmniej w tej wizycie.
    }
    document.documentElement.setAttribute(ATRYBUT_ZGODY, ZGODA_PODJETA);
    przekazDoGtag(wybor);
    setWidoczny(false);
    // Pomiar odpływu na banerze (plan 21.10.2026): dopiero po zapisie decyzji
    // i zdjęciu blokady, żeby wysyłka nie mogła opóźnić ani zablokować strony.
    wyslijDecyzje(wybor === 'granted' ? 'zgoda' : 'odmowa');
  }

  if (!widoczny) return null;

  /*
   * `createElement` zamiast JSX — nie z upodobania, tylko dlatego, że paczka
   * jedzie do landingów jako ŹRÓDŁO (bez kroku budowania). Gdyby były tu tagi
   * JSX, każde repo musiałoby dołożyć `esbuild: { jsx: 'automatic' }` do swojej
   * konfiguracji vitest — vite nie czyta `tsconfig.json` z `node_modules`,
   * więc bez tego testy padają na „React is not defined". Sprawdzone na świeżej
   * instalacji: to była jedyna rzecz, która nie działała out of the box.
   *
   * Kolejność w DOM: NAJPIERW zgoda, potem odmowa. Przyciski stoją w kolumnie
   * na każdej szerokości (karta jest wąska), „Zgadzam się" na górze — robi to
   * kolejność w DOM, nie `column-reverse`, żeby czytnik ekranu czytał to samo,
   * co widać.
   */
  return createElement(
    'div',
    {
      className: 'consent-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Zgoda na ciasteczka',
    },
    createElement(
      'div',
      { className: klasa ? `consent-banner ${klasa}` : 'consent-banner' },
      createElement('h2', { className: 'consent-naglowek' }, naglowek),
      createElement('p', { className: 'consent-tekst' }, tekst),
      createElement(
        'div',
        { className: 'consent-przyciski' },
        createElement(
          'button',
          { type: 'button', className: 'consent-tak', onClick: () => zdecyduj('granted') },
          etykietaZgody,
        ),
        createElement(
          'button',
          { type: 'button', className: 'consent-nie', onClick: () => zdecyduj('denied') },
          etykietaOdmowy,
        ),
      ),
    ),
  );
}

function przekazDoGtag(wybor: 'granted' | 'denied') {
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  gtag?.('consent', 'update', ladunekZgody(wybor));
}
