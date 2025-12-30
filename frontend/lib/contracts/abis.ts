// Contract ABIs for Markee platform

export const TopDawgStrategyABI = [
  {
    inputs: [
      { internalType: "address", name: "_revNetTerminal", type: "address" },
      { internalType: "uint256", name: "_revNetProjectId", type: "uint256" },
      { internalType: "string", name: "_instanceName", type: "string" },
      { internalType: "address", name: "_adminAddress", type: "address" },
      { internalType: "uint256", name: "_minimumPrice", type: "uint256" },
      { internalType: "uint256", name: "_maxMessageLength", type: "uint256" },
      { internalType: "uint256", name: "_maxNameLength", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "string", name: "message", type: "string" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "MarkeeCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "addedBy", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newMarkeeTotal", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newInstanceTotal", type: "uint256" }
    ],
    name: "FundsAddedToMarkee",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "updatedBy", type: "address" },
      { indexed: false, internalType: "string", name: "newMessage", type: "string" }
    ],
    name: "MessageUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "updatedBy", type: "address" },
      { indexed: false, internalType: "string", name: "newName", type: "string" }
    ],
    name: "NameUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "string", name: "oldName", type: "string" },
      { indexed: false, internalType: "string", name: "newName", type: "string" }
    ],
    name: "InstanceNameUpdated",
    type: "event"
  },
  {
    inputs: [],
    name: "NATIVE_TOKEN",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "instanceName",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalInstanceFunds",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "_message", type: "string" },
      { internalType: "string", name: "_name", type: "string" }
    ],
    name: "createMarkee",
    outputs: [{ internalType: "address", name: "markeeAddress", type: "address" }],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "_markeeAddress", type: "address" }],
    name: "addFunds",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_markeeAddress", type: "address" },
      { internalType: "string", name: "_newMessage", type: "string" }
    ],
    name: "updateMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_markeeAddress", type: "address" },
      { internalType: "string", name: "_newName", type: "string" }
    ],
    name: "updateName",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "_newName", type: "string" }],
    name: "setInstanceName",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "minimumPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxMessageLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxNameLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isMarkeeUsingThisStrategy",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  }
] as const

export const TopDawgPartnerStrategyABI = [
  {
    inputs: [
      { internalType: "address", name: "_revNetTerminal", type: "address" },
      { internalType: "uint256", name: "_revNetProjectId", type: "uint256" },
      { internalType: "string", name: "_instanceName", type: "string" },
      { internalType: "address", name: "_adminAddress", type: "address" },
      { internalType: "address", name: "_beneficiaryAddress", type: "address" },
      { internalType: "uint256", name: "_minimumPrice", type: "uint256" },
      { internalType: "uint256", name: "_maxMessageLength", type: "uint256" },
      { internalType: "uint256", name: "_maxNameLength", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "oldAdmin", type: "address" },
      { indexed: true, internalType: "address", name: "newAdmin", type: "address" }
    ],
    name: "AdminAddressUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "oldBeneficiary", type: "address" },
      { indexed: true, internalType: "address", name: "newBeneficiary", type: "address" }
    ],
    name: "BeneficiaryAddressUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "addedBy", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "beneficiaryAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "revNetAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newMarkeeTotal", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newInstanceTotal", type: "uint256" }
    ],
    name: "FundsAddedToMarkee",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "string", name: "oldName", type: "string" },
      { indexed: false, internalType: "string", name: "newName", type: "string" }
    ],
    name: "InstanceNameUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "string", name: "message", type: "string" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "beneficiaryAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "revNetAmount", type: "uint256" }
    ],
    name: "MarkeeCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "oldLength", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newLength", type: "uint256" }
    ],
    name: "MaxMessageLengthUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "oldLength", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newLength", type: "uint256" }
    ],
    name: "MaxNameLengthUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "updatedBy", type: "address" },
      { indexed: false, internalType: "string", name: "newMessage", type: "string" }
    ],
    name: "MessageUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "oldPrice", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newPrice", type: "uint256" }
    ],
    name: "MinimumPriceUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "updatedBy", type: "address" },
      { indexed: false, internalType: "string", name: "newName", type: "string" }
    ],
    name: "NameUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "oldPercent", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newPercent", type: "uint256" }
    ],
    name: "PercentToBeneficiaryUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "markeeAddress", type: "address" },
      { indexed: true, internalType: "address", name: "oldStrategy", type: "address" },
      { indexed: true, internalType: "address", name: "newStrategy", type: "address" },
      { indexed: false, internalType: "address", name: "changedBy", type: "address" }
    ],
    name: "PricingStrategyChangedForMarkee",
    type: "event"
  },
  {
    inputs: [],
    name: "BASIS_POINTS_DIVISOR",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "NATIVE_TOKEN",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "_markeeAddress", type: "address" }],
    name: "addFunds",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "adminAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "beneficiaryAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_markeeAddress", type: "address" },
      { internalType: "address", name: "_newStrategy", type: "address" }
    ],
    name: "changePricingStrategy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "_message", type: "string" },
      { internalType: "string", name: "_name", type: "string" }
    ],
    name: "createMarkee",
    outputs: [{ internalType: "address", name: "markeeAddress", type: "address" }],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "instanceName",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isMarkeeUsingThisStrategy",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxMessageLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxNameLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "minimumPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "percentToBeneficiary",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "revNetProjectId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "revNetTerminal",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "_newAdmin", type: "address" }],
    name: "setAdminAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "_newBeneficiary", type: "address" }],
    name: "setBeneficiaryAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "_newName", type: "string" }],
    name: "setInstanceName",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_newMaxLength", type: "uint256" }],
    name: "setMaxMessageLength",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_newMaxLength", type: "uint256" }],
    name: "setMaxNameLength",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_newMinimumPrice", type: "uint256" }],
    name: "setMinimumPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_newPercent", type: "uint256" }],
    name: "setPercentToBeneficiary",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "totalInstanceFunds",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_markeeAddress", type: "address" },
      { internalType: "address", name: "_newOwner", type: "address" }
    ],
    name: "transferMarkeeOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_markeeAddress", type: "address" },
      { internalType: "string", name: "_newMessage", type: "string" }
    ],
    name: "updateMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_markeeAddress", type: "address" },
      { internalType: "string", name: "_newName", type: "string" }
    ],
    name: "updateName",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const

