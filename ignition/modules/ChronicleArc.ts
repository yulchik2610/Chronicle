import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { id } from "ethers";

// Arc testnet deployment module.
//
// Unlike the local module (ignition/modules/Chronicle.ts), a testnet deployer
// usually has a SINGLE funded key, so every privileged role (admin, publisher,
// resolver, guardian) and the seed LP/trader all resolve to account(0). Adjust
// the role accounts below if you fund additional signers.
//
// USDC is deployed as MockUSDC (test collateral), matching the local flow.

const MARKET_ID = id("market:election-district-n-2026");
const USDC = 1_000_000n;

export default buildModule("ChronicleArcModule", (m) => {
  // Single-signer testnet deploy: all roles collapse onto the deployer.
  const deployer = m.getAccount(0);
  const admin = deployer;
  const publisher = deployer;
  const resolver = deployer;
  const guardian = deployer;
  const lp = deployer;
  const trader = deployer;

  const mockUsdc = m.contract("MockUSDC");
  const oracle = m.contract("OddsIndexOracle", [
    admin,
    publisher,
    resolver,
    guardian,
    0
  ]);
  const pool = m.contract("OptionPool", [mockUsdc, admin, 9_000, 0]);
  const option = m.contract("BinaryOption", [
    mockUsdc,
    oracle,
    pool,
    admin,
    admin,
    "https://api.chronicle.market/options/{id}.json",
    0
  ]);

  const authorizeOptionContract = m.call(pool, "setOptionOperator", [option], {
    from: admin,
    id: "authorize_option_contract"
  });
  const registerDemoMarket = m.call(
    oracle,
    "registerMarket",
    [MARKET_ID, 300, 100, 2],
    {
      from: admin,
      id: "register_demo_market"
    }
  );

  // Seed liquidity so the market is tradeable immediately after deploy.
  const mintLiquidity = m.call(mockUsdc, "mint", [lp, 2_000n * USDC], {
    from: admin,
    id: "mint_lp_liquidity"
  });
  const approvePoolLiquidity = m.call(
    mockUsdc,
    "approve",
    [pool, 1_000n * USDC],
    {
      from: lp,
      id: "approve_pool_liquidity",
      after: [mintLiquidity]
    }
  );
  m.call(pool, "deposit", [1_000n * USDC, lp], {
    from: lp,
    id: "seed_option_pool",
    after: [approvePoolLiquidity]
  });

  const expiry = m.getParameter("expiry", 1_893_456_000);
  m.call(
    option,
    "createSeries",
    [MARKET_ID, 650_000, expiry, 350_000, 650_000],
    {
      from: admin,
      id: "create_demo_series",
      after: [authorizeOptionContract, registerDemoMarket]
    }
  );

  return { mockUsdc, oracle, pool, option };
});
