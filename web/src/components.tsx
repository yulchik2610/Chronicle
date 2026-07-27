import { useQuery } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bitcoin,
  ExternalLink,
  Fingerprint,
  Landmark,
  LoaderCircle,
  WalletCards,
  X
} from "lucide-react";
import { contractsConfigured } from "./config";
import type { MarketSeries, Position, Side } from "./types";
import {
  compactAddress,
  fetchPolymarketSignals,
  formatCompactUsd,
  formatDate,
  formatPercent,
  POLYMARKET_SIGNALS,
  type PolymarketSignal
} from "./lib";
import { CircleAlert } from "lucide-react";

export function SignalIcon({ kind }: { kind: PolymarketSignal["kind"] }) {
  if (kind === "bitcoin") return <Bitcoin size={19} />;
  if (kind === "satoshi") return <Fingerprint size={19} />;
  return <Landmark size={19} />;
}

export function PolymarketPulse() {
  const { data = POLYMARKET_SIGNALS } = useQuery({
    queryKey: ["polymarket", "macro-signals"],
    queryFn: fetchPolymarketSignals,
    placeholderData: POLYMARKET_SIGNALS,
    refetchInterval: 60_000,
    retry: 1
  });

  return (
    <section className="polymarket-section" aria-labelledby="polymarket-title">
      <div className="section-heading poly-heading">
        <div>
          <span className="section-index">LIVE INTELLIGENCE / POLYMARKET</span>
          <h2 id="polymarket-title">Рынки, за которыми следят все</h2>
        </div>
        <span className="poly-feed-state">
          <span />
          LIVE GAMMA API
        </span>
      </div>

      <div className="polymarket-grid">
        {data.map((signal) => (
          <a
            className={`poly-card ${signal.kind}`}
            href={`https://polymarket.com/event/${signal.slug}`}
            key={`${signal.slug}-${signal.matcher}`}
            target="_blank"
            rel="noreferrer"
          >
            <div className="poly-art">
              <img src={signal.image} alt="" loading="lazy" />
              <span className="poly-icon">
                <SignalIcon kind={signal.kind} />
              </span>
              <span className="poly-label">{signal.label}</span>
            </div>
            <div className="poly-card-body">
              <div className="poly-question">
                <h3>{signal.title}</h3>
                <strong>{signal.probability.toFixed(1)}%</strong>
              </div>
              <div className="poly-meter" aria-hidden="true">
                <span style={{ width: `${signal.probability}%` }} />
              </div>
              <div className="poly-card-meta">
                <span>YES probability</span>
                <span>${formatCompactUsd(signal.volume)} volume</span>
                <ExternalLink size={13} />
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export function ChronicleMark() {
  return (
    <a className="brand" href="/" aria-label="Chronicle — на главную">
      <span className="brand-seal">C</span>
      <span className="brand-word">
        CHRONICLE<em>.</em>
      </span>
    </a>
  );
}

export function WalletControl() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button className="wallet-button connected" onClick={() => disconnect()}>
        <span className="live-dot" />
        {compactAddress(address)}
        <X size={14} />
      </button>
    );
  }

  return (
    <button
      className="wallet-button"
      disabled={isPending || connectors.length === 0}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      {isPending ? (
        <LoaderCircle className="spin" size={16} />
      ) : (
        <WalletCards size={16} />
      )}
      {connectors.length === 0 ? "Нужен Web3-кошелёк" : "Подключить кошелёк"}
    </button>
  );
}

export function Stat({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function Sparkline({ rising }: { rising: boolean }) {
  const points = rising
    ? "0,58 24,51 50,54 77,39 104,44 132,30 160,34 188,18 216,24 244,10"
    : "0,15 24,20 50,17 77,32 104,26 132,39 160,34 188,49 216,45 244,58";

  return (
    <div className={`sparkline ${rising ? "up" : "down"}`} aria-hidden="true">
      <svg viewBox="0 0 244 68" preserveAspectRatio="none">
        <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="spark-baseline" />
    </div>
  );
}

export function MarketCard({
  series,
  active,
  onSelect,
  onSelectSide
}: {
  series: MarketSeries;
  active: boolean;
  onSelect: (series: MarketSeries) => void;
  onSelectSide?: (series: MarketSeries, side: Side) => void;
}) {
  const now = BigInt(Math.floor(Date.now() / 1_000));
  const expired = series.expiry <= now;
  const implied = series.abovePremium;

  return (
    <article className={`market-card ${active ? "selected" : ""}`}>
      <div className="market-topline">
        <span className="market-category">POLITICS / DISTRICT N</span>
        <span
          className={`market-status ${
            series.settled ? "settled" : expired ? "expired" : ""
          }`}
        >
          {series.preview
            ? "PREVIEW"
            : series.settled
              ? "SETTLED"
              : expired
                ? "EXPIRED"
                : "LIVE"}
        </span>
      </div>

      <h3>
        Будет ли индекс вероятности победы кандидата A выше{" "}
        {formatPercent(series.strike)} к экспирации?
      </h3>

      <div className="market-visual">
        <div>
          <span className="odds-label">Цена ABOVE</span>
          <strong className="odds-value">{formatPercent(implied)}</strong>
          <span className="odds-change">
            <ArrowUpRight size={14} /> +4.2 п.п. / 24ч
          </span>
        </div>
        <Sparkline rising />
      </div>

      <div className="market-meta">
        <span>
          <strong>
            {Number(series.totalAbove + series.totalBelow).toLocaleString(
              "ru-RU",
            )}
          </strong>{" "}
          контрактов
        </span>
        <span>
          Страйк <strong>{formatPercent(series.strike)}</strong>
        </span>
        <span>
          До <strong>{formatDate(series.expiry)}</strong>
        </span>
      </div>

      <div className="market-actions">
        <button
          className="side-button above"
          disabled={expired || series.settled}
          onClick={() => onSelectSide?.(series, 0) ?? onSelect(series)}
        >
          <span>ABOVE</span>
          <strong>{formatPercent(series.abovePremium)}</strong>
        </button>
        <button
          className="side-button below"
          disabled={expired || series.settled}
          onClick={() => onSelectSide?.(series, 1) ?? onSelect(series)}
        >
          <span>BELOW</span>
          <strong>{formatPercent(series.belowPremium)}</strong>
        </button>
      </div>
    </article>
  );
}

export function PositionRow({
  position,
  onClaim,
  pending
}: {
  position: Position;
  onClaim: (position: Position) => void;
  pending: boolean;
}) {
  const canClaim =
    position.series.settled &&
    position.series.winningSide === position.side &&
    position.amount > 0n;

  return (
    <div className="position-row">
      <span className={`position-side ${position.side === 0 ? "above" : "below"}`}>
        {position.side === 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {position.side === 0 ? "ABOVE" : "BELOW"}
      </span>
      <div>
        <strong>Серия #{position.series.id.toString()}</strong>
        <small>{formatPercent(position.series.strike)} strike</small>
      </div>
      <div className="position-amount">
        <strong>{position.amount.toString()}</strong>
        <small>контрактов</small>
      </div>
      {canClaim ? (
        <button disabled={pending} onClick={() => onClaim(position)}>
          Claim
        </button>
      ) : (
        <span className="position-state">
          {position.series.settled ? "Закрыта" : "Открыта"}
        </span>
      )}
    </div>
  );
}

export function AppNotice() {
  if (contractsConfigured) return null;

  return (
    <div className="setup-notice">
      <CircleAlert size={18} />
      <div>
        <strong>Интерфейс открыт в preview-режиме</strong>
        <span>
          Деплойте ChronicleModule и перенесите адреса контрактов в{" "}
          <code>web/.env</code> — после этого кнопка ставки отправляет настоящую
          onchain-транзакцию.
        </span>
      </div>
    </div>
  );
}

export { Activity };
