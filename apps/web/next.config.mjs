/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Serve images as-is (bundled SVGs + any remote host). Avoids the in-container
    // optimizer needing sharp/outbound network. Flip off once real raster art +
    // a CDN are in place.
    unoptimized: true,
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;
    // When a FastAPI backend is configured, proxy /backend/* to it.
    if (!api) return [];
    return [{ source: "/backend/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