export const MarkeeABI = [
  {
    inputs: [
      { internalType: "address", name: "_owner", type: "address" },
      { internalType: "address", name: "_pricingStrategy", type: "address" },
      { internalType: "string", name: "_initialMessage", type: "string" },
      { internalType: "string", name: "_name", type: "string" },
      { internalType: "uint256", name: "_initialFunds", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "string", name: "newMessage", type: "string" },
      { indexed: true, internalType: "address", name: "changedBy", type: "address" }
    ],
    name: "MessageChanged",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "string", name: "newName", type: "string" },
      { indexed: true, internalType: "address", name: "changedBy", type: "address" }
    ],
    name: "NameChanged",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "newTotal", type: "uint256" },
      { indexed: true, internalType: "address", name: "addedBy", type: "address" }
    ],
    name: "FundsAdded",
    type: "event"
  },
  {
    inputs: [],
    name: "message",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalFundsAdded",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "pricingStrategy",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "_message", type: "string" }],
    name: "setMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "_name", type: "string" }],
    name: "setName",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_amount", type: "uint256" }],
    name: "addFunds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const

export const FixedPriceStrategyABI = [
  {
    inputs: [
      { internalType: "address", name: "_revNetTerminal", type: "address" },
      { internalType: "uint256", name: "_revNetProjectId", type: "uint256" },
      { internalType: "string", name: "_initialMessage", type: "string" },
      { internalType: "string", name: "_initialName", type: "string" },
      { internalType: "uint256", name: "_price", type: "uint256" },
      { internalType: "uint256", name: "_maxMessageLength", type: "uint256" },
      { internalType: "uint256", name: "_maxNameLength", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "changedBy", type: "address" },
      { indexed: false, internalType: "string", name: "newMessage", type: "string" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "uint256", name: "pricePaid", type: "uint256" }
    ],
    name: "MessageChanged",
    type: "event"
  },
  {
    inputs: [
      { internalType: "string", name: "_newMessage", type: "string" },
      { internalType: "string", name: "_name", type: "string" }
    ],
    name: "changeMessage",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "_newMessage", type: "string" },
      { internalType: "string", name: "_name", type: "string" }
    ],
    name: "updateMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "markeeAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "price",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxMessageLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "maxNameLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const

// Legacy exports for backward compatibility during migration
export const InvestorStrategyABI = TopDawgStrategyABI
export const FixedStrategyABI = FixedPriceStrategyABI
