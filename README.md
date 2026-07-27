# Chronicle Protocol

**Trade the odds as the story unfolds.**

Chronicle is an on-chain derivatives protocol for trading the path of event
probabilities, not only the final event outcome. A trader buys an ERC-1155
`ABOVE` or `BELOW` position on whether a curated probability index will finish
above a strike at expiry. Every position has a fixed maximum loss, a known
maximum payout, and USDC collateral reserved when the trade is opened.

The repository contains a working MVP for Arc Testnet and a fully reproducible
local demo. It is unaudited and must not be used with production funds.

## Architecture

- `OddsIndexOracle.sol` — append-only probability observations, per-market
  heartbeat and TWAP settings, dispute/resolution states, deviation protection,
  and permissionless settlement snapshots.
- `OptionPool.sol` — ERC-4626 USDC vault that reserves the full payout
  obligation before a position is minted and prevents LP withdrawals from
  consuming reserved collateral.
- `BinaryOption.sol` — ERC-1155 `ABOVE`/`BELOW` positions, utilization-aware
  quotes, slippage protection, settlement, and claims.
- `web/` — React/Vite interface with wallet connection, live Polymarket context,
  on-chain quotes, trade execution, position tracking, and claims.

Probability values use six-decimal precision:

- `0` = 0%
- `500_000` = 50%
- `1_000_000` = 100%

## Trade lifecycle

1. A risk manager creates a series with a market, strike, expiry, and base
   premiums.
2. The interface requests the current on-chain quote and applies a 1% maximum
   slippage bound.
3. The trader approves USDC and buys `ABOVE` or `BELOW`.
4. The premium enters the pool and the full maximum payout is reserved.
5. Chronicle mints the ERC-1155 position.
6. After expiry, anyone can finalize the market TWAP and settle the series.
7. Winning positions are burned in exchange for their reserved USDC payout.

## Premium and solvency model

The MVP separates market risk pricing from inventory pricing.

The series manager supplies a base premium per side. The paired base premiums
must satisfy:

```text
baseAbove + baseBelow >= payoutPerContract
```

This prevents a trader from buying both sides below the guaranteed payout.
Production base premiums are intended to come from an implied-volatility model
for the probability index, calibrated with historical TWAP volatility from
comparable markets.

For each order, the contract then calculates the directional exposure after the
trade:

```text
directionalContracts = max(contractsOnChosenSide - contractsOnOtherSide, 0)
directionalUtilization = directionalContracts * payout / poolAssets
surcharge = min(directionalUtilization, 50%)
effectivePremium = min(basePremium * (1 + surcharge), payout - 1 unit)
```

The result makes increasingly one-sided inventory progressively more expensive.
The pool deployment uses a 100% utilization ceiling as a hard solvency boundary,
not as the primary pricing mechanism.

## Oracle safety

Each market has its own heartbeat (`maxAge`), TWAP window, minimum source count,
maximum short-window deviation, and deviation window.

- New trades fail when the index is stale, disputed, or already resolved.
- A price move above the configured relative deviation is rejected when it
  occurs inside the configured window.
- A guardian-controlled multisig can publish the reviewed point through the
  explicit deviation-override path, with a reason commitment recorded on-chain.
- Settlement uses the market-specific TWAP instead of a single global window.
- Publisher, guardian, resolver, series-manager, and admin permissions are
  distinct roles. The hackathon deployment may temporarily use one funded
  operator; production must assign independent multisig-controlled accounts.

## Local MVP

Requirements: Node.js 22 and pnpm 11.

```bash
pnpm install
pnpm node
```

In a second terminal:

```bash
pnpm deploy:local
pnpm smoke:local
pnpm web:dev
```

Open `http://127.0.0.1:5173`. The smoke scenario validates the complete flow:
fresh oracle observation, dynamic quote, approval, purchase, collateral reserve,
TWAP finalization, permissionless settlement, winning claim, position burn, and
reserve release.

Run the full automated gate with:

```bash
pnpm check
```

## Arc Testnet

Chronicle uses the official Arc Testnet configuration:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

Fund the deployer with Arc Testnet USDC, then store the private key in the
encrypted Hardhat keystore:

```bash
npx hardhat keystore set ARC_PRIVATE_KEY
pnpm deploy:arc
pnpm setup:arc-demo
```

The deployment seeds 5 USDC by default. Override it through the
`ChronicleArcModule.seedLiquidity` Ignition parameter when needed.

After the short demo series expires:

```bash
pnpm settle:arc-demo
```

Copy `web/.env.arc.example` to `web/.env`, insert the deployed oracle, pool, and
option addresses from
`ignition/deployments/chronicle-arc/deployed_addresses.json`, and build:

```bash
pnpm web:build
```

## Deployment and judging checklist

- Public source repository
- Passing `pnpm check`
- Arc Testnet contract addresses and ArcScan links
- Public frontend URL with `/app` rewrite support
- Public demo video
- Public presentation
- Clear `NOT AUDITED` disclosure

## Regulatory and product scope

Chronicle is presented as an experimental derivatives protocol, not a
prediction-market operator. A public launch still requires jurisdiction-specific
legal review, geographic restrictions where required, frontend eligibility/KYC
decisions, sanctions controls, risk disclosures, and independent smart-contract
and oracle audits.
