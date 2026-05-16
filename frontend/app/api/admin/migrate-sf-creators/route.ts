// app/api/admin/migrate-sf-creators/route.ts
//
// One-time KV fix: for every v1.3 Superfluid leaderboard that was migrated by
// scripts/migrate-v11-to-v13.sh, the creator:sf:{address} KV entry was set to
// the revnet-admin EOA (the script runner) instead of the original beneficiary.
// This endpoint reads beneficiaryAddress() from each v1.3 contract on-chain and
// overwrites those KV entries so users see their own leaderboards in /account.
//
// Usage (run once after deploy):
//   curl -X POST -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/migrate-sf-creators

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

// All 119 canonical v1.3 SF leaderboard addresses produced by migrate-v11-to-v13.sh
const MIGRATED_V13_ADDRESSES = [
  '0x032e8caf8d30551299594d4336a592f408505f9e',
  '0x060c9cb516c0c6ec609c7846487257498705941b',
  '0x061e02dd4824bff68b72ac323e86027ee09e529a',
  '0x097b06f778ae2fb32a9a4251ccf04fdbebf3733c',
  '0x0ab8f6d9746f8b9a2d1413c5fc2572399e53ac62',
  '0x0c4460b8d01713557548d88507e65eef06bf6338',
  '0x0cf5c43951cf2eb0395b7b01124ccb06477fe8c3',
  '0x0deef75e1bab6b27c3d77e78bb9fa70cd2b0060c',
  '0x0e06b511779646d854da1bd1ef9dc34f8bb3846e',
  '0x0e7a1128760dde93901efc4d2b3c86ec2c8a7b2e',
  '0x1003e2d81cf8dc3b80f191677a08a6c7f58a7d8b',
  '0x10ad0309a8ac3de7dec8027bd600c11f202fe962',
  '0x10eb027f394dcc300b355a79bc0cec110c054fd6',
  '0x122140b7714a2aa4507d7742a28d0fd71117a729',
  '0x127c1aef13f534485686ce034f36a189db128ede',
  '0x133841b9b9f40debdea531695c22ce80bf50ebbd',
  '0x17b4bd540468a13ad8374e52ffc0693698373a81',
  '0x1b4eb52953d865e0dde1c856c2ead826581e2904',
  '0x1be900ecc09edd0590db88723dbcb3b1fea22fe3',
  '0x1eb69e0cbdc476fc46d4bc8d81afc5f8a500990a',
  '0x202a5372ba7bd32db9417b4f55153cdb83edc024',
  '0x20378d8f18d82c10886c2ecb703322c2e6abd990',
  '0x24dd75ec1377c76aa2918372321fce46fd0548b9',
  '0x2db338261e4cbb17940c456b6ce90b2fb7a1eba4',
  '0x2eb4ef5d253247ddc8f7b299d38bd6a58f566b89',
  '0x2f6dabf7f2fef2f8d9110d9df2afcdc31d7d5968',
  '0x3045dba0b770bba5d95ec06532d6ee6fa4b741ae',
  '0x3324bd811f8ec9b744b9724f34c8d43172fe8a82',
  '0x33dacf696c8d62418e34d99fcb649551229eaf82',
  '0x372a4c19e8c0b76647bf976f072d4350f28aaf03',
  '0x386c06a41a6d9498ed53871d26ab397f1729c915',
  '0x39001232e741e8f0911126a29106a32111fe54c1',
  '0x3b52e2615b60e827991ac557694e52bfeac25e13',
  '0x416b30b65ca00ae8a413c0dd53103388f28632c2',
  '0x41bd51685f2ea4d963fb57f3e19af42a4aee17b8',
  '0x472d3b5d5ec1b0241c729da53854e8bd001e06c2',
  '0x485067d11116af0a7b806312a370366850355a07',
  '0x4903142045737e696001df4fac8a90178aa3be06',
  '0x49c8467d923fbdd17d08c844e69c9cf283d3a8b1',
  '0x4ad89044f5f3f324935747a4bce7ba7954d2aaa4',
  '0x4e413915c0c1d86084e8dcb36d4dec6b66b45a24',
  '0x554454cd50d823327c5ca48dae6cec472fd4bc94',
  '0x566f89accd7e6a497e7b4c9f7992f1fe67e564cb',
  '0x569063e615ccbebeeabb2b682fdeb9eb445c6cc1',
  '0x57842f5043059ad1acf9b9a0e92c5fde781aab0a',
  '0x57cc6a1f4a91f5c0893a9a09b9ddc80afbfeabd4',
  '0x57edfbc2a6f743e4a3b3b0465aefffb8e0772022',
  '0x5b710e8c248decacb62f261cca3c6bc2fb0f8276',
  '0x5cfaa3d7e5088978b30019199d0c5b22acfbd5d9',
  '0x60f304c610ce2619fd66a758379e1c6e76a07ead',
  '0x648f5ad23d2029d1dd5e9f20309158f1783570b6',
  '0x651aea33ceaad24b4e320f5179a02e6e295f7920',
  '0x688ec360d714a8b8bdd1a5aad680884c1a8358fe',
  '0x6963f61671ba5a2d23c3a7f8c06ffa1435feead9',
  '0x6ad93a55809eb96985bcb39f1dbd0b7908c5abe1',
  '0x6cebc87de40519fa52fc40a1d49f16ff968bb439',
  '0x6dba3b2e2b2e14054cf8eb55ae31e1e6ebcd30aa',
  '0x6e7701ce931d6e1566e25405761196e4e7252f6b',
  '0x6f062407acd410c9accaa7053915170dd7e7a64b',
  '0x750c72023a228d8b61a65f4b83a9606734bddaf5',
  '0x762c0484599d6a75636cc8cffd9fcb23793dc582',
  '0x774d8d9ce01151fc5189c13e362f5061dab0fd8f',
  '0x797a572d6a9b9268961f77aa69d05e4e1690a770',
  '0x7ddb9bd5837c05cefff55d1ca2d25234f6ede4ee',
  '0x7eb66060be196e08b775981b1fe0dd3f5d67f002',
  '0x80eecd62d4a8ae16f9e3b31d4e77b7c6074ff262',
  '0x82f241542df97ffca15a45e640dc36e625154644',
  '0x8578915859912888407f72f102761b7d21b2e702',
  '0x85a551cb943b99f124cad1a39fa2bb7dafcbb0e5',
  '0x87d37f04d7317f3c4710b55744598483053da93e',
  '0x8898d54dcc9a2177cac57b90c8dab313f6b15b82',
  '0x8dbc1a23ce909e02cf0e1fa9087ae686b09c3f2f',
  '0x8f193ac581b3a1839ea21b0e5b92f7ccbd64ee64',
  '0x8f37a3a4d1f3d5dd92eb271bfa345db924a8bcae',
  '0x9195ec3e39f2b4a94818ca88d893360d3eab06da',
  '0x93d4b62ae46fd9ea1bc8a25f1265d5aea2083a19',
  '0x97912ff138d1159f87bce5b7065556ba6ad59c61',
  '0x98041921d4f75c08b88bae9b919a8e13b82656b3',
  '0xa3d3b8be1559ac03b6a32d986b3e1d8ea48c58eb',
  '0xa7c4614858fe3e7816c566327f369fee520d9654',
  '0xa920b51ecdde6e1f9fb63e1b073dc742af7dcbf6',
  '0xb05ae71c64964ca7add597d619eac7aa92205c4e',
  '0xb1b62f4122b51c3927751809e4e57c98ad97e741',
  '0xb25222d134bab8371ff932f3e75cf38b2e7f6666',
  '0xb3f507a508a713eb2bbcd39949d372f7402caf0a',
  '0xb5451c1cb790367d0ddbcbf1249de22b9014ecdc',
  '0xb5b3366ecf2e2cb77a2b0379a37a9fdb601f29fc',
  '0xb5d4d2c130e17c18c6cd1b752ed9fd233b71c371',
  '0xb5eea86f7d725c80821e1a82873188c555cd5e4c',
  '0xb8f4cca2d8f5c03b130f2c1a6030f903c1873b79',
  '0xbbe257afaaa27faa9a7a1b0dae4f8a0aab71c4cb',
  '0xbc36bf18e03b71da43d0f1420b0b2b42c9827009',
  '0xbf4864e667700d959ef0f2fa843880e4c21d7f17',
  '0xbfc4c1877c47d5d33968612f23f0c2a64280ce2a',
  '0xc0418bee53cdc46b7fcd0d00b8092ff24c851c85',
  '0xc91c331d42a9a9ff1641d6eb1016f15913b6cda5',
  '0xc936a036b7727865a696398de30f616be98e266b',
  '0xc9e1c161ac741f248216619030e1b2efc8ddc6f5',
  '0xcc8f82a05b5e800d06b82e9f0c42b3feadc614a1',
  '0xcceb1b32e22c2ae3b4d9b5bf53eb273108180b1a',
  '0xceaaaa0b8bd66e7801433053ef3295baea5f56ca',
  '0xd769fa3f04ccaeedccd0025d06b3a5cc46f10ba2',
  '0xd942d61aaacd866fece307ce27311f5fa94bb9b9',
  '0xe00cdd358ac03ca581eac0fbfa6222a14d22668b',
  '0xe33e4bcacbde878b3d8854991174e568fc66c097',
  '0xe3d8731b380e4c24458cb9b1a8fe121efdc58bcc',
  '0xe3ee8c369dc37e478bc4b0e7fbbecce5f1dc089f',
  '0xe431a6faa5fbd22e3d8550f7c5d49625e64ad8c1',
  '0xe4634e8dfe96d949a370bebaedd8431b9cb505ce',
  '0xe72c527b4173d71d4ab93e03cecba6871dcdd6dd',
  '0xe7a63fe6d23f61cbbcd96c923c1401e30ebbfb10',
  '0xe84f511f6fddd1909d33ab78f5d432052af6767d',
  '0xe8a45288396611294d5627f712f107984a719c9d',
  '0xf03e1003db00e33eeba8fd7eccac42fb5f19e245',
  '0xf341ad6892d60f543b794582efeed274b9de928a',
  '0xf3842af17d5e110eb27bbded3db9d84f8b60403b',
  '0xf5d1171a2921e6f6971c48ac8d3384cad5eb829e',
  '0xfaac6424d21f21566e35cbf7f44a0f17b5446941',
  '0xfcd51100dc5146668360546a7180841c48e8fb8f',
] as const

