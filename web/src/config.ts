import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain, isAddress, zeroAddress, type Address } from "viem";

const envAddress = (value?: string): Address =>
  value && isAddress(value) ? value : zeroAddress;

export const contracts = {
  usdc: envAddress(import.meta.env.VITE_USDC_ADDRESS),
  oracle: envAddress(import.meta.env.VITE_ORACLE_ADDRESS),
  pool: envAddress(import.meta.env.VITE_POOL_ADDRESS),
  option: envAddress(import.meta.env.VITE_OPTION_ADDRESS)
} as const;

export const contractsConfigured = Object.values(contracts).every(
  (address) => address !== zeroAddress
);

export const faucetEnabled = import.meta.env.VITE_ENABLE_FAUCET === "true";

export const chronicleChain = defineChain({
  id: Number(import.meta.env.VITE_CHAIN_ID ?? 31337),
  name: import.meta.env.VITE_CHAIN_NAME ?? "Chronicle Local",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545"]
    }
  }
});

export const wagmiConfig = createConfig({
  chains: [chronicleChain],
  connectors: [injected()],
  transports: {
    [chronicleChain.id]: http(chronicleChain.rpcUrls.default.http[0])
  }
});
