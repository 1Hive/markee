'use client'

// Small spinning-ring placeholder shown in place of a view count while it's still loading, matching
// the connecting-state spinner used elsewhere (GitHubVerify's "Connecting to GitHub…"), so a
// still-fetching count doesn't flash as "0" or "-" before the real number arrives. Defaults to
// currentColor so it picks up whatever color the surrounding text already uses.
export function ViewsSpinner({ size = 10, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: `1.5px solid ${color}`, borderTopColor: 'transparent',
        opacity: 0.75,
        animation: 'spin 0.8s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  )
}
