/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_NAME?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_USDC_ADDRESS?: `0x${string}`;
  readonly VITE_ORACLE_ADDRESS?: `0x${string}`;
  readonly VITE_POOL_ADDRESS?: `0x${string}`;
  readonly VITE_OPTION_ADDRESS?: `0x${string}`;
  readonly VITE_ENABLE_FAUCET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
