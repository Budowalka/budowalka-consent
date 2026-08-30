/**
 * Zestaw kontraktowy banera zgody — uruchamiany W REPO KLIENTA, nie tutaj.
 *
 * PO CO TO JEST. Od 30.08.2026 baner jest pełnoekranowym overlayem z kartą:
 * pasek na dole dawało się zignorować, więc większość ruchu nie podejmowała
 * żadnej decyzji i Google w trybie Consent Mode nie zbierał danych. Overlay
 * wymusza decyzję przed interakcją ze stroną — scroll blokuje czysty CSS
 * (`html:not([data-consent='decided']) body { overflow: hidden }`), a obie
 * opcje (zgoda i odmowa) odblokowują go tak samo. Inaczej zgoda nie byłaby
 * dobrowolna (EDPB 05/2020) i cały pomiar wisiałby na nieważnej podstawie.
 *
 * ⚠ KONTRAKT MA DWIE STRONY. Komponent stawia znacznik `decided`, ale blokada
 * scrolla i chowanie overlaya u powracającego żyją w CSS. Sam komponent może
 * być bez zarzutu, a strona i tak zostanie zablokowana na zawsze (albo baner
 * będzie migał przy każdym wejściu), jeśli te reguły znikną z arkusza. Dlatego
 * blok „kontrakt CSS" czyta ŹRÓDŁO arkusza — w jsdom nie ma kaskady,
 * `getComputedStyle` nie zna reguł z pliku, którego nikt nie wstrzyknął.
 *
 * ⚠ CZEGO TE TESTY NIE DOWODZĄ. jsdom nie liczy layoutu i nie ma trafień
 * myszą, więc nie sprawdzą, że overlay realnie zasłania treść ani że scroll
 * stoi. Dowodzą kontraktu: overlay jest w HTML z serwera, decyzja zapisuje się
 * i stawia znacznik odblokowujący stronę, a reguły CSS, na których wisi
 * blokada i chowanie, istnieją w źródle. Realne zasłanianie, blokadę scrolla
 * i klikalność potwierdza się osobno w przeglądarce na buildzie produkcyjnym.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ATRYBUT_ZGODY, LIMIT_SLOW, ZGODA_PODJETA } from '../src/stale';

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
   * Arkusz z regułami overlaya (scroll-lock, chowanie u powracającego, wspólny
   * rozmiar przycisków). Domyślnie CSS paczki w `node_modules` — landing, który
   * importuje `@budowalka/baner-zgody/css`, nie musi nic podawać. Landing
   * z lokalną kopią stylów wskazuje tu swój plik (np. `src/app/globals.css`).
   */
  sciezkaArkusza?: string;
  /**
   * Opcjonalnie: pliki, w których nie może zostać ślad po mechanizmie rezerwy
   * `--consent-h` z wariantu paskowego (do v1). Overlay nie leży trwale na
   * treści, więc rezerwa odeszła w całości — połowicznie przywrócony mechanizm
   * (np. sam zapas w CSS) zostawia martwy odstęp, którego nic już nie zeruje.
   * Podaj tu arkusze i strony, które przy pasku doliczały rezerwę.
   */
  plikiBezSladu?: string[];
};

