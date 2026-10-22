/** @type {import('next').NextConfig} */
const path = require('path')

// Allow the RPC endpoint the app is actually configured to use, so reconfiguring
// NEXT_PUBLIC_BASE_RPC_URL is not silently blocked by connect-src.
function originOf(url) {
  try { return new URL(url).origin } catch { return null }
}
const baseRpcOrigin = originOf(process.env.NEXT_PUBLIC_BASE_RPC_URL || '')

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
    // The configured base RPC origin (whatever NEXT_PUBLIC_BASE_RPC_URL points at).
    ...(baseRpcOrigin ? [baseRpcOrigin] : []),
    // Farcaster / Neynar (used by Privy Farcaster login + app API calls)
    'https://api.neynar.com',
    'https://api.farcaster.xyz',
    'https://*.farcaster.xyz',
    // Vercel — analytics & speed insights if ever added
    'https://va.vercel-scripts.com',
    // Web3Forms contact form submission
    'https://api.web3forms.com',
  ],
  'worker-src':   ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
}

const cspHeader = Object.entries(cspDirectives)
  .map(([key, vals]) => `${key} ${vals.join(' ')}`)
  .join('; ')

// Embed pages can be framed by HTTPS third-party sites.
const embedCspHeader = Object.entries({ ...cspDirectives, 'frame-ancestors': ['https:'] })
  .map(([key, vals]) => `${key} ${vals.join(' ')}`)
  .join('; ')

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.logo.dev' },
    ],
  },

  async headers() {
    return [
      // /embed/* — allow iframing from any origin, no X-Frame-Options
      {
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: embedCspHeader },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      // Everything else — deny framing
      {
        source: '/((?!embed(?:/|$)).*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
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
      { source: '/ecosystem/platforms/superfluid', destination: '/campaigns/superfluid', permanent: true },
      // The GitHub board page was retired: Add to Your Site handles GitHub files, and every board's
      // detail page is /markee/[address].
      { source: '/ecosystem/platforms/github', destination: '/marketplace', permanent: true },
      { source: '/ecosystem/platforms/github/:address', destination: '/markee/:address', permanent: true },
      { source: '/own-the-network', destination: '/owners', permanent: false },
    ]
  },

  // Lets an E2E dev server run beside a normal one without sharing (and clobbering) .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  webpack: (config) => {
    // E2E builds swap Privy for a mock wagmi wallet on a local fork (tests/e2e/fork/stubs).
    if (process.env.NEXT_PUBLIC_E2E === '1') {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@privy-io/react-auth$': path.resolve(__dirname, 'tests/e2e/fork/stubs/privy-react-auth.tsx'),
        '@privy-io/wagmi$': path.resolve(__dirname, 'tests/e2e/fork/stubs/privy-wagmi.tsx'),
      }
    }
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
      '@farcaster/mini-app-solana': false,
      '@react-native-async-storage/async-storage': false,
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

module.exports = nextConfig
