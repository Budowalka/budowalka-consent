# @budowalka/baner-zgody

Baner zgody na ciasteczka (Consent Mode v2) dla landingów kalkulatorowych Budowalki.
Mierzy własną wysokość i publikuje ją jako `--consent-h`, żeby nie zasłonić przycisków
stojących przy dolnej krawędzi ekranu.

## Po co to powstało

21.08.2026 okazało się, że baner zgody zasłaniał przycisk wysyłki formularza
na czterech landingach naraz — u Niezawodnych w 89%, u Esystems, On the Wall i 2W
w 100% przy oknie 375×667. Baner stoi na `position: fixed` przy dolnej krawędzi,
więc nie odsuwa treści, tylko leży na niej; na telefonie układał się w kolumnę
i urastał do 150–215 px. Objaw był niewidoczny w logach, bo żądanie w ogóle nie
wychodziło: u Niezawodnych siedem dni dało 74 wejścia do kalkulatora i ani jednej
próby wysyłki.

Naprawiono to wtedy cztery razy osobno. Ta paczka istnieje po to, żeby piąte
wdrożenie dostało naprawę bez przepisywania jej po raz piąty.

Pełny opis: `obsidian-notes/02_projects/wdrozenia-klientow/wzorzec-landingu-kalkulatorowego.md`,
sekcja 9b.

## Instalacja

```bash
npm i "@budowalka/baner-zgody@github:Budowalka/budowalka-consent#v1.1.0"
```

Paczka nie idzie przez żaden rejestr — repo jest publiczne, więc instalacja
działa lokalnie i na Vercelu bez tokena i bez `.npmrc`. Wersja to tag gita.

Paczka jest źródłem TSX, więc Next musi ją przepuścić przez swój transpiler:

```ts
// next.config.ts
const nextConfig = {
  transpilePackages: ['@budowalka/baner-zgody'],
};
```

## Wpięcie w pięciu krokach

### 1. Skrypt inline w layoucie, PRZED tagami Google

```tsx
import { skryptZgody } from '@budowalka/baner-zgody';

const KLUCZ = 'nazwaklienta_consent';

<head>
  <script dangerouslySetInnerHTML={{ __html: skryptZgody({ klucz: KLUCZ }) }} />
  {/* dopiero tutaj gtag */}
</head>
```

Robi dwie rzeczy: ustawia Consent Mode na odmowę, zanim cokolwiek pobierze się
z Google, i u powracającego stawia `data-consent="decided"` przed pierwszym
malowaniem, żeby baner nie mignął.

⚠ Nie używaj do tego `<Script strategy="afterInteractive">` — ta wykonuje się
po hydracji, czyli za późno na jedno i na drugie.

### 2. Styl i komponent

```tsx
import '@budowalka/baner-zgody/css';
import { BanerZgody } from '@budowalka/baner-zgody';

<body>
  {children}
  <BanerZgody klucz={KLUCZ} />
</body>
```

Klucz musi być ten sam, co w skrypcie inline.

### 3. Doliczenie rezerwy w arkuszu landingu

Wszystko, co stoi przy dolnej krawędzi, dolicza zmienną:

```css
.quiz {
  padding-bottom: calc(24px + var(--consent-h, 0px));
}

/* Pasek z przyciskami przyklejony NAD banerem, nie pod nim. */
.quiz-nawigacja {
  position: sticky;
  bottom: var(--consent-h, 0px);
}
```

To jest ta strona kontraktu, której paczka nie może zrobić za landing — i to
właśnie jej brak wywołał incydent.

### 4. Zestaw kontraktowy w testach landingu

```ts
// src/lib/__tests__/baner-zgody.test.tsx
import { createElement } from 'react';
import { BanerZgody } from '@budowalka/baner-zgody';
import { kontraktBaneraZgody } from '@budowalka/baner-zgody/testy';

kontraktBaneraZgody({
  element: () => createElement(BanerZgody, { klucz: 'nazwaklienta_consent' }),
  klucz: 'nazwaklienta_consent',
  sciezkaLayoutu: 'src/app/layout.tsx',
  sciezkaZapasu: 'src/app/globals.css',
  rezerwa: [
    // landing z własnym CSS: reguła w arkuszu
    { plik: 'src/app/globals.css', selektor: '.quiz' },
    { plik: 'src/app/globals.css', selektor: '.quiz-nawigacja' },
  ],
  wysokoscNaTelefonie: 87,
});
```

`rezerwa` ma dwa kształty, bo mamy dwa rodzaje landingów:

