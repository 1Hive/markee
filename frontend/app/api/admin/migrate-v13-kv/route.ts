// app/api/admin/migrate-v13-kv/route.ts
//
// One-time KV migration: copies oi:meta and github:markee/github:contract entries
// from v1.2 leaderboard addresses to their v1.3 equivalents.
//
// Call once after deploying v1.3 contracts:
//   curl -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/migrate-v13-kv
//
// Safe to call multiple times — only writes if the source key exists and dest doesn't.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

// v1.2 address → v1.3 address for all migrated leaderboards
const ADDRESS_MAP: Record<string, string> = {
  // OI leaderboards
  '0xa9a65432a1daf9bdb67542b75f341e4361aecc54': '0xca7fc7887f6448d3a8232845e6f6e5dee916a286', // Honeyswap
  '0xf73cab6d43df28798af171df41ec12155b5c725c': '0x9c86db5cfd00805727929e8b85884df4cadaff07', // Gitcoin
  '0x4ba55b631c23487519dacd909500accd714c4648': '0x357b6352ef44c52c2299b731aa449ffed129ec61', // Matias
  '0x07a8d34c350c66d6a7e30dbf9b3f8dcc67b70aff': '0x0590b56430426a38d0fa065b839c10d542e75ccd', // Markee Cooperative
  '0x03e9b27cbc55aa47bbdf6339a1f525bdfb87fbe0': '0x2768bc6e90266248bd8bcf5401c36d8049cdf671', // Gardens
  '0x753c1a3203ad3143ecef57e986cb72f7da195741': '0xdf4769a9593cb8e40d0409def2645651412a8a97', // Clawchemy
  // SF leaderboards
  '0x5dcd5003b06506c1fdab4e77721ce879575ae3c9': '0xc76bf8291151ecfe4554dda29f56b06c0f48260b', // Gardens 🌱
  '0x2eff03c0cb4c09583462adea1abbcee92b52a742': '0xaa37d049dfbfc07f9e8526a4a9bde418df9f1b79', // Superfluid
  // GH leaderboards
  '0xdbb405000bcc0662b0d72f620acb91ec7e8dcaea': '0x43d025ea7f0bfcc508c5dc1708415fe2e41c464a', // pglavin2/honeyswap-interface
  '0x84bc9feff57ae16307a4a01b7babff05dbd6b4e1': '0x5e2d08d07b2c771abe15af29fb30826bfeef2151', // 1Hive/markee
  '0x172e45b38dc98a11299c3ff9a308f81132e0934c': '0x0ed8e4f89b2e7ebdbc7ba2f1bf7d1f9012f00746', // 1Hive/gardens-v2
  '0x0246c6dd1cd13e460dadac694cb4abbc8ed4b034': '0xe871f0282224ef727bfc69fc54ec3ebe2908f489', // web3devz/VeriNet
  '0xb64aa75d72ecfc0009053852a656ec84ea65f30e': '0xce0b603d7d72cd665e7bf917a339d1b8585a61c1', // bitpixi2/deviantclaw
  '0x23172551399f19a988a3df12680305ab2ca50214': '0xee3c567b5ff302d7a0d8a3105a911804da576cf9', // JimmyNagles/AVN #1
  '0x688e6e140314dfdc6817420f27f29c97b5947171': '0xb57d3a145cb0245f598cda68a676eeb0a4333b2b', // web3devz/agentcred
  '0x3569d07f2007ca4ac5ea4aed2f40f4a61255cfd1': '0xc2a42b3edbfcdfa3c64108336a7f3492a3aca887', // Timidan/synth-x
  '0x8d0e06422bf9e860a9543abb64d5304eaeeff5e8': '0x1e95812f4ce5178339d55d17727e7355a4ced67b', // nativ3ai/hermes
  '0x64d232ef48580160663f96983f4ba2bad735c701': '0x029bcbce4b21be6e9686993616965eade321de37', // JimmyNagles/AVN #2
  '0x9dab2b08033268b0414016282152fcb82017fbc8': '0x8aa3136d599886910cbde882268c4f276ccfe6f6', // web3devz/Soulbyte
  '0x98f4235fbe3a134b21ef75d6319bf5fc2fe8ccb0': '0xcb4108cb6900a09a51176ef1f1ec9b1141d7179f', // web3sim/PolicyPay
  '0x713af7f43d51470f0b9d40133203611ba729c596': '0x0b63a27f25d69c0fc636eccf7b5f338206bb9e40', // web3sim/HelixChain
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, { copied: string[]; skipped: string[] }> = {}

  for (const [oldAddr, newAddr] of Object.entries(ADDRESS_MAP)) {
    results[oldAddr] = { copied: [], skipped: [] }

    // Migrate oi:meta entries (OI leaderboards only)
    const oiMetaKey = `oi:meta:${oldAddr}`
    const oiMetaNewKey = `oi:meta:${newAddr}`
    const [oiMeta, oiMetaNew] = await Promise.all([
      kv.get(oiMetaKey),
      kv.get(oiMetaNewKey),
    ])
    if (oiMeta && !oiMetaNew) {
      await kv.set(oiMetaNewKey, oiMeta)
      results[oldAddr].copied.push(oiMetaKey)
    } else if (oiMeta && oiMetaNew) {
      results[oldAddr].skipped.push(oiMetaKey + ' (dest exists)')
    }

    // Migrate github:markee entries
    const ghMarkeeKey = `github:markee:${oldAddr}`
    const ghMarkeeNewKey = `github:markee:${newAddr}`
    const [ghMarkee, ghMarkeeNew] = await Promise.all([
      kv.get(ghMarkeeKey),
      kv.get(ghMarkeeNewKey),
    ])
    if (ghMarkee && !ghMarkeeNew) {
      await kv.set(ghMarkeeNewKey, ghMarkee)
      results[oldAddr].copied.push(ghMarkeeKey)
    } else if (ghMarkee && ghMarkeeNew) {
      results[oldAddr].skipped.push(ghMarkeeKey + ' (dest exists)')
    }

    // Migrate github:contract entries
    const ghContractKey = `github:contract:${oldAddr}`
    const ghContractNewKey = `github:contract:${newAddr}`
    const [ghContract, ghContractNew] = await Promise.all([
      kv.get(ghContractKey),
      kv.get(ghContractNewKey),
    ])
    if (ghContract && !ghContractNew) {
      await kv.set(ghContractNewKey, ghContract)
      results[oldAddr].copied.push(ghContractKey)
    } else if (ghContract && ghContractNew) {
      results[oldAddr].skipped.push(ghContractKey + ' (dest exists)')
    }

    // Migrate views:total entries
    const viewsKey = `views:total:${oldAddr}`
    const viewsNewKey = `views:total:${newAddr}`
    const [views, viewsNew] = await Promise.all([
      kv.get<number>(viewsKey),
      kv.get<number>(viewsNewKey),
    ])
    if (views && !viewsNew) {
      await kv.set(viewsNewKey, views)
      results[oldAddr].copied.push(viewsKey)
    } else if (views && viewsNew) {
      results[oldAddr].skipped.push(viewsKey + ' (dest exists)')
    }
  }

  return NextResponse.json({ ok: true, results })
}
