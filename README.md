# @budowalka/baner-zgody

Baner zgody na ciasteczka (Consent Mode v2) dla landingów kalkulatorowych Budowalki.
Od v2 to pełnoekranowy overlay z kartą, który wymusza decyzję przed interakcją
ze stroną — scroll blokuje czysty CSS do momentu kliknięcia, a zgoda i odmowa
odblokowują stronę tak samo.

## Po co to powstało

**Wariant v1 (pasek na dole)** powstał po incydencie z 21.08.2026: pasek zasłaniał
przycisk wysyłki formularza na czterech landingach naraz, więc paczka mierzyła
własną wysokość i publikowała ją jako rezerwę do doliczenia w CSS landingu.

**Wariant v2 (overlay, decyzja z 30.08.2026)** rozwiązuje inny problem: pasek
dawało się zignorować, więc większość ruchu nie podejmowała żadnej decyzji
i Google w trybie Consent Mode nie zbierał danych. Modal na środku ekranu daje
wg danych branżowych ~55–70% opt-in wobec ~35–50% dla paska — to największa
pojedyncza dźwignia consent rate. Przy okazji overlay unieważnia problem z v1
u korzenia: nie leży trwale na treści, więc cały mechanizm rezerwy odszedł.

Granica prawna, nie kosmetyka: cookie wall (dostęp tylko po zgodzie) jest
nielegalny wg EDPB 05/2020, ale modal wymuszający **decyzję** — z odmową o tym
samym koszcie kliknięcia — jest standardem rynkowym (za ukrytą odmowę CNIL karał:
Google 325 mln €, Shein 150 mln €). Dlatego „Tylko niezbędne" to pełnowymiarowy
przycisk tej samej wielkości co zgoda, a kliknięcie któregokolwiek odblokowuje
stronę identycznie.

Pełny opis: `obsidian-notes/02_projects/wdrozenia-klientow/wzorzec-landingu-kalkulatorowego.md`,
sekcje 9b (historia paska) i 9d (overlay).

## Instalacja

```bash
npm i "@budowalka/baner-zgody@github:Budowalka/budowalka-consent#v2.0.0"
```

Paczka nie idzie przez żaden rejestr — repo jest publiczne, więc instalacja
działa lokalnie i na Vercelu bez tokena i bez `.npmrc`. Wersja to tag gita.

Paczka jest źródłem TS, więc Next musi ją przepuścić przez swój transpiler:

```ts
// next.config.ts
const nextConfig = {
  transpilePackages: ['@budowalka/baner-zgody'],
};
```

## Wpięcie w czterech krokach

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
malowaniem — dzięki temu overlay nie mignie, a scroll od razu działa.

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

Arkusz paczki zawiera także regułę blokady scrolla
(`html:not([data-consent='decided']) body { overflow: hidden }`) i chowanie
overlaya u powracającego — obie wiszą na atrybucie z kroku 1, więc działają
od pierwszego malowania, przed hydracją Reacta.

### 3. Zestaw kontraktowy w testach landingu

```ts
// src/lib/__tests__/baner-zgody.test.ts
import { createElement } from 'react';
import { BanerZgody } from '@budowalka/baner-zgody';
import { kontraktBaneraZgody } from '@budowalka/baner-zgody/testy';

kontraktBaneraZgody({
  element: () => createElement(BanerZgody, { klucz: 'nazwaklienta_consent' }),
  klucz: 'nazwaklienta_consent',
  sciezkaLayoutu: 'src/app/layout.tsx',
  // Landing migrowany z paska v1: pliki, które doliczały rezerwę wysokości.
  plikiBezSladu: ['src/app/globals.css', 'src/app/kalkulator/page.tsx'],
});
```

Zestaw testów: overlay w HTML z serwera (nie doklejka po hydracji), decyzja
zapisuje się i stawia znacznik odblokowujący stronę — po zgodzie i po odmowie
tak samo, ponowienie zgody u powracającego, odporność na wyłączony
`localStorage`, kolejność przycisków w DOM, limit słów — oraz kontrakt CSS:
reguła blokady scrolla i chowania overlaya istnieją w źródle arkusza, oba
przyciski dzielą jedną regułę rozmiaru (min. 44 px), a po mechanizmie rezerwy
z v1 nie ma śladu.

Opcje:

