// Bare layout for embed pages — no header, footer, or nav.
// X-Frame-Options and CSP frame-ancestors are overridden in next.config.js
// to allow third-party sites to iframe these pages.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
