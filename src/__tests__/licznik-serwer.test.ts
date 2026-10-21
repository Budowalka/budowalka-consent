// @vitest-environment node
/**
 * Licznik odpływu na banerze, część serwerowa (plan 21.10.2026).
 *
 * PO CO TO JEST. Wejście na stronę liczy proxy landingu z żądania, które
 * przeglądarka i tak wysyła, więc nic nie sięga do urządzenia przed decyzją.
 * Liczymy tylko dokumenty HTML od ludzi: prefetch, boty i podglądy linków
 * zawyżałyby mianownik. Do Vercela idzie nazwa zdarzenia i dwie właściwości,
 * bez parametrów adresu (gclid), bez ciasteczek i bez strony odsyłającej.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { czyLiczycWejscie, obsluzLicznik, wyslijZdarzenie, zliczWejscie } from '../licznik-serwer';

const CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function wejscie(adres: string, naglowki: Record<string, string> = {}, metoda = 'GET') {
  return new Request(adres, {
    method: metoda,
    headers: {
      'user-agent': CHROME,
      'sec-fetch-dest': 'document',
      accept: 'text/html,application/xhtml+xml',
      'x-forwarded-for': '203.0.113.7',
      cookie: '_ga=GA1.1.123',
      referer: 'https://www.google.com/',
      ...naglowki,
    },
  });
}

function licznik(cialo: string) {
  return new Request('https://firma.pl/api/zgoda-licznik', {
    method: 'POST',
    headers: { 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.7', referer: 'https://firma.pl/?gclid=TAJNE' },
    body: cialo,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('czyLiczycWejscie', () => {
  it('zwykłe wejście przeglądarki → tak', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/?gclid=x'))).toBe(true);
  });
  it('bez sec-fetch-dest, ale z accept text/html → tak', () => {
    const r = wejscie('https://firma.pl/');
    const h = new Headers(r.headers);
    h.delete('sec-fetch-dest');
    expect(czyLiczycWejscie(new Request(r.url, { headers: h }))).toBe(true);
  });
  it('sec-fetch-dest inny niż document (np. obraz) → nie', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', { 'sec-fetch-dest': 'image' }))).toBe(false);
  });
  it('bez sec-fetch-dest i bez text/html → nie', () => {
    const h = new Headers({ 'user-agent': CHROME, accept: '*/*' });
    expect(czyLiczycWejscie(new Request('https://firma.pl/', { headers: h }))).toBe(false);
  });
  it('prefetch Next (next-router-prefetch) → nie', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', { 'next-router-prefetch': '1' }))).toBe(false);
  });
  it('żądanie RSC → nie', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', { rsc: '1' }))).toBe(false);
  });
  it('prefetch przeglądarki (sec-purpose / purpose) → nie', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', { 'sec-purpose': 'prefetch;prerender' }))).toBe(false);
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', { purpose: 'prefetch' }))).toBe(false);
  });
  it('AdsBot Google → nie', () => {
    expect(
      czyLiczycWejscie(wejscie('https://firma.pl/?gclid=x', { 'user-agent': 'AdsBot-Google (+http://www.google.com/adsbot.html)' })),
    ).toBe(false);
  });
  it('podgląd linku (WhatsApp, Facebook) i Lighthouse → nie', () => {
    for (const ua of [
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (Linux; Android 11) Chrome/120 Mobile Safari/537.36 Chrome-Lighthouse',
      'Mozilla/5.0 HeadlessChrome/120.0',
      'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
    ]) {
      expect(czyLiczycWejscie(wejscie('https://firma.pl/', { 'user-agent': ua })), ua).toBe(false);
    }
  });
  it('pusty user-agent → nie', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', { 'user-agent': '' }))).toBe(false);
  });
  it('POST → nie', () => {
    expect(czyLiczycWejscie(wejscie('https://firma.pl/', {}, 'POST'))).toBe(false);
  });
});

