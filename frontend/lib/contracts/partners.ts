// Partner registry. Kept free of client-only imports so server routes can read it too.
// Partner configuration.
// leaderboardAddress — original Leaderboard; null for unmigrated partners. Read and buy through the
// leaderboardAddress /api/partner/board returns, which follows a finished board migration.
// strategyAddress — kept for reference only (no longer queried).
export const PARTNERS = [
  {
    slug: 'markee-cooperative',
    name: 'Markee Cooperative',
    description: 'The home message for markee.xyz. 62% of each payment goes to the Markee Cooperative treasury and 38% is paid into the Markee Revnet.',
    strategyAddress: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a',
    leaderboardAddress: '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}` | null,
    logo: '/markee-logo.png',
    fundingSplit: '62% to Markee Cooperative, 38% to the Revnet',
    percentToBeneficiary: 6200,
    isCooperative: true,
    liveUrl: 'https://markee.xyz',
  },
  {
    slug: 'gardens',
    name: 'Gardens',
    description: 'Community governance platform built on conviction voting',
    strategyAddress: '0x346419315740F085Ba14cA7239D82105a9a2BDBE',
    leaderboardAddress: '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' as `0x${string}` | null,
    logo: '/partners/gardens.png',
    fundingSplit: '62% to Gardens, 38% to the Revnet',
    percentToBeneficiary: 6200,
    isCooperative: false,
    liveUrl: 'https://app.gardens.fund',
  },
  {
    slug: 'bread-cooperative',
    name: 'Bread Cooperative',
    description: 'A collective of communities building worker-owned financial infrastructure',
    strategyAddress: '0x05A40489965B355e0404c05134dA68626a5a927c',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/breadcoop.png',
    fundingSplit: '100% to Bread Cooperative',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'revnets',
    name: 'RevNets',
    description: 'Autonomous revenue-sharing networks with immutable tokenomics rules',
    strategyAddress: '0xe68CbEf87B710B379654Dfd3c0BEC8779bBCcEbB',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/revnets.png',
    fundingSplit: '100% to RevNets',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'juicebox',
    name: 'Juicebox',
    description: 'Programmable fundraising protocol for community-owned treasury formation',
    strategyAddress: '0x2a84960367832039C188C75FD6D6D5f2E8F640e2',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/juicebox.png',
    fundingSplit: '100% to Juicebox',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'giveth',
    name: 'Giveth',
    description: 'Web3 crowdfunding platform for nonprofits and social causes',
    strategyAddress: '0x00A60bA8351a69EF8d10F6c9b2b0E03aDE2E7431',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/giveth.png',
    fundingSplit: '100% to Giveth',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'flow-state',
    name: 'Flow State',
    description: 'Continuous funding apps, incentive systems & governance mechanisms',
    strategyAddress: '0x24512EE8E5f9138e2Bfca0c8253e7525035f4989',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/flowstate.png',
    fundingSplit: '100% to Flow State',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'superfluid',
    name: 'Superfluid',
    description: 'Protocol for money streaming - send and receive tokens continuously',
    strategyAddress: '0x7A6CE4d457AC1A31513BDEFf924FF942150D293E',
    leaderboardAddress: '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as `0x${string}` | null,
    logo: '/partners/superfluid.png',
    fundingSplit: '100% to Superfluid',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: 'https://campaigns.superfluid.org',
  },
  {
    slug: 'clawchemy',
    name: 'Clawchemy',
    description: 'Autonomous element discovery engine for AI agents on Base Network',
    strategyAddress: '0x89e608223BEc645227f11d8241e8175A9A95597E',
    leaderboardAddress: '0xdF4769a9593CB8E40d0409dEF2645651412A8A97' as `0x${string}` | null,
    logo: '/partners/clawchemy.png',
    fundingSplit: '100% to Clawchemy',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: 'https://clawchemy.xyz/',
  },
]

// Response shape of /api/partner/board (amounts are decimal strings). leaderboardAddress is the
// board to read and buy on: the registry address, or its finished-migration successor.
export interface PartnerBoardSnapshot {
  leaderboardAddress: `0x${string}`
  markees: {
    address: `0x${string}`
    message: string
    name: string
    owner: string
    pricingStrategy: string
    totalFundsAdded: string
  }[]
}
