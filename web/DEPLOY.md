# React Deploy

The frontend is a Vite single-page app in this `web` directory.

## Build

```bash
pnpm install
pnpm --dir web build
```

The static output is written to `web/dist`.

## Environment

Set these variables on the hosting provider before building:

```bash
VITE_CHAIN_ID=
VITE_CHAIN_NAME=
VITE_RPC_URL=
VITE_EXPLORER_URL=
VITE_USDC_ADDRESS=
VITE_ORACLE_ADDRESS=
VITE_POOL_ADDRESS=
VITE_OPTION_ADDRESS=
VITE_ENABLE_FAUCET=false
```

For Arc Testnet, copy values from `web/.env.arc.example` and contract
addresses from `ignition/deployments/chronicle-arc/deployed_addresses.json`
after `pnpm deploy:arc`.

## Hosting

- Vercel: set project root to `web`, build command `pnpm build`, output `dist`.
- Netlify: set base directory `web`, build command `pnpm build`, publish `web/dist`.
- Static hosting: upload the contents of `web/dist` and configure all routes to serve `index.html`.

`web/vercel.json` and `web/public/_redirects` keep `/app` working after a page refresh.
