# Деплой JET Store Bot (Railway)

## Шаги

1. Загрузите код на GitHub
2. Создайте проект на [railway.app](https://railway.app) → Deploy from GitHub
3. Добавьте переменные окружения:
   - `BOT_TOKEN` — токен бота от @BotFather
   - `ADMIN_IDS` — ваш Telegram ID (например 6928639672)
   - `WEB_APP_URL` — URL мини-приложения (https://jetstoreapp.ru или GitHub Pages)
   - `CRYPTO_PAY_TOKEN` — токен из @CryptoBot → Crypto Pay → Create App
4. Получите URL бота (например `https://jet-store-bot-production.up.railway.app`)
5. Укажите URL в `js/config.js`: `window.JET_BOT_API_URL = 'https://ваш-url';`

## CryptoBot

1. Откройте @CryptoBot в Telegram
2. Crypto Pay → Create App (или My Apps)
3. Скопируйте API Token
4. Добавьте как переменную `CRYPTO_PAY_TOKEN` в Railway

## Проверка

- `https://ваш-url/api/health` — бот запущен
- `https://ваш-url/api/cryptobot/status` — configured: true, api_ok: true (если false — добавьте CRYPTO_PAY_TOKEN)
- `https://ваш-url/api/ton-rate` — курс TON в рублях

## Если не работает

**Курс TON не отображается**
- Убедитесь, что в `js/config.js` указан `JET_BOT_API_URL` (URL бота на Railway)
- Откройте F12 → Console — есть ли ошибки при загрузке?

**CryptoBot: «Ошибка создания заказа»**
1. Проверьте `/api/cryptobot/status` — api_ok должен быть true
2. В Railway → Variables добавьте `CRYPTO_PAY_TOKEN` (токен из @CryptoBot → Crypto Pay → Create App)
3. Токен без пробелов, формат: `123456:ABCdef...`
