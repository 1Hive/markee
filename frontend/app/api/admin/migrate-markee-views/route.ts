// app/api/admin/migrate-markee-views/route.ts
//
// Migrates per-markee view counts (views:total + views:msg) for all old→new pairs
// that have explicit markee addresses in markee-migrations.csv.
//
// Covers: OI leaderboards (Gitcoin, Matias) + all 32 SF migration pairs.
// GitHub leaderboard rows are excluded — old markee addresses not in CSV.
//
// Usage:
//   curl -L -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/migrate-markee-views
//
// Safe to re-run — only writes if dest key doesn't already exist.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

const MARKEE_MESSAGE_ABI = [{
  inputs: [],
  name: 'message',
  outputs: [{ name: '', type: 'string' }],
  stateMutability: 'view',
  type: 'function',
}] as const

function hashMessage(message: string): string {
  return createHash('md5').update(message.trim().toLowerCase()).digest('hex').slice(0, 8)
}

// All old→new markee pairs from markee-migrations.csv (rows with both old_markee + new_markee_1)
const PAIRS: Array<{ label: string; old: string; new: string }> = [
  // OI leaderboards
  { label: 'Gitcoin OI',   old: '0xde21f729137c5af1b01d73af1dc21effa2b8a0d6', new: '0xf3c35c36255b68e88c0ac4cb68997e22bf5e5619' },
  { label: 'Matias OI',    old: '0xa25211b64d041f690c0c818183e32f28ba9647dd', new: '0x8b06b9efaafffe15f17848d1ec61a4682fc9b2cf8' },
  // SF migrations (32 rows)
  { label: 'SF #1',  old: '0xe72f92aa469fdbd875bc3f8fc745b94b2a15277d', new: '0xfe68b484e59054de11e53720258486206d980dbf' },
  { label: 'SF #2',  old: '0xc639383b964333b002b0694ed67edde5181db5db', new: '0x2925f02c648e24e9dc56c3f25243e75ed714b161' },
  { label: 'SF #3',  old: '0x322f593462ab69e56d8b7a71ecc89b520be08e53', new: '0x44dbf310016371610880c06d5ff4a22e0367c152' },
  { label: 'SF #4',  old: '0x396bff9cab12790eb9ebd02a7150f13f11df2ed3', new: '0x77225c6c6aa76bf8ebc92d2ac566b6ad038dd203' },
  { label: 'SF #5',  old: '0x59ee9f109cda991cd8aaffba9faf353b9bf8d5f4', new: '0x8d94b4ec747114ed9d09eede53043037fde2715c' },
  { label: 'SF #6',  old: '0x2e7c679530ba46e0941535f8d1d4366d4bf76132', new: '0x9347769e6398c676290134350d077277101527fc' },
  { label: 'SF #7',  old: '0x652519984e7df45c30527a88c2132f5b0512e999', new: '0x5a5d2cc5601798715fa721e414dec53e1d69b1ba' },
  { label: 'SF #8',  old: '0xd7245d5dcd44c0ddd683f34d2735120a50e26b32', new: '0xec1e8c6ce09526a4bcddcbf25ab09db1d1ce8d1a' },
  { label: 'SF #9',  old: '0x171b0e43da56051ea74fe89821589693bae016fc', new: '0x41db9daa2753c1e23b3785b09d8b98597928f3ea' },
  { label: 'SF #10', old: '0x30f8cb939f0575c43717dcef175b99d787a3444e', new: '0xfe899af384cd71d50313b1b1a67a36ca3cdc2df4' },
  { label: 'SF #11', old: '0x544dfb7acd9057faad8f0d7bdf80fa54bb95352d', new: '0xd5dc659a28f8a4b1f1e18af0553e026c984d781c' },
  { label: 'SF #12', old: '0x7708c4c3d53ef01cd604ecbb75016e0c54b01237', new: '0x54626230f2bb6a09e0f3e2c58ceeba85d97e8b86' },
  { label: 'SF #13', old: '0x4903ce622b8f744a4ef7149573e13e68fdde4494', new: '0x62ef0a4ecca13ac67d2bca07f07b16d7bf0b9f26' },
  { label: 'SF #14', old: '0x67276585ca9182fc2ad58280f8aa7a68908e1fa0', new: '0x0f81fd0870e4463dfeee07f7ba0ec2e5114d70a9' },
  { label: 'SF #15', old: '0xccd57ed33856036172a8975a64b54c78a3c2db7b', new: '0x8f8af4e02e782d495353f6954fbac527cdb97d6a' },
  { label: 'SF #16', old: '0x8493d4d18879228e168232faf7eda791f20360f7', new: '0xb64b87ab7cfdb24cf5b2609a09e54fd9cef0394c' },
  { label: 'SF #17', old: '0x6740a895dd60fb26cf9956c920bbc75b08d26f8f', new: '0xaafc4e0e1372db0d2d0fd226b7a3697ba1bae288' },
  { label: 'SF #18', old: '0xf298e0e8d6e5de548d73f022dbe04c1eb33fcf30', new: '0xf325a9510aa220114d7db3992e784f4088b92697' },
  { label: 'SF #19', old: '0xacd29d5e83af136ef663c6b50352631b91d0f8ba', new: '0x2319791da4509fea4852c60693186c7610d1f235' },
  { label: 'SF #20', old: '0x808ac090d84573a69e0e41ade07c09b42fe68959', new: '0x892f255cd8e831bb10734ab31002d3958495401a' },
  { label: 'SF #21', old: '0x654016b7f827f4f2f57f9fa6bf653892aed5b23c', new: '0x5d8e3f79d7eade1e782e96920b32511c35f3a1c9' },
  { label: 'SF #22', old: '0x19e68e98da388b26946e702f93557d2062134367', new: '0x8a414020c2259da3735c81f3ef29ec2809a28a79' },
  { label: 'SF #23', old: '0x0010e937f2bcaa3f2937b768dae03e435378654b', new: '0x8aed5b8ebc315936bda893521dc34664b702500b' },
  { label: 'SF #24', old: '0x1c52b6cbe007894449e09a5ab9c3b021b568fdcc', new: '0xa86612fc23e81a584819a986a22eca6750b4ad12' },
  { label: 'SF #25', old: '0xd4ccdecdebaf66581a5e7466fb3db9a33af3d612', new: '0xba25260b4db8da38f578b1c6ac70d34d6e13291a' },
  { label: 'SF #26', old: '0x5c0cd658c4c073997eda65018a0225086c147fa7', new: '0x31976ff5a47b21b48593b3c0cd302bda98193418' },
  { label: 'SF #27', old: '0x4bbb5008560499818a174e67426be060730184f5', new: '0x048d622c38ddace6aa06dd2a8a7c4b16d6330aa2' },
  { label: 'SF #28', old: '0xee6291a781bd1025cfa8591f3abfb0449c72206f', new: '0x8e0aede794065ffd0437c93c16b73c64460d5f65' },
  { label: 'SF #29', old: '0xffd99a2003456cd06df9fc8074da3aedcb202a1a', new: '0x3ba6e70aa356e6431c6214d6e0d7acb2ae6b701a' },
  { label: 'SF #30', old: '0xa565628ee90c3bfd1b44ab599a13be7441db784b', new: '0xfdd6fe66b39aee1ba36a248e6af168afd4b5fd8c' },
  { label: 'SF #31', old: '0xe147f29cd2dee6cf41cbfabcf9e60a1c15ec57fd', new: '0x5955bc9a450669db75de669cf215461ce02d72d5' },
  { label: 'SF #32', old: '0x6535865b71586e7443d686c0bec6ea8ed8bccffb', new: '0xd3242aa66506dfb1a25d961c6291252811048040' },
]

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Batch-read messages from all old markees via multicall
  const messageResults = await client.multicall({
    contracts: PAIRS.map(({ old: oldAddr }) => ({
      address: oldAddr as `0x${string}`,
      abi: MARKEE_MESSAGE_ABI,
      functionName: 'message',
    })),
    allowFailure: true,
  })

  const results: Record<string, { copied: string[]; skipped: string[] }> = {}

  await Promise.all(PAIRS.map(async ({ label, old: oldAddr, new: newAddr }, i) => {
    const result = { copied: [] as string[], skipped: [] as string[] }
    results[label] = result

    // Migrate views:total (additive — preserves natural views on new address)
    const oldTotal = await kv.get<number>(`views:total:${oldAddr}`)
    if (!oldTotal) {
      result.skipped.push('views:total (no source data)')
    } else {
      const added = await kv.incrby(`views:total:${newAddr}`, oldTotal)
      result.copied.push(`views:total (+${oldTotal} → now ${added})`)
    }

    // Migrate views:msg using message text from multicall (additive)
    const msgResult = messageResults[i]
    if (msgResult.status !== 'success' || !msgResult.result) {
      result.skipped.push('views:msg (could not read message from contract)')
      return
    }
    const msgHash = hashMessage(msgResult.result)
    const oldMsg = await kv.get<number>(`views:msg:${oldAddr}:${msgHash}`)
    if (!oldMsg) {
      result.skipped.push(`views:msg:${msgHash} (no source data)`)
    } else {
      const added = await kv.incrby(`views:msg:${newAddr}:${msgHash}`, oldMsg)
      result.copied.push(`views:msg:${msgHash} (+${oldMsg} → now ${added})`)
    }
  }))

  return NextResponse.json({ ok: true, results })
}
