import Script from 'next/script';
import { isValidGoogleAnalyticsId, isValidGoogleTagManagerId } from '@/lib/analytics';

export default function AnalyticsScripts({
  googleAnalyticsId,
  googleTagManagerId,
}: {
  googleAnalyticsId: string;
  googleTagManagerId: string;
}) {
  const hasGtm = isValidGoogleTagManagerId(googleTagManagerId);
  const hasGa = isValidGoogleAnalyticsId(googleAnalyticsId) && !hasGtm;

  if (!hasGtm && !hasGa) {
    return null;
  }

  return (
    <>
      {hasGtm ? (
        <>
          <Script id="gtm-loader" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${googleTagManagerId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(googleTagManagerId)}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        </>
      ) : null}

      {hasGa ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAnalyticsId)}`}
            strategy="afterInteractive"
          />
          <Script id="ga-loader" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${googleAnalyticsId}',{anonymize_ip:true});`}
          </Script>
        </>
      ) : null}
    </>
  );
}
