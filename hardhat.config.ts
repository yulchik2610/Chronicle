import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

// Circle Arc testnet. No chain details are hardcoded — the RPC URL and deployer
// key are resolved lazily (only when the arcTestnet network is actually used),
// either from the Hardhat keystore or from environment variables:
//
//   ARC_RPC_URL      Arc testnet JSON-RPC endpoint
//   ARC_PRIVATE_KEY  deployer private key (0x-prefixed)
//
// Provide them without committing secrets, e.g.:
//   npx hardhat keystore set ARC_RPC_URL
//   npx hardhat keystore set ARC_PRIVATE_KEY
// or export ARC_RPC_URL / ARC_PRIVATE_KEY in your shell before deploying.
//
// chainId is intentionally omitted so it is auto-detected from the RPC — the
// frontend gets its own chain ID from web/.env (VITE_CHAIN_ID).
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545"
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARC_RPC_URL"),
      accounts: [configVariable("ARC_PRIVATE_KEY")]
    }
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          },
          viaIR: true
        }
      }
    }
  }
});
