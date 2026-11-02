import { useMemo, useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { MarkeeModal, MarkeeSign } from '@markee_team/sdk/react';
import type { Address, MarkeeTheme, Placement } from '@markee_team/sdk';
import { useMarkeeWallet } from './wallet';

const sale = import.meta.env.VITE_SALE_BOARD || '0x80783947c9561EFa9BA484D44BBd5AAa03028242';
const apiUrl = import.meta.env.VITE_MARKEE_API_URL || undefined;
const publishedSite = import.meta.env.VITE_PUBLIC_SITE_URL || 'https://markee-sdk-connectkit-example.vercel.app';
const siteUrl = typeof window !== 'undefined' && window.location.origin === publishedSite ? publishedSite : undefined;
const themes = {
  light: { mode: 'light' },
  dark: { mode: 'dark' },
  system: { mode: 'system' },
  plum: {
    mode: 'light', fontFamily: '"DM Sans", system-ui, sans-serif', radius: 8,
    colors: {
      background: '#fff8fc', surface: '#ffffff', text: '#39283d', muted: '#77607c', border: '#e5d3e5',
      inputBackground: '#ffffff', inputText: '#39283d',
      primary: '#743a84', primaryText: '#ffffff', accent: '#eac6f1', accentText: '#50265b',
      accentSurface: '#f6eafa', accentSurfaceText: '#743a84', accentBorder: '#d8b4e3',
      selected: '#f0ddf5', selectedText: '#50265b', link: '#743a84', focusRing: '#a751be',
      overlay: '#351c3e99',
    },
  },
} satisfies Record<string, MarkeeTheme>;
export function App() {
  const [mode, setMode] = useState<'sale' | 'rent' | 'community'>('sale');
  const [theme, setTheme] = useState<keyof typeof themes>('light');
  const [rent, setRent] = useState(import.meta.env.VITE_RENT_BOARD || '0xAce1e0dfD123525B1270a69CF9b1C5b6F850f1e6');
  const [community, setCommunity] = useState(import.meta.env.VITE_COMMUNITY_ADDRESS || '');
  const [chainId, setChainId] = useState(Number(import.meta.env.VITE_COMMUNITY_CHAIN_ID || 100));
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const wallet = useMarkeeWallet();
  const account = useAccount();
  const placement = useMemo<Placement>(() => mode === 'community' ? { kind: 'gardens-community', chainId, community: community as Address } : { kind: 'board', chainId: 8453, address: (mode === 'sale' ? sale : rent) as Address }, [mode, chainId, community, rent]);
  const valid = /^0x[\da-fA-F]{40}$/.test(mode === 'community' ? community : mode === 'rent' ? rent : sale);
  return <div className="app">
    <header className="site-header"><a href="#" className="wordmark"><span>m</span> markee <i>×</i> <b>ConnectKit</b></a><ConnectKitButton /></header>
    <main className="layout">
      <section className="intro"><div className="overline"><span className="live-dot" /> A PLACE FOR YOUR MESSAGE</div><h1>A live sign.<br/>A little more<br/><em>possibility.</em></h1><p>Display a live, moderated Markee sign. Open the payment modal independently when someone wants to participate.</p><div className="features"><div><span>01</span><strong>Your app’s wallet</strong><small>Connect once with ConnectKit.</small></div><div><span>02</span><strong>Both ways to back</strong><small>One payment or a rental stream.</small></div><div><span>03</span><strong>Rewards to you</strong><small>MARKEE arrives in your wallet.</small></div></div></section>
      <section className="demo"><div className="demo-top"><span>THE INTEGRATION PLAYGROUND</span><span className="network">Base</span></div><div className="tabs" aria-label="Placement type">{(['sale', 'rent', 'community'] as const).map(value => <button key={value} className={mode === value ? 'selected' : ''} onClick={() => { setMode(value); setNotice(''); }}>{value === 'sale' ? 'For sale' : value === 'rent' ? 'For rent' : 'Community'}</button>)}</div><div className="preview"><div className="preview-top"><span className="tiny-mark">m</span><span>{mode === 'sale' ? 'A message that stays with you' : mode === 'rent' ? 'Your message, in the spotlight' : 'Built around your community'}</span></div>{valid ? <MarkeeSign className="live-sign" apiUrl={apiUrl} placement={placement} theme={themes[theme]} showAction={false} /> : <div className="illustration" aria-hidden="true"><div className="orb"/><div className="mini-sign"><span>MARK YOUR MOMENT</span><strong>Hello,<br/>possibility.</strong><span className="mini-bottom">✳ &nbsp; powered by markee</span></div><div className="floating-tag">{mode === 'sale' ? 'YOURS TO OWN ↗' : 'YOURS TO BACK ↗'}</div></div>}<h2>{mode === 'sale' ? 'Make your mark.' : mode === 'rent' ? 'Keep the conversation going.' : 'A voice. A shared treasury.'}</h2><p>{mode === 'sale' ? 'Explore the sample For Sale board, create a message, and fund your place on the leaderboard.' : mode === 'rent' ? 'Choose a rental board to start, adjust, or stop a stream and manage your ETHx balance.' : 'Open a community board, activate its integration, and manage revenue with your council wallet.'}</p></div>
      {mode === 'rent' && <div className="config"><label htmlFor="rent-board">Rental board address</label><input id="rent-board" value={rent} onChange={event => setRent(event.target.value)} placeholder="0x…" spellCheck={false}/></div>}
      {mode === 'community' && <div className="config"><label htmlFor="community-chain">Community network</label><select id="community-chain" value={chainId} onChange={event => setChainId(Number(event.target.value))}>{[[100, 'Gnosis'], [8453, 'Base'], [10, 'Optimism'], [42161, 'Arbitrum'], [42220, 'Celo'], [137, 'Polygon'], [1, 'Ethereum'], [11155111, 'Sepolia'], [421614, 'Arbitrum Sepolia'], [11155420, 'Optimism Sepolia']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label htmlFor="community-address">Community address</label><input id="community-address" value={community} onChange={event => setCommunity(event.target.value)} placeholder="0x…" spellCheck={false}/></div>}
      <div className="config theme-config"><label htmlFor="modal-theme">Sign and modal theme</label><div className="theme-picker"><select id="modal-theme" value={theme} onChange={event => setTheme(event.target.value as keyof typeof themes)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Match device</option><option value="plum">Plum · custom brand</option></select><span className={`theme-swatch ${theme}`} aria-hidden="true"><i/><i/><i/></span></div></div>
      <div className="launch"><button className="launch-button" disabled={!valid} onClick={() => setOpen(true)}>Open Markee <span>↗</span></button><span className="launch-note">{account.isConnected ? 'Uses your connected app wallet' : 'Browse first. Connect when you’re ready.'}</span></div></section>
    </main><footer className="site-footer"><span>MARK BOTH THE MOMENT & THE FUTURE.</span><span>Markee SDK × ConnectKit</span></footer>{notice && <div className="toast" role="status">{notice}</div>}
    <MarkeeModal apiUrl={apiUrl} siteUrl={mode === 'community' ? undefined : siteUrl} wallet={wallet} theme={themes[theme]} placement={placement} open={open} onClose={() => setOpen(false)} onEvent={event => { if (event.type === 'confirmed') setNotice('Your Markee transaction is confirmed.'); }} />
  </div>;
}
