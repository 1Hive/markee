'use client'

import Link from 'next/link'

function SocialIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-9 h-9 rounded-lg border border-[#8A8FBF]/20 flex items-center justify-center text-[#8A8FBF] transition-[border-color,color] duration-[160ms] hover:border-[rgba(248,151,254,0.35)] hover:text-[#F897FE]"
    >
      {children}
    </a>
  )
}

export function Footer() {
  return (
    <footer className="bg-[#060A2A] border-t border-[#8A8FBF]/20 py-14 flex flex-col items-center gap-[22px]">
      <Link href="/" aria-label="Markee home">
        <img src="/markee-logo-purple.png" alt="Markee" className="w-10 h-10 rounded-[9px] block" />
      </Link>

      <div className="flex gap-[10px]">
        <SocialIcon href="https://x.com/markee_xyz" label="X (Twitter)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </SocialIcon>
        <SocialIcon href="https://farcaster.xyz/markee" label="Farcaster">
          <svg width="15" height="15" viewBox="0 0 1000 1000" fill="currentColor">
            <path d="M257.778 155.556h484.444v688.889h-71.111V528.889h-.697c-7.86-87.212-81.156-155.556-170.414-155.556s-162.554 68.344-170.414 155.556h-.697v315.556h-71.111z"/>
            <path d="M128.889 253.333l28.889 97.778h24.444v395.556a48.889 48.889 0 0 0-48.889 48.889v26.667h-4.444a48.889 48.889 0 0 0-48.889 48.889v26.667h271.111v-26.667a48.889 48.889 0 0 0-48.889-48.889h-4.444v-26.667a48.889 48.889 0 0 0-48.889-48.889h-26.667V253.333z"/>
            <path d="M675.556 746.667a48.889 48.889 0 0 0-48.889 48.889v26.667h-4.444a48.889 48.889 0 0 0-48.889 48.889v26.667h271.111v-26.667a48.889 48.889 0 0 0-48.889-48.889h-4.444v-26.667a48.889 48.889 0 0 0-48.889-48.889V351.111h24.444l28.889-97.778H702.222v493.334z"/>
          </svg>
        </SocialIcon>
        <SocialIcon href="https://discord.gg/QtDMJsSDJK" label="Discord">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.2 14.2 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </SocialIcon>
      </div>

      <p className="text-center leading-relaxed text-[#8A8FBF] text-[13px] max-w-[520px] px-4">
        The Markee Network is community-owned by the{' '}
        <Link href="/own-the-network" className="text-[#F897FE] no-underline border-b border-dotted border-[#F897FE]">
          Markee Cooperative
        </Link>.
      </p>

      <div className="text-[#8A8FBF] font-jetbrains text-[11px] tracking-[1px]">markee.xyz · © 2026</div>
    </footer>
  )
}
