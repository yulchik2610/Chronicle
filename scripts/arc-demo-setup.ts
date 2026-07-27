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

const marketId = ethers.id("market:election-district-n-2026");
const sourceHash = ethers.id("polymarket+kalshi:arc-demo");
const latestBlock = await ethers.provider.getBlock("latest");
if (!latestBlock) throw new Error("Unable to read the latest Arc block");

await (
  await oracle.updateIndex(
    marketId,
    700_000,
    latestBlock.timestamp,
    2,
    sourceHash,
  )
).wait();

const lifetime = Number(process.env.DEMO_EXPIRY_SECONDS ?? 180);
if (!Number.isSafeInteger(lifetime) || lifetime < 120) {
  throw new Error("DEMO_EXPIRY_SECONDS must be an integer of at least 120");
}

const expiry = latestBlock.timestamp + lifetime;
await (
  await option.createSeries(
    marketId,
    650_000,
    expiry,
    350_000,
    650_000,
  )
).wait();

const seriesId = await option.seriesCount();
console.log({
  seriesId: seriesId.toString(),
  expiry,
  expiryIso: new Date(expiry * 1_000).toISOString(),
  initialIndex: "70.00%",
  strike: "65.00%",
});