| Landing | Zapis | Uwaga |
|---|---|---|
| własny CSS | `{ plik, selektor }` | plik nie musi być arkuszem — u Termo-Fasad style siedzą w stałej `STYLE` wewnątrz komponentu i skan działa tak samo |
| Tailwind | `{ plik, wzorzec }` | rezerwa jest klasą arbitralną w JSX: `{ plik: 'src/app/kalkulator/page.tsx', wzorzec: /pb-\[calc\([^\]]*var\(--consent-h[^\]]*\]/ }` |

⚠ Przy wariancie z selektorem kontrakt sprawdza **każdą** regułę tego selektora,
która rusza dolny odstęp — także tę z media query. Doliczenie rezerwy wyłącznie
w regule bazowej wygląda na zrobione, a skrót `padding` z media query kasuje ją
dokładnie na telefonie. Przy wariancie z wzorcem celuj w sam kawałek doliczający,
nie w komentarz obok — komentarze o `--consent-h` są w tych plikach i goły grep
po nazwie zmiennej przeszedłby mimo skasowania klasy.

Zestaw testów: pomiar zamiast stałej, zwalnianie miejsca po decyzji
i po odmontowaniu, sprzątanie po `ResizeObserver`, ponowienie zgody
u powracającego, kolejność przycisków w DOM, obecność w HTML z serwera,
limit słów — oraz sprawdzenie, czy **arkusz landingu naprawdę dolicza
`var(--consent-h)`** i czy skrypt inline używa tego samego klucza.

Testy chodzą w jsdom, więc landing potrzebuje w `vitest.config.ts`:

```ts
export default defineConfig({ test: { environment: 'jsdom' } });
```

Nic więcej — zestaw nie wymaga Testing Library ani żadnej konfiguracji esbuilda.
Sprawdzone na vitest 3 i 4 (obie wersje są u nas w użyciu) oraz na Next 15 i 16.

### 5. Pomiar w przeglądarce, na buildzie produkcyjnym

Testy w jsdom nie liczą layoutu i nie znają trafień myszą, więc same nie dowiodą,
że przycisk jest klikalny. Domknij to ręcznie, na oknie 375×667 (czyli
**z paskiem adresu** — przy 375×812 wynik bywa fałszywie dobry):

```js
const p = document.querySelector('.przycisk-wysylki').getBoundingClientRect();
[0.1, 0.3, 0.5, 0.7, 0.9].map((u) =>
  document.elementFromPoint(p.left + p.width * u, p.top + p.height / 2)?.className,
);
```

W pięciu punktach ma wyjść przycisk, nie baner. Zmierzoną wysokość banera wpisz
do `wysokoscNaTelefonie` w zestawie kontraktowym.

## Dopasowanie do klienta

| Co | Jak |
|---|---|
| Kolory | `--consent-tlo`, `--consent-akcent`, `--consent-akcent-tekst`, `--consent-kolor-tekstu`, `--consent-obwodka`, `--consent-obwodka-przycisku` |
| Zapas przed hydracją | `--consent-zapas: 120px` w arkuszu landingu (domyślnie 96 px) |
| Teksty | `<BanerZgody tekst="…" etykietaZgody="…" etykietaOdmowy="…" />` |
| Dodatkowe klasy | `<BanerZgody klasa="…" />` |

Tekst musi się zmieścić w dwunastu słowach — zestaw kontraktowy tego pilnuje.
Dłuższy zawija się na telefonie i baner znowu urasta do rozmiaru, który
zasłaniał przyciski.

## Czego paczka celowo nie robi

- **Nie dolicza rezerwy za landing.** Nie wie, który element stoi przy dolnej
  krawędzi. Robi to krok 3, a pilnuje krok 4.
- **Nie pozwala pominąć ciasteczek.** Google Ads i GA4 je stawiają, a Consent
  Mode v2 jest wymagany dla ruchu z EOG. Problemem nigdy nie były ciasteczka,
  tylko pas zabierający jedną trzecią ekranu telefonu tam, gdzie stoją przyciski.
- **Nie ma wersji bez wyglądu.** Jedno wejście znaczy, że kolejne landingi nie
  napiszą sobie własnego markupu i baner nie rozjedzie się po raz drugi.

## Aktualizacja

```bash
npm i "@budowalka/baner-zgody@github:Budowalka/budowalka-consent#v1.1.0"
npm test
```

Zestaw kontraktowy jest częścią paczki, więc nowa wersja przynosi ze sobą
nowe testy — jeśli zmiana wymaga czegoś od landingu, dowiesz się o tym
na czerwono, a nie z produkcji.
