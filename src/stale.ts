/**
 * Stałe wspólne dla banera, skryptu inline, arkusza stylów i zestawu
 * kontraktowego. Żyją w jednym miejscu, bo rozjechanie się literałów
 * (zwłaszcza klucza i atrybutu) daje baner migający przy każdym wejściu —
 * albo, od wariantu overlay, stronę zablokowaną na zawsze.
 */

/**
 * Znacznik na `<html>`, na którym wisi cała mechanika overlaya:
 * bez niego CSS blokuje scroll strony, z nim CSS chowa overlay.
 * Stawia go skrypt inline (powracający) albo komponent (po kliknięciu).
 */
export const ATRYBUT_ZGODY = 'data-consent';

/** Wartość atrybutu dla kogoś, kto już zdecydował. */
export const ZGODA_PODJETA = 'decided';

/**
 * Limit długości tekstu. Karta ma miejsce na dwie–trzy linie, ale dłuższy
 * tekst spycha przyciski w dół — a na telefonie karta stoi przy dolnej
 * krawędzi i przyciski muszą zostać w zasięgu kciuka bez przewijania.
 */
export const LIMIT_SLOW = 16;

/** Nagłówek domyślny karty. */
export const NAGLOWEK_DOMYSLNY = 'Zanim przejdziesz dalej';

/** Tekst domyślny — 14 słów, mieści się w limicie. */
export const TEKST_DOMYSLNY =
  'Ciasteczka pokazują nam, które reklamy działają. Wycenę policzysz tak czy tak, niezależnie od wyboru.';

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
