import { readFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers } = await network.create();
const [, , , , , trader] = await ethers.getSigners();

const deploymentUrl = new URL(
  "../ignition/deployments/chronicle-local/deployed_addresses.json",
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
const pool = await ethers.getContractAt(
  "OptionPool",
  addresses["ChronicleModule#OptionPool"],
  trader,
);

const amount = 3n;
const side = 0;
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

console.log({
  transactionHash: receipt?.hash,
  trader: trader.address,
  seriesId: 1,
  side: "ABOVE",
  amount: amount.toString(),
  premiumUsdc: ethers.formatUnits(premium, 6),
  maxPayoutUsdc: ethers.formatUnits(payout, 6),
  positionBalance: position.toString(),
  reservedCollateralUsdc: ethers.formatUnits(reservedAfter, 6),
});
