// GET /api/embed/[address]/script
// Serves a self-contained JS snippet that inserts the current top message into
// any element with data-markee="[address]" and polls for updates every 60 s.
// Publishers include it as:
//   <script src="https://markee.xyz/api/embed/0x.../script" defer></script>
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  const address = params.address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return new NextResponse('// Invalid address', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  const apiUrl     = `${siteOrigin}/api/embed/${address}`
  const pageUrl    = `${siteOrigin}/markee/${address}`

  // The injected script never transmits anything about the visitor's page or
  // behaviour — it only fetches the public embed API to get the current message.
  const script = `
(function(){
  var ADDR="${address}";
  var API="${apiUrl}";
  var PAGE="${pageUrl}";
  var SEL='[data-markee="'+ADDR+'"]';

  function applyMessage(d){
    if(!d||!d.message)return;
    document.querySelectorAll(SEL).forEach(function(el){
      if(el.tagName==='A'){el.textContent=d.message;if(!el.href)el.href=PAGE;}
      else{el.textContent=d.message;}
      el.title=d.name?'By '+d.name:'';
    });
  }

  function poll(){
    fetch(API)
      .then(function(r){return r.ok?r.json():null})
      .then(applyMessage)
      .catch(function(){});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',poll);
  }else{poll();}
  setInterval(poll,60000);
})();
`.trim()

  return new NextResponse(script, {
    headers: {
      'Content-Type':                'application/javascript; charset=utf-8',
      'Cache-Control':               'public, max-age=60, stale-while-revalidate=120',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
