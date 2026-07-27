# Chronicle web application

The Vite/React application has two routes:

- `/` — product landing page with live Polymarket context.
- `/app` — wallet-connected trading desk for Chronicle option series.

## Trading flow

1. The app reads deployed series and pool liquidity from Arc.
2. A trader selects `ABOVE` or `BELOW` and an amount.
3. The app calls `BinaryOption.quote` every four seconds. This quote includes
   the on-chain directional utilization surcharge.
4. The trader approves up to 1% above the current quote and submits `buy`.
5. The app waits for both receipts and refreshes balances, positions, series,
   pool utilization, and the quote.
6. After settlement, a winning ERC-1155 position can be claimed for USDC.

The faucet action exists only for the local `MockUSDC` environment. It is
disabled in `web/.env.arc.example`, where the application uses canonical Arc
Testnet USDC.

## Configuration

Copy `.env.example` for local development or `.env.arc.example` for Arc:

```text
VITE_CHAIN_ID=
VITE_CHAIN_NAME=
VITE_RPC_URL=
VITE_EXPLORER_URL=
VITE_USDC_ADDRESS=
VITE_ORACLE_ADDRESS=
VITE_POOL_ADDRESS=
VITE_OPTION_ADDRESS=
VITE_ENABLE_FAUCET=
```

Zero or invalid contract addresses place the app in preview mode. A configured
address set is only shown as live after the series read succeeds.

## Build

```bash
pnpm --dir web build
```

The static output is written to `web/dist`. Vercel rewrites and Netlify
redirects are included so `/app` resolves to `index.html` after a refresh.
