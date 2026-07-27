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
const RESOLUTION_HASH = ethers.id("official-resolution-document");
const DISPUTE_HASH = ethers.id("publisher-source-mismatch");
const METADATA_URI = "https://api.chronicle.market/options/{id}.json";
const MAX_AGE = 300;

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
    await oracle
      .connect(admin)
      .registerMarket(MARKET_ID, MAX_AGE, 100, 2, 6_000, 60);

    await usdc.mint(lp.address, 2_000n * USDC);
    await usdc.mint(trader.address, 100n * USDC);
    await usdc.connect(lp).approve(await pool.getAddress(), 1_000n * USDC);
    await pool.connect(lp).deposit(1_000n * USDC, lp.address);

    const initialTimestamp = await networkHelpers.time.latest();
    await oracle
      .connect(publisher)
      .updateIndex(MARKET_ID, 550_000, initialTimestamp, 2, SOURCE_HASH);

    const expiry = (await networkHelpers.time.latest()) + 1_000;
    await option
      .connect(manager)
      .createSeries(MARKET_ID, 600_000, expiry, 200_000, 800_000);

    return {
      usdc,
      oracle,
      pool,
      option,
      admin,
      publisher,
      resolver,
      guardian,
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
    expect(series.belowPremium).to.equal(800_000n);

    expect(await option.tokenIdFor(1, 0)).to.equal(2n);
    expect(await option.tokenIdFor(1, 1)).to.equal(3n);
  });

  it("takes real USDC premium, reserves payout collateral and mints ERC-1155 positions", async function () {
    const { usdc, pool, option, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(
      approveAndBuy(option, usdc, trader, 0, 10n, 2_100_000n)
    )
      .to.emit(option, "BetPlaced")
      .withArgs(trader.address, 1, 0, 10, 2_020_000, 2);

    expect(await usdc.balanceOf(trader.address)).to.equal(97_980_000n);
    expect(await usdc.balanceOf(await pool.getAddress())).to.equal(
      1_002_020_000n
    );
    expect(await pool.reservedCollateral()).to.equal(10n * USDC);
    expect(await option.balanceOf(trader.address, 2)).to.equal(10n);

    const [premium, payout] = await option.quote(1, 0, 10);
    expect(premium).to.equal(2_039_800n);
    expect(payout).to.equal(10n * USDC);
  });

  it("raises the premium as one-sided exposure grows", async function () {
    const { usdc, option, trader } =
      await networkHelpers.loadFixture(deployFixture);

    const [firstQuote] = await option.quote(1, 0, 10);
    await approveAndBuy(option, usdc, trader, 0, 10n, firstQuote);
    const [secondQuote] = await option.quote(1, 0, 10);
    const [balancingQuote] = await option.quote(1, 1, 10);

    expect(secondQuote).to.be.greaterThan(firstQuote);
    expect(balancingQuote).to.equal(8n * USDC);
  });

  it("rejects a series whose paired premiums underprice the guaranteed payout", async function () {
    const { option, manager, expiry } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(
      option
        .connect(manager)
        .createSeries(MARKET_ID, 650_000, expiry + 1, 200_000, 700_000)
    )
      .to.be.revertedWithCustomError(option, "InvalidPremiumPair")
      .withArgs(900_000, USDC);
  });

  it("rejects new positions when the latest oracle index is stale", async function () {
    const { usdc, option, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.connect(trader).approve(await option.getAddress(), USDC);
    await networkHelpers.time.increase(MAX_AGE + 1);

    await expect(
      option.connect(trader).buy(1, 0, 1, USDC)
    ).to.be.revertedWithCustomError(option, "MarketIndexStale");
  });

  it("rejects new positions while the oracle market is disputed", async function () {
    const { usdc, oracle, option, guardian, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await oracle.connect(guardian).flagDispute(MARKET_ID, DISPUTE_HASH);
    await usdc.connect(trader).approve(await option.getAddress(), USDC);

    await expect(option.connect(trader).buy(1, 0, 1, USDC))
      .to.be.revertedWithCustomError(option, "MarketUnavailable")
      .withArgs(MARKET_ID, 2);
  });

  it("rejects new positions after the oracle market is resolved", async function () {
    const { usdc, oracle, option, resolver, trader } =
      await networkHelpers.loadFixture(deployFixture);

    const resolvedAt = (await networkHelpers.time.latest()) + 1;
    await networkHelpers.time.setNextBlockTimestamp(resolvedAt);
    await oracle
      .connect(resolver)
      .resolveMarket(MARKET_ID, 1_000_000, resolvedAt, RESOLUTION_HASH);
    await usdc.connect(trader).approve(await option.getAddress(), USDC);

    await expect(option.connect(trader).buy(1, 0, 1, USDC))
      .to.be.revertedWithCustomError(option, "MarketUnavailable")
      .withArgs(MARKET_ID, 3);
  });

  it("enforces utilization limits atomically", async function () {
    const { usdc, pool, option, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.mint(trader.address, 2_500n * USDC);
    const balanceBefore = await usdc.balanceOf(trader.address);
    await usdc
      .connect(trader)
      .approve(await option.getAddress(), 2_000n * USDC);
    await expect(
      option.connect(trader).buy(1, 0, 2_000, 2_000n * USDC)
    ).to.be.revertedWithCustomError(pool, "UtilizationExceeded");

    expect(await usdc.balanceOf(trader.address)).to.equal(balanceBefore);
    expect(await pool.reservedCollateral()).to.equal(0n);
  });

  it("prevents LP withdrawals from consuming reserved collateral", async function () {
    const { usdc, pool, option, lp, trader } =
      await networkHelpers.loadFixture(deployFixture);

    await approveAndBuy(option, usdc, trader, 0, 10n, 2_100_000n);

    expect(await pool.freeLiquidity()).to.equal(992_020_000n);
    // ERC-4626 virtual shares round the withdrawable amount down by one unit.
    expect(await pool.maxWithdraw(lp.address)).to.equal(992_020_000n - 1n);
    await expect(
      pool.connect(lp).withdraw(1_000n * USDC, lp.address, lp.address)
    ).to.be.revertedWithCustomError(pool, "ERC4626ExceededMaxWithdraw");
  });

  it("settles permissionlessly, releases losing collateral and pays winners", async function () {
    const { usdc, oracle, pool, option, publisher, trader, keeper, expiry } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.connect(trader).approve(await option.getAddress(), 10n * USDC);
    await option.connect(trader).buy(1, 0, 10, 2_100_000n);
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
    expect(await usdc.balanceOf(trader.address)).to.equal(103_980_000n);
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
