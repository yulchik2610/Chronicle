import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { id } from "ethers";

const MARKET_ID = id("market:election-district-n-2026");
const USDC = 1_000_000n;
const ARC_USDC = "0x3600000000000000000000000000000000000000";

export default buildModule("ChronicleArcModule", (m) => {
  // A single signer keeps the hackathon demo operable. Production deployments
  // must replace these roles with separate multisig-controlled addresses.
  const deployer = m.getAccount(0);
  const admin = deployer;
  const publisher = deployer;
  const resolver = deployer;
  const guardian = deployer;
  const lp = deployer;

  const usdc = m.contractAt("IERC20", ARC_USDC, { id: "ArcUSDC" });
  const oracle = m.contract("OddsIndexOracle", [
    admin,
    publisher,
    resolver,
    guardian,
    0
  ]);
  const pool = m.contract("OptionPool", [usdc, admin, 10_000, 0]);
  const option = m.contract("BinaryOption", [
    usdc,
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
    [MARKET_ID, 300, 100, 2, 6_000, 60],
    {
      from: admin,
      id: "register_demo_market"
    }
  );

  // Arc exposes testnet USDC at a canonical address. The deployer must receive
  // faucet USDC before running this module.
  const seedLiquidity = m.getParameter("seedLiquidity", 5n * USDC);
  const approvePoolLiquidity = m.call(
    usdc,
    "approve",
    [pool, seedLiquidity],
    {
      from: lp,
      id: "approve_pool_liquidity"
    }
  );
  m.call(pool, "deposit", [seedLiquidity, lp], {
    from: lp,
    id: "seed_option_pool",
    after: [approvePoolLiquidity]
  });

  return { usdc, oracle, pool, option };
});
