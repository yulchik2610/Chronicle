import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWriteContract
} from "wagmi";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Droplets,
  ExternalLink,
  Gauge,
  Layers3,
  LoaderCircle,
  Radio,
  ShieldCheck
} from "lucide-react";
import type { Hex } from "viem";
import { binaryOptionAbi, erc20Abi, poolAbi } from "../abi";
import {
  chronicleChain,
  contracts,
  contractsConfigured,
  explorerUrl,
  faucetEnabled
} from "../config";
import type { MarketSeries, Position, Side } from "../types";
import {
  ContractSeries,
  MAX_SERIES,
  SAMPLE_SERIES,
  TxStage,
  USDC,
  formatPercent,
  formatUsdc,
  shortError
} from "../lib";
import {
  AppNotice,
  ChronicleMark,
  MarketCard,
  PositionRow,
  WalletControl
} from "../components";

export function DappPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [selected, setSelected] = useState<MarketSeries>(SAMPLE_SERIES);
  const [side, setSide] = useState<Side>(0);
  const [amountInput, setAmountInput] = useState("10");
  const [txStage, setTxStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<Hex>();
  const [txError, setTxError] = useState("");
  const [positionsTab, setPositionsTab] = useState<"open" | "closed">("open");

  const seriesCount = useReadContract({
    address: contracts.option,
    abi: binaryOptionAbi,
    functionName: "seriesCount",
    query: {
      enabled: contractsConfigured,
      refetchInterval: 8_000
    }
  });

  const visibleSeriesCount = Math.min(Number(seriesCount.data ?? 0n), MAX_SERIES);
  const contractsLive = contractsConfigured && seriesCount.isSuccess;
  const seriesContracts = useMemo(
    () =>
      Array.from({ length: visibleSeriesCount }, (_, index) => ({
        address: contracts.option,
        abi: binaryOptionAbi,
        functionName: "series" as const,
        args: [BigInt(index + 1)] as const
      })),
    [visibleSeriesCount]
  );

  const seriesReads = useReadContracts({
    contracts: seriesContracts,
    query: {
      enabled: contractsConfigured && seriesContracts.length > 0,
      refetchInterval: 8_000
    }
  });

  const onchainSeries = useMemo(() => {
    if (!seriesReads.data) return [];
    return seriesReads.data.flatMap((entry, index) => {
      if (entry.status !== "success") return [];
      const raw = entry.result as ContractSeries;
      return [
        {
          id: BigInt(index + 1),
          marketId: raw.marketId,
          strike: BigInt(raw.strike),
          expiry: raw.expiry,
          abovePremium: raw.abovePremium,
          belowPremium: raw.belowPremium,
          totalAbove: raw.totalAbove,
          totalBelow: raw.totalBelow,
          settlementPrice: BigInt(raw.settlementPrice),
          winningSide: Number(raw.winningSide) as Side,
          settled: raw.settled
        } satisfies MarketSeries
      ];
    });
  }, [seriesReads.data]);

  const markets = onchainSeries.length > 0 ? onchainSeries : [SAMPLE_SERIES];

  useEffect(() => {
    if (onchainSeries.length > 0 && selected.preview) {
      setSelected(onchainSeries[0]);
    }
  }, [onchainSeries, selected.preview]);

  useEffect(() => {
    setTxStage("idle");
    setTxError("");
    setTxHash(undefined);
  }, [selected.id, side]);

  const positionContracts = useMemo(() => {
    if (!address) return [];
    return onchainSeries.flatMap((market) =>
      ([0, 1] as const).map((positionSide) => ({
        address: contracts.option,
        abi: binaryOptionAbi,
        functionName: "balanceOf" as const,
        args: [address, market.id * 2n + BigInt(positionSide)] as const
      }))
    );
  }, [address, onchainSeries]);

  const positionReads = useReadContracts({
    contracts: positionContracts,
    query: {
      enabled:
        contractsConfigured && isConnected && positionContracts.length > 0,
      refetchInterval: 6_000
    }
  });

  const positions = useMemo(() => {
    if (!positionReads.data) return [];
    const result: Position[] = [];
    onchainSeries.forEach((market, marketIndex) => {
      ([0, 1] as const).forEach((positionSide, sideIndex) => {
        const entry = positionReads.data[marketIndex * 2 + sideIndex];
        const amount =
          entry?.status === "success" ? (entry.result as bigint) : 0n;
        if (amount > 0n) {
          result.push({ series: market, side: positionSide, amount });
        }
      });
    });
    return result;
  }, [onchainSeries, positionReads.data]);

  const openPositions = useMemo(
    () => positions.filter((position) => !position.series.settled),
    [positions]
  );
  const closedPositions = useMemo(
    () => positions.filter((position) => position.series.settled),
    [positions]
  );

  const accountReads = useReadContracts({
    contracts: [
      {
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address ?? contracts.option]
      },
      {
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address ?? contracts.option, contracts.option]
      }
    ],
    query: {
      enabled: contractsConfigured && Boolean(address),
      refetchInterval: 6_000
    }
  });

  const poolReads = useReadContracts({
    contracts: [
      {
        address: contracts.pool,
        abi: poolAbi,
        functionName: "totalAssets"
      },
      {
        address: contracts.pool,
        abi: poolAbi,
        functionName: "reservedCollateral"
      },
      {
        address: contracts.pool,
        abi: poolAbi,
        functionName: "freeLiquidity"
      }
    ],
    query: {
      enabled: contractsConfigured,
      refetchInterval: 8_000
    }
  });

  const allowance =
    accountReads.data?.[1]?.status === "success"
      ? (accountReads.data[1].result as bigint)
      : 0n;
  const usdcBalance =
    accountReads.data?.[0]?.status === "success"
      ? (accountReads.data[0].result as bigint)
      : 0n;
  const totalAssets =
    poolReads.data?.[0]?.status === "success"
      ? (poolReads.data[0].result as bigint)
      : 1_000n * USDC;
  const reserved =
    poolReads.data?.[1]?.status === "success"
      ? (poolReads.data[1].result as bigint)
      : 182n * USDC;
  const freeLiquidity =
    poolReads.data?.[2]?.status === "success"
      ? (poolReads.data[2].result as bigint)
      : totalAssets - reserved;

  const amount = /^\d+$/.test(amountInput) ? BigInt(amountInput) : 0n;
  const unitPremium = side === 0 ? selected.abovePremium : selected.belowPremium;
  const quoteRead = useReadContract({
    address: contracts.option,
    abi: binaryOptionAbi,
    functionName: "quote",
    args: [selected.id, side, amount],
    query: {
      enabled:
        contractsConfigured &&
        !selected.preview &&
        amount > 0n &&
        amount <= (1n << 128n) - 1n,
      refetchInterval: 4_000
    }
  });
  const premium = quoteRead.data?.[0] ?? unitPremium * amount;
  const payout = quoteRead.data?.[1] ?? amount * USDC;
  const maximumPremium = (premium * 101n + 99n) / 100n;
  const potentialProfit = payout > premium ? payout - premium : 0n;
  const wrongChain = isConnected && chainId !== chronicleChain.id;
  const utilization =
    totalAssets > 0n ? (Number(reserved) / Number(totalAssets)) * 100 : 0;
  const selectedSideLabel = side === 0 ? "ABOVE" : "BELOW";
  const selectedPremium = side === 0 ? selected.abovePremium : selected.belowPremium;
  const txPending =
    txStage === "approving" ||
    txStage === "submitting" ||
    txStage === "confirming";

  const refreshOnchain = async () => {
    await Promise.all([
      seriesCount.refetch(),
      seriesReads.refetch(),
      positionReads.refetch(),
      accountReads.refetch(),
      poolReads.refetch(),
      quoteRead.refetch()
    ]);
  };

  const ensureCorrectChain = async () => {
    if (chainId === chronicleChain.id) return;
    await switchChainAsync({ chainId: chronicleChain.id });
  };

  const handleTrade = async () => {
    if (
      !address ||
      !publicClient ||
      !contractsConfigured ||
      selected.preview ||
      amount <= 0n
    ) {
      return;
    }

    setTxError("");
    setTxHash(undefined);

    try {
      await ensureCorrectChain();

      if (allowance < maximumPremium) {
        setTxStage("approving");
        const approvalHash = await writeContractAsync({
          address: contracts.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.option, maximumPremium]
        });
        setTxStage("confirming");
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      setTxStage("submitting");
      const betHash = await writeContractAsync({
        address: contracts.option,
        abi: binaryOptionAbi,
        functionName: "buy",
        args: [selected.id, side, amount, maximumPremium]
      });
      setTxHash(betHash);
      setTxStage("confirming");
      await publicClient.waitForTransactionReceipt({ hash: betHash });
      setTxStage("success");
      await refreshOnchain();
    } catch (error) {
      setTxStage("idle");
      setTxError(shortError(error));
    }
  };

  const handleFaucet = async () => {
    if (!address || !publicClient || !contractsConfigured) return;
    setTxError("");
    try {
      await ensureCorrectChain();
      setTxStage("submitting");
      const hash = await writeContractAsync({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, 100n * USDC]
      });
      setTxStage("confirming");
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStage("success");
      await accountReads.refetch();
    } catch (error) {
      setTxStage("idle");
      setTxError(shortError(error));
    }
  };

  const handleClaim = async (position: Position) => {
    if (!publicClient || !contractsConfigured) return;
    setTxError("");
    try {
      await ensureCorrectChain();
      setTxStage("submitting");
      const hash = await writeContractAsync({
        address: contracts.option,
        abi: binaryOptionAbi,
        functionName: "claim",
        args: [position.series.id, position.side, position.amount]
      });
      setTxStage("confirming");
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStage("success");
      await refreshOnchain();
    } catch (error) {
      setTxStage("idle");
      setTxError(shortError(error));
    }
  };

  const visiblePositions =
    positionsTab === "open" ? openPositions : closedPositions;

  return (
    <div className="app-shell dapp-shell">
      <header className="site-header">
        <ChronicleMark />
        <nav aria-label="Основная навигация">
          <a href="/#markets">Как работает</a>
          <a href="/#liquidity">Ликвидность</a>
          <a href="/#documents">Документы</a>
          <span className="active">Дапка</span>
        </nav>
        <WalletControl />
      </header>

      <main>
        <AppNotice />

        <section className="dapp-hero">
          <div className="dapp-hero-copy">
            <span className="section-index">TRADING DESK / LOCAL TESTNET</span>
            <h1>Рынки вероятности в режиме сделки</h1>
            <p>
              Выберите серию, сторону ABOVE или BELOW, задайте количество
              контрактов и отправьте транзакцию. Пул сразу резервирует
              максимальную выплату в USDC.
            </p>
          </div>

          <div className="desk-status-panel">
            <div className="desk-status-topline">
              <span className={contractsLive ? "desk-dot live" : "desk-dot"} />
              <strong>{contractsLive ? "Контракты подключены" : "Preview режим"}</strong>
            </div>
            <div className="desk-status-grid">
              <div>
                <span>Кошелёк</span>
                <strong>{isConnected ? "Подключен" : "Не подключен"}</strong>
              </div>
              <div>
                <span>Сеть</span>
                <strong>{wrongChain ? "Нужно переключить" : chronicleChain.name}</strong>
              </div>
              <div>
                <span>Баланс</span>
                <strong>{isConnected ? `${formatUsdc(usdcBalance)} USDC` : "—"}</strong>
              </div>
              <div>
                <span>Выбрано</span>
                <strong>{selectedSideLabel} · {formatPercent(selectedPremium)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="dapp-stats" id="liquidity">
          <div className="desk-stat">
            <Layers3 size={18} />
            <span>TVL пула</span>
            <strong>${formatUsdc(totalAssets, 0)}</strong>
            <small>общий USDC collateral</small>
          </div>
          <div className="desk-stat">
            <ShieldCheck size={18} />
            <span>Зарезервировано</span>
            <strong>${formatUsdc(reserved, 0)}</strong>
            <small>{utilization.toFixed(1)}% utilization</small>
          </div>
          <div className="desk-stat">
            <Gauge size={18} />
            <span>Свободная ликвидность</span>
            <strong>${formatUsdc(freeLiquidity, 0)}</strong>
            <small>лимит новых позиций</small>
          </div>
          <div className="desk-stat accent">
            <Radio size={18} />
            <span>Активные серии</span>
            <strong>{markets.length}</strong>
            <small>chain ID {chronicleChain.id}</small>
          </div>
        </section>

        <div className="trading-layout">
          <div className="market-column">
            <div className="section-heading">
              <div>
                <span className="section-index">01 / MARKETS</span>
                <h2>Открытые серии</h2>
              </div>
              <button className="filter-button">
                Все категории <ChevronRight size={15} />
              </button>
            </div>

            <div className="market-grid">
              {markets.map((market) => (
                <MarketCard
                  key={market.id.toString()}
                  series={market}
                  active={selected.id === market.id}
                  onSelect={(nextSeries) => {
                    setSelected(nextSeries);
                    setSide(0);
                  }}
                  onSelectSide={(nextSeries, nextSide) => {
                    setSelected(nextSeries);
                    setSide(nextSide);
                  }}
                />
              ))}
            </div>

            <div className="section-heading">
              <div>
                <span className="section-index">02 / HISTORY</span>
                <h2>Мои позиции</h2>
              </div>
              <div className="positions-tabs">
                <button
                  className={positionsTab === "open" ? "active" : ""}
                  onClick={() => setPositionsTab("open")}
                >
                  Открытые ({openPositions.length})
                </button>
                <button
                  className={positionsTab === "closed" ? "active" : ""}
                  onClick={() => setPositionsTab("closed")}
                >
                  Закрытые ({closedPositions.length})
                </button>
              </div>
            </div>

            <div className="positions-list">
              {!isConnected ? (
                <p className="positions-empty">
                  Подключите кошелёк, чтобы увидеть свои позиции.
                </p>
              ) : visiblePositions.length === 0 ? (
                <p className="positions-empty">
                  {positionsTab === "open"
                    ? "Пока нет открытых позиций."
                    : "Пока нет закрытых позиций."}
                </p>
              ) : (
                visiblePositions.map((position) => (
                  <PositionRow
                    key={`${position.series.id}-${position.side}`}
                    position={position}
                    onClaim={handleClaim}
                    pending={txPending}
                  />
                ))
              )}
            </div>
          </div>

          <aside className="trade-ticket">
            <div className="ticket-header">
              <div>
                <span>ORDER TICKET</span>
                <strong>Серия #{selected.id.toString()}</strong>
              </div>
              <span className="ticket-state">LIVE</span>
            </div>

            <p className="ticket-question">
              Индекс выше {formatPercent(selected.strike)} к экспирации?
            </p>

            <div className="side-toggle">
              <button
                className={side === 0 ? "active above" : ""}
                onClick={() => setSide(0)}
              >
                <ArrowUpRight size={17} />
                ABOVE
                <strong>{formatPercent(selected.abovePremium)}</strong>
              </button>
              <button
                className={side === 1 ? "active below" : ""}
                onClick={() => setSide(1)}
              >
                <ArrowDownRight size={17} />
                BELOW
                <strong>{formatPercent(selected.belowPremium)}</strong>
              </button>
            </div>

            <label className="amount-field">
              <span>Количество контрактов</span>
              <div>
                <input
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(event) =>
                    setAmountInput(event.target.value.replace(/[^\d]/g, ""))
                  }
                  aria-label="Количество контрактов"
                />
                <button onClick={() => setAmountInput("10")}>10</button>
                <button onClick={() => setAmountInput("25")}>25</button>
              </div>
            </label>

            <div className="ticket-summary">
              <div>
                <span>Стоимость</span>
                <strong>{formatUsdc(premium)} USDC</strong>
              </div>
              <div>
                <span>Макс. выплата</span>
                <strong>{formatUsdc(payout)} USDC</strong>
              </div>
              <div className="profit">
                <span>Потенциальная прибыль</span>
                <strong>+{formatUsdc(potentialProfit)} USDC</strong>
              </div>
            </div>

            {wrongChain ? (
              <button className="primary-action warning" onClick={ensureCorrectChain}>
                Переключиться на {chronicleChain.name}
              </button>
            ) : (
              <button
                className="primary-action"
                disabled={
                  !isConnected ||
                  !contractsConfigured ||
                  selected.preview ||
                  amount <= 0n ||
                  txPending
                }
                onClick={handleTrade}
              >
                {txPending ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    {txStage === "approving"
                      ? "Разрешение USDC…"
                      : txStage === "confirming"
                        ? "Подтверждение…"
                        : "Отправка ставки…"}
                  </>
                ) : txStage === "success" ? (
                  <>
                    <Check size={17} /> Позиция открыта
                  </>
                ) : !isConnected ? (
                  "Сначала подключите кошелёк"
                ) : selected.preview ? (
                  "Нужен деплой контрактов"
                ) : (
                  `Купить ${side === 0 ? "ABOVE" : "BELOW"}`
                )}
              </button>
            )}

            {faucetEnabled && isConnected && contractsConfigured ? (
              <button
                className="faucet-button"
                disabled={txPending}
                onClick={handleFaucet}
              >
                <Droplets size={15} />
                Получить 100 test mUSDC
              </button>
            ) : null}

            {txError ? (
              <div className="tx-message error">
                <CircleAlert size={16} />
                <span>{txError}</span>
              </div>
            ) : null}

            {txHash && explorerUrl ? (
              <a
                className="tx-message success"
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                <Check size={16} />
                <span>Транзакция подтверждена</span>
                <ExternalLink size={14} />
              </a>
            ) : txHash ? (
              <div className="tx-message success">
                <Check size={16} />
                <span>Транзакция подтверждена</span>
              </div>
            ) : null}

            <div className="ticket-proof">
              <ShieldCheck size={18} />
              <div>
                <strong>Полностью обеспечено</strong>
                <span>
                  Номинал резервируется в OptionPool до расчёта серии.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer>
        <ChronicleMark />
        <span>ODDS DERIVATIVES PROTOCOL / 2026</span>
        <span>TESTNET-READY · NOT AUDITED</span>
      </footer>
    </div>
  );
}
