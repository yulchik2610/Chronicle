export const binaryOptionAbi = [
  {
    type: "function",
    name: "seriesCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }]
  },
  {
    type: "function",
    name: "series",
    stateMutability: "view",
    inputs: [{ name: "seriesId", type: "uint64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "marketId", type: "bytes32" },
          { name: "strike", type: "uint32" },
          { name: "expiry", type: "uint64" },
          { name: "abovePremium", type: "uint96" },
          { name: "belowPremium", type: "uint96" },
          { name: "totalAbove", type: "uint128" },
          { name: "totalBelow", type: "uint128" },
          { name: "settlementPrice", type: "uint32" },
          { name: "winningSide", type: "uint8" },
          { name: "settled", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "seriesId", type: "uint64" },
      { name: "side", type: "uint8" },
      { name: "amount", type: "uint128" },
      { name: "maximumPremium", type: "uint256" }
    ],
    outputs: [{ name: "premium", type: "uint256" }]
  },
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "seriesId", type: "uint64" },
      { name: "side", type: "uint8" },
      { name: "amount", type: "uint128" }
    ],
    outputs: [
      { name: "premium", type: "uint256" },
      { name: "maximumPayout", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "seriesId", type: "uint64" },
      { name: "side", type: "uint8" },
      { name: "amount", type: "uint128" }
    ],
    outputs: [{ name: "payout", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

export const poolAbi = [
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "reservedCollateral",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "freeLiquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;