const BENEFICIARY_ABI = [
  {
    inputs: [],
    name: 'beneficiaryAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org'),
  })

  // Fetch all beneficiary addresses in batches of 50
  const CHUNK = 50
  const beneficiaries: (string | null)[] = []
  for (let i = 0; i < MIGRATED_V13_ADDRESSES.length; i += CHUNK) {
    const chunk = MIGRATED_V13_ADDRESSES.slice(i, i + CHUNK)
    const results = await client.multicall({
      contracts: chunk.map(addr => ({
        address: addr as `0x${string}`,
        abi: BENEFICIARY_ABI,
        functionName: 'beneficiaryAddress' as const,
      })),
    })
    for (const r of results) {
      beneficiaries.push(r.status === 'success' ? (r.result as string).toLowerCase() : null)
    }
  }

  // Write creator:sf:{addr} = beneficiary for all that resolved
  let updated = 0
  let failed = 0
  const pipeline = MIGRATED_V13_ADDRESSES.map((addr, i) => {
    const b = beneficiaries[i]
    if (!b) { failed++; return null }
    updated++
    return kv.set(`creator:sf:${addr}`, b)
  }).filter(Boolean)

  await Promise.all(pipeline)

  return NextResponse.json({ ok: true, updated, failed, total: MIGRATED_V13_ADDRESSES.length })
}
