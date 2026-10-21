import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkeeModal } from '@markee_team/sdk/react';
import { MarkeeClient, type Placement } from '@markee_team/sdk';
import './style.css';
const placement: Placement = { kind: 'board', chainId: 8453, address: '0x80783947c9561EFa9BA484D44BBd5AAa03028242' };
// Optional developer override only. Integrators use the SDK's built-in endpoint.
const apiUrl = import.meta.env.VITE_MARKEE_API_URL || undefined;
function App() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    new MarkeeClient({ apiUrl }).request<{ enabled: boolean }>('checkout/config').then(r => { if (active) setAvailable(r.enabled); }).catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);
  return <><header><a href="#home" className="brand">Common Ground<span>COMMUNITY NOTICEBOARD</span></a><span className="pill">Scenario 03 · No app wallet</span></header><main id="home"><p className="eyebrow">Good ideas deserve a little space.</p><h1>Your message.<br/>Our common ground.</h1><p className="intro">Support the open internet and put your idea on the board. Start here; sign in and pay by card on Markee.</p><button onClick={() => setOpen(true)}>Put your message on the board ↗</button><p className="fine">This is the real Base For Sale board. Payments use real funds.</p><section className="steps" aria-label="How it works"><article><span>01</span><h2>Make it yours</h2><p>Write your message and choose how much to contribute.</p></article><article><span>02</span><h2>Pay on Markee</h2><p>Sign in to Markee. Fund your wallet by card, then confirm your payment.</p></article><article><span>03</span><h2>Keep your rewards</h2><p>Your MARKEE rewards arrive directly in your Markee wallet.</p></article></section>{available === false && <p className="availability" role="status">Card checkout is not enabled on the connected Markee environment yet. You can explore the board, but the card button stays hidden until it is available.</p>}{notice && <p className="availability" role="status">{notice}</p>}</main><footer>No wallet connection or account is required on Common Ground.</footer><MarkeeModal open={open} onClose={() => setOpen(false)} placement={placement} apiUrl={apiUrl} theme={{ mode: 'light', colors: { primary: '#245c4b', primaryText: '#ffffff' }, radius: 20 }} onEvent={event => { if (event.type === 'confirmed') setNotice('Payment confirmed. Open Markee to see your message and rewards.'); }}/></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
