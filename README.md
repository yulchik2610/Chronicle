# Chronicle Odds Derivatives

Рабочий прототип on-chain рынка опционов на вероятность событий:

- `OddsIndexOracle.sol` — append-only индекс вероятности, TWAP и финализация;
- `OptionPool.sol` — ERC-4626 пул андеррайтинга с лимитом утилизации;
- `BinaryOption.sol` — ERC-1155 позиции ABOVE/BELOW, покупка и claim;
- React-интерфейс — подключение кошелька, approve USDC, ставка, позиции и claim.

Все вероятности имеют точность 6 знаков:

- `0` = 0%;
- `500_000` = 50%;
- `1_000_000` = 100%.

## Локальный запуск

Нужны Node.js и pnpm.

```bash
pnpm install
pnpm node
```

Во втором терминале:

```bash
pnpm deploy:local
pnpm smoke:local
pnpm web:dev
```

После деплоя адреса находятся в
`ignition/deployments/chronicle-local/deployed_addresses.json`. Для локального
интерфейса они уже записаны в игнорируемый Git-файл `web/.env`.

Откройте `http://127.0.0.1:4173`. Для ручной сделки добавьте сеть
`http://127.0.0.1:8545`, chain ID `31337`, в браузерный кошелёк и импортируйте
один из тестовых аккаунтов, которые показывает `pnpm node`.

## Проверка

```bash
pnpm check
```

Команда запускает Solidity-тесты, TypeScript-проверку и production-сборку
интерфейса.

## Модель исполнения

1. Risk Manager создаёт серию со страйком, экспирацией и премиями.
2. Трейдер разрешает списание USDC и покупает ABOVE или BELOW.
3. Премия поступает в пул, а максимальная выплата резервируется.
4. Трейдер получает ERC-1155 позицию.
5. После финализации oracle любой keeper рассчитывает серию.
6. Победитель сжигает позицию и получает выплату из пула.

## Безопасность

Код предназначен для разработки и тестовых сетей. Он не проходил независимый
аудит и не должен использоваться с реальными средствами до аудита, настройки
production-oracle, multisig-ролей, мониторинга и ограничений риска.


## Деплой в Circle Arc testnet

Сеть `arcTestnet` в `hardhat.config.ts` не содержит захардкоженных параметров.
RPC-эндпоинт и приватный ключ деплоера читаются лениво (только при
использовании сети) через `configVariable`, а chainId определяется из RPC.

Задайте два секрета (не коммитятся в Git):

```bash
npx hardhat keystore set ARC_RPC_URL       # JSON-RPC Arc testnet
npx hardhat keystore set ARC_PRIVATE_KEY   # ключ деплоера, 0x..., пополнен на Arc
```

Либо экспортируйте те же переменные в окружении (см. `.env.example`).

USDC на Arc разворачивается как `MockUSDC` (тестовый коллатерал), как и локально.
Деплой одним подписантом — все роли (admin/publisher/resolver/guardian) и
seed LP/trader сходятся на `account(0)`:

```bash
pnpm deploy:arc
```

Адреса появятся в
`ignition/deployments/chronicle-arc/deployed_addresses.json`.

### Подключение интерфейса к Arc

Скопируйте шаблон и подставьте адреса из деплоя и параметры сети Arc:

```bash
cp web/.env.arc.example web/.env
```

Заполните `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_CHAIN_NAME` (из документации Arc)
и четыре `VITE_*_ADDRESS` (из `deployed_addresses.json`), затем:

```bash
pnpm web:dev
```

Добавьте ту же сеть Arc и её chain ID в браузерный кошелёк, чтобы совершать
сделки: подключение → approve USDC → ставка ABOVE/BELOW → позиции → claim.
