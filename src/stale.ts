/**
 * Stałe wspólne dla banera, skryptu inline, arkusza stylów i zestawu
 * kontraktowego. Żyją w jednym miejscu, bo rozjechanie się literałów
 * (zwłaszcza klucza i atrybutu) daje baner migający przy każdym wejściu.
 */

/** Zmierzona wysokość banera, publikowana na `<html>` do użycia w `calc()`. */
export const ZMIENNA_WYSOKOSCI = '--consent-h';

/**
 * Zapas na okno między pierwszym malowaniem a hydracją. Baner przychodzi
 * z serwera, a zmierzy się dopiero po hydracji — do tego czasu rezerwację
 * trzyma czysty CSS, żeby działała także przy wyłączonym JavaScripcie.
 */
export const ZMIENNA_ZAPASU = '--consent-zapas';

/** Znacznik na `<html>`, po którym CSS chowa baner jeszcze przed hydracją. */
export const ATRYBUT_ZGODY = 'data-consent';

/** Wartość atrybutu dla kogoś, kto już zdecydował. */
export const ZGODA_PODJETA = 'decided';

/**
 * Domyślny zapas w pikselach. Zmierzone na produkcji 21.08.2026: baner po
 * skróceniu do jednego zdania ma 69–99 px zależnie od szerokości ekranu
 * i zawijania tekstu. Klient z wyższym banerem nadpisuje `--consent-zapas`
 * w swoim arkuszu, a zestaw kontraktowy pilnuje, żeby wartość nie była
 * mniejsza od zmierzonej.
 */
export const ZAPAS_DOMYSLNY = 96;

/**
 * Limit długości tekstu. Przed poprawką banery miały 150–215 px, bo tekst
 * zawijał się na telefonie w kilka linii i spychał przyciski pod spód.
 * Jedno zdanie mieści się w rzędzie obok przycisków.
 */
export const LIMIT_SLOW = 12;

/** Tekst domyślny — 11 słów, mieści się w limicie. */
export const TEKST_DOMYSLNY =
  'Ciasteczka pokazują nam, które reklamy działają. Wycenę policzysz tak czy tak.';

export const ETYKIETA_ZGODY_DOMYSLNA = 'Zgadzam się';
export const ETYKIETA_ODMOWY_DOMYSLNA = 'Tylko niezbędne';

/** Cztery klucze Consent Mode v2, ustawiane zawsze razem. */
export const KLUCZE_CONSENT_MODE = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
] as const;

/** Buduje ładunek dla `gtag('consent', ...)` z jedną decyzją dla wszystkich kluczy. */
export function ladunekZgody(wybor: 'granted' | 'denied'): Record<string, string> {
  return Object.fromEntries(KLUCZE_CONSENT_MODE.map((k) => [k, wybor]));
}