| Opcja | Kiedy |
|---|---|
| `sciezkaArkusza` | Domyślnie kontrakt czyta CSS paczki z `node_modules`. Landing z lokalną kopią stylów wskazuje tu swój plik (np. `src/app/globals.css`). |
| `plikiBezSladu` | Landingi migrowane z paska v1: arkusze i strony, które doliczały rezerwę. Połowicznie usunięty mechanizm zostawia martwy odstęp u dołu, którego nic nie zeruje. Sprawdzenie jest tekstowe — łapie też komentarze, i to celowo. |
| `sciezkaLayoutu` | Kontrakt sprawdzi, że skrypt inline używa tego samego klucza co baner. Rozjechane literały = overlay wraca powracającemu przy każdym wejściu. |

Testy chodzą w jsdom, więc landing potrzebuje w `vitest.config.ts`:

```ts
export default defineConfig({ test: { environment: 'jsdom' } });
```

Nic więcej — zestaw nie wymaga Testing Library ani żadnej konfiguracji esbuilda.
Sprawdzone na vitest 3 i 4 (obie wersje są u nas w użyciu) oraz na Next 15 i 16.

### 4. Sprawdzenie w przeglądarce, na buildzie produkcyjnym

Testy w jsdom nie liczą layoutu i nie znają kaskady, więc same nie dowiodą,
że overlay zasłania treść, a scroll stoi. Domknij to ręcznie na oknie 375×667:

- przed decyzją strona nie przewija się, overlay przykrywa całą treść,
- oba przyciski są w zasięgu kciuka (karta przy dolnej krawędzi),
- po „Tylko niezbędne" scroll działa i overlay nie wraca po odświeżeniu,
- po wyczyszczeniu `localStorage` i „Zgadzam się" w konsoli sieci widać
  hity Google z `gcs` w trybie zgody.

## Dopasowanie do klienta

| Co | Jak |
|---|---|
| Kolory | `--consent-przyciemnienie`, `--consent-tlo`, `--consent-kolor-tekstu`, `--consent-kolor-tekstu-slaby`, `--consent-akcent`, `--consent-akcent-tekst`, `--consent-obwodka-przycisku` |
| Teksty | `<BanerZgody naglowek="…" tekst="…" etykietaZgody="…" etykietaOdmowy="…" />` |
| Dodatkowe klasy na karcie | `<BanerZgody klasa="…" />` |

Tekst musi się zmieścić w szesnastu słowach — zestaw kontraktowy tego pilnuje.
Dłuższy spycha przyciski w dół, a na telefonie karta stoi przy dolnej krawędzi
i przyciski muszą zostać w zasięgu kciuka bez przewijania.

## Czego paczka celowo nie robi

- **Nie robi odmowy trudniejszą od zgody.** Oba przyciski dzielą jedną regułę
  rozmiaru i jedną warstwę — to wymóg ważności zgody, nie uprzejmość. Kontrakt
  pilnuje tego w CSS.
- **Nie pozwala pominąć ciasteczek.** Google Ads i GA4 je stawiają, a Consent
  Mode v2 jest wymagany dla ruchu z EOG.
- **Nie ma wersji bez wyglądu.** Jedno wejście znaczy, że kolejne landingi nie
  napiszą sobie własnego markupu i baner nie rozjedzie się po raz drugi.

## Migracja z v1 (pasek) na v2 (overlay) — breaking

1. Usuń z arkuszy landingu każde doliczenie rezerwy wysokości banera
   (`calc(… + var(--consent-h…))`, nadpisania `--consent-zapas`) — v2 niczego
   nie rezerwuje, a osierocony zapas to martwy odstęp u dołu strony.
2. W zestawie kontraktowym: opcje `rezerwa`, `wysokoscNaTelefonie`
   i `sciezkaZapasu` nie istnieją. Wpisz usunięte w kroku 1 pliki
   do `plikiBezSladu`.
3. Z eksportów zniknęły `ZMIENNA_WYSOKOSCI`, `ZMIENNA_ZAPASU` i `ZAPAS_DOMYSLNY`.
4. Komponent dostał opcjonalny nagłówek (`naglowek`), a `klasa` ląduje na karcie
   (`.consent-banner`), nie na pasku. Skrypt inline i klucz `localStorage`
   bez zmian — zapisane decyzje użytkowników przeżywają migrację.

## Aktualizacja

```bash
npm i "@budowalka/baner-zgody@github:Budowalka/budowalka-consent#v2.0.0"
npm test
```

Zestaw kontraktowy jest częścią paczki, więc nowa wersja przynosi ze sobą
nowe testy — jeśli zmiana wymaga czegoś od landingu, dowiesz się o tym
na czerwono, a nie z produkcji.
