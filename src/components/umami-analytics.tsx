"use client";

import Script from "next/script";

interface UmamiAnalyticsProps {
  websiteId?: string;
  src?: string;
}

export default function UmamiAnalytics({
  websiteId = "96d87ca5-31e5-4d50-a900-8a3c042fe4eb",
  src = "https://analytics.romitsagu.com/script.js",
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