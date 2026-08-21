import { ATRYBUT_ZGODY, KLUCZE_CONSENT_MODE, ZGODA_PODJETA } from './stale';

/**
 * Skrypt wstrzykiwany INLINE w `<head>`, przed tagami Google. Robi dwie rzeczy:
 *
 *  1. ustawia Consent Mode na odmowę, zanim cokolwiek pobierze się z Google —
 *     bez tego pierwsze hity wychodzą przed decyzją użytkownika,
 *  2. u powracającego stawia `data-consent="decided"` jeszcze przed pierwszym
 *     malowaniem, więc baner (renderowany po stronie serwera) nie mignie
 *     i nie kandyduje na element LCP.
 *
 * ⚠ Musi stać przed tagiem gtag i przed treścią strony. W Next wstawia się go
 * przez `<script dangerouslySetInnerHTML={{ __html: skryptZgody({ klucz }) }} />`
 * w layoucie, NIE przez komponent `<Script>` ze strategią `afterInteractive` —
 * ta wykonuje się po hydracji, czyli za późno na obie te rzeczy.
 */
export function skryptZgody({ klucz }: { klucz: string }): string {
  const odmowa = KLUCZE_CONSENT_MODE.map((k) => `${k}:'denied'`).join(',');
  const zgoda = KLUCZE_CONSENT_MODE.map((k) => `${k}:'granted'`).join(',');

  return [
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`,
    `gtag('consent','default',{${odmowa},wait_for_update:500});`,
    `try{var z=localStorage.getItem('${klucz}');if(z){`,
    `document.documentElement.setAttribute('${ATRYBUT_ZGODY}','${ZGODA_PODJETA}');`,
    `if(z==='granted'){gtag('consent','update',{${zgoda}})}}}catch(e){}`,
  ].join('');
}
