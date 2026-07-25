import { expect } from "chai";
import { network } from "hardhat";
import type { OddsIndexOracle } from "../types/ethers-contracts/OddsIndexOracle.js";

const { ethers, networkHelpers } = await network.create();

const MARKET_ID = ethers.id("market:election-district-n-2026");
const SOURCE_HASH = ethers.id("polymarket+kalshi:normalized-payload");
const RESOLUTION_HASH = ethers.id("official-resolution-document");
const DISPUTE_HASH = ethers.id("publisher-source-mismatch");

const PRICE_SCALE = 1_000_000;
const MAX_AGE = 300;
const TWAP_WINDOW = 100;
const MIN_SOURCES = 2;

describe("OddsIndexOracle", function () {
  async function deployFixture() {
    const [admin, publisher, resolver, guardian, outsider] =
      await ethers.getSigners();

    const oracle = (await ethers.deployContract("OddsIndexOracle", [
      admin.address,
      publisher.address,
      resolver.address,
      guardian.address,
      2 * 24 * 60 * 60
    ])) as unknown as OddsIndexOracle;
    await oracle.waitForDeployment();

    await oracle
      .connect(admin)
      .registerMarket(MARKET_ID, MAX_AGE, TWAP_WINDOW, MIN_SOURCES);

    const baseTime = (await networkHelpers.time.latest()) + 1_000;

    async function publish(timestamp: number, price: number) {
      await networkHelpers.time.setNextBlockTimestamp(timestamp);
      return oracle
        .connect(publisher)
        .updateIndex(
          MARKET_ID,
          price,
          timestamp,
          MIN_SOURCES,
          SOURCE_HASH
        );
    }

    return {
      oracle,
      admin,
      publisher,
      resolver,
      guardian,
      outsider,
      baseTime,
      publish
    };
  }

  it("registers immutable market parameters and assigns split roles", async function () {
    const { oracle, admin, publisher, resolver, guardian } =
      await networkHelpers.loadFixture(deployFixture);

    const config = await oracle.marketConfig(MARKET_ID);
    expect(config.status).to.equal(1n);
    expect(config.maxAge).to.equal(BigInt(MAX_AGE));
    expect(config.twapWindow).to.equal(BigInt(TWAP_WINDOW));
    expect(config.minSources).to.equal(BigInt(MIN_SOURCES));

    expect(
      await oracle.hasRole(await oracle.DEFAULT_ADMIN_ROLE(), admin.address)
    ).to.equal(true);
    expect(
      await oracle.hasRole(await oracle.PUBLISHER_ROLE(), publisher.address)
    ).to.equal(true);
    expect(
      await oracle.hasRole(await oracle.RESOLVER_ROLE(), resolver.address)
    ).to.equal(true);
    expect(
      await oracle.hasRole(await oracle.GUARDIAN_ROLE(), guardian.address)
    ).to.equal(true);
  });

  it("rejects registration by a non-admin", async function () {
    const { oracle, outsider } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(
      oracle
        .connect(outsider)
        .registerMarket(ethers.id("another-market"), 300, 60, 2)
    ).to.be.revertedWithCustomError(
      oracle,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("appends observations and records the cumulative price integral", async function () {
    const { oracle, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(publish(baseTime, 400_000))
      .to.emit(oracle, "IndexUpdated")
      .withArgs(
        MARKET_ID,
        400_000,
        baseTime,
        MIN_SOURCES,
        SOURCE_HASH
      );
    await publish(baseTime + 100, 600_000);

    const latest = await oracle.getLatestIndex(MARKET_ID);
    expect(latest.price).to.equal(600_000n);
    expect(latest.timestamp).to.equal(BigInt(baseTime + 100));
    expect(latest.isStale).to.equal(false);
    expect(latest.status).to.equal(1n);

    expect(await oracle.observationCount(MARKET_ID)).to.equal(2n);
    const second = await oracle.observationAt(MARKET_ID, 1);
    expect(second.cumulativePrice).to.equal(40_000_000n);
  });

  it("enforces price bounds, source quorum, source commitment and timestamps", async function () {
    const { oracle, publisher, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await publish(baseTime, 400_000);

    await expect(
      oracle
        .connect(publisher)
        .updateIndex(
          MARKET_ID,
          PRICE_SCALE + 1,
          baseTime + 1,
          MIN_SOURCES,
          SOURCE_HASH
        )
    ).to.be.revertedWithCustomError(oracle, "InvalidPrice");

    await expect(
      oracle
        .connect(publisher)
        .updateIndex(MARKET_ID, 500_000, baseTime + 1, 1, SOURCE_HASH)
    ).to.be.revertedWithCustomError(oracle, "InsufficientSources");

    await expect(
      oracle
        .connect(publisher)
        .updateIndex(
          MARKET_ID,
          500_000,
          baseTime + 1,
          MIN_SOURCES,
          ethers.ZeroHash
        )
    ).to.be.revertedWithCustomError(oracle, "InvalidSourceCommitment");

    await expect(
      oracle
        .connect(publisher)
        .updateIndex(
          MARKET_ID,
          500_000,
          baseTime,
          MIN_SOURCES,
          SOURCE_HASH
        )
    ).to.be.revertedWithCustomError(oracle, "NonMonotonicTimestamp");

    const future = (await networkHelpers.time.latest()) + 1_000;
    await expect(
      oracle
        .connect(publisher)
        .updateIndex(
          MARKET_ID,
          500_000,
          future,
          MIN_SOURCES,
          SOURCE_HASH
        )
    ).to.be.revertedWithCustomError(oracle, "InvalidTimestamp");
  });

  it("computes historical TWAPs with boundary interpolation", async function () {
    const { oracle, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await publish(baseTime, 400_000);
    await publish(baseTime + 100, 600_000);
    await publish(baseTime + 200, 800_000);

    expect(
      await oracle.getTwap(MARKET_ID, baseTime, baseTime + 200)
    ).to.equal(500_000n);
    expect(
      await oracle.getTwap(MARKET_ID, baseTime + 50, baseTime + 150)
    ).to.equal(500_000n);

    await networkHelpers.time.increase(10);
    await expect(
      oracle.getTwap(MARKET_ID, baseTime, baseTime + 201)
    ).to.be.revertedWithCustomError(oracle, "InsufficientHistory");
  });

  it("marks an active index stale after maxAge", async function () {
    const { oracle, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await publish(baseTime, 525_000);
    await networkHelpers.time.increase(MAX_AGE + 1);

    const latest = await oracle.getLatestIndex(MARKET_ID);
    expect(latest.isStale).to.equal(true);
  });

  it("permissionlessly finalizes and permanently snapshots a TWAP settlement", async function () {
    const { oracle, outsider, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await publish(baseTime, 400_000);
    await publish(baseTime + 50, 600_000);
    const expiry = baseTime + TWAP_WINDOW;
    await publish(expiry, 800_000);

    await expect(oracle.connect(outsider).finalizeSettlement(MARKET_ID, expiry))
      .to.emit(oracle, "SettlementFinalized")
      .withArgs(MARKET_ID, expiry, 500_000, expiry + 1);

    const settlement = await oracle.getSettlementPrice(MARKET_ID, expiry);
    expect(settlement.price).to.equal(500_000n);
    expect(settlement.finalized).to.equal(true);

    await expect(
      oracle.connect(outsider).finalizeSettlement(MARKET_ID, expiry)
    ).to.be.revertedWithCustomError(oracle, "SettlementAlreadyFinalized");
  });

  it("irreversibly freezes a resolved market and settles later expiries at the outcome", async function () {
    const { oracle, publisher, resolver, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await publish(baseTime, 700_000);
    const resolvedAt = baseTime + 100;
    await networkHelpers.time.setNextBlockTimestamp(resolvedAt);

    await expect(
      oracle
        .connect(resolver)
        .resolveMarket(
          MARKET_ID,
          PRICE_SCALE,
          resolvedAt,
          RESOLUTION_HASH
        )
    )
      .to.emit(oracle, "MarketResolved")
      .withArgs(
        MARKET_ID,
        PRICE_SCALE,
        resolvedAt,
        RESOLUTION_HASH
      );

    await expect(
      oracle
        .connect(publisher)
        .updateIndex(
          MARKET_ID,
          900_000,
          resolvedAt + 1,
          MIN_SOURCES,
          SOURCE_HASH
        )
    ).to.be.revertedWithCustomError(oracle, "MarketNotActive");

    const expiry = resolvedAt + 100;
    await networkHelpers.time.setNextBlockTimestamp(expiry);
    await oracle.finalizeSettlement(MARKET_ID, expiry);

    const settlement = await oracle.getSettlementPrice(MARKET_ID, expiry);
    expect(settlement.price).to.equal(BigInt(PRICE_SCALE));

    await networkHelpers.time.increase(MAX_AGE * 2);
    const latest = await oracle.getLatestIndex(MARKET_ID);
    expect(latest.status).to.equal(3n);
    expect(latest.isStale).to.equal(false);
  });

  it("blocks trading reads and settlement during a dispute, then resumes safely", async function () {
    const { oracle, admin, guardian, baseTime, publish } =
      await networkHelpers.loadFixture(deployFixture);

    await publish(baseTime, 400_000);
    const expiry = baseTime + TWAP_WINDOW;
    await publish(expiry, 600_000);

    await oracle.connect(guardian).flagDispute(MARKET_ID, DISPUTE_HASH);

    const latest = await oracle.getLatestIndex(MARKET_ID);
    expect(latest.status).to.equal(2n);
    expect(latest.isStale).to.equal(true);

    await expect(
      oracle.getTwap(MARKET_ID, baseTime, expiry)
    ).to.be.revertedWithCustomError(oracle, "MarketDisputed");
    await expect(
      oracle.finalizeSettlement(MARKET_ID, expiry)
    ).to.be.revertedWithCustomError(oracle, "MarketDisputed");

    await oracle.connect(admin).clearDispute(MARKET_ID);
    await oracle.finalizeSettlement(MARKET_ID, expiry);

    const settlement = await oracle.getSettlementPrice(MARKET_ID, expiry);
    expect(settlement.price).to.equal(400_000n);
  });
});
