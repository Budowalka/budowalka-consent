/**
 * Zestaw kontraktowy banera zgody — uruchamiany W REPO KLIENTA, nie tutaj.
 *
 * PO CO TO JEST. 21.08.2026 okazało się, że baner zgody zasłaniał przycisk
 * wysyłki formularza na czterech landingach naraz. U Niezawodnych logi z siedmiu
 * dni pokazały 74 wejścia do kalkulatora i ani jednej próby wysyłki — żądanie
 * w ogóle nie wychodziło, więc w logach nie było żadnego błędu. Naprawa polega
 * na tym, że baner mierzy własną wysokość i publikuje ją jako `--consent-h`,
 * a strona dolicza tę zmienną do dolnego odstępu.
 *
 * ⚠ KONTRAKT MA DWIE STRONY. Paczka odpowiada za pomiar, klient za doliczenie.
 * Sam komponent może być bez zarzutu, a przycisk i tak zostanie przykryty, jeśli
 * z `globals.css` klienta zniknie `var(--consent-h)`. Dlatego blok „kontrakt CSS"
 * czyta ŹRÓDŁO arkusza klienta — w jsdom nie ma kaskady, `getComputedStyle` nie
 * rozwiąże `calc()` ze zmienną i nie zna reguł z pliku, którego nikt nie wstrzyknął.
 *
 * ⚠ CZEGO TE TESTY NIE DOWODZĄ. Nie sprawdzają klikalności ani widoczności —
 * jsdom nie liczy layoutu i nie ma trafień myszą. Dowodzą, że rezerwacja powstaje,
 * ma wartość z POMIARU (a nie wpisaną na sztywno), wraca do zera, gdy baner znika,
 * i że druga strona kontraktu istnieje w CSS. Realne nienachodzenie potwierdza się
 * osobno w przeglądarce: `getBoundingClientRect` i `elementFromPoint` w pięciu
 * punktach przycisku, przy widocznym banerze, po przewinięciu do końca,
 * na oknie 375×667 (czyli z paskiem adresu).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ZMIENNA_WYSOKOSCI, ATRYBUT_ZGODY, ZAPAS_DOMYSLNY, LIMIT_SLOW } from '../src/stale';

/**
 * Gdzie landing dolicza rezerwę. Dwa kształty, bo mamy dwa rodzaje landingów:
 *
 *  - `selektor` — reguła CSS w podanym pliku. Plik nie musi być arkuszem:
 *    u Termo-Fasad style strony kalkulatora żyją w stałej `STYLE` wewnątrz
 *    komponentu i skan po tekście działa tam tak samo.
 *  - `wzorzec` — dla landingów tailwindowych, gdzie rezerwa jest klasą
 *    arbitralną w JSX (`pb-[calc(120px+var(--consent-h,0px))]`), a nie regułą.
 *    Wyrażenie musi trafić w sam kawałek doliczający, nie w komentarz obok —
 *    komentarze o `--consent-h` są w tych plikach i goły grep by je złapał.
 */
export type MiejsceRezerwy =
  | { plik: string; selektor: string }
  | { plik: string; wzorzec: RegExp };

export type OpcjeKontraktu = {
  /** Jak landing renderuje baner — z własnym kluczem i ewentualnie własnym tekstem. */
  element: () => ReactElement;
  /** Klucz `localStorage` przekazany do banera. Musi się zgadzać ze skryptem inline. */
  klucz: string;
  /**
   * Opcjonalnie: ścieżka do layoutu ze skryptem inline. Kontrakt sprawdzi wtedy,
   * że skrypt używa tego samego klucza co baner — rozjechane literały oznaczają
   * baner migający powracającemu przy każdym wejściu.
   */
  sciezkaLayoutu?: string;
  /**
   * Opcjonalnie: plik, w którym landing nadpisuje `--consent-zapas`. Bez tego
   * kontrakt porównuje z wartością domyślną paczki.
   */
  sciezkaZapasu?: string;
  /** Miejsca, w których landing dolicza rezerwę. Patrz `MiejsceRezerwy`. */
  rezerwa: MiejsceRezerwy[];
  /**
   * Wysokość banera ZMIERZONA W PRZEGLĄDARCE na buildzie produkcyjnym, przy
   * oknie 375 px. Zapas przed hydracją nie może być od niej mniejszy.
   */
  wysokoscNaTelefonie: number;
};

