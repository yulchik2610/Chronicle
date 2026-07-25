import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { id } from "ethers";

const MARKET_ID = id("market:election-district-n-2026");
const USDC = 1_000_000n;

export default buildModule("ChronicleModule", (m) => {
  const admin = m.getAccount(0);
  const publisher = m.getAccount(1);
  const resolver = m.getAccount(2);
  const guardian = m.getAccount(3);
  const lp = m.getAccount(4);
  const trader = m.getAccount(5);

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

  const mintLpLiquidity = m.call(mockUsdc, "mint", [lp, 2_000n * USDC], {
    from: admin,
    id: "mint_lp_liquidity"
  });
  m.call(mockUsdc, "mint", [trader, 100n * USDC], {
    from: admin,
    id: "mint_trader_balance"
  });
  const approvePoolLiquidity = m.call(
    mockUsdc,
    "approve",
    [pool, 1_000n * USDC],
    {
    from: lp,
      id: "approve_pool_liquidity",
      after: [mintLpLiquidity]
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
