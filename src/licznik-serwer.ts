/**
 * Licznik odpływu na banerze, część serwerowa (plan 21.10.2026,
 * `google-ads-mcp/docs/PLAN-pomiar-baneru-zgody-2026-10-21.md`).
 *
 * Trzy zdarzenia w Vercel Web Analytics, każde z dwiema właściwościami
 * `reklama` (tak/nie) i `firma` (slug landingu):
 * - `baner_wejscie`: proxy/middleware landingu, z żądania dokumentu HTML,
 * - `baner_zgoda` i `baner_odmowa`: trasa `POST /api/zgoda-licznik`, wołana z banera.
 *
 * ⚠ DLACZEGO WŁASNA WYSYŁKA, A NIE `track()` z `@vercel/analytics/server`
 * (odstępstwo od planu, sprawdzone w kodzie `@vercel/analytics@2.0.1`):
 * 1. `track()` wysyła na `VERCEL_URL`, czyli adres `*.vercel.app` wdrożenia.
 *    Nasze projekty mają ochronę wdrożeń „wszystko poza własnymi domenami”,
 *    więc taka wysyłka dostałaby 401 i zdarzenia by przepadały.
 * 2. `track()` wpisuje jako stronę pełny adres z kontekstu żądania albo nagłówek
 *    `referer`, czyli razem z `?gclid=…`, i przekazuje ciasteczka. Plan zakłada,
 *    że identyfikator kliknięcia nigdzie nie wychodzi.
 * Dlatego wysyłamy to samo ciało co `track()` (punkt `/_vercel/insights/event`
 * na własnej domenie), ale stroną jest adres bez parametrów, a z nagłówków idzie
 * tylko user-agent i IP do skrótu odwiedzającego (Vercel nie zapisuje IP).
 * Bez ciasteczek i bez strony odsyłającej.
 */

import { czyZReklamy } from './licznik';

export type Wlasciwosci = { reklama: 'tak' | 'nie'; firma: string };

/** Fragmenty user-agenta botów i podglądów linków, których wejścia zawyżałyby mianownik. */
const BOTY = [
  'bot',
  'crawler',
  'spider',
  'slurp',
  'adsbot',
  'google-inspectiontool',
  'lighthouse',
  'headlesschrome',
  'facebookexternalhit',
  'whatsapp',
  'telegram',
  'skypeuripreview',
  'vercel',
  'curl',
  'wget',
  'python',
  'go-http-client',
  'node-fetch',
  'undici',
  'axios',
];

/** Czy to żądanie to wejście człowieka na stronę (dokument HTML), które liczymy. */
export function czyLiczycWejscie(req: Request): boolean {
  if (req.method !== 'GET') return false;
  const h = req.headers;
  const cel = h.get('sec-fetch-dest');
  if (cel !== null) {
    if (cel !== 'document') return false;
  } else if (!(h.get('accept') ?? '').includes('text/html')) {
    return false;
  }
  if (h.has('next-router-prefetch') || h.has('rsc')) return false;
  if ((h.get('purpose') ?? '').includes('prefetch')) return false;
  if ((h.get('sec-purpose') ?? '').includes('prefetch')) return false;
  const ua = (h.get('user-agent') ?? '').toLowerCase();
  if (ua.trim() === '') return false;
  return !BOTY.some((b) => ua.includes(b));
}

/**
 * Wysyła jedno zdarzenie do Vercel Web Analytics projektu (przez własną domenę).
 * Nigdy nie odrzuca: błąd pomiaru nie może wyłożyć strony ani trasy.
 */
export async function wyslijZdarzenie(req: Request, nazwa: string, wlasciwosci: Wlasciwosci): Promise<void> {
  try {
    const adres = new URL(req.url);
    const naglowki: Record<string, string> = { 'content-type': 'application/json', 'x-va-server': '1' };
    const ua = req.headers.get('user-agent');
    if (ua) naglowki['user-agent'] = ua;
    const ip = req.headers.get('x-forwarded-for');
    if (ip) naglowki['x-vercel-ip'] = ip;
    const cialo = {
      o: adres.origin + adres.pathname,
      ts: Date.now(),
      sdkn: '@vercel/analytics/server',
      sdkv: '2.0.1',
      r: '',
      en: nazwa,
      ed: wlasciwosci,
    };
    const odp = await fetch(new URL('/_vercel/insights/event', adres.origin).toString(), {
      method: 'POST',
      headers: naglowki,
      body: JSON.stringify(cialo),
    });
    await odp.text().catch(() => undefined);
  } catch {
    // Tracimy jedną liczbę, strona działa.
  }
}

/**
 * Do wywołania w proxy/middleware: `const p = zliczWejscie(req, 'firma'); if (p) ev.waitUntil(p)`.
 * Zwraca `null`, gdy żądania nie liczymy (zasoby, prefetch, boty).
 */
export function zliczWejscie(req: Request, firma: string): Promise<void> | null {
  try {
    if (!czyLiczycWejscie(req)) return null;
    const reklama = czyZReklamy(new URL(req.url).searchParams) ? 'tak' : 'nie';
    return wyslijZdarzenie(req, 'baner_wejscie', { reklama, firma });
  } catch {
    return null;
  }
}

const LIMIT_CIALA = 200;
const WYBORY = { zgoda: 'baner_zgoda', odmowa: 'baner_odmowa' } as const;

/**
 * Trasa `POST /api/zgoda-licznik`: `export const POST = (req: Request) => obsluzLicznik(req, 'firma')`.
 * Przyjmuje wyłącznie `{"z":"zgoda|odmowa","r":"tak|nie"}`. Wejść tu nie przyjmujemy:
 * liczy je tylko proxy, inaczej każdy mógłby pompować mianownik jednym żądaniem.
 */
export async function obsluzLicznik(req: Request, firma: string): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  let tekst: string;
  try {
    tekst = await req.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (new TextEncoder().encode(tekst).length > LIMIT_CIALA) return new Response(null, { status: 413 });
  let dane: unknown;
  try {
    dane = JSON.parse(tekst);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!dane || typeof dane !== 'object' || Array.isArray(dane)) return new Response(null, { status: 400 });
  const { z, r, ...reszta } = dane as Record<string, unknown>;
  if (Object.keys(reszta).length > 0) return new Response(null, { status: 400 });
  if (z !== 'zgoda' && z !== 'odmowa') return new Response(null, { status: 400 });
  if (r !== 'tak' && r !== 'nie') return new Response(null, { status: 400 });
  await wyslijZdarzenie(req, WYBORY[z], { reklama: r, firma });
  return new Response(null, { status: 204 });
}
