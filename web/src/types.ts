export type Side = 0 | 1;

export type MarketSeries = {
  id: bigint;
  marketId: `0x${string}`;
  strike: bigint;
  expiry: bigint;
  abovePremium: bigint;
  belowPremium: bigint;
  totalAbove: bigint;
  totalBelow: bigint;
  settlementPrice: bigint;
  winningSide: Side;
  settled: boolean;
  preview?: boolean;
};

export type Position = {
  series: MarketSeries;
  side: Side;
  amount: bigint;
};
