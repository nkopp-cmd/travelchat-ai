declare module "next-pwa" {
  import { NextConfig } from "next";

  interface RuntimeCachingOptions {
    cacheName?: string;
    expiration?: {
      maxEntries?: number;
      maxAgeSeconds?: number;
      purgeOnQuotaError?: boolean;
    };
    cacheableResponse?: {
      statuses?: number[];
      headers?: Record<string, string>;
    };
    networkTimeoutSeconds?: number;
    backgroundSync?: {
      name?: string;
      options?: object;
    };
  }

  interface RuntimeCaching {
    urlPattern: RegExp | string;
    handler: "CacheFirst" | "CacheOnly" | "NetworkFirst" | "NetworkOnly" | "StaleWhileRevalidate";
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
    options?: RuntimeCachingOptions;
  }

  interface PWAConfig {
    dest?: string;
    disable?: boolean;
    register?: boolean;
    scope?: string;
    sw?: string;
    skipWaiting?: boolean;
    runtimeCaching?: RuntimeCaching[];
    publicExcludes?: string[];
    buildExcludes?: (string | RegExp)[];
    cacheOnFrontEndNav?: boolean;
    reloadOnOnline?: boolean;
    fallbacks?: {
      document?: string;
      image?: string;
      font?: string;
      audio?: string;
      video?: string;
    };
  }

  function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig;

  export default withPWA;
}
