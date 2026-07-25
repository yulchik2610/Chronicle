import { expect } from "chai";
import { network } from "hardhat";
import type { BinaryOption } from "../types/ethers-contracts/BinaryOption.js";
import type { OddsIndexOracle } from "../types/ethers-contracts/OddsIndexOracle.js";
import type { OptionPool } from "../types/ethers-contracts/OptionPool.js";
import type { MockUSDC } from "../types/ethers-contracts/mocks/MockUSDC.js";

const { ethers, networkHelpers } = await network.create();

const USDC = 1_000_000n;
const MARKET_ID = ethers.id("market:election-district-n-2026");
const SOURCE_HASH = ethers.id("polymarket+kalshi:normalized-payload");
const METADATA_URI = "https://api.chronicle.market/options/{id}.json";

describe("BinaryOption + OptionPool", function () {
  async function deployFixture() {
    const [admin, publisher, resolver, guardian, manager, lp, trader, keeper] =
      await ethers.getSigners();

    const usdc = (await ethers.deployContract(
      "MockUSDC"
    )) as unknown as MockUSDC;
    const oracle = (await ethers.deployContract("OddsIndexOracle", [
      admin.address,
      publisher.address,
      resolver.address,
      guardian.address,
      2 * 24 * 60 * 60
    ])) as unknown as OddsIndexOracle;
    const pool = (await ethers.deployContract("OptionPool", [
      await usdc.getAddress(),
      admin.address,
      9_000,
      2 * 24 * 60 * 60
    ])) as unknown as OptionPool;
    const option = (await ethers.deployContract("BinaryOption", [
      await usdc.getAddress(),
      await oracle.getAddress(),
      await pool.getAddress(),
      admin.address,
      manager.address,
      METADATA_URI,
      2 * 24 * 60 * 60
    ])) as unknown as BinaryOption;

    await pool.connect(admin).setOptionOperator(await option.getAddress());
    await oracle.connect(admin).registerMarket(MARKET_ID, 300, 100, 2);

    await usdc.mint(lp.address, 2_000n * USDC);
    await usdc.mint(trader.address, 100n * USDC);
    await usdc.connect(lp).approve(await pool.getAddress(), 1_000n * USDC);
    await pool.connect(lp).deposit(1_000n * USDC, lp.address);

    const expiry = (await networkHelpers.time.latest()) + 1_000;
    await option
      .connect(manager)
      .createSeries(MARKET_ID, 600_000, expiry, 200_000, 700_000);

    return {
      usdc,
      oracle,
      pool,
      option,
      admin,
      publisher,
      manager,
      lp,
      trader,
      keeper,
      expiry
    };
  }

  async function approveAndBuy(
    option: BinaryOption,
    usdc: MockUSDC,
    trader: Awaited<ReturnType<typeof ethers.getSigners>>[number],
    side: 0 | 1,
    amount: bigint,
    maxPremium: bigint
  ) {
    await usdc.connect(trader).approve(await option.getAddress(), maxPremium);
    return option.connect(trader).buy(1, side, amount, maxPremium);
  }

  async function publishSettlementHistory(
    oracle: OddsIndexOracle,
    publisher: Awaited<ReturnType<typeof ethers.getSigners>>[number],
    expiry: number,
    price: number
  ) {
    await networkHelpers.time.setNextBlockTimestamp(expiry - 100);
    await oracle
      .connect(publisher)
      .updateIndex(MARKET_ID, price, expiry - 100, 2, SOURCE_HASH);
    await networkHelpers.time.setNextBlockTimestamp(expiry);
    await oracle
      .connect(publisher)
      .updateIndex(MARKET_ID, price, expiry, 2, SOURCE_HASH);
  }

  it("creates an on-chain series with separate ABOVE and BELOW premiums", async function () {
    const { option, expiry } =
      await networkHelpers.loadFixture(deployFixture);

    const series = await option.series(1);
    expect(series.marketId).to.equal(MARKET_ID);
    expect(series.strike).to.equal(600_000n);
    expect(series.expiry).to.equal(BigInt(expiry));
    expect(series.abovePremium).to.equal(200_000n);
    expect(series.belowPremium).to.equal(700_000n);

    expect(await option.tokenIdFor(1, 0)).to.equal(2n);
    expect(await option.tokenIdFor(1, 1)).to.equal(3n);
  });

  it("takes real USDC premium, reserves payout collateral and mints ERC-1155 positions", async function () {
    const { usdc, pool, option, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(
      approveAndBuy(option, usdc, trader, 0, 10n, 2n * USDC)
    )
      .to.emit(option, "BetPlaced")
      .withArgs(trader.address, 1, 0, 10, 2n * USDC, 2);

    expect(await usdc.balanceOf(trader.address)).to.equal(98n * USDC);
    expect(await usdc.balanceOf(await pool.getAddress())).to.equal(
      1_002n * USDC
    );
    expect(await pool.reservedCollateral()).to.equal(10n * USDC);
    expect(await option.balanceOf(trader.address, 2)).to.equal(10n);

    const [premium, payout] = await option.quote(1, 0, 10);
    expect(premium).to.equal(2n * USDC);
    expect(payout).to.equal(10n * USDC);
  });

  it("enforces utilization limits atomically", async function () {
    const { usdc, pool, option, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.mint(trader.address, 500n * USDC);
    const balanceBefore = await usdc.balanceOf(trader.address);
    await usdc.connect(trader).approve(await option.getAddress(), 400n * USDC);
    await expect(
      option.connect(trader).buy(1, 0, 2_000, 400n * USDC)
    ).to.be.revertedWithCustomError(pool, "UtilizationExceeded");

    expect(await usdc.balanceOf(trader.address)).to.equal(balanceBefore);
    expect(await pool.reservedCollateral()).to.equal(0n);
  });

  it("prevents LP withdrawals from consuming reserved collateral", async function () {
    const { usdc, pool, option, lp, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await approveAndBuy(option, usdc, trader, 0, 10n, 2n * USDC);

    expect(await pool.freeLiquidity()).to.equal(992n * USDC);
    // ERC-4626 virtual shares round the withdrawable amount down by one unit.
    expect(await pool.maxWithdraw(lp.address)).to.equal(992n * USDC - 1n);
    await expect(
      pool.connect(lp).withdraw(1_000n * USDC, lp.address, lp.address)
    ).to.be.revertedWithCustomError(pool, "ERC4626ExceededMaxWithdraw");
  });

  it("settles permissionlessly, releases losing collateral and pays winners", async function () {
    const { usdc, oracle, pool, option, publisher, trader, keeper, expiry } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.connect(trader).approve(await option.getAddress(), 10n * USDC);
    await option.connect(trader).buy(1, 0, 10, 2n * USDC);
    await option.connect(trader).buy(1, 1, 5, 4n * USDC);
    expect(await pool.reservedCollateral()).to.equal(15n * USDC);

    await publishSettlementHistory(oracle, publisher, expiry, 700_000);
    await oracle.connect(keeper).finalizeSettlement(MARKET_ID, expiry);

    await expect(option.connect(keeper).settleSeries(1))
      .to.emit(option, "SeriesSettled")
      .withArgs(1, 700_000, 0, 5n * USDC);
    expect(await pool.reservedCollateral()).to.equal(10n * USDC);

    await expect(option.connect(trader).claim(1, 0, 10))
      .to.emit(option, "Claimed")
      .withArgs(trader.address, 1, 0, 10, 10n * USDC);
    await option.connect(trader).claim(1, 1, 5);

    expect(await pool.reservedCollateral()).to.equal(0n);
    expect(await usdc.balanceOf(trader.address)).to.equal(104_500_000n);
    expect(await option.balanceOf(trader.address, 2)).to.equal(0n);
    expect(await option.balanceOf(trader.address, 3)).to.equal(0n);
  });

  it("rejects new bets at expiry", async function () {
    const { usdc, option, trader, expiry } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.connect(trader).approve(await option.getAddress(), USDC);
    await networkHelpers.time.setNextBlockTimestamp(expiry);
    await expect(
      option.connect(trader).buy(1, 0, 1, USDC)
    ).to.be.revertedWithCustomError(option, "SeriesExpired");
  });
});
