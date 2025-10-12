"use client";

import Script from "next/script";

interface UmamiAnalyticsProps {
  websiteId?: string;
  src?: string;
}

export default function UmamiAnalytics({
  websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  src = process.env.NEXT_PUBLIC_UMAMI_URL,
}: UmamiAnalyticsProps) {
  if (!src || !websiteId) return null;

  return (
    <Script
      async
      defer
      src={src}
      data-website-id={websiteId}
    />
  );
}