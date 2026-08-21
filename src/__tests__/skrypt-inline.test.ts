/**
 * Skrypt inline jest jedynym kawałkiem, który wykonuje się PRZED pierwszym
 * malowaniem. Dwa błędy, które przez niego przechodzą, są kosztowne i ciche:
 * brak `consent default denied` (hity do Google przed decyzją) i rozjechany
 * klucz (baner miga powracającemu przy każdym wejściu).
 *
 * Testujemy przez wykonanie stringa, nie przez porównanie tekstu — literówka
 * w kodzie, który i tak wygląda poprawnie, jest tu najbardziej prawdopodobną wadą.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { skryptZgody } from '../skrypt-inline';
import { ATRYBUT_ZGODY, ZGODA_PODJETA } from '../stale';

const KLUCZ = 'testowy_consent';
const opisLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function podstawPamiec(zapisane: string | null) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: { getItem: (k: string) => (k === KLUCZ ? zapisane : null) },
  });
}

function uruchom() {
  new Function(skryptZgody({ klucz: KLUCZ }))();
  return ((window as unknown as { dataLayer: IArguments[] }).dataLayer ?? []).map((a) => [...a]);
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).dataLayer;
  document.documentElement.removeAttribute(ATRYBUT_ZGODY);
});

afterEach(() => {
  if (opisLocalStorage) Object.defineProperty(globalThis, 'localStorage', opisLocalStorage);
});

describe('skrypt inline', () => {
  it('ustawia odmowę zanim cokolwiek pobierze się z Google', () => {
    podstawPamiec(null);
    const wywolania = uruchom();
    const domyslne = wywolania.find((a) => a[0] === 'consent' && a[1] === 'default');
    expect(domyslne, 'brak consent default').toBeDefined();
    expect(domyslne![2]).toMatchObject({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500,
    });
  });

  it('bez zapisanej decyzji nie oznacza <html> — baner ma się pokazać', () => {
    podstawPamiec(null);
    uruchom();
    expect(document.documentElement.hasAttribute(ATRYBUT_ZGODY)).toBe(false);
  });

  it('powracającemu ze zgodą stawia atrybut i ponawia zgodę', () => {
    podstawPamiec('granted');
    const wywolania = uruchom();
    expect(document.documentElement.getAttribute(ATRYBUT_ZGODY)).toBe(ZGODA_PODJETA);
    const update = wywolania.find((a) => a[0] === 'consent' && a[1] === 'update');
    expect(update, 'brak ponowienia zgody').toBeDefined();
    expect(update![2]).toMatchObject({ ad_storage: 'granted', analytics_storage: 'granted' });
  });

  it('powracającemu z odmową stawia atrybut, ale nie daje zgody', () => {
    podstawPamiec('denied');
    const wywolania = uruchom();
    expect(document.documentElement.getAttribute(ATRYBUT_ZGODY)).toBe(ZGODA_PODJETA);
    expect(wywolania.some((a) => a[1] === 'update')).toBe(false);
  });

  it('przeżywa niedostępny localStorage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => {
          throw new Error('brak dostępu');
        },
      },
    });
    expect(() => uruchom()).not.toThrow();
  });

  it('używa dokładnie tego klucza, który dostał', () => {
    expect(skryptZgody({ klucz: 'inny_klient_consent' })).toContain("'inny_klient_consent'");
  });
});
