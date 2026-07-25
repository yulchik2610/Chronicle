import { formatUnits, keccak256, stringToHex, type Address, type Hex } from "viem";
import type { MarketSeries, Side } from "./types";

export const USDC = 1_000_000n;
export const MAX_SERIES = 12;
export const DEMO_MARKET_ID = keccak256(
  stringToHex("market:election-district-n-2026")
);

export const HERO_MURAL = "/assets/call_rO5VaowuRxQJ39g98IFQI99m.png";

export const SAMPLE_SERIES: MarketSeries = {
  id: 1n,
  marketId: DEMO_MARKET_ID,
  strike: 650_000n,
  expiry: BigInt(Math.floor(Date.now() / 1000) + 12 * 24 * 60 * 60),
  abovePremium: 350_000n,
  belowPremium: 650_000n,
  totalAbove: 1_284n,
  totalBelow: 746n,
  settlementPrice: 0n,
  winningSide: 0,
  settled: false,
  preview: true
};

export type ContractSeries = {
  marketId: Hex;
  strike: number;
  expiry: bigint;
  abovePremium: bigint;
  belowPremium: bigint;
  totalAbove: bigint;
  totalBelow: bigint;
  settlementPrice: number;
  winningSide: number;
  settled: boolean;
};

export type TxStage = "idle" | "approving" | "submitting" | "confirming" | "success";

export type GammaMarket = {
  question: string;
  outcomePrices?: string;
  volume?: string;
  active: boolean;
  closed: boolean;
};

export type GammaEvent = {
  slug: string;
  image?: string;
  markets: GammaMarket[];
};

export type PolymarketSignal = {
  slug: string;
  label: string;
  title: string;
  matcher: string;
  probability: number;
  volume: number;
  image: string;
  kind: "bitcoin" | "satoshi" | "fed";
};

export const POLYMARKET_SIGNALS: PolymarketSignal[] = [
  {
    slug: "bitcoin-up-or-down-on-july-24-2026",
    label: "BTC / TODAY",
    title: "Bitcoin закроет день ростом?",
    matcher: "Bitcoin Up or Down on July 24?",
    probability: 74.5,
    volume: 116_428,
    image:
      "https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png",
    kind: "bitcoin"
  },
  {
    slug: "what-price-will-bitcoin-hit-before-2027",
    label: "BTC / 2026",
    title: "Bitcoin достигнет $95 000 до конца 2026?",
    matcher: "Will Bitcoin reach $95,000 by December 31, 2026?",
    probability: 15.5,
    volume: 93_736,
    image:
      "https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png",
    kind: "bitcoin"
  },
  {
    slug: "will-satoshi-move-any-bitcoin-in-2026",
    label: "SATOSHI / WALLETS",
    title: "Сатоши переместит хотя бы один Bitcoin в 2026?",
    matcher: "Will Satoshi move any Bitcoin in 2026?",
    probability: 5.8,
    volume: 4_484_775,
    image:
      "https://polymarket-upload.s3.us-east-2.amazonaws.com/will-satoshi-move-any-bitcoin-in-2025--yj25LtDXYuO.jpg",
    kind: "satoshi"
  },
  {
    slug: "satoshis-identity-be-proven-by",
    label: "SATOSHI / IDENTITY",
    title: "Личность Сатоши раскроют до 31 декабря?",
    matcher: "Will Satoshi's identity be revealed by December 31?",
    probability: 3.8,
    volume: 934_353,
    image: "https://polymarket-upload.s3.us-east-2.amazonaws.com/satoshi.png",
    kind: "satoshi"
  },
  {
    slug: "fed-decision-in-july-181",
    label: "FED / JULY",
    title: "ФРС оставит ставку без изменений в июле?",
    matcher: "Will there be no change in Fed interest rates after the July",
    probability: 75,
    volume: 26_090_025,
    image:
      "https://polymarket-upload.s3.us-east-2.amazonaws.com/fed-decision-in-september-762-c4RyWuxRPo1L.jpg",
    kind: "fed"
  },
  {
    slug: "fed-decision-in-september-762",
    label: "FED / SEPTEMBER",
    title: "ФРС повысит ставку на 25 б.п. в сентябре?",
    matcher: "Will the Fed increase interest rates by 25 bps after the September",
    probability: 51.5,
    volume: 1_027_131,
    image:
      "https://polymarket-upload.s3.us-east-2.amazonaws.com/fed-decision-in-september-762-c4RyWuxRPo1L.jpg",
    kind: "fed"
  }
];

export const compactAddress = (address: Address) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export const formatUsdc = (value: bigint, digits = 2) =>
  Number(formatUnits(value, 6)).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

export const formatPercent = (value: bigint) =>
  `${(Number(value) / 10_000).toFixed(value % 10_000n === 0n ? 0 : 1)}%`;

export const formatDate = (timestamp: bigint) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(Number(timestamp) * 1_000));

export const shortError = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "shortMessage" in error &&
    typeof error.shortMessage === "string"
  ) {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Транзакция не выполнена";
};

export const formatCompactUsd = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

export const fetchPolymarketSignals = async (): Promise<PolymarketSignal[]> =>
  Promise.all(
    POLYMARKET_SIGNALS.map(async (fallback) => {
      const response = await fetch(
        `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(fallback.slug)}`,
        { signal: AbortSignal.timeout(8_000) }
      );
      if (!response.ok) throw new Error("Polymarket Gamma API is unavailable");

      const [event] = (await response.json()) as GammaEvent[];
      const market = event?.markets.find(
        (candidate) =>
          candidate.active &&
          !candidate.closed &&
          candidate.question.includes(fallback.matcher)
      );
      if (!market) return fallback;

      const prices = market.outcomePrices
        ? (JSON.parse(market.outcomePrices) as string[])
        : [];
      const yesPrice = Number(prices[0]);

      return {
        ...fallback,
        probability: Number.isFinite(yesPrice)
          ? Math.round(yesPrice * 1_000) / 10
          : fallback.probability,
        volume: Number(market.volume ?? fallback.volume),
        image: event.image || fallback.image
      };
    })
  );

export type { Side };