/** Pamięć w pamięci — Node podstawia własne, wyłączone `localStorage`, a jsdom go nie nadpisuje. */
function pamiecWPamieci() {
  const dane = new Map<string, string>();
  return {
    getItem: (k: string) => (dane.has(k) ? dane.get(k)! : null),
    setItem: (k: string, v: string) => void dane.set(k, String(v)),
    removeItem: (k: string) => void dane.delete(k),
    clear: () => dane.clear(),
    key: (i: number) => [...dane.keys()][i] ?? null,
    get length() {
      return dane.size;
    },
  };
}

function podstaw(wartosc: unknown) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: wartosc,
  });
}

export function kontraktBaneraZgody(opcje: OpcjeKontraktu): void {
  const opisOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const opisLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  let korzen: Root | null = null;
  let gniazdo: HTMLDivElement;
  let udawanaWysokosc = opcje.wysokoscNaTelefonie;
  let wywolaniaGtag: unknown[][] = [];

  const zmienna = () => document.documentElement.style.getPropertyValue(ZMIENNA_WYSOKOSCI);

  function zamontuj() {
    gniazdo = document.createElement('div');
    document.body.appendChild(gniazdo);
    korzen = createRoot(gniazdo);
    act(() => {
      korzen!.render(opcje.element());
    });
  }

  function odmontuj() {
    act(() => korzen?.unmount());
    korzen = null;
    gniazdo?.remove();
  }

  function kliknij(selektor: string) {
    const przycisk = gniazdo.querySelector<HTMLButtonElement>(selektor);
    expect(przycisk, `brak przycisku ${selektor}`).not.toBeNull();
    act(() => {
      przycisk!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  describe('baner zgody — rezerwacja miejsca pod przyciskami', () => {
    beforeEach(() => {
      (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      podstaw(pamiecWPamieci());
      udawanaWysokosc = opcje.wysokoscNaTelefonie;
      wywolaniaGtag = [];
      (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a: unknown[]) => {
        wywolaniaGtag.push(a);
      };
      document.documentElement.removeAttribute(ATRYBUT_ZGODY);
      document.documentElement.style.removeProperty(ZMIENNA_WYSOKOSCI);
      // jsdom nie liczy layoutu — `offsetHeight` jest tam zawsze 0. Bez podstawienia
      // test nie odróżniłby pomiaru od braku pomiaru.
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get: () => udawanaWysokosc,
      });
      zainstalujObserwator();
    });

    afterEach(() => {
      odmontuj();
      if (opisLocalStorage) Object.defineProperty(globalThis, 'localStorage', opisLocalStorage);
      if (opisOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', opisOffsetHeight);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
      delete (window as unknown as Record<string, unknown>).gtag;
      przywrocObserwator();
    });

    /**
     * Baner MUSI być w HTML z serwera. Wariant doklejany po hydracji kosztował
     * na dwóch landingach około dwóch sekund LCP: pasek na całą szerokość
     * pojawiał się późno i przeglądarka brała go za kandydata na element LCP.
     */
    it('jest w HTML z serwera, nie doklejany po hydracji', () => {
      const html = renderToStaticMarkup(opcje.element());
      expect(html).toContain('consent-banner');
      expect(html).toContain('consent-tak');
      expect(html).toContain('consent-nie');
    });

    it('publikuje zmierzoną wysokość jako --consent-h', () => {
      zamontuj();
      expect(zmienna()).toBe(`${opcje.wysokoscNaTelefonie}px`);
    });

    it('podaje POMIAR, nie wpisaną na sztywno liczbę — inny baner, inna wartość', () => {
      udawanaWysokosc = opcje.wysokoscNaTelefonie + 55;
      zamontuj();
      expect(zmienna()).toBe(`${opcje.wysokoscNaTelefonie + 55}px`);
    });

    it('po zgodzie znika i zwalnia miejsce', () => {
      zamontuj();
      expect(zmienna()).toBe(`${opcje.wysokoscNaTelefonie}px`);
      kliknij('.consent-tak');
      expect(gniazdo.querySelector('.consent-banner')).toBeNull();
      expect(zmienna()).toBe('0px');
    });

    it('po odmowie też znika i zwalnia miejsce', () => {
      zamontuj();
      kliknij('.consent-nie');
      expect(gniazdo.querySelector('.consent-banner')).toBeNull();
      expect(zmienna()).toBe('0px');
    });

    it('po odmontowaniu zwalnia miejsce', () => {
      zamontuj();
      expect(zmienna()).toBe(`${opcje.wysokoscNaTelefonie}px`);
      odmontuj();
      expect(zmienna()).toBe('0px');
    });

    it('powracający z zapisaną decyzją nie widzi banera i nie powoduje rezerwacji', () => {
      localStorage.setItem(opcje.klucz, 'granted');
      zamontuj();
      expect(gniazdo.querySelector('.consent-banner')).toBeNull();
      expect(zmienna()).toBe('0px');
    });

    /**
     * Stan zgody w gtag żyje w pamięci jednego załadowania strony. Zapisane
     * „zgadzam się" trzeba ponowić przy KAŻDYM wejściu, inaczej hity — w tym
     * konwersje — lecą w trybie odmowy mimo udzielonej zgody.
     */
    it('powracający ze zgodą dostaje ponowione consent update', () => {
      localStorage.setItem(opcje.klucz, 'granted');
      zamontuj();
      const update = wywolaniaGtag.find((a) => a[0] === 'consent' && a[1] === 'update');
      expect(update, 'brak ponowienia zgody przy wejściu').toBeDefined();
      expect(update![2]).toMatchObject({
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      });
    });

    it('powracający z odmową nie dostaje zgody tylnymi drzwiami', () => {
      localStorage.setItem(opcje.klucz, 'denied');
      zamontuj();
      const granted = wywolaniaGtag.some(
        (a) => a[0] === 'consent' && JSON.stringify(a[2] ?? {}).includes('granted'),
      );
      expect(granted, 'odmowa nie może kończyć się zgodą w gtag').toBe(false);
    });

    it('zapisuje decyzję pod ustalonym kluczem', () => {
      zamontuj();
      kliknij('.consent-tak');
      expect(localStorage.getItem(opcje.klucz)).toBe('granted');
    });

    /**
     * Tryb prywatny i zablokowane ciasteczka potrafią rzucić z `localStorage`.
     * Baner ma wtedy zapytać drugi raz, a nie wywalić całą stronę — to jest
     * komponent renderowany w layoucie, więc jego wyjątek zabiera cały landing.
     */
    it('przeżywa niedostępny localStorage', () => {
      podstaw({
        getItem: () => {
          throw new Error('brak dostępu');
        },
        setItem: () => {
          throw new Error('brak dostępu');
        },
      });
      expect(() => zamontuj()).not.toThrow();
      expect(gniazdo.querySelector('.consent-banner')).not.toBeNull();
      expect(() => kliknij('.consent-tak')).not.toThrow();
      expect(gniazdo.querySelector('.consent-banner')).toBeNull();
    });

    /**
     * Decyzja Piotra z 21.08.2026: główna akcja stoi NAD odmową w kolumnie
     * i po prawej w rzędzie — kolejnością w DOM, nie odwróceniem wizualnym,
     * żeby czytnik ekranu czytał to samo, co widać.
     */
    it('przycisk zgody stoi w DOM przed przyciskiem odmowy', () => {
      zamontuj();
      const klasy = [...gniazdo.querySelectorAll('.consent-banner button')].map((b) => b.className);
      expect(klasy).toEqual(['consent-tak', 'consent-nie']);
    });

    it(`tekst banera mieści się w ${LIMIT_SLOW} słowach`, () => {
      zamontuj();
      const tekst = gniazdo.querySelector('.consent-tekst')?.textContent?.trim() ?? '';
      expect(tekst.length).toBeGreaterThan(0);
      expect(tekst.split(/\s+/).length).toBeLessThanOrEqual(LIMIT_SLOW);
    });

    /**
     * ⚠ Te cztery testy istnieją, bo jsdom NIE MA `ResizeObserver`. Bez atrapy
     * komponent chodzi wyłącznie ścieżką awaryjną (`return zeruj`), a ścieżka
     * z obserwatorem — jedyna, która wykonuje się w prawdziwej przeglądarce —
     * nie jest sprawdzana wcale. Wyszło to przy próbie mutacji: skasowanie
     * sprzątania po obserwatorze nie zapaliło ani jednego testu na czerwono.
     */
    it('obserwuje baner, żeby złapać obrót telefonu i zmianę zawijania tekstu', () => {
      zamontuj();
      expect(AtrapaObserwatora.instancje).toHaveLength(1);
      expect(AtrapaObserwatora.instancje[0].cele[0]).toBe(gniazdo.querySelector('.consent-banner'));
    });

    it('aktualizuje rezerwację, gdy baner zmieni wysokość', () => {
      zamontuj();
      udawanaWysokosc = opcje.wysokoscNaTelefonie + 55;
      act(() => AtrapaObserwatora.instancje[0].oddzwon());
      expect(zmienna()).toBe(`${opcje.wysokoscNaTelefonie + 55}px`);
    });

    it('przy odmontowaniu odłącza obserwatora i zwalnia miejsce', () => {
      zamontuj();
      const obserwator = AtrapaObserwatora.instancje[0];
      odmontuj();
      expect(obserwator.odlaczony, 'obserwator został podpięty na zawsze').toBe(true);
      expect(zmienna()).toBe('0px');
    });

    it('działa też tam, gdzie ResizeObserver nie istnieje', () => {
      przywrocObserwator();
      delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
      zamontuj();
      expect(zmienna()).toBe(`${opcje.wysokoscNaTelefonie}px`);
      odmontuj();
      expect(zmienna()).toBe('0px');
    });
  });

  /**
   * Druga strona kontraktu: kod landingu. Bez tego bloku można wyciąć
   * doliczenie rezerwy ze strony kalkulatora i zostać z całkowicie zielonym
   * zestawem, mimo że przycisk wysyłki znowu jest przykryty.
   */
  describe('kontrakt: landing dolicza --consent-h', () => {
    for (const miejsce of opcje.rezerwa) {
      const opis =
        'selektor' in miejsce
          ? `${miejsce.plik} → ${miejsce.selektor}`
          : `${miejsce.plik} → ${miejsce.wzorzec}`;

      it(`${opis} dolicza rezerwę`, () => {
        const tresc = readFileSync(path.resolve(process.cwd(), miejsce.plik), 'utf8');

        if ('wzorzec' in miejsce) {
          const trafienie = tresc.match(miejsce.wzorzec);
          expect(trafienie, `wzorzec nie trafia w ${miejsce.plik}`).not.toBeNull();
          expect(trafienie![0]).toContain('var(--consent-h');
          return;
        }

        const reguly = znajdzReguly(tresc, miejsce.selektor);
        expect(reguly.length, `brak reguły ${miejsce.selektor} w ${miejsce.plik}`).toBeGreaterThan(0);

        /*
         * ⚠ Sprawdzamy KAŻDĄ regułę selektora, która rusza dolny odstęp, a nie
         * „przynajmniej jedną". Powód jest konkretny: u Termo-Fasad `.kp-main`
         * ma padding podany skrótem i drugi raz w media query dla telefonu.
         * Doliczenie rezerwy tylko w regule bazowej wygląda na zrobione,
         * a skrót z media query kasuje ją dokładnie tam, gdzie boli —
         * na telefonie, czyli na ~87% ruchu.
         */
        const rusza = reguly.filter((r) => /[;{]\s*(padding|padding-bottom|bottom)\s*:/.test(r));
        expect(
          rusza.length,
          `żadna reguła ${miejsce.selektor} nie ustawia dolnego odstępu`,
        ).toBeGreaterThan(0);

        for (const regula of rusza) {
          expect(regula, `reguła ${miejsce.selektor} bez rezerwy: ${regula.slice(0, 80)}`).toContain(
            'var(--consent-h',
          );
        }
      });
    }

    /**
     * Baner jedzie z serwera, a mierzy się dopiero po hydracji. W tym oknie
     * rezerwację trzyma sam CSS: paczka daje `--consent-zapas` z wartością
     * domyślną, landing może ją nadpisać. Wartość nie może być mniejsza niż
     * realna wysokość banera na telefonie, bo wtedy okno przed hydracją
     * odsłania dokładnie ten fragment przycisku, o który chodziło.
     */
    it('zapas przed hydracją nie jest mniejszy niż zmierzona wysokość banera', () => {
      const nadpisanie = opcje.sciezkaZapasu
        ? readFileSync(path.resolve(process.cwd(), opcje.sciezkaZapasu), 'utf8').match(
            /--consent-zapas:\s*(\d+)px/,
          )
        : null;
      const zapas = nadpisanie ? Number(nadpisanie[1]) : ZAPAS_DOMYSLNY;
      expect(zapas).toBeGreaterThanOrEqual(opcje.wysokoscNaTelefonie);
    });

    if (opcje.sciezkaLayoutu) {
      /**
       * Klucz żyje w dwóch miejscach naraz: w banerze i w skrypcie inline.
       * Rozjechanie literałów nie wywala niczego — po prostu każdy powrót na
       * stronę zaczyna się od banera, którego nikt już nie chciał oglądać.
       */
      it('skrypt inline w layoucie używa tego samego klucza co baner', () => {
        const layout = readFileSync(path.resolve(process.cwd(), opcje.sciezkaLayoutu!), 'utf8');
        expect(layout).toContain(opcje.klucz);
      });
    }
  });
}

/**
 * Wycina WSZYSTKIE bloki reguł dla podanego selektora. Skan po tekście, nie regex
 * budowany z selektora: kropki i nawiasy w selektorach CSS trzeba by escapować,
 * a pomyłka w escapowaniu daje test, który zawsze przechodzi. Selektor musi stać
 * samodzielnie, więc `.quiz` nie złapie `.quiz-nawigacja`.
 *
 * Wszystkie, a nie pierwszą — ten sam selektor zwykle wraca w media query
 * i to właśnie tam rezerwa najczęściej ginie.
 */
function znajdzReguly(tresc: string, selektor: string): string[] {
  const znalezione: string[] = [];
  let od = 0;
  while ((od = tresc.indexOf(selektor, od)) !== -1) {
    const koniecSelektora = od + selektor.length;
    const poprzedni = od === 0 ? '\n' : tresc[od - 1];
    const nastepny = tresc[koniecSelektora] ?? '';
    if (/[\s,{}]/.test(poprzedni) && /[\s,{]/.test(nastepny)) {
      const otwarcie = tresc.indexOf('{', koniecSelektora);
      const zamkniecie = tresc.indexOf('}', otwarcie);
      if (otwarcie !== -1 && zamkniecie !== -1) znalezione.push(tresc.slice(od, zamkniecie + 1));
    }
    od = koniecSelektora;
  }
  return znalezione;
}

/**
 * Atrapa `ResizeObserver`. jsdom go nie ma, a to właśnie ścieżka z obserwatorem
 * wykonuje się w prawdziwej przeglądarce — bez atrapy testy sprawdzałyby
 * wyłącznie awaryjne obejście dla środowiska testowego.
 */
class AtrapaObserwatora {
  static instancje: AtrapaObserwatora[] = [];
  cele: Element[] = [];
  odlaczony = false;
  oddzwon: () => void;

  constructor(oddzwon: () => void) {
    this.oddzwon = oddzwon;
    AtrapaObserwatora.instancje.push(this);
  }

  observe(element: Element) {
    this.cele.push(element);
  }

  unobserve() {}

  disconnect() {
    this.odlaczony = true;
  }
}

let opisObserwatora: PropertyDescriptor | undefined;

function zainstalujObserwator() {
  AtrapaObserwatora.instancje = [];
  opisObserwatora ??= Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: AtrapaObserwatora,
  });
}

function przywrocObserwator() {
  if (opisObserwatora) Object.defineProperty(globalThis, 'ResizeObserver', opisObserwatora);
  else delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
}