const ARKUSZ_PACZKI = 'node_modules/@budowalka/baner-zgody/src/baner-zgody.css';

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
  const opisLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  let korzen: Root | null = null;
  let gniazdo: HTMLDivElement;
  let wywolaniaGtag: unknown[][] = [];

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

  describe('baner zgody — overlay wymuszający decyzję', () => {
    beforeEach(() => {
      (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      podstaw(pamiecWPamieci());
      wywolaniaGtag = [];
      (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a: unknown[]) => {
        wywolaniaGtag.push(a);
      };
      document.documentElement.removeAttribute(ATRYBUT_ZGODY);
    });

    afterEach(() => {
      odmontuj();
      if (opisLocalStorage) Object.defineProperty(globalThis, 'localStorage', opisLocalStorage);
      delete (window as unknown as Record<string, unknown>).gtag;
      document.documentElement.removeAttribute(ATRYBUT_ZGODY);
    });

    /**
     * Overlay MUSI być w HTML z serwera. Wariant doklejany po hydracji kosztował
     * na dwóch landingach około dwóch sekund LCP: element na cały ekran pojawiał
     * się późno i przeglądarka brała go za kandydata na element LCP.
     */
    it('jest w HTML z serwera, nie doklejany po hydracji', () => {
      const html = renderToStaticMarkup(opcje.element());
      expect(html).toContain('consent-overlay');
      expect(html).toContain('consent-tak');
      expect(html).toContain('consent-nie');
    });

    it('overlay jest dialogiem modalnym z kartą w środku', () => {
      zamontuj();
      const overlay = gniazdo.querySelector('.consent-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.getAttribute('role')).toBe('dialog');
      expect(overlay!.getAttribute('aria-modal')).toBe('true');
      expect(overlay!.querySelector('.consent-banner')).not.toBeNull();
    });

    it('po zgodzie stawia znacznik decided, zapisuje granted i znika', () => {
      zamontuj();
      kliknij('.consent-tak');
      expect(localStorage.getItem(opcje.klucz)).toBe('granted');
      expect(document.documentElement.getAttribute(ATRYBUT_ZGODY)).toBe(ZGODA_PODJETA);
      expect(gniazdo.querySelector('.consent-overlay')).toBeNull();
      const update = wywolaniaGtag.find((a) => a[0] === 'consent' && a[1] === 'update');
      expect(update, 'brak consent update po zgodzie').toBeDefined();
      expect(update![2]).toMatchObject({
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      });
    });

    /**
     * Odmowa odblokowuje stronę TAK SAMO jak zgoda — ten sam znacznik `decided`.
     * To granica prawna, nie kosmetyka: zgoda wymuszona zablokowaną stroną
     * nie jest dobrowolna, a bez dobrowolności cały pomiar jest nieważny.
     */
    it('po odmowie stawia TEN SAM znacznik decided, zapisuje denied i znika', () => {
      zamontuj();
      kliknij('.consent-nie');
      expect(localStorage.getItem(opcje.klucz)).toBe('denied');
      expect(document.documentElement.getAttribute(ATRYBUT_ZGODY)).toBe(ZGODA_PODJETA);
      expect(gniazdo.querySelector('.consent-overlay')).toBeNull();
      const update = wywolaniaGtag.find((a) => a[0] === 'consent' && a[1] === 'update');
      expect(update, 'brak consent update po odmowie').toBeDefined();
      expect(update![2]).toMatchObject({
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      });
    });

    it('powracający z zapisaną decyzją nie widzi overlaya', () => {
      localStorage.setItem(opcje.klucz, 'granted');
      zamontuj();
      expect(gniazdo.querySelector('.consent-overlay')).toBeNull();
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

    /**
     * Tryb prywatny i zablokowane ciasteczka potrafią rzucić z `localStorage`.
     * Baner ma wtedy zapytać drugi raz, a nie wywalić całą stronę — to jest
     * komponent renderowany w layoucie, więc jego wyjątek zabiera cały landing.
     * Kliknięcie MUSI mimo to postawić znacznik `decided`, bo na nim wisi
     * odblokowanie scrolla.
     */
    it('przeżywa niedostępny localStorage i mimo to odblokowuje stronę', () => {
      podstaw({
        getItem: () => {
          throw new Error('brak dostępu');
        },
        setItem: () => {
          throw new Error('brak dostępu');
        },
      });
      expect(() => zamontuj()).not.toThrow();
      expect(gniazdo.querySelector('.consent-overlay')).not.toBeNull();
      expect(() => kliknij('.consent-tak')).not.toThrow();
      expect(gniazdo.querySelector('.consent-overlay')).toBeNull();
      expect(document.documentElement.getAttribute(ATRYBUT_ZGODY)).toBe(ZGODA_PODJETA);
    });

    /**
     * Decyzja Piotra: główna akcja („Zgadzam się") stoi NAD odmową. Robi to
     * kolejność w DOM, nie `column-reverse`, żeby czytnik ekranu czytał to
     * samo, co widać. Drugą stronę (kierunek `column`) sprawdza kontrakt CSS.
     */
    it('przycisk zgody stoi w DOM przed przyciskiem odmowy', () => {
      zamontuj();
      const klasy = [...gniazdo.querySelectorAll('.consent-przyciski button')].map((b) => b.className);
      expect(klasy).toEqual(['consent-tak', 'consent-nie']);
    });

    it('odmowa jest zwykłym przyciskiem na pierwszej warstwie — bez dodatkowych kroków', () => {
      zamontuj();
      const odmowa = gniazdo.querySelector<HTMLButtonElement>('.consent-nie');
      expect(odmowa).not.toBeNull();
      expect(odmowa!.tagName).toBe('BUTTON');
      expect(odmowa!.textContent?.trim().length).toBeGreaterThan(0);
    });

    it(`tekst banera mieści się w ${LIMIT_SLOW} słowach`, () => {
      zamontuj();
      const tekst = gniazdo.querySelector('.consent-tekst')?.textContent?.trim() ?? '';
      expect(tekst.length).toBeGreaterThan(0);
      expect(tekst.split(/\s+/).length).toBeLessThanOrEqual(LIMIT_SLOW);
    });
  });

  /**
   * Druga strona kontraktu: arkusz stylów. Bez tego bloku można wyciąć regułę
   * blokady scrolla albo chowanie overlaya u powracającego — i zostać
   * z całkowicie zielonym zestawem, mimo że strona jest zablokowana na zawsze
   * albo baner miga przy każdym wejściu.
   */
  describe('kontrakt: CSS overlaya', () => {
    const sciezka = opcje.sciezkaArkusza ?? ARKUSZ_PACZKI;
    const css = () => readFileSync(path.resolve(process.cwd(), sciezka), 'utf8');

    it(`scroll stoi do podjęcia decyzji — i rusza po znaczniku decided (${sciezka})`, () => {
      expect(css()).toMatch(/html:not\(\[data-consent='decided'\]\)\s*body\s*\{[^}]*overflow:\s*hidden/);
    });

    it('powracającemu overlay chowa CSS przed hydracją (znacznik z inline skryptu)', () => {
      expect(css()).toMatch(/html\[data-consent='decided'\]\s*\.consent-overlay\s*\{[^}]*display:\s*none/);
    });

    it('overlay zasłania cały ekran i leży nad resztą strony', () => {
      const regula = css().match(/\n\.consent-overlay\s*\{[^}]*\}/);
      expect(regula, 'brak reguły .consent-overlay').not.toBeNull();
      expect(regula![0]).toContain('position: fixed');
      expect(regula![0]).toContain('inset: 0');
      expect(regula![0]).toMatch(/z-index:\s*\d\d+/);
    });

    it('oba przyciski dzielą jedną regułę rozmiaru — równorzędność opcji, nie tylko deklaracja', () => {
      const wspolna = css().match(/\n\.consent-banner button\s*\{[^}]*\}/);
      expect(wspolna, 'brak wspólnej reguły przycisków').not.toBeNull();
      const minWysokosc = wspolna![0].match(/min-height:\s*(\d+)px/);
      expect(minWysokosc, 'przyciski bez min-height').not.toBeNull();
      // 44 px to minimalny cel dotykowy — poniżej odmowa robi się „trudniejsza do trafienia".
      expect(Number(minWysokosc![1])).toBeGreaterThanOrEqual(44);
      // Odmowa ma widoczną obwódkę, nie jest gołym tekstem.
      const odmowa = css().match(/\n\.consent-nie\s*\{[^}]*\}/);
      expect(odmowa, 'brak reguły .consent-nie').not.toBeNull();
      expect(odmowa![0]).toMatch(/border:\s*1px solid/);
    });

    it('zgoda zostaje na górze kolumny — `column`, nie `column-reverse`', () => {
      const kolumna = css().match(/\n\.consent-przyciski\s*\{([^}]*)\}/);
      expect(kolumna, 'brak reguły .consent-przyciski').not.toBeNull();
      expect(kolumna![1]).toContain('flex-direction: column');
      expect(kolumna![1]).not.toContain('column-reverse');
    });

    it('w arkuszu nie ma śladu po mechanizmie rezerwy --consent-h', () => {
      expect(css()).not.toContain('--consent-h');
    });

    /**
     * Rezerwa `--consent-h` z wariantu paskowego (do v1) odeszła w całości —
     * overlay nie leży trwale na treści. Połowicznie przywrócony mechanizm
     * (np. sam zapas albo doliczenie w calc()) zostawia martwy odstęp u dołu
     * strony, którego nic już nie zeruje.
     */
    for (const plik of opcje.plikiBezSladu ?? []) {
      it(`${plik} nie ma śladu po --consent-h ani --consent-zapas`, () => {
        const tresc = readFileSync(path.resolve(process.cwd(), plik), 'utf8');
        expect(tresc).not.toContain('--consent-h');
        expect(tresc).not.toContain('--consent-zapas');
      });
    }

    if (opcje.sciezkaLayoutu) {
      /**
       * Klucz żyje w dwóch miejscach naraz: w banerze i w skrypcie inline.
       * Rozjechanie literałów nie wywala niczego — po prostu każdy powrót na
       * stronę zaczyna się od overlaya, którego nikt już nie chciał oglądać.
       */
      it('skrypt inline w layoucie używa tego samego klucza co baner', () => {
        const layout = readFileSync(path.resolve(process.cwd(), opcje.sciezkaLayoutu!), 'utf8');
        expect(layout).toContain(opcje.klucz);
      });
    }
  });
}
