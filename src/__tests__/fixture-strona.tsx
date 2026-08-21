/*
 * Udaje stronę landingu tailwindowego, gdzie rezerwa jest klasą arbitralną
 * w JSX, a nie regułą w arkuszu — tak robią to Niezawodne i Esystems.
 *
 * Komentarz o --consent-h jest tu celowo: w prawdziwych plikach też są,
 * a goły grep po nazwie zmiennej przeszedłby mimo skasowania klasy.
 */
export default function Strona() {
  return <main className="mx-auto max-w-[620px] px-5 pb-[calc(120px+var(--consent-h,0px))] pt-7" />;
}
