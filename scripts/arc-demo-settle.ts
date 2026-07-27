import { readFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers } = await network.create();
const [operator] = await ethers.getSigners();

const deploymentUrl = new URL(
  "../ignition/deployments/chronicle-arc/deployed_addresses.json",
  import.meta.url,
);
const addresses = JSON.parse(readFileSync(deploymentUrl, "utf8")) as Record<
  string,
  string
>;

const oracle = await ethers.getContractAt(
  "OddsIndexOracle",
  addresses["ChronicleArcModule#OddsIndexOracle"],
  operator,
);
const option = await ethers.getContractAt(
  "BinaryOption",
  addresses["ChronicleArcModule#BinaryOption"],
  operator,
);

const seriesId = BigInt(process.env.DEMO_SERIES_ID ?? "1");
const series = await option.series(seriesId);
const latestBlock = await ethers.provider.getBlock("latest");
if (!latestBlock) throw new Error("Unable to read the latest Arc block");

const expiry = Number(series.expiry);
if (latestBlock.timestamp < expiry) {
  throw new Error(
    `Series ${seriesId} expires in ${expiry - latestBlock.timestamp} seconds`,
  );
}

await (
  await oracle.updateIndex(
    series.marketId,
    700_000,
    latestBlock.timestamp,
    2,
    ethers.id("polymarket+kalshi:arc-demo-settlement"),
  )
).wait();
await (await oracle.finalizeSettlement(series.marketId, expiry)).wait();
await (await option.settleSeries(seriesId)).wait();

const settled = await option.series(seriesId);
console.log({
  seriesId: seriesId.toString(),
  settlementPrice: `${(Number(settled.settlementPrice) / 10_000).toFixed(2)}%`,
  winningSide: Number(settled.winningSide) === 0 ? "ABOVE" : "BELOW",
  settled: settled.settled,
});
