'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Zap, Trophy, Plus, Copy, Check, Eye,
} from 'lucide-react'
import { useReadContracts, useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal, type MarkeeSlot } from '@/components/modals/BuyMessageModal'
import { useViews } from '@/hooks/useViews'
import { NETWORK_PAUSED } from '@/lib/paused'
import type { Markee } from '@/types'

// ─── ABIs ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLeaderboardFunds', outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxMessageLength', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'VERSION', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotToMarkee(slot: MarkeeSlot): Markee {
  return {
    address: slot.address,
    message: slot.message,
    owner: slot.owner,
    totalFundsAdded: slot.totalFundsAdded,
    chainId: 8453,
    pricingStrategy: '',
  }
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkeletonBar({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-[#1A1F4D] rounded animate-pulse ${className}`} />
  )
}

function MetaStatsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-8 mt-8">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2">
          <SkeletonBar className="w-4 h-4 rounded-full" />
          <SkeletonBar className="w-8 h-3.5" />
          <SkeletonBar className="w-16 h-3.5" />
        </div>
      ))}
    </div>
  )
}

function TopMessageSkeleton() {
  return (
    <section className="bg-[#0A0F3D] border-y border-[#8A8FBF]/20 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <SkeletonBar className="flex-shrink-0 w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0 space-y-3">
            <SkeletonBar className="w-24 h-3" />
            <SkeletonBar className="w-3/4 h-5" />
            <SkeletonBar className="w-1/2 h-4" />
            <div className="flex gap-4 pt-1">
              <SkeletonBar className="w-16 h-3" />
              <SkeletonBar className="w-20 h-3" />
              <SkeletonBar className="w-16 h-3" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MarkeeRowSkeleton({ rank }: { rank: number }) {
  const messageWidths = ['w-4/5', 'w-3/4', 'w-2/3', 'w-5/6', 'w-1/2']
  const nameWidths = ['w-24', 'w-20', 'w-28', 'w-16', 'w-24']
  const mw = messageWidths[rank % messageWidths.length]
  const nw = nameWidths[rank % nameWidths.length]

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 px-5 py-4 flex items-start gap-4">
      <SkeletonBar className="flex-shrink-0 w-8 h-8 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        <SkeletonBar className={`h-4 ${mw}`} />
        <SkeletonBar className={`h-3 ${nw}`} />
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2.5 pt-0.5">
        <SkeletonBar className="w-20 h-4" />
        <SkeletonBar className="w-14 h-3" />
      </div>
    </div>
  )
}

// ─── Old → new leaderboard redirect map (v1.0 factory → v1.1 factory) ────────

const OLD_TO_NEW_SF_LEADERBOARDS: Record<string, string> = {
  '0x27c7bbf9dab6a794fcff603867044ec84ad4464e': '0xaec94b5fc02c3b7c3aedd79522bc0c62309486a7',
  '0x98908a8eb592dc9f6f19422d6a44461660b99915': '0x5dcf31a848f9574c00b4233291fdf18fc8ab4790',
  '0xb229743c455257cb7f602be3babe2fe488febf14': '0xaf337820c82cce753c7df1f7706a633d200c3460',
  '0xf2fb5dc337ca8d9919650bfcd8f9bbfd0a9d1e2f': '0xa4720ca4d6ef9d741c0b6c04c93287592f8ebe70',
  '0xa583d80c7cb1e6539c3fffa2c38754976a79623e': '0x78cc4738179a7ca0ce893c8fe4c0f09a01d92077',
  '0xd4307bde177a6a00235daa35981286bc8861ef60': '0xdd3f1f822f83c2502135fb956de6c680d60fe7cb',
  '0x7c73466bb2093ccbce806bbcb85fc071e32096e5': '0x1f32fb5bd17e98e29b438a439fcf53bc02ac3dc0',
  '0x1af9cab44a1d941c06d0d8d7210c6fda27e34784': '0xc07ad92350bc939dc7960b8a88e73f80aab46bbd',
  '0xbb7983a6272fcb6a7a32760abc06f9f3649dcd28': '0x31a3fb211b41a99c566773e62ced0e111e89a6af',
  '0x3e67a7cdd0da2b0d006f5dd7ce8475f2ef3e2473': '0xd1dacb4c17ae6974264e95d95c24f0153220c3e3',
  '0x2c655dea9812cd634bc523359d555264e085ebc6': '0x95102f77fcd7846d2de62a4b369363683129d174',
  '0xb207b1ec84b2e1f23b2dabf4c17c79f5d8251162': '0xdc66413bc7ef0e4d38f03289ee1da2088ee7428f',
  '0x155154eb19b6f18d4c826aa7536529264323e9e1': '0x9f98f04bf216594e6c3e942a2539390d9e29e90b',
  '0xbe55dbbf63b7ee0946c6fa59ae740d1314f63055': '0xaee76259d79c22bcf5e03e064087b67268fe720b',
  '0x1f1dd0dd782e4811a7e06da6bd4538b740e5a6dc': '0xc4faf709a5d485da8771f6fa65783e21886ceeff',
  '0x66bbec26fecdb6df63a1e496f3402896af367f2f': '0xdea1e763d3896efe0fc02dc15c029244447fc896',
  '0x28d493ce23fe67d14fe3cd828c084b05ee999ffc': '0x0bb39abfb2fa0c4b1d680c9ca26ec9594062883a',
  '0x7f0b6d103d04407e0574ade7cf1eb482a7263e20': '0xa7b4e7ad909c8585e231c2743e7cb5dbd82743d2',
  '0xbbf6d78d3725d904937eb1d91fd65937cec8e7c9': '0x3f898a5bebbe16b11cf28a2a1ee3a0b16287c1c8',
  '0xf1a0f3a85ab9524bd7111468a52be3eafedaeffb': '0x8b08378f601d74edbddaafd5fffc1fd5f40eaa51',
  '0xb294638e13fcb5c0480cd66b5304bc7cff52a773': '0x016242be7b9d619d86d8c2761df22da5a7ef523d',
  '0xf47bfd214224262915ae62bfc9a5a4f50922e1b7': '0xc2701fb7df19dff285af41cfaeceea53ecc35ca8',
  '0x07dba7fcc9840701f6a8e0bfa16be97cb4ea5de2': '0x2bc998e6eb59558f9f275d9b091329680cd1a682',
  '0xb9079b0ec155d80a76971dab9a242eb1b3a065cd': '0x5ed45df15aa3d1aba5d1a109f5c2327fa79423f2',
  '0x655ebe4a1ddb5a155a7a2a21cfa5eb13abbe0c9a': '0x437df2c25f127b22da07abebd91b742f01daa575',
  '0xa26068972217f136c98c3a075134490be6cd3907': '0xbf2aadec8d930488ac09c7eb22f9c2c8720ee45e',
  '0x1fafbb2b4a5dd84643e546e51b4606bbb5d45028': '0xfd66afd4bd4d7d5a923abd4f7b4db3a34f4725d9',
  '0x29d75dfa406aa2c6b0ef685d6dcda1b484ab02ce': '0x8628d37bac06f5b60d94abdad74c993af00a1c7e',
  '0x649e046fdb75af69f9062d044d2e29823b121fd5': '0x93218a75bdacc6566e677268955fe1b89fc845c5',
  '0x2124d61cab7561d3547800abdac2adaa3f2ce958': '0xe69b663584d46b13710bb89f9ff8b4e0d06ef259',
  '0x825dd6c09924a8ddaac5dbbd3a4a44d9036df608': '0x8acf288cd509a11ae75be99c20b597b347f3d921',
  '0x8e64587e444500b020d4714734edce28b26df6d1': '0x724a58f320e6852aa7639c64d627d7c2fd4b61eb',
  '0xcf33ff8ec2f64904d9eb8ac2ca0ffb9e8fe8eedd': '0x22c122b800a93b850a9ec46e3bb1eeb524598c44',
  '0x1bf9ddae25ab4ffd23d5c0da19827e5c3d5d4f0c': '0xfa436eb4afeb16b64e9a0273122c8130d051dc02',
  '0x106e3169aa0b83a15230332135ffcd1fba86850b': '0x032dfc910ca53efdec5460de5fd2682eb3d31ff2',
  '0x8fe92fcf7b4ea2ddcfc72e0b8c25c9e240be8424': '0x22e35b8772542cc1801b010e467ea409523708d0',
  '0xb1499d2807789192127d243c356f43d4869496fc': '0x11c97b4a644a68f00ab357df51a680c7cb46e3d1',
  '0x91a786ed59ba4a72a768f8538fac8a5bc9a2f1dc': '0x1cf0257e9d4fda29602d636f636dc0b68fa9a77f',
  '0xf6427b138a10378386c402f456a9d98b349de6e5': '0x23193705020f99f4a20a459f5305a05f0890c8c3',
  '0xa9b58bac81736961938b5269dc4af1c4516df304': '0xdcd0d5e21b214f9fcab56836f7c17fff9da8763d',
  '0x31fac7033f343a7be2d852391f8f277cb2ffe6f9': '0x765383bfa8e8af3b6c8b3f8921889ba3efc65b6a',
  '0xb440e828cbaa81a2d33c218412f0edc534b5fc60': '0x7ad93aa3660bbb30ad358769495af60d1a3ebaa9',
  '0x373db653481bb9db1c43cdb060a2e961462f1aa3': '0x40da1b5830d974c24eb290bff9565156bbd00f73',
  '0x98f8c5bbb3724028750466c54f2d06391a1e4cf2': '0x9c9c9411acec008eb3f4405a3b41d313c72786ae',
  '0x1aa206ba51bcdb767cedd3b2d8b5d9aae7ab1fd2': '0x71ac571e772b9324cabfaf71d9c4033c366e0304',
  '0xa01fa1c8ef307e591c61c4ac3c0462742944e59d': '0x560a13c65e5d91269b73ee14e735cb67a2bb517d',
  '0x49bb853be66f5582ae3bd28e7aea524110916b98': '0x180f653430558649660ee9ca63cfad59222c244b',
  '0x1a71ea8e195ec6cd53ec63070bd1c1a14e84ea0f': '0x48b601d180ed04b87096ff57e257ea26757d9301',
  '0x5086da9c96e158d94aa671244c98a851d68d532a': '0x7e176ca598195bbd7debc7a7b5405f683c6cf0eb',
  '0x806215064e65317b4b54e7907651b8f63e23d8a6': '0xde99aa623651de9112132789e752306b83ecbde5',
  '0x8332ba2c87336e51a360fc350b4fbd3a5c97b88b': '0x27d123ab567a648ab17bacde172dc23b4a809d32',
  '0xaacd0e9cdb7bf49d64d094883723e72dc041a553': '0x3bfdf0cb7aa13810da0ad537378854fd2f108eb9',
  '0x907d6ac7eb73b7a189a95fb11c19bbf63cb5849f': '0x8473a1142d455433da1c6232419eef3bce2b9260',
  '0x864479007374ef1c6aaa5a79f1524e961ef012f1': '0xe661c4cd492a86fab79e08c084022724ec41b998',
  '0xb106c7a841b312cdf8b86656245255b30674d988': '0x61b74d66463c729afeede87e640d4cc43a86660b',
  '0xc9ee4f2c6eeeb99490969fbcab748a656aeb5ffa': '0x413e64e90136d8c12d1d6624736880fd66e03f4b',
  '0x8f27127b8604598c190dcb5af86d5379e356f0f9': '0x6e19cceeacd78a4e2b086f8a88cb42342e536e93',
  '0xb6e0474699b4ac1478864b4b4161f7cecdd43f9b': '0x9e8806b026b1c2936aa0b845909ea442ecb88874',
  '0xcbdebf43c860c79bb40d4d2339f198d1fcb4f228': '0xecf3585c20856deeb603ff640b39ee0dbe7ec07e',
  '0xffd8e2b3978581884abb67e2d38b971ae9597710': '0xed56e0e6d6a355117945b3dc60af0de39fd90c7e',
  '0xba85b7ac1507f43e4c61f9547413929322451fb7': '0x459e4cd41f2cbdcef2537cf5a8e4bebfe59e816a',
  '0xa52949126070fb9a56c3c7b0a968b6e42cdb6561': '0xbdfc3dc45b96ef7d5a8f86fdd4ea8c6f6e52d20a',
  '0x9a7a49dc9d1d0faedd63df633d181524b3ad8dd1': '0x22b88b976214935f39b31f44b79f5f22f8ed0f16',
  '0xbefa4d87842a8613a2069bba6c251a9a38fd5a71': '0xf3c86d155169d2d599effcf0b9e29b5dab9135c6',
  '0xb6da7c92813aa51d3f4fd8dfed0fbabd34ad3089': '0x97a20800252e342ee5fd5e7116d349d4a205784f',
  '0x0310ddc581044f71bbfef29b8365483c95c18dcd': '0x8e858226a12dbd7422ea14e5e1a5bb123397995d',
  '0x7eb9af75ba8ecd756fec9d088d3be6e554f0f2b7': '0xa1752a5282af6fd276af7474aee644f8332a64c7',
  '0x55a56f94a89d8beca75bf049df5f7cd95a2e4ec0': '0x4b460eee80f94c3cf8c16f347df858b936cfe78d',
  '0x1a8a026168acd6f738784ee12efa58587ebd01f6': '0xbfba946af874fa8c370ee56680dc8955230f6fe3',
  '0x9e3841d0306e3c5d05511ba42133aced928fca4a': '0xde3e725936c34cb75cbd57e30e49a09e80bb4446',
  '0x5909e6fdf1e2f8e5a3160074d184f7341415f50e': '0xb1ed40c085b6285790dea942b6670387f85f9d6e',
  '0x0ece35183b8aee9e240d6035a03e3fb73b69dd16': '0x746847bfe55804ce5e8e416988e1d6701c933e8b',
  '0x9eaa5b74739b661ec04eddfde96c32dbf56d102a': '0xb98d5266b5e3e892dbd40034eddd8c87dde3d359',
  '0x3cb879e4ad7b1e94d8b47da9bb6c1acf0f47270b': '0x751ed345aede34029e3f6b5eb72c048f30f2adf6',
  '0xacb99d556b89f64135705794a1212ea52a001ee4': '0x06f5a85ce2a4217fd785913339b3d5c2789f32ed',
  '0xf632fada179e59c241e25496bf09814ce171082d': '0xaab691079ddc7e8ea80eaef3f27b8395f275eda1',
  '0x6c38bf4504a420622cce090f73e7bdad459436f2': '0xa6cd8e48efe4b28807abc5bf76e93a2bd3c387b5',
  '0x601cd540959631a6260722cb6573938b92bf4347': '0xd73015c2e8bf0392316bceddcfb769777ca78da5',
  '0x3bfe8442e020ebe2a1449070df584dfcde1d1ad6': '0xcdc50053c632ce0232d753c71d30c690b893eef7',
  '0xaeeb838cd75839b7501ec6a5313e0f675fd5a04c': '0x1ab76e21ad1d3ae785c6b1b9436a5fb6ea7a2c16',
  '0x0e41a475d4b405e7507ccf8a6daf6bf184a3f4ab': '0xa51ed57512bb58b1806b81a1f89a51c6fe9addd2',
  '0x42f1221eb2d9633b1b641b0f64f194a480fc8fa0': '0x8b021d355ecac1d7f41dccb0e124feb365ae838b',
  '0x2507d46e5311f3fb39f68d068f885607b753d03b': '0xfaa59e2ef534b85d8d6889ddb020bea3831dde46',
  '0xfb36a3d516ded3d1259d10d1e836b5734aaa988d': '0xe538e8edfe949a86077fc52baad90108bf715e85',
  '0x54140dc60bdacc58affade446b157e239abbedd5': '0x2844d6f6e360f197b2986001703d8c4949284469',
  '0xf077f6ce3e6392c37238fe1497b36532929c698e': '0xd72a0eb5f2769388ee86371b3dfc3d0fb838b417',
  '0xcd7ed436e6d40dad509d8bead07d9713fcc1f637': '0xe16500279953eb4837090d9e3eede425d0b2398e',
  '0xa315ed9506ea4595e3b7ea95aa0b7f44a97e7ba8': '0xe3296c80bbf41520bc888b6554548809775a998b',
  '0x489eb8b6013edf4293f084ef07c780ced2892e3b': '0xfd0f84e18dfeeb2ee95caea8a4c8522fec0ffc07',
  '0x9805798b120f886f21bf9e25d5ad82b58c311c2f': '0x01e6e1b008cfd37d581abab2a186fa2aa29ece24',
  '0xe247fb44f281dc49c675924526b9e0fb23f6cdaa': '0xd39c36683acc0e81a5eee54c338ae6b2568df14e',
  '0xbceee965717920544836eb4f525353d799e547af': '0x16417ffd346b0a88dbb50187cfbef9e88a70b74a',
  '0xc85a24c129902dde962f8b48fb423f1d97ebd6ab': '0x247d74e34ab953dcf7d921efe5a897355ac36488',
  '0x30fa580f8bc516e9cad54b65bbf8a9ab2aa8de8e': '0x6bf71bd05fc39a4820899edaacb220c7800305a2',
  '0xe21a767eb453426c2c26ef5313704119f801b386': '0x44e037ce7b8b8482b6ef806c8b5c8a65e1fbe9d0',
  '0xb46860ccbbcb43701b0e3beae4359b1527bb9b5f': '0x18a81ec51dc01538eb4f92b4c703852252a1a9fa',
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuperfluidLeaderboardPage() {
  const params = useParams()
  const router = useRouter()
  const leaderboardAddress = (params.address as string) as `0x${string}`

  // Redirect v1.0 factory leaderboard addresses to their v1.1 counterparts
  useEffect(() => {
    const newAddr = OLD_TO_NEW_SF_LEADERBOARDS[leaderboardAddress.toLowerCase()]
    if (newAddr) router.replace(`/ecosystem/platforms/superfluid/${newAddr}`)
  }, [leaderboardAddress, router])

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<MarkeeSlot | null>(null)
  const [initialMode, setInitialMode] = useState<'create' | 'addFunds' | 'updateMessage' | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  // ── Read leaderboard metadata ──────────────────────────────────────────────
  const metaContracts = useMemo(() => [
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'maxMessageLength' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'VERSION' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [100n] as const },
  ], [leaderboardAddress])

  const { data: meta, isLoading: isMetaLoading, refetch: refetchMeta } = useReadContracts({
    contracts: metaContracts,
  })

  const leaderboardName = meta?.[0]?.result as string | undefined
  const totalFunds = meta?.[1]?.result as bigint | undefined
  const markeeCount = meta?.[2]?.result as bigint | undefined
  const minimumPrice = meta?.[3]?.result as bigint | undefined
  const maxMessageLength = meta?.[5]?.result as bigint | undefined
  const contractVersion = meta?.[6]?.result as string | undefined
  const isLegacyContract = contractVersion !== undefined && contractVersion !== '1.1.0'
  const topResult = meta?.[7]?.result as [string[], bigint[]] | undefined

  const topAddresses = topResult?.[0] ?? []
  const topFunds = topResult?.[1] ?? []

  const displayMessageCount = markeeCount !== undefined
    ? (markeeCount > 0n ? markeeCount - 1n : 0n)
    : undefined

  const markeeContracts = useMemo(
    () => topAddresses.flatMap(addr => [
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'owner' as const },
    ]),
    [topAddresses]
  )

  const { data: markeeDetails, isLoading: isDetailsLoading, refetch: refetchDetails } = useReadContracts({
    contracts: markeeContracts,
    query: { enabled: topAddresses.length > 0 },
  })

  const isLoading = isMetaLoading || (topAddresses.length > 0 && isDetailsLoading)

  const markees = useMemo((): MarkeeSlot[] =>
    topAddresses
      .map((addr, i) => ({
        address: addr,
        message: (markeeDetails?.[i * 3]?.result as string) ?? '',
        name: (markeeDetails?.[i * 3 + 1]?.result as string) ?? '',
        owner: (markeeDetails?.[i * 3 + 2]?.result as string) ?? '',
        totalFundsAdded: topFunds[i] ?? 0n,
      }))
      .filter(m => m.totalFundsAdded > 0n),
    [topAddresses, topFunds, markeeDetails]
  )

  // ── Views ──────────────────────────────────────────────────────────────────
  const viewableMarkees = useMemo(() => markees.map(slotToMarkee), [markees])
  const { views, trackView } = useViews(viewableMarkees)

  const refetch = useCallback(() => {
    refetchMeta()
    refetchDetails()
  }, [refetchMeta, refetchDetails])

  const formatFunds = (wei: bigint) => {
    const eth = parseFloat(formatEther(wei))
    if (eth === 0) return '0 ETH'
    if (eth < 0.0001) return '< 0.0001 ETH'
    return `${eth.toFixed(3)} ETH`
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(leaderboardAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const topMarkee = markees[0]

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="create-a-markee" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Link href="/create-a-markee" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Create a Markee</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <Link href="/ecosystem/platforms/superfluid" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Superfluid</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            {isMetaLoading
              ? <SkeletonBar className="w-32 h-3.5" />
              : <span className="text-[#EDEEFF] truncate max-w-xs">{leaderboardName ?? ''}</span>
            }
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-16 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Zap size={28} className="text-[#1DB227]" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  {isMetaLoading
                    ? <SkeletonBar className="w-48 h-7" />
                    : (
                      <>
                        <h1 className="text-2xl font-bold text-[#EDEEFF]">{leaderboardName ?? ''}</h1>
                        <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          Superfluid S5
                        </span>
                      </>
                    )
                  }
                </div>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-mono transition-colors"
                >
                  {leaderboardAddress.slice(0, 8)}…{leaderboardAddress.slice(-6)}
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            {!NETWORK_PAUSED && !isLegacyContract && (
              <button
                onClick={() => { setSelectedMarkee(null); setBuyModalOpen(true) }}
                className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
              >
                <Plus size={18} />
                Buy a Message
              </button>
            )}
          </div>

          {/* Stats */}
          {isMetaLoading ? (
            <MetaStatsSkeleton />
          ) : (
            <div className="flex flex-wrap items-center gap-8 mt-8">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{displayMessageCount?.toString() ?? ''}</span>
                <span className="text-[#8A8FBF]">messages</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                <span className="text-[#7C9CFF] font-semibold">
                  {totalFunds !== undefined ? formatFunds(totalFunds) : '—'}
                </span>
                <span className="text-[#8A8FBF]">total funded</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Legacy contract warning */}
      {!isMetaLoading && isLegacyContract && (
        <section className="bg-[#FF8E8E]/10 border-y border-[#FF8E8E]/40 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-sm text-[#FF8E8E]">
              This sign uses an older contract version. New purchases are disabled to prevent funds from routing through a deprecated payment terminal.
            </p>
          </div>
        </section>
      )}

      {/* Top message spotlight */}
      {isLoading
        ? <TopMessageSkeleton />
        : topMarkee && (
          <section className="bg-[#0A0F3D] border-y border-[#8A8FBF]/20 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#FFD700]/15 border border-[#FFD700]/40 text-[#FFD700] text-xs font-bold">
                  #1
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">Top Message</div>
                  <p className="text-[#EDEEFF] font-mono text-base leading-relaxed">
                    {topMarkee.message || <span className="opacity-40 italic">No message set</span>}
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    {topMarkee.name && (
                      <span className="text-[#8A8FBF] text-xs">by {topMarkee.name}</span>
                    )}
                    <span className="text-[#F897FE] text-xs font-semibold">{formatFunds(topMarkee.totalFundsAdded)}</span>
                    {!NETWORK_PAUSED && !isLegacyContract && (
                      <button
                        onClick={() => { setSelectedMarkee(topMarkee); setBuyModalOpen(true) }}
                        className="text-[#7C9CFF] text-xs hover:text-[#F897FE] transition-colors"
                      >
                        Add funds →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )
      }

      {/* All Messages */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#EDEEFF]">All Messages</h2>
            {!NETWORK_PAUSED && !isLegacyContract && (
              <button
                onClick={() => { setSelectedMarkee(null); setBuyModalOpen(true) }}
                className="flex items-center gap-1.5 text-sm text-[#8A8FBF] hover:text-[#F897FE] transition-colors border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-4 py-2 rounded-lg"
              >
                <Plus size={14} />
                Buy a message
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <MarkeeRowSkeleton key={i} rank={i} />
              ))}
            </div>
          ) : markees.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Trophy size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No messages yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Be the first to buy a message on this sign.</p>
              {!NETWORK_PAUSED && !isLegacyContract && (
                <button
                  onClick={() => setBuyModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
                >
                  <Plus size={18} />
                  Buy the first message
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {markees.map((markee, idx) => (
                <MarkeeRow
                  key={markee.address}
                  markee={markee}
                  rank={idx + 1}
                  formatFunds={formatFunds}
                  trackView={trackView}
                  viewCount={views.get(markee.address.toLowerCase())?.totalViews}
                  onAddFunds={NETWORK_PAUSED || isLegacyContract ? undefined : () => { setSelectedMarkee(markee); setInitialMode('addFunds'); setBuyModalOpen(true) }}
                  onEditMessage={NETWORK_PAUSED || isLegacyContract ? undefined : () => { setSelectedMarkee(markee); setInitialMode('updateMessage'); setBuyModalOpen(true) }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {buyModalOpen && !isLegacyContract && (
        <BuyMessageModal
          leaderboardAddress={leaderboardAddress}
          minimumPrice={minimumPrice ?? 0n}
          maxMessageLength={Number(maxMessageLength ?? 222n)}
          existingMarkee={selectedMarkee}
          topFundsAdded={markees[0]?.totalFundsAdded}
          initialMode={initialMode}
          platformId="superfluid"
          onClose={() => { setBuyModalOpen(false); setSelectedMarkee(null); setInitialMode(undefined) }}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}

// ─── Markee Row ───────────────────────────────────────────────────────────────

function MarkeeRow({
  markee,
  rank,
  formatFunds,
  trackView,
  viewCount,
  onAddFunds,
  onEditMessage,
}: {
  markee: MarkeeSlot
  rank: number
  formatFunds: (wei: bigint) => string
  trackView: (m: Markee) => void
  viewCount?: number
  onAddFunds?: () => void
  onEditMessage?: () => void
}) {
  const { address } = useAccount()
  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  useEffect(() => {
    if (markee.message) {
      trackView(slotToMarkee(markee))
    }
  }, [markee.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const rankColors: Record<number, string> = {
    1: 'text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10',
    2: 'text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10',
    3: 'text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10',
  }
  const rankStyle = rankColors[rank] ?? 'text-[#8A8FBF] border-[#8A8FBF]/20 bg-[#8A8FBF]/5'

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-all px-5 py-4 flex items-start gap-4">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${rankStyle}`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#EDEEFF] font-mono text-sm leading-relaxed line-clamp-2">
          {markee.message || <span className="opacity-40 italic">No message</span>}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {markee.name && <span className="text-[#8A8FBF] text-xs">{markee.name}</span>}
          {isOwner && (
            <span className="text-xs bg-[#F897FE]/15 border border-[#F897FE]/30 text-[#F897FE] px-2 py-0.5 rounded-full">
              yours
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        {viewCount !== undefined && (
          <span className="text-[#8A8FBF] text-xs flex items-center gap-1">
            <Eye size={12} className="opacity-60" />
            <span>{viewCount.toLocaleString()}</span>
          </span>
        )}
        <span className="text-[#F897FE] text-sm font-semibold">{formatFunds(markee.totalFundsAdded)}</span>
        <button onClick={onAddFunds} className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
          + add funds
        </button>
        {isOwner && (
          <button onClick={onEditMessage} className="text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
            edit message
          </button>
        )}
      </div>
    </div>
  )
}