describe('wyslijZdarzenie', () => {
  it('wysyła na /_vercel/insights/event tej samej domeny nazwę i właściwości', async () => {
    await wyslijZdarzenie(wejscie('https://firma.pl/cennik?gclid=TAJNE'), 'baner_wejscie', { reklama: 'tak', firma: 'firma' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [adres, opcje] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(adres).toBe('https://firma.pl/_vercel/insights/event');
    const cialo = JSON.parse(String(opcje.body));
    expect(cialo.en).toBe('baner_wejscie');
    expect(cialo.ed).toEqual({ reklama: 'tak', firma: 'firma' });
    expect(cialo.o).toBe('https://firma.pl/cennik');
  });

  it('nie przenosi gclid, ciasteczek ani strony odsyłającej', async () => {
    await wyslijZdarzenie(wejscie('https://firma.pl/?gclid=TAJNE'), 'baner_wejscie', { reklama: 'tak', firma: 'firma' });
    const [, opcje] = fetchMock.mock.calls[0] as [string, RequestInit];
    const wszystko = String(opcje.body) + JSON.stringify(opcje.headers);
    expect(wszystko).not.toContain('TAJNE');
    expect(wszystko).not.toContain('_ga');
    expect(wszystko).not.toContain('google.com');
    const naglowki = new Headers(opcje.headers);
    expect(naglowki.has('cookie')).toBe(false);
    expect(naglowki.has('referer')).toBe(false);
  });

  it('gdy fetch rzuca, obietnica się rozwiązuje (nie odrzuca)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('sieć'));
    await expect(wyslijZdarzenie(wejscie('https://firma.pl/'), 'baner_wejscie', { reklama: 'nie', firma: 'f' })).resolves.toBeUndefined();
  });
});

describe('zliczWejscie', () => {
  it('liczone wejście z gclid → wysyłka baner_wejscie z reklama=tak', async () => {
    const obietnica = zliczWejscie(wejscie('https://firma.pl/?gclid=x'), 'firma');
    expect(obietnica).not.toBeNull();
    await obietnica;
    const cialo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(cialo).toMatchObject({ en: 'baner_wejscie', ed: { reklama: 'tak', firma: 'firma' } });
  });
  it('wejście bez reklamy → reklama=nie', async () => {
    await zliczWejscie(wejscie('https://firma.pl/'), 'firma');
    const cialo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(cialo.ed.reklama).toBe('nie');
  });
  it('bot → null i zero wysyłek', () => {
    expect(zliczWejscie(wejscie('https://firma.pl/?gclid=x', { 'user-agent': 'AdsBot-Google' }), 'firma')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('obsluzLicznik', () => {
  it('dobre ciało zgody → 204 i jedno zdarzenie baner_zgoda', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"zgoda","r":"tak"}'), 'firma');
    expect(odp.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [adres, opcje] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(adres).toBe('https://firma.pl/_vercel/insights/event');
    const cialo = JSON.parse(String(opcje.body));
    expect(cialo).toMatchObject({ en: 'baner_zgoda', ed: { reklama: 'tak', firma: 'firma' } });
    expect(String(opcje.body)).not.toContain('TAJNE');
  });
  it('odmowa → baner_odmowa', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"odmowa","r":"nie"}'), 'firma');
    expect(odp.status).toBe(204);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).en).toBe('baner_odmowa');
  });
  it('z=klik → 400 i zero zdarzeń', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"klik","r":"tak"}'), 'firma');
    expect(odp.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('wejście z trasy → 400 (wejścia liczy tylko proxy, inaczej każdy mógłby pompować mianownik)', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"wejscie","r":"tak"}'), 'firma');
    expect(odp.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('r spoza tak/nie → 400', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"zgoda","r":"abc123"}'), 'firma');
    expect(odp.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('dodatkowe pola → 400', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"zgoda","r":"tak","gclid":"x"}'), 'firma');
    expect(odp.status).toBe(400);
  });
  it('niepoprawny JSON → 400', async () => {
    const odp = await obsluzLicznik(licznik('nie-json'), 'firma');
    expect(odp.status).toBe(400);
  });
  it('ciało 500 bajtów → 413 i zero zdarzeń', async () => {
    const odp = await obsluzLicznik(licznik('{"z":"zgoda","r":"tak","x":"' + 'a'.repeat(480) + '"}'), 'firma');
    expect(odp.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('GET → 405', async () => {
    const odp = await obsluzLicznik(new Request('https://firma.pl/api/zgoda-licznik'), 'firma');
    expect(odp.status).toBe(405);
  });
  it('gdy wysyłka do Vercela pada, i tak 204', async () => {
    fetchMock.mockRejectedValueOnce(new Error('sieć'));
    const odp = await obsluzLicznik(licznik('{"z":"zgoda","r":"nie"}'), 'firma');
    expect(odp.status).toBe(204);
  });
});
