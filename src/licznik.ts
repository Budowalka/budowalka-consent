/**
 * Licznik odpływu na banerze, część przeglądarkowa (plan 21.10.2026,
 * `google-ads-mcp/docs/PLAN-pomiar-baneru-zgody-2026-10-21.md`).
 *
 * GA4 nie pokazuje wizyt bez zgody, więc nie wiemy, ile osób z reklam zamyka
 * stronę na banerze. Wejścia liczy proxy landingu (po stronie serwera), a tu
 * baner po kliknięciu wysyła sam wybór i znak, czy wejście było z reklamy.
 *
 * ⚠ GRANICE, KTÓRYCH NIE WOLNO PRZESUNĄĆ:
 * - wysyłka tylko po kliknięciu (to część obsługi zgody), nigdy sama z siebie,
 * - wychodzi wyłącznie `{"z":"zgoda|odmowa","r":"tak|nie"}`, bez wartości gclid,
 * - nic nie zapisujemy na urządzeniu,
 * - błąd wysyłki nie może rzucić, bo wtedy strona zostałaby zablokowana.
 */

/** Trasa landingu, która przyjmuje decyzję. Nazwa bez „analytics” i „track”, żeby blokery jej nie cięły. */
export const ADRES_LICZNIKA = '/api/zgoda-licznik';

/** Parametry, które Google Ads dokleja do adresu po kliknięciu reklamy. */
const PARAMETRY_REKLAMY = ['gclid', 'gbraid', 'wbraid'] as const;

/** Czy wejście przyszło z reklamy Google Ads: któryś z identyfikatorów kliknięcia jest niepusty. */
export function czyZReklamy(params: URLSearchParams): boolean {
  return PARAMETRY_REKLAMY.some((p) => (params.get(p) ?? '').trim() !== '');
}

/** Wysyła decyzję z banera do licznika. Nigdy nie rzuca i nic nie zapisuje. */
export function wyslijDecyzje(wybor: 'zgoda' | 'odmowa'): void {
  try {
    const r = czyZReklamy(new URLSearchParams(window.location.search)) ? 'tak' : 'nie';
    navigator.sendBeacon(ADRES_LICZNIKA, JSON.stringify({ z: wybor, r }));
  } catch {
    // Bloker, stara przeglądarka albo brak sendBeacon: tracimy jedną liczbę, strona działa.
  }
}
