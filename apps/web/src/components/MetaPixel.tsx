"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { PIXEL_ID, track } from "@/lib/pixel";

/**
 * Loads the Meta Pixel and keeps PageView honest.
 *
 * The snippet Meta hands out fires PageView once, on load. This is a
 * single-page app: moving from a story to the preview to the checkout never
 * reloads the document, so every step after the first would be invisible.
 * Firing again on each path change is what makes the funnel show up in Ads
 * Manager at all.
 */
function PixelPageViews() {
  const pathname = usePathname();
  const search = useSearchParams();
  // The snippet already sent the first PageView; don't double-count it.
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    track("PageView");
    // Query changes matter here: /order/[id]?pid=… is a different step.
  }, [pathname, search]);

  return null;
}

export function MetaPixel() {
  if (!PIXEL_ID) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
      <PixelPageViews />
    </>
  );
}
