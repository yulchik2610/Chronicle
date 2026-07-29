import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Landmark,
  ShieldCheck
} from "lucide-react";
import { useReadContracts } from "wagmi";
import { binaryOptionAbi, poolAbi } from "../abi";
import { chronicleChain, contracts, contractsConfigured } from "../config";
import { USDC, formatUsdc } from "../lib";
import {
  AppNotice,
  ChronicleMark,
  PolymarketPulse,
  Stat,
  WalletControl
} from "../components";

const HERO_PANORAMA =
  "/hero/exec-b06eb723-a08c-42f0-ba15-c465a4666c8d.png";

export function LandingPage() {
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

  return (
    <div className="app-shell">
      <div className="hero-media" aria-hidden="true">
        <img
          className="hero-panorama"
          src={HERO_PANORAMA}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
        <div className="hero-gradient" />
      </div>
      <header className="site-header">
        <ChronicleMark />
        <nav aria-label="Основная навигация">
          <a className="active" href="#markets">
            Как работает
          </a>
          <a href="#liquidity">Ликвидность</a>
          <a href="#documents">Документы</a>
        </nav>
        <WalletControl />
      </header>

      <main>
        <section className="hero-strip">
          <div className="hero-copy">
            <span className="kicker">ODDS DERIVATIVES / ONCHAIN</span>
            <h1>
              <span className="desktop-headline">
                Торгуйте не исходом.
                <br />
                Торгуйте <em>движением уверенности.</em>
              </span>
              <span className="mobile-headline">
                Куда двинутся <em>шансы?</em>
              </span>
            </h1>
            <p>
              Опционы на вероятность событий. Фиксированный риск, прозрачный
              страйк и выплата в USDC — всё проверяется контрактом.
            </p>
            <div className="hero-prompt">
              <button
                className="prompt-signal"
                type="button"
                aria-label="История рынка"
              >
                <Activity size={19} />
              </button>
              <div className="prompt-copy">
                <span>GLOBAL MARKET DESK · 10 SIGNALS</span>
                <strong>
                  Выберите событие и торгуйте движением его вероятности.
                </strong>
              </div>
              <Link className="prompt-action" to="/app">
                Смотреть рынки
                <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
          <div className="hero-stamp" aria-hidden="true">
            <span>VERIFIED</span>
            <strong>ODDS</strong>
            <small>LEDGER / 2026</small>
          </div>
        </section>

        <AppNotice />

        <section className="stats-rail" id="liquidity">
          <Stat
            label="TVL ПУЛА"
            value={`$${formatUsdc(totalAssets, 0)}`}
            detail="USDC collateral"
          />
          <Stat
            label="ЗАРЕЗЕРВИРОВАНО"
            value={`$${formatUsdc(reserved, 0)}`}
            detail={`${totalAssets > 0n ? ((Number(reserved) / Number(totalAssets)) * 100).toFixed(1) : "0"}% utilization`}
          />
          <Stat
            label="СВОБОДНАЯ ЛИКВИДНОСТЬ"
            value={`$${formatUsdc(freeLiquidity, 0)}`}
            detail="доступно для новых ставок"
          />
          <Stat
            label="СЕТЬ"
            value={chronicleChain.name}
            detail={`chain ID ${chronicleChain.id}`}
          />
        </section>

        <section className="liquidity-brief" aria-label="Что означает ликвидность">
          <div>
            <span className="section-index">00 / LIQUIDITY</span>
            <h2>Ликвидность — это запас USDC, из которого платятся выигрыши.</h2>
          </div>
          <div className="liquidity-copy">
            <p>
              Когда трейдер покупает ABOVE или BELOW, он платит премию, а
              OptionPool сразу резервирует максимальную возможную выплату. Так
              серия не обещает больше, чем реально может выплатить.
            </p>
            <p>
              TVL показывает весь капитал пула. Зарезервировано — часть,
              заблокированная под уже открытые позиции. Свободная ликвидность —
              капитал, который ещё можно использовать для новых сделок.
            </p>
          </div>
        </section>

        <PolymarketPulse />

        <section className="explain-section" id="markets">
          <div className="section-heading explain-heading">
            <div>
              <span className="section-index">01 / HOW IT WORKS</span>
              <h2>Как работает проект</h2>
            </div>
            <p>
              Chronicle превращает вопрос о событии в onchain-серию: у неё есть
              страйк, экспирация, две стороны и заранее понятный риск.
            </p>
          </div>

          <div className="explain-grid">
            <article className="explain-card">
              <span>01</span>
              <Landmark size={22} />
              <h3>Рынок появляется как серия</h3>
              <p>
                Фабрика создаёт контракт с вопросом, страйком и датой
                экспирации. Например: индекс вероятности будет выше 65%?
              </p>
            </article>
            <article className="explain-card">
              <span>02</span>
              <Activity size={22} />
              <h3>Трейдер выбирает сторону</h3>
              <p>
                ABOVE покупается, если вы ждёте значение выше страйка. BELOW
                покупается, если ждёте значение ниже страйка.
              </p>
            </article>
            <article className="explain-card">
              <span>03</span>
              <ShieldCheck size={22} />
              <h3>Пул резервирует выплату</h3>
              <p>
                OptionPool блокирует номинал под возможную выплату. Поэтому
                максимальный риск и максимальная выплата видны до входа.
              </p>
            </article>
            <article className="explain-card">
              <span>04</span>
              <Check size={22} />
              <h3>Оракул закрывает результат</h3>
              <p>
                После экспирации OddsIndexOracle передаёт финальный индекс.
                Победившая сторона делает claim, проигравшая сгорает.
              </p>
            </article>
          </div>

          <div className="explain-flow" aria-label="Жизненный цикл серии">
            <span>LISTING</span>
            <ChevronRight size={15} />
            <span>BUY ABOVE / BELOW</span>
            <ChevronRight size={15} />
            <span>POOL RESERVE</span>
            <ChevronRight size={15} />
            <span>ORACLE SETTLEMENT</span>
            <ChevronRight size={15} />
            <span>CLAIM USDC</span>
          </div>

          <div className="explain-note">
            <div>
              <span className="section-index">MVP MECHANICS</span>
              <h3>Что уже имитирует интерфейс</h3>
            </div>
            <p>
              Карточки Polymarket используются как живой источник тем, а
              локальные контракты показывают механику покупки бинарных odds
              options: премия, резерв пула, side-токены и claim после расчёта.
            </p>
          </div>

          <div className="project-brief">
            <div>
              <span>Что это за проект</span>
              <strong>Chronicle — прототип рынка деривативов на вероятность.</strong>
              <p>
                Он соединяет механику prediction markets с опционной логикой:
                вместо покупки “да/нет” пользователь покупает контракт на то,
                будет ли индекс вероятности выше или ниже заданного страйка.
              </p>
            </div>
            <div>
              <span>Что сейчас готово</span>
              <strong>Контракты, локальный деплой, торговый экран и smoke-сценарий.</strong>
              <p>
                В MVP есть MockUSDC, oracle, пул ликвидности, ERC-1155 позиции,
                покупка ABOVE/BELOW, резервирование выплаты и claim после расчёта.
              </p>
            </div>
          </div>

          <Link className="prompt-action explain-cta" to="/app">
            Перейти в дапку
            <ArrowUpRight size={18} />
          </Link>
        </section>

        <section className="documents-section" id="documents">
          <div className="section-heading explain-heading">
            <div>
              <span className="section-index">02 / DOCUMENTS</span>
              <h2>Документы проекта</h2>
            </div>
            <p>
              Здесь собраны рабочие материалы, которые помогают понять механику
              протокола и подготовить следующий шаг перед тестнетом.
            </p>
          </div>

          <div className="documents-grid">
            <article className="document-card">
              <FileText size={22} />
              <span>README</span>
              <h3>Архитектура и локальный запуск</h3>
              <p>
                Объясняет контракты, роли, локальную сеть Hardhat, деплой и
                базовую проверку проекта командой pnpm check.
              </p>
            </article>
            <article className="document-card">
              <FileText size={22} />
              <span>HOW IT WORKS</span>
              <h3>Механика odds options</h3>
              <p>
                Описывает жизненный цикл серии: создание рынка, покупка
                позиции, резерв пула, расчёт оракулом и claim.
              </p>
            </article>
            <article className="document-card">
              <FileText size={22} />
              <span>DEPLOY</span>
              <h3>Деплой React-интерфейса</h3>
              <p>
                Показывает переменные VITE_*, build-команду и настройки для
                Vercel, Netlify или обычного статического хостинга.
              </p>
            </article>
          </div>
        </section>

        <section className="trust-ledger">
          <div>
            <span className="section-index">WHY CHRONICLE</span>
            <h2>Не обещание букмекера. Исполняемый расчёт.</h2>
          </div>
          <div className="ledger-items">
            <div>
              <Landmark size={20} />
              <strong>USDC collateral</strong>
              <span>Пул резервирует максимальную выплату в момент покупки.</span>
            </div>
            <div>
              <Activity size={20} />
              <strong>TWAP settlement</strong>
              <span>Цена экспирации берётся из append-only odds oracle.</span>
            </div>
            <div>
              <ShieldCheck size={20} />
              <strong>ERC-1155 position</strong>
              <span>Позиция принадлежит кошельку и может быть передана.</span>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <ChronicleMark />
        <span>ODDS DERIVATIVES PROTOCOL / 2026</span>
        <span>TESTNET-READY · NOT AUDITED</span>
      </footer>
    </div>
  );
}
