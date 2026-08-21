'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import {
  ATRYBUT_ZGODY,
  ETYKIETA_ODMOWY_DOMYSLNA,
  ETYKIETA_ZGODY_DOMYSLNA,
  TEKST_DOMYSLNY,
  ZGODA_PODJETA,
  ZMIENNA_WYSOKOSCI,
  ladunekZgody,
} from './stale';

export type WlasciwosciBanera = {
  /**
   * Klucz zapisu decyzji w `localStorage`, z prefiksem klienta
   * (np. `termofasady_consent`). Ta sama wartość musi trafić do
   * `skryptZgody({ klucz })` w layoucie — inaczej powracającemu baner mignie.
   */
  klucz: string;
  /** Nadpisanie tekstu. Musi się mieścić w limicie słów, pilnuje tego zestaw kontraktowy. */
  tekst?: string;
  etykietaZgody?: string;
  etykietaOdmowy?: string;
  /** Dodatkowa klasa dla landingów, które chcą dopiąć własne narzędzia (np. Tailwind). */
  klasa?: string;
};

/**
 * Baner zgody na ciasteczka (Consent Mode v2) dla landingów kalkulatorowych.
 *
 * ⚠ DWIE RZECZY, KTÓRYCH NIE WOLNO TU ZMIENIĆ BEZ ZROZUMIENIA, PO CO SĄ:
 *
 * 1. `useState(true)`, nie `false`. Baner MUSI być w HTML z serwera. Wariant
 *    z doklejaniem po `useEffect` kosztował na dwóch landingach około dwóch
 *    sekund LCP: pasek na całą szerokość pojawiał się po hydracji i przeglądarka
 *    brała go za kandydata na element LCP. Powracającego przed mignięciem chroni
 *    skrypt inline z layoutu (`data-consent="decided"` + `display:none` w CSS).
 *
 * 2. Pomiar wysokości, nie stała. Baner stoi na `position: fixed` przy dolnej
 *    krawędzi, więc leży NA treści. 21.08.2026 zasłaniał przez to przycisk
 *    wysyłki na czterech landingach naraz — u Niezawodnych 89%, u trzech
 *    pozostałych 100% przy oknie 375×667. Wysokość zależy od szerokości ekranu
 *    i zawijania tekstu (zmierzone: 172 px przy 320 px szerokości, 150 px przy
 *    375 px), więc wpisana na sztywno liczba prędzej czy później znowu przykryje
 *    przycisk. Baner publikuje POMIAR jako `--consent-h`, a strona dolicza go
 *    do dolnego odstępu.
 *
 * Rola `region`, nie `dialog`: baner niczego nie blokuje i nie przechwytuje
 * fokusu, a `dialog` bez pułapki fokusu wprowadza czytnik ekranu w błąd.
 */
export function BanerZgody({
  klucz,
  tekst = TEKST_DOMYSLNY,
  etykietaZgody = ETYKIETA_ZGODY_DOMYSLNA,
  etykietaOdmowy = ETYKIETA_ODMOWY_DOMYSLNA,
  klasa,
}: WlasciwosciBanera) {
  const [widoczny, setWidoczny] = useState(true);
  const kontener = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const korzen = document.documentElement;
    const element = kontener.current;
    const zeruj = () => korzen.style.setProperty(ZMIENNA_WYSOKOSCI, '0px');

    if (!widoczny || !element) {
      zeruj();
      return;
    }

    const zmierz = () => korzen.style.setProperty(ZMIENNA_WYSOKOSCI, `${element.offsetHeight}px`);
    zmierz();

    // jsdom nie ma ResizeObserver — bez tego guardu testy padają na starcie.
    if (typeof ResizeObserver === 'undefined') return zeruj;

    // Wysokość zmienia się przy obrocie telefonu i zmianie zawijania tekstu.
    const obserwator = new ResizeObserver(zmierz);
    obserwator.observe(element);
    return () => {
      obserwator.disconnect();
      zeruj();
    };
  }, [widoczny]);

  function zdecyduj(wybor: 'granted' | 'denied') {
    try {
      localStorage.setItem(klucz, wybor);
    } catch {
      // Decyzja obowiązuje przynajmniej w tej wizycie.
    }
    document.documentElement.setAttribute(ATRYBUT_ZGODY, ZGODA_PODJETA);
    przekazDoGtag(wybor);
    setWidoczny(false);
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
   * Kolejność w DOM: NAJPIERW zgoda, potem odmowa. Na telefonie przyciski
   * układają się w kolumnę i „Zgadzam się" ma stać na górze; w rzędzie ma być
   * po prawej, co załatwia `row-reverse` w CSS. Robi to kolejność w DOM,
   * a nie `column-reverse`, żeby czytnik ekranu czytał to samo, co widać.
   */
  return createElement(
    'div',
    {
      ref: kontener,
      className: klasa ? `consent-banner ${klasa}` : 'consent-banner',
      role: 'region',
      'aria-label': 'Zgoda na ciasteczka',
    },
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
  );
}

function przekazDoGtag(wybor: 'granted' | 'denied') {
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  gtag?.('consent', 'update', ladunekZgody(wybor));
}
