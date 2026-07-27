import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

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
      url: "https://rpc.testnet.arc.network",
      chainId: 5_042_002,
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
