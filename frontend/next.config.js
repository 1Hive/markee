/** @type {import('next').NextConfig} */

const cspDirectives = {
  'default-src':     ["'self'"],
  // Next.js injects inline scripts; 'unsafe-inline' is required without nonces.
  // 'unsafe-eval' is required by some wallet SDKs (WalletConnect, MetaMask SDK).
  'script-src':      ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://challenges.cloudflare.com', 'https://vercel.live'],
  'style-src':       ["'self'", "'unsafe-inline'"],
  // Partner logos come from arbitrary HTTPS sources stored in KV — allow all HTTPS images.
  'img-src':         ["'self'", 'data:', 'blob:', 'https:'],
  // next/font/google downloads fonts at build time and self-hosts them.
  'font-src':        ["'self'", 'data:'],
  'object-src':      ["'none'"],
  'base-uri':        ["'self'"],
  'form-action':     ["'self'"],
  'frame-ancestors': ["'none'"],
  // Privy auth iframe + WalletConnect verification iframes
  'child-src': [
    'https://auth.privy.io',
    'https://verify.walletconnect.com',
    'https://verify.walletconnect.org',
  ],
  'frame-src': [
    'https://auth.privy.io',
    'https://verify.walletconnect.com',
    'https://verify.walletconnect.org',
    'https://challenges.cloudflare.com',
    'https://vercel.live',
  ],
  'connect-src': [
    "'self'",
    // Privy
    'https://auth.privy.io',
    'https://*.rpc.privy.systems',
    // WalletConnect
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
    'https://explorer-api.walletconnect.com',
    // Coinbase Wallet
    'wss://www.walletlink.org',
    // Base RPC (Alchemy + public fallback)
    'https://*.g.alchemy.com',
    'https://mainnet.base.org',
    // Farcaster / Neynar (used by Privy Farcaster login + app API calls)
    'https://api.neynar.com',
    'https://api.farcaster.xyz',
    'https://*.farcaster.xyz',
    // Vercel — analytics & speed insights if ever added
    'https://va.vercel-scripts.com',
  ],
  'worker-src':   ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
}

const cspHeader = Object.entries(cspDirectives)
  .map(([key, vals]) => `${key} ${vals.join(' ')}`)
  .join('; ')

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          // Belt-and-suspenders clickjacking protection
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  async redirects() {
    return [
      { source: '/ecosystem', destination: '/create-a-markee', permanent: true },
      { source: '/raise-funding', destination: '/create-a-markee', permanent: false },
      { source: '/own-the-network', destination: '/owners', permanent: false },
    ]
  },

  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false, '@farcaster/mini-app-solana': false }
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

module.exports = nextConfig
