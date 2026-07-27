import { readFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers } = await network.create();
const [, publisher, , , , trader, keeper] = await ethers.getSigners();

const deploymentId = process.env.CHRONICLE_DEPLOYMENT_ID ?? "chronicle-local";
const deploymentUrl = new URL(
  `../ignition/deployments/${deploymentId}/deployed_addresses.json`,
  import.meta.url,
);
const addresses = JSON.parse(readFileSync(deploymentUrl, "utf8")) as Record<
  string,
  string
>;

const usdc = await ethers.getContractAt(
  "MockUSDC",
  addresses["ChronicleModule#MockUSDC"],
  trader,
);
const option = await ethers.getContractAt(
  "BinaryOption",
  addresses["ChronicleModule#BinaryOption"],
  trader,
);
const oracle = await ethers.getContractAt(
  "OddsIndexOracle",
  addresses["ChronicleModule#OddsIndexOracle"],
  publisher,
);
const pool = await ethers.getContractAt(
  "OptionPool",
  addresses["ChronicleModule#OptionPool"],
  trader,
);

const amount = 3n;
const side = 0;
const marketId = ethers.id("market:election-district-n-2026");
const sourceHash = ethers.id("polymarket+kalshi:local-smoke");
const latestBlock = await ethers.provider.getBlock("latest");
if (!latestBlock) throw new Error("Unable to read the latest block");
await (
  await oracle.updateIndex(
    marketId,
    620_000,
    latestBlock.timestamp,
    2,
    sourceHash,
  )
).wait();

const [premium, payout] = await option.quote(1, side, amount);
const balanceBefore = await usdc.balanceOf(trader.address);
const reservedBefore = await pool.reservedCollateral();

await (await usdc.approve(await option.getAddress(), premium)).wait();
const receipt = await (
  await option.buy(1, side, amount, premium)
).wait();

const tokenId = await option.tokenIdFor(1, side);
const position = await option.balanceOf(trader.address, tokenId);
const balanceAfter = await usdc.balanceOf(trader.address);
const reservedAfter = await pool.reservedCollateral();

if (balanceBefore - balanceAfter !== premium) {
  throw new Error("USDC premium delta does not match the quote");
}
if (reservedAfter - reservedBefore !== payout) {
  throw new Error("Pool collateral delta does not match the max payout");
}
if (position < amount) {
  throw new Error("ERC-1155 position was not minted");
}

const series = await option.series(1);
const expiry = Number(series.expiry);
await ethers.provider.send("evm_setNextBlockTimestamp", [expiry - 100]);
await (
  await oracle.updateIndex(marketId, 700_000, expiry - 100, 2, sourceHash)
).wait();
await ethers.provider.send("evm_setNextBlockTimestamp", [expiry]);
await (
  await oracle.updateIndex(marketId, 700_000, expiry, 2, sourceHash)
).wait();

const oracleAsKeeper = await ethers.getContractAt(
  "OddsIndexOracle",
  await oracle.getAddress(),
  keeper,
);
const optionAsKeeper = await ethers.getContractAt(
  "BinaryOption",
  await option.getAddress(),
  keeper,
);
await (await oracleAsKeeper.finalizeSettlement(marketId, expiry)).wait();
await (await optionAsKeeper.settleSeries(1)).wait();

const traderBalanceBeforeClaim = await usdc.balanceOf(trader.address);
await (await option.claim(1, side, amount)).wait();
const traderBalanceAfterClaim = await usdc.balanceOf(trader.address);
const positionAfterClaim = await option.balanceOf(trader.address, tokenId);
const reservedAfterClaim = await pool.reservedCollateral();

if (traderBalanceAfterClaim - traderBalanceBeforeClaim !== payout) {
  throw new Error("Winning claim did not pay the quoted maximum payout");
}
if (positionAfterClaim !== 0n) {
  throw new Error("Claimed ERC-1155 position was not burned");
}
if (reservedAfterClaim !== reservedBefore) {
  throw new Error("Pool reserve was not released after the winning claim");
}

console.log({
  transactionHash: receipt?.hash,
  trader: trader.address,
  seriesId: 1,
  side: "ABOVE",
  amount: amount.toString(),
  premiumUsdc: ethers.formatUnits(premium, 6),
  maxPayoutUsdc: ethers.formatUnits(payout, 6),
  settlementPrice: "70.00%",
  positionBeforeClaim: position.toString(),
  positionAfterClaim: positionAfterClaim.toString(),
  payoutReceivedUsdc: ethers.formatUnits(
    traderBalanceAfterClaim - traderBalanceBeforeClaim,
    6,
  ),
  reservedCollateralAfterClaimUsdc: ethers.formatUnits(reservedAfterClaim, 6),
});
