import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://meet.jit.si",
              "frame-src https://meet.jit.si",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://meet.jit.si",
              "media-src 'self' blob: https://meet.jit.si",
              "img-src 'self' data: blob: https://meet.jit.si",
              "style-src 'self' 'unsafe-inline'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

export default nextConfig;
