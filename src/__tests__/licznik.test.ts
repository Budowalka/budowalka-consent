/**
 * Licznik odpływu na banerze, część przeglądarkowa (plan 21.10.2026).
 *
 * PO CO TO JEST. GA4 nie pokazuje wizyt bez zgody, więc nie wiemy, ile osób
 * z reklam zamyka stronę na banerze. Baner po kliknięciu wysyła sam wybór
 * (zgoda/odmowa) i to, czy wejście było z reklamy (tak/nie). Identyfikator
 * kliknięcia nigdzie nie wychodzi, nic nie zapisujemy na urządzeniu, a błąd
 * wysyłki nie może zablokować strony.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { czyZReklamy, wyslijDecyzje, ADRES_LICZNIKA } from '../licznik';
import { BanerZgody } from '../BanerZgody';
import { ATRYBUT_ZGODY, ZGODA_PODJETA } from '../stale';

/**
 * Node podstawia własne, wyłączone `localStorage` (pusty obiekt bez metod),
 * a jsdom go nie nadpisuje. Podstawiamy działającą pamięć dla obu magazynów,
 * żeby test mógł sprawdzić, że licznik niczego w nich nie zapisuje.
 */
function pamiec(): Storage {
  const dane = new Map<string, string>();
  const p = {
    getItem: (k: string) => (dane.has(k) ? dane.get(k)! : null),
    setItem: (k: string, v: string) => void dane.set(k, String(v)),
    removeItem: (k: string) => void dane.delete(k),
    clear: () => dane.clear(),
    key: (i: number) => [...dane.keys()][i] ?? null,
    get length() {
      return dane.size;
    },
  };
  return new Proxy(p, { ownKeys: () => [...dane.keys()], getOwnPropertyDescriptor: (_, k) => (dane.has(String(k)) ? { enumerable: true, configurable: true, value: dane.get(String(k)) } : undefined) }) as unknown as Storage;
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: pamiec() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: pamiec() });
});

function ustawAdres(szukanie: string) {
  window.history.replaceState(null, '', `/${szukanie}`);
}

function podstawBeacon(impl: (url: string, dane: string) => boolean) {
  const beacon = vi.fn(impl);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: beacon });
  return beacon;
}

function kluczePamieci() {
  return { lokalna: Object.keys(localStorage), sesyjna: Object.keys(sessionStorage) };
}

describe('czyZReklamy', () => {
  it('gclid → tak', () => {
    expect(czyZReklamy(new URLSearchParams('gclid=abc'))).toBe(true);
  });
  it('gbraid → tak', () => {
    expect(czyZReklamy(new URLSearchParams('gbraid=abc'))).toBe(true);
  });
  it('wbraid → tak', () => {
    expect(czyZReklamy(new URLSearchParams('wbraid=abc'))).toBe(true);
  });
  it('puste gclid= → nie', () => {
    expect(czyZReklamy(new URLSearchParams('gclid='))).toBe(false);
  });
  it('same parametry utm → nie', () => {
    expect(czyZReklamy(new URLSearchParams('utm_source=google&utm_medium=cpc'))).toBe(false);
  });
});

describe('wyslijDecyzje', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => ustawAdres(''));

  it('przy ?gclid=x wysyła dokładnie {"z":"zgoda","r":"tak"} na adres licznika', () => {
    ustawAdres('?gclid=x');
    const beacon = podstawBeacon(() => true);
    wyslijDecyzje('zgoda');
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(ADRES_LICZNIKA);
    expect(beacon.mock.calls[0][1]).toBe('{"z":"zgoda","r":"tak"}');
  });

  it('bez gclid wysyła odmowę z r=nie i nie przenosi wartości identyfikatora', () => {
    ustawAdres('?utm_source=google');
    const beacon = podstawBeacon(() => true);
    wyslijDecyzje('odmowa');
    expect(beacon.mock.calls[0][1]).toBe('{"z":"odmowa","r":"nie"}');
  });

  it('wartość gclid nie trafia do wysyłki', () => {
    ustawAdres('?gclid=TAJNE123');
    const beacon = podstawBeacon(() => true);
    wyslijDecyzje('zgoda');
    expect(String(beacon.mock.calls[0][1])).not.toContain('TAJNE123');
  });

  it('gdy sendBeacon rzuca, funkcja nie rzuca', () => {
    podstawBeacon(() => {
      throw new Error('zablokowane');
    });
    expect(() => wyslijDecyzje('odmowa')).not.toThrow();
  });

  it('gdy przeglądarka nie ma sendBeacon, funkcja nie rzuca', () => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: undefined });
    expect(() => wyslijDecyzje('zgoda')).not.toThrow();
  });

  it('nie zapisuje nic w localStorage ani sessionStorage', () => {
    ustawAdres('?gclid=x');
    podstawBeacon(() => true);
    const przed = kluczePamieci();
    wyslijDecyzje('zgoda');
    expect(kluczePamieci()).toEqual(przed);
  });
});

describe('BanerZgody wysyła decyzję', () => {
  let korzen: Root | null = null;
  let gniazdo: HTMLDivElement;

  function zamontuj() {
    gniazdo = document.createElement('div');
    document.body.appendChild(gniazdo);
    korzen = createRoot(gniazdo);
    act(() => korzen!.render(createElement(BanerZgody, { klucz: 'licznik_consent' })));
  }
  function kliknij(selektor: string) {
    act(() => {
      gniazdo.querySelector<HTMLButtonElement>(selektor)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(ATRYBUT_ZGODY);
  });
  afterEach(() => {
    act(() => korzen?.unmount());
    korzen = null;
    gniazdo?.remove();
    ustawAdres('');
  });

  it('zgoda: jedno wysłanie z wyborem zgoda', () => {
    ustawAdres('?gclid=x');
    const beacon = podstawBeacon(() => true);
    zamontuj();
    kliknij('.consent-tak');
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][1]).toBe('{"z":"zgoda","r":"tak"}');
  });

  it('odmowa: jedno wysłanie z wyborem odmowa', () => {
    const beacon = podstawBeacon(() => true);
    zamontuj();
    kliknij('.consent-nie');
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][1]).toBe('{"z":"odmowa","r":"nie"}');
  });

  it('odmowa zdejmuje blokadę i chowa baner także wtedy, gdy sendBeacon rzuca', () => {
    podstawBeacon(() => {
      throw new Error('bloker');
    });
    zamontuj();
    kliknij('.consent-nie');
    expect(document.documentElement.getAttribute(ATRYBUT_ZGODY)).toBe(ZGODA_PODJETA);
    expect(localStorage.getItem('licznik_consent')).toBe('denied');
    expect(gniazdo.querySelector('.consent-overlay')).toBeNull();
  });
});
