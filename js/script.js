// script.js - Исправленный скрипт
const tg = window.Telegram?.WebApp;

// Инициализация приложения
if (tg) {
    tg.expand();
    tg.MainButton.hide();
    tg.BackButton.hide();
}

// Данные пользователя - ГЛОБАЛЬНЫЕ для связи между файлами
// ВАЖНО: Не устанавливаем начальный баланс здесь - он будет загружен из базы данных
window.userData = {
    id: null,
    username: null,
    firstName: null,
    lastName: null,
    photoUrl: null,
    language: 'ru',
    currencies: {
        RUB: 0,    // Будет загружено из базы данных
        USDT: 0,     // Будет загружено из базы данных
        USD: 0,
        EUR: 0
    },
    activeCurrency: 'RUB',
    purchases: []
};

// Текущий активный раздел
let currentSection = 'telegram';

// Функции для игр (объявляем раньше, чтобы избежать ошибок инициализации)
let currentGameCategory = null;
window.currentGameCategory = null;

// Функции для Supercell
let currentSupercellGame = null;
window.currentSupercellGame = null;

// API бота: localhost → localhost:3000; GitHub Pages → из config.js (JET_BOT_API_URL) или localStorage.
(function() {
    var host = (typeof window !== 'undefined' && window.location?.hostname) ? window.location.hostname.toLowerCase() : '';
    if (host === 'localhost' || host === '127.0.0.1') {
        window.JET_API_BASE = 'http://localhost:3000';
    } else {
        window.JET_API_BASE = window.JET_BOT_API_URL || localStorage.getItem('jet_bot_api_url') || localStorage.getItem('jet_api_base') || '';
    }
})();

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация магазина...');
    
    // Инициализируем базу данных
    if (typeof window.Database !== 'undefined' && window.Database) {
        if (typeof window.Database.init === 'function') {
            window.Database.init();
        } else {
            console.warn('⚠️ window.Database.init не является функцией');
        }
    } else {
        console.warn('⚠️ window.Database не найден');
    }
    
    // ВАЖНО: Инициализируем пользователя ПЕРВЫМ делом, чтобы загрузить баланс из базы
    initializeUserData();

    // Restore pending payment screen after returning from external payment (CryptoBot/TonKeeper)
    try { restorePendingPaymentToUI('domcontentloaded'); } catch (e) {}
    
    // Загружаем товары для активного раздела
    loadProductsForSection(currentSection);
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Обновляем цены из админки
    updatePricesDisplay();
    
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || '';
    if (apiBase && /^https?:\/\//i.test(apiBase)) {
        fetch(apiBase.replace(/\/$/, '') + '/api/config').then(function(r) { return r.json(); }).then(function(c) {
            if (c && c.cryptobot_usdt_amount != null) window.JET_CRYPTOBOT_USDT_AMOUNT = parseFloat(c.cryptobot_usdt_amount) || 1;
            if (c && c.bot_username) window.JET_BOT_USERNAME = c.bot_username;
        }).catch(function() {});
    }
    if (window.JET_CRYPTOBOT_USDT_AMOUNT == null) window.JET_CRYPTOBOT_USDT_AMOUNT = 1;
    if (typeof window.fetchTonToRubRateFromApi === 'function') {
        window.fetchTonToRubRateFromApi().then(function(rate) {
            if (rate != null) updatePricesDisplay();
        });
    }
    
    // Слушаем изменения цен в localStorage (если админ изменил цены)
    window.addEventListener('storage', function(e) {
        if (e.key === 'jetstore_stars_prices' || e.key === 'jetstore_premium_prices' || e.key === 'jetstore_star_rate') {
            updatePricesDisplay();
        }
    });
    
    // Также проверяем изменения каждые 2 секунды (на случай, если изменения в том же окне)
    setInterval(() => {
        updatePricesDisplay();
    }, 2000);
    
    // Переход с premium.html по кнопке «Оплатить»: открыть выбор способа оплаты
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pay') === 'premium') {
        const months = sessionStorage.getItem('premium_pay_months');
        const recipient = sessionStorage.getItem('premium_pay_recipient') || '';
        const amount = sessionStorage.getItem('premium_pay_amount');
        if (months && amount) {
            sessionStorage.removeItem('premium_pay_months');
            sessionStorage.removeItem('premium_pay_recipient');
            sessionStorage.removeItem('premium_pay_amount');
            currentPurchase = {
                type: 'premium',
                amount: parseFloat(amount),
                login: recipient || null,
                productId: null,
                productName: 'Premium ' + months + ' мес.'
            };
            if (typeof history.replaceState === 'function') {
                history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
            }
            setTimeout(function() {
                if (typeof showPaymentMethodSelection === 'function') {
                    showPaymentMethodSelection('premium');
                }
            }, 300);
        }
    }
    
    console.log('Магазин инициализирован. Баланс RUB:', window.userData?.currencies?.RUB);
});

// When user returns to the mini app (tab becomes visible), restore pending payment popup again.
document.addEventListener('visibilitychange', function() {
    try {
        if (document.visibilityState === 'visible') {
            var popup = document.getElementById('paymentWaitingPopup');
            var active = popup && popup.classList && popup.classList.contains('active');
            if (!active) restorePendingPaymentToUI('visibilitychange');
        }
    } catch (e) {}
});

// Инициализация пользователя
function initializeUserData() {
    console.log('Инициализация данных пользователя...');
    
    // Сначала получаем ID пользователя
    let userId = null;
    
    // Проверяем Telegram Web App
    if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        userId = user.id;
        window.userData.id = userId;
        window.userData.username = user.username || '';
        window.userData.firstName = user.first_name || '';
        window.userData.lastName = user.last_name || '';
        window.userData.photoUrl = user.photo_url || null;
        
        console.log('Пользователь из Telegram:', userId);
    } else {
        // Для тестирования вне Telegram - используем ФИКСИРОВАННЫЙ ID
        userId = 'test_user_default';
        window.userData.id = String(userId);
        window.userData.username = 'test_user';
        window.userData.firstName = 'Тестовый';
        window.userData.lastName = 'Пользователь';
        
        console.log('✅ Тестовый пользователь с фиксированным ID:', userId);
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что ID всегда строка
    if (window.userData.id) {
        window.userData.id = String(window.userData.id);
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Загружаем баланс из ФИКСИРОВАННОГО ключа ПЕРВЫМ ДЕЛОМ
    let savedBalance = 0;
    try {
        const db = window.Database || Database;
        if (db && typeof db.getBalanceFixed === 'function') {
            savedBalance = db.getBalanceFixed('RUB');
            console.log('✅ Баланс из фиксированного ключа (через Database):', savedBalance);
        } else {
            // Прямая проверка localStorage
            const balanceKey = 'jetstore_balance_fixed';
            const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            savedBalance = balanceData.RUB || 0;
            console.log('✅ Баланс из localStorage (фиксированный ключ, прямое чтение):', savedBalance);
        }
    } catch (e) {
        console.warn('⚠️ Ошибка загрузки баланса из фиксированного ключа:', e);
        // Пытаемся загрузить напрямую
        try {
            const balanceKey = 'jetstore_balance_fixed';
            const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            savedBalance = balanceData.RUB || 0;
            console.log('✅ Баланс загружен напрямую из localStorage:', savedBalance);
        } catch (e2) {
            console.error('❌ Критическая ошибка загрузки баланса:', e2);
        }
    }
    
    // ВАЖНО: Сначала загружаем данные из базы данных
    const db = window.Database || Database;
    if (db && typeof db.getUser === 'function' && userId) {
        const savedUser = db.getUser(userId);
        
        if (savedUser) {
            console.log('✅ Найден сохраненный пользователь, загружаем данные из базы...');
            
            // ВАЖНО: Полностью перезаписываем window.userData данными из базы
            // Сохраняем только актуальные данные из Telegram (имя, фото и т.д.)
            const telegramData = {
                username: window.userData.username,
                firstName: window.userData.firstName,
                lastName: window.userData.lastName,
                photoUrl: window.userData.photoUrl
            };
            
            // Объединяем: база данных имеет приоритет, но обновляем актуальные данные из Telegram
            window.userData = {
                ...savedUser,
                ...telegramData,
                // КРИТИЧЕСКИ ВАЖНО: баланс из фиксированного ключа (приоритет)
                currencies: {
                    RUB: savedBalance || savedUser.currencies?.RUB || 0,
                    USDT: savedUser.currencies?.USDT || 0,
                    USD: savedUser.currencies?.USD || 0,
                    EUR: savedUser.currencies?.EUR || 0
                },
                // Сохраняем другие важные данные из базы
                purchases: savedUser.purchases || [],
                transactions: savedUser.transactions || [],
                referrals: savedUser.referrals || { count: 0, earnings: 0, list: [] },
                registrationDate: savedUser.registrationDate || new Date().toLocaleDateString('ru-RU'),
                // Сохраняем ID из базы
                id: savedUser.id || userId
            };
            console.log('✅ Данные загружены из базы. Баланс RUB (из фиксированного ключа):', window.userData.currencies.RUB);
        } else {
            console.log('🆕 Новый пользователь, создаем запись в базе...');
            // Для нового пользователя используем баланс из фиксированного ключа
            if (!window.userData.currencies) {
                window.userData.currencies = {
                    RUB: (savedBalance !== undefined && savedBalance !== null) ? savedBalance : 0,
                    USDT: 0,
                    USD: 0,
                    EUR: 0
                };
            } else {
                window.userData.currencies.RUB = (savedBalance !== undefined && savedBalance !== null) ? savedBalance : (window.userData.currencies.RUB ?? 0);
            }
            
            // Сохраняем начальный баланс в фиксированный ключ
            const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
            if (db && typeof db.saveBalanceFixed === 'function' && (savedBalance === undefined || savedBalance === null)) {
                db.saveBalanceFixed('RUB', window.userData.currencies.RUB ?? 0);
            }
            // Для нового пользователя устанавливаем дату регистрации
            if (!window.userData.registrationDate) {
                window.userData.registrationDate = new Date().toLocaleDateString('ru-RU');
            }
            // Инициализируем дополнительные поля
            if (!window.userData.purchases) {
                window.userData.purchases = [];
            }
            if (!window.userData.transactions) {
                window.userData.transactions = [];
            }
            if (!window.userData.referrals) {
                window.userData.referrals = { count: 0, earnings: 0, list: [] };
            }
            console.log('🆕 Начальный баланс для нового пользователя:', window.userData.currencies.RUB);
        }
        
        // Сохраняем пользователя в базу данных (обновляем или создаем)
        saveUserToDatabase();
    }
    
    // Обновляем отображение
    updateUserDisplay();
    updateBalanceDisplay();
}

// Сохраняем пользователя в базу данных
function saveUserToDatabase() {
    const db = window.Database || Database;
    if (db && typeof db.saveUser === 'function' && window.userData.id) {
        // Убеждаемся, что currencies инициализированы
        if (!window.userData.currencies) {
            window.userData.currencies = {
                RUB: window.userData.currencies?.RUB || 0,
                USDT: window.userData.currencies?.USDT || 0,
                USD: window.userData.currencies?.USD || 0,
                EUR: window.userData.currencies?.EUR || 0
            };
        }
        
        // Сохраняем пользователя (обновляем или создаем)
        const success = db.saveUser(window.userData);
        if (success) {
            console.log('✅ Пользователь сохранен в базу данных. Баланс RUB:', window.userData.currencies.RUB);
            
            // Проверяем сохранение
            if (typeof db.getUser === 'function') {
                const checkUser = db.getUser(window.userData.id);
                if (checkUser && checkUser.currencies && checkUser.currencies.RUB === window.userData.currencies.RUB) {
                    console.log('✅✅✅ ПРОВЕРКА: Баланс успешно сохранен и проверен!');
                } else {
                    console.error('❌❌❌ ПРОВЕРКА: Баланс не совпадает после сохранения!');
                }
            }
        } else {
            console.error('❌ Ошибка сохранения пользователя в базу данных');
        }
    } else {
        console.warn('⚠️ Невозможно сохранить: Database не определен или нет ID пользователя');
        console.warn('window.userData.id:', window.userData?.id);
        console.warn('typeof Database:', typeof Database);
        console.warn('typeof window.Database:', typeof window.Database);
        if (db) {
            console.warn('Доступные методы Database:', Object.keys(db));
        }
    }
}

// Обновление отображения пользователя
function updateUserDisplay() {
    // Обновляем аватар в старом меню
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
        if (window.userData.photoUrl) {
            userAvatar.innerHTML = `<img src="${window.userData.photoUrl}" alt="Avatar">`;
        } else if (window.userData.firstName) {
            userAvatar.textContent = window.userData.firstName[0].toUpperCase();
        } else {
            userAvatar.textContent = '👤';
        }
    }
    
    // Обновляем магазин звёзд
    updateStoreDisplay();
}

// Обновление отображения магазина звёзд
function updateStoreDisplay() {
    // КРИТИЧЕСКИ ВАЖНО: Загружаем баланс из фиксированного ключа перед отображением
    const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    let currentBalance = 0;
    
    if (db && typeof db.getBalanceFixed === 'function') {
        currentBalance = db.getBalanceFixed('RUB') || 0;
    } else {
        try {
            const balanceKey = 'jetstore_balance_fixed';
            const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            currentBalance = balanceData.RUB || 0;
        } catch (e) {
            console.warn('⚠️ Ошибка загрузки баланса:', e);
        }
    }
    
    // Обновляем window.userData
    if (!window.userData) {
        window.userData = { currencies: { RUB: 0 } };
    }
    if (!window.userData.currencies) {
        window.userData.currencies = { RUB: 0 };
    }
    window.userData.currencies.RUB = currentBalance;
    
    // Логотип в шапке магазина
    const storeAvatar = document.getElementById('storeUserAvatar');
    if (storeAvatar) {
        storeAvatar.innerHTML = `<img src="assets/jet-logo.png" alt="JET" style="width:100%;height:100%;object-fit:contain;">`;
    }
    
    // Имя пользователя
    const storeName = document.getElementById('storeUserName');
    if (storeName) {
        storeName.textContent = "JET";
    }
    
    // Обновляем кнопку продолжить
    updateContinueButton();
}

// ==================== МАГАЗИН ЗВЁЗД ====================
// Выбранные звёзды, премиум и TON
let selectedStars = { amount: 0, price: 0 };
let selectedPremium = { months: 0, price: 0 };
let selectedTon = 0;
let selectedTonNetwork = '';

// Загрузка курса 1 звезды из localStorage
function getStarRate() {
    try {
        const rate = parseFloat(localStorage.getItem('jetstore_star_rate'));
        return rate && !isNaN(rate) ? rate : 1.37;
    } catch (error) {
        console.error('Ошибка загрузки курса 1 звезды:', error);
        return 1.37;
    }
}

// Курс скупки 1 звезды (для продажи)
function getStarBuyRate() {
    try {
        const rate = parseFloat(localStorage.getItem('jetstore_star_buy_rate') || '0.65');
        return rate && !isNaN(rate) ? rate : 0.65;
    } catch (error) {
        console.error('Ошибка загрузки курса скупки звезды:', error);
        return 0.65;
    }
}
// Курс TON (1 TON = X RUB) — из /api/ton-rate или localStorage (тот же источник, что в конфиге)
function getTonToRubRate() {
    try {
        var cr = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}');
        var rate = cr.TON ? parseFloat(cr.TON) : null;
        if (!rate || isNaN(rate)) {
            var db = window.Database;
            if (db && typeof db.getCurrencyRates === 'function') {
                var r = db.getCurrencyRates();
                rate = r && r.TON ? parseFloat(r.TON) : null;
            }
        }
        return (rate && !isNaN(rate) && rate > 0) ? rate : 600;
    } catch (e) { return 600; }
}

// Курс пополнения Steam (множитель: сколько платит пользователь за 1₽ пополнения)
// Например, при значении 1.05 за пополнение 100₽ клиент платит 105₽.
function getSteamTopupRate(currencyCode) {
    const code = (currencyCode || '').toUpperCase() || 'RUB';
    try {
        // Новый формат: ключи по валютам
        const perCur = parseFloat(localStorage.getItem('jetstore_steam_rate_' + code));
        if (perCur && !isNaN(perCur) && perCur > 0) return perCur;

        // Fallback на старый ключ (используем как RUB по умолчанию)
        const legacy = parseFloat(localStorage.getItem('jetstore_steam_rate'));
        if (legacy && !isNaN(legacy) && legacy > 0) return legacy;
        return 1;
    } catch (e) {
        return 1;
    }
}

function updateSteamTopupRateText() {
    try {
        const rateEl = document.getElementById('steamTopupRateText');
        if (!rateEl) return;

        const code = (typeof currentSteamCurrency === 'string' && currentSteamCurrency) ? currentSteamCurrency : 'RUB';
        const r = (typeof getSteamTopupRate === 'function' ? getSteamTopupRate(code) : 1) || 1;

        // Курс отображаем только в рублях, без знаков тенге/гривны
        rateEl.textContent = `Текущий курс: ${r.toFixed(2)} ₽ за 1 единицу пополнения на Steam`;
    } catch (e) {}
}

// Добавление записи в историю покупок (для профиля)
function addPurchaseHistoryEntry(entry) {
    try {
        const baseEntry = {
            id: entry.id || ('ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)),
            status: entry.status || 'успешно',
            date: entry.date || new Date().toISOString()
        };
        const full = Object.assign({}, entry, baseEntry);

        let purchases = [];
        try {
            purchases = JSON.parse(localStorage.getItem('jetstore_purchases') || '[]');
        } catch (e) {
            purchases = [];
        }
        purchases.unshift(full);
        localStorage.setItem('jetstore_purchases', JSON.stringify(purchases));

        try {
            if (window.userData) {
                if (!Array.isArray(window.userData.purchases)) window.userData.purchases = [];
                window.userData.purchases.push(full);
            }
        } catch (e) {
            console.warn('addPurchaseHistoryEntry userData error:', e);
        }
    } catch (e) {
        console.error('Ошибка добавления в историю покупок:', e);
    }
}

// Курс USDT (1 USDT = X RUB) из админки
function getUsdtRate() {
    try {
        var rate = parseFloat(localStorage.getItem('jetstore_usdt_rate'));
        if (!rate || isNaN(rate)) {
            var cr = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}');
            rate = cr.USDT;
        }
        if (!rate || isNaN(rate)) {
            var db = window.Database;
            if (db && typeof db.getCurrencyRates === 'function') {
                var r = db.getCurrencyRates();
                rate = r && r.USDT ? r.USDT : null;
            }
        }
        return (rate && !isNaN(rate)) ? rate : 80;
    } catch (e) { return 80; }
}

// Загрузка курса USD из админки / настроек
function getUsdRate() {
    try {
        const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
        if (db && typeof db.getCurrencyRates === 'function') {
            const rates = db.getCurrencyRates();
            if (rates && rates.USD) return rates.USD;
        }
        // Пытаемся загрузить из локальных настроек
        const settingsStr = localStorage.getItem('jetStoreAdminSettings');
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            if (settings?.currencyRates?.USD) return settings.currencyRates.USD;
            if (settings?.USD) return settings.USD;
        }
    } catch (error) {
        console.error('Ошибка загрузки курса USD:', error);
    }
    // Значение по умолчанию
    return 90;
}

// Загрузка цен на звёзды из localStorage
function getStarsPrices() {
    try {
        const prices = JSON.parse(localStorage.getItem('jetstore_stars_prices') || '{}');
        return {
            50: prices[50] || 69,
            100: prices[100] || 137,
            250: prices[250] || 343,
            500: prices[500] || 685,
            1000: prices[1000] || 1370
        };
    } catch (error) {
        console.error('Ошибка загрузки цен на звёзды:', error);
        return { 50: 69, 100: 137, 250: 343, 500: 685, 1000: 1370 };
    }
}

// Загрузка цен на Premium из localStorage
function getPremiumPrices() {
    try {
        const prices = JSON.parse(localStorage.getItem('jetstore_premium_prices') || '{}');
        return {
            3: prices[3] || 983,
            6: prices[6] || 1311,
            12: prices[12] || 2377
        };
    } catch (error) {
        console.error('Ошибка загрузки цен на Premium:', error);
        return { 3: 983, 6: 1311, 12: 2377 };
    }
}

// Обновление цен в HTML
function updatePricesDisplay() {
    const starsPrices = getStarsPrices();
    const premiumPrices = getPremiumPrices();
    const starRate = getStarRate();
    const usdRate = getUsdRate();
    
    // Обновляем отображение курса 1 звезды
    const starRateDisplay = document.getElementById('starRateDisplay');
    if (starRateDisplay) {
        starRateDisplay.textContent = `1 звезда = ${starRate}₽`;
    }
    
    // Обновляем цены на звёзды
    const starCards = document.querySelectorAll('.star-card');
    starCards.forEach(card => {
        const amount = parseInt(card.getAttribute('data-amount'));
        if (amount && starsPrices[amount]) {
            const priceEl = card.querySelector('.star-card-price');
            if (priceEl) {
                const price = starsPrices[amount];
                if (price >= 1000) {
                    priceEl.textContent = price.toLocaleString('ru-RU') + ' ₽';
                } else {
                    priceEl.textContent = price + ' ₽';
                }
            }
        }
    });
    
    // Обновляем цены на Premium (обычные карточки)
    const premiumCards = document.querySelectorAll('.premium-card');
    premiumCards.forEach(card => {
        const months = parseInt(card.getAttribute('data-months'));
        if (months && premiumPrices[months]) {
            const priceRubEl = card.querySelector('.premium-price-rub');
            const priceUsdEl = card.querySelector('.premium-price-usd');
            const price = premiumPrices[months];
            if (priceRubEl) {
                priceRubEl.textContent = price.toLocaleString('ru-RU') + ' ₽';
            }
            if (priceUsdEl && usdRate) {
                const usdValue = (price / usdRate).toFixed(2);
                priceUsdEl.textContent = `${usdValue} $`;
            }
        }
    });
    
    // Обновляем цены на Premium в попапе (компактные карточки)
    const premiumCardsCompact = document.querySelectorAll('.premium-card-compact');
    premiumCardsCompact.forEach(card => {
        const months = parseInt(card.getAttribute('data-months'));
        if (months && premiumPrices[months]) {
            const priceRubEl = card.querySelector('.premium-price-rub');
            const priceUsdEl = card.querySelector('.premium-price-usd');
            const price = premiumPrices[months];
            if (priceRubEl) {
                priceRubEl.textContent = price.toLocaleString('ru-RU') + ' ₽';
            }
            if (priceUsdEl && usdRate) {
                const usdValue = (price / usdRate).toFixed(2);
                priceUsdEl.textContent = `${usdValue} $`;
            }
        }
    });
}

// Переключение вкладок магазина
function switchStoreTab(tab) {
    // Убираем активный класс у всех вкладок
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.store-section').forEach(s => s.classList.remove('active'));
    
    // Активируем выбранную вкладку
    const tabBtn = document.querySelector('.store-tab[data-tab="' + tab + '"]');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else if (tabBtn) {
        tabBtn.classList.add('active');
    } else {
        document.querySelectorAll('.store-tab').forEach(btn => {
            if (btn.textContent.includes(tab === 'stars' ? 'Звёзды' : 'Рейтинг')) btn.classList.add('active');
        });
    }
    
    // Показываем секцию
    const sectionId = tab + 'Section';
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
    
    // Обновляем индикаторы
    const dots = document.querySelectorAll('.page-dot');
    dots.forEach((dot, index) => dot.classList.remove('active'));
    if (tab === 'stars') dots[0]?.classList.add('active');
    if (tab === 'rating') dots[1]?.classList.add('active');
    
    // Обновляем цены при переключении
    updatePricesDisplay();
}

// Выбор количества звёзд (новая версия с загрузкой цены)
function selectStarsByAmount(amount) {
    const starsPrices = getStarsPrices();
    const price = starsPrices[amount] || 0;
    
    selectedStars = { amount, price };
    
    // Убираем выделение со всех карточек
    document.querySelectorAll('.star-card').forEach(card => card.classList.remove('selected'));
    
    // Выделяем выбранную карточку
    event.currentTarget.classList.add('selected');
    
    // Очищаем поле своего количества
    const customInput = document.getElementById('customStarsAmount');
    if (customInput) customInput.value = '';
    
    // Обновляем кнопку
    updateContinueButton();
}

// Выбор количества звёзд (старая версия для совместимости)
function selectStars(amount, price) {
    selectedStars = { amount, price };
    
    // Убираем выделение со всех карточек
    document.querySelectorAll('.star-card').forEach(card => card.classList.remove('selected'));
    
    // Выделяем выбранную карточку
    event.currentTarget.classList.add('selected');
    
    // Очищаем поле своего количества
    const customInput = document.getElementById('customStarsAmount');
    if (customInput) customInput.value = '';
    
    // Обновляем кнопку
    updateContinueButton();
}

// Расчёт своего количества звёзд
function calculateCustomStars() {
    const input = document.getElementById('customStarsAmount');
    const amount = parseInt(input?.value) || 0;
    
    if (amount >= 50) {
        // Базовая цена (используем динамический курс)
        const starRate = getStarRate();
        let price = Math.round(amount * starRate);
        
        // Применяем скидки
        if (amount >= 15000) {
            price = Math.round(price * 0.96); // -4%
        } else if (amount >= 8000) {
            price = Math.round(price * 0.97); // -3%
        } else if (amount >= 4000) {
            price = Math.round(price * 0.98); // -2%
        }
        
        selectedStars = { amount, price };
        
        // Убираем выделение с карточек
        document.querySelectorAll('.star-card').forEach(card => card.classList.remove('selected'));
    } else {
        selectedStars = { amount: 0, price: 0 };
    }
    
    updateContinueButton();
}

// Выбор премиума (новая версия с загрузкой цены)
function selectPremiumByMonths(months) {
    const premiumPrices = getPremiumPrices();
    const price = premiumPrices[months] || 0;
    
    selectedPremium = { months, price };
    
    // Убираем выделение со всех карточек
    document.querySelectorAll('.premium-card').forEach(card => card.classList.remove('selected'));
    
    // Выделяем выбранную карточку
    event.currentTarget.classList.add('selected');
    
    // Обновляем кнопку
    updatePremiumButton();
}

// Выбор премиума (старая версия для совместимости)
function selectPremium(months, price) {
    selectedPremium = { months, price };
    
    // Убираем выделение со всех карточек
    document.querySelectorAll('.premium-card').forEach(card => card.classList.remove('selected'));
    
    // Выделяем выбранную карточку
    event.currentTarget.classList.add('selected');
    
    // Обновляем кнопку
    updatePremiumButton();
}

// Обновление кнопки продолжить для звёзд
function updateContinueButton() {
    const btn = document.getElementById('starsContinueBtn');
    if (!btn) return;
    
    if (selectedStars.amount > 0) {
        btn.textContent = `Оплатить ${selectedStars.amount} ⭐ за ${selectedStars.price.toLocaleString('ru-RU')} ₽`;
        btn.classList.remove('deposit');
        btn.classList.remove('disabled');
        btn.onclick = () => proceedStarsPurchase();
    } else {
        btn.textContent = 'Введите количество звёзд';
        btn.classList.remove('deposit');
        btn.classList.add('disabled');
        btn.onclick = null;
    }
}

// Обновление кнопки продолжить для премиума
function updatePremiumButton() {
    const btn = document.getElementById('premiumContinueBtn');
    if (!btn) return;
    
    if (selectedPremium.months > 0) {
        btn.textContent = `Оплатить Premium ${selectedPremium.months} мес. за ${selectedPremium.price.toLocaleString('ru-RU')} ₽`;
        btn.classList.remove('deposit');
        btn.classList.remove('disabled');
        btn.onclick = () => proceedPremiumPurchase();
    } else {
        btn.textContent = 'Выберите период';
        btn.classList.remove('deposit');
        btn.classList.add('disabled');
        btn.onclick = null;
    }
}

// Покупка звёзд
function proceedStarsPurchase() {
    if (selectedStars.amount < 50) {
        showStoreNotification('Минимум 50 звёзд', 'error');
        return;
    }
    if (selectedStars.amount > 50000) {
        showStoreNotification('Максимум 50 000 звёзд за одну покупку', 'error');
        return;
    }
    
    // Получаем получателя из поля ввода
    const recipientInput = document.getElementById('starsRecipient');
    const recipient = recipientInput ? recipientInput.value.trim() : '';
    
    // Сохраняем данные покупки и открываем выбор способа оплаты
    currentPurchase = {
        type: 'stars',
        amount: selectedStars.price,
        stars_amount: selectedStars.amount,
        login: recipient || null,
        productId: null,
        productName: `Покупка ${selectedStars.amount} звёзд`
    };
    
    showPaymentMethodSelection('stars');
}

// Покупка премиума
function proceedPremiumPurchase() {
    if (selectedPremium.months <= 0) {
        showStoreNotification('Выберите период премиума', 'error');
        return;
    }
    
    // Получаем получателя из поля ввода (если есть)
    const recipientInput = document.getElementById('premiumRecipient') || document.getElementById('premiumPopupRecipient');
    const recipient = recipientInput ? recipientInput.value.trim() : '';
    
    // Сохраняем данные покупки и открываем выбор способа оплаты
    currentPurchase = {
        type: 'premium',
        amount: selectedPremium.price,
        months: selectedPremium.months,
        login: recipient || null,
        productId: null,
        productName: `Premium ${selectedPremium.months} мес.`
    };
    
    showPaymentMethodSelection('premium');
}

// Обновление суммы звёзд из поля ввода (новый дизайн)
// Минимум 50 звёзд, максимум 50 000
function updateStarsAmountFromInput() {
    const input = document.getElementById('starsAmountInput');
    if (!input) return;
    
    let amount = parseInt(input.value || '0', 10) || 0;
    if (amount > 0 && amount < 50) amount = 0; // минимум 50
    if (amount > 50000) {
        amount = 50000;
        input.value = '50000';
    }
    const starRate = getStarRate();
    const usdRate = getUsdRate();
    
    let price = 0;
    if (amount >= 50) {
        price = Math.round(amount * starRate);
    }
    
    selectedStars = { amount, price };
    
    const rubEl = document.getElementById('starsPriceRubDisplay');
    const usdEl = document.getElementById('starsPriceUsdDisplay');
    
    if (rubEl) {
        rubEl.textContent = price.toLocaleString('ru-RU') + ' ₽';
    }
    if (usdEl && usdRate) {
        const usdValue = price > 0 ? (price / usdRate).toFixed(2) : '0.00';
        usdEl.textContent = `${usdValue} $`;
    }
    
    updateContinueButton();
}

// Подстановка собственного юзера в поле получателя
function fillOwnUsername(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    let username = window.userData?.username || window.Telegram?.WebApp?.initDataUnsafe?.user?.username;
    const firstName = window.userData?.firstName || window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name;
    
    if (username) {
        if (!username.startsWith('@')) username = '@' + username;
        input.value = username;
    } else if (firstName) {
        input.value = firstName;
    }
}

// Проверка пользователя по API отключена: только ввод @username, без отображения авы и ника.
function checkTelegramUser(inputId, previewId) {
    return;
}

// Отображение превью пользователя
function showUserPreview(previewId, userData) {
    const preview = document.getElementById(previewId);
    if (!preview) return;
    
    const avatarEl = preview.querySelector('img');
    const nameEl = preview.querySelector('span');
    
    if (avatarEl) {
        avatarEl.src = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.firstName || userData.username)}&background=00d4ff&color=fff&size=128`;
        avatarEl.alt = userData.firstName || userData.username;
    }
    
    if (nameEl) {
        const uname = userData.username ? `@${userData.username}` : '';
        const fname = (userData.firstName || '').trim();
        nameEl.textContent = fname ? `${fname} ${uname}`.trim() : uname;
    }
    
    preview.style.display = 'flex';
}

// Состояния поля получателя в покупке звёзд
function setStarsRecipientState(state, userData) {
    const wrapper = document.getElementById('starsRecipientWrapper');
    const input = document.getElementById('starsRecipient');
    const chip = document.getElementById('starsUserPreview');
    const errorText = document.getElementById('starsUserError');
    const avatarImg = document.getElementById('starsUserAvatar');
    const nameSpan = document.getElementById('starsUserName');

    if (!wrapper || !input || !chip || !errorText) return;

    // Сброс
    wrapper.classList.remove('tg-user-input-error');
    chip.style.display = 'none';
    errorText.style.display = 'none';
    input.style.display = 'block';

    if (state === 'empty') {
        return;
    }

    if (state === 'loading') {
        if (avatarImg) {
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                userData?.username || ''
            )}&background=00d4ff&color=fff&size=128`;
        }
        if (nameSpan) {
            nameSpan.textContent = 'Поиск пользователя...';
        }
        chip.style.display = 'flex';
        input.style.display = 'none';
        return;
    }

    if (state === 'found' && userData) {
        if (avatarImg) {
            avatarImg.src =
                userData.avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    userData.username || userData.firstName || ''
                )}&background=00d4ff&color=fff&size=128`;
        }
        if (nameSpan) {
            // Показываем "Имя @username" (как в Telegram)
            const uname = userData.username ? `@${userData.username}` : '';
            const fname = (userData.firstName || '').trim();
            nameSpan.textContent = fname ? `${fname} ${uname}`.trim() : uname;
        }

        chip.style.display = 'flex';
        input.style.display = 'none';
        return;
    }

    if (state === 'not_found') {
        wrapper.classList.add('tg-user-input-error');
        errorText.style.display = 'block';
    }
}

function clearStarsRecipient() {
    const input = document.getElementById('starsRecipient');
    if (input) {
        input.value = '';
    }
    setStarsRecipientState('empty');
}

function lookupStarsRecipient() {
    const input = document.getElementById('starsRecipient');
    if (!input) return;
    let username = (input.value || '').trim().replace(/^@/, '');
    if (!username) {
        setStarsRecipientState('empty');
        return;
    }
    setStarsRecipientState('loading', { username: username });
    var apiBase = window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var url = (apiBase ? (apiBase.replace(/\/$/, '') + '/api/telegram/user?username=' + encodeURIComponent(username)) : '');
    if (!url) {
        setStarsRecipientState('found', { username: username, firstName: username });
        return;
    }
    fetch(url)
        .then(function(r) { return r.json().catch(function() { return null; }); })
        .then(function(data) {
            if (data && (data.username || data.firstName)) {
                setStarsRecipientState('found', data);
            } else {
                setStarsRecipientState('not_found');
            }
        })
        .catch(function() { setStarsRecipientState('not_found'); });
}

function setPremiumRecipientState(state, userData) {
    var wrapper = document.getElementById('premiumRecipientWrapper');
    var input = document.getElementById('premiumRecipient');
    var chip = document.getElementById('premiumUserPreview');
    var errorText = document.getElementById('premiumUserError');
    var avatarImg = document.getElementById('premiumUserAvatar');
    var nameSpan = document.getElementById('premiumUserName');
    if (!wrapper || !input || !chip || !errorText) return;
    wrapper.classList.remove('tg-user-input-error');
    chip.style.display = 'none';
    errorText.style.display = 'none';
    input.style.display = 'block';
    if (state === 'empty') return;
    if (state === 'loading') {
        if (avatarImg) avatarImg.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userData?.username || '') + '&background=00d4ff&color=fff&size=128';
        if (nameSpan) nameSpan.textContent = 'Поиск пользователя...';
        chip.style.display = 'flex';
        input.style.display = 'none';
        return;
    }
    if (state === 'found' && userData) {
        if (avatarImg) avatarImg.src = userData.avatar || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(userData.username || userData.firstName || '') + '&background=00d4ff&color=fff&size=128');
        if (nameSpan) {
            var uname = userData.username ? '@' + userData.username : '';
            var fname = (userData.firstName || '').trim();
            nameSpan.textContent = fname ? (fname + ' ' + uname).trim() : uname;
        }
        chip.style.display = 'flex';
        input.style.display = 'none';
        return;
    }
    if (state === 'not_found') {
        wrapper.classList.add('tg-user-input-error');
        errorText.style.display = 'block';
    }
}

function clearPremiumRecipient() {
    var input = document.getElementById('premiumRecipient');
    if (input) input.value = '';
    setPremiumRecipientState('empty');
}

function lookupPremiumRecipient() {
    var input = document.getElementById('premiumRecipient');
    if (!input) return;
    var username = (input.value || '').trim().replace(/^@/, '');
    if (!username) {
        setPremiumRecipientState('empty');
        return;
    }
    setPremiumRecipientState('loading', { username: username });
    var apiBase = window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var url = apiBase ? (apiBase.replace(/\/$/, '') + '/api/telegram/user?username=' + encodeURIComponent(username)) : '';
    if (!url) {
        setPremiumRecipientState('found', { username: username, firstName: username });
        return;
    }
    fetch(url)
        .then(function(r) { return r.json().catch(function() { return null; }); })
        .then(function(data) {
            if (data && (data.username || data.firstName)) {
                setPremiumRecipientState('found', data);
            } else {
                setPremiumRecipientState('not_found');
            }
        })
        .catch(function() { setPremiumRecipientState('not_found'); });
}

// Уведомления в магазине
function showStoreNotification(message, type = 'info') {
    const oldNotification = document.querySelector('.store-notification');
    if (oldNotification) oldNotification.remove();
    
    const bgColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#ff4757' : '#667eea';
    
    const notification = document.createElement('div');
    notification.className = 'store-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 16px;
        border-radius: 12px;
        z-index: 10000;
        box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        text-align: center;
        font-weight: 600;
        animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Обновление отображения баланса
function updateBalanceDisplay() {
    // КРИТИЧЕСКИ ВАЖНО: Загружаем баланс из фиксированного ключа перед отображением
    const db = window.Database || Database;
    if (db && typeof db.getBalanceFixed === 'function') {
        const savedBalance = db.getBalanceFixed('RUB');
        if (savedBalance !== undefined && savedBalance !== null && savedBalance !== window.userData.currencies.RUB) {
            window.userData.currencies.RUB = savedBalance;
            console.log('✅ Баланс обновлен из фиксированного ключа:', savedBalance);
        }
    } else {
        // Прямая загрузка из localStorage
        try {
            const balanceKey = 'jetstore_balance_fixed';
            const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            if (balanceData.RUB !== undefined && balanceData.RUB !== window.userData.currencies.RUB) {
                window.userData.currencies.RUB = balanceData.RUB;
                console.log('✅ Баланс обновлен напрямую из localStorage:', balanceData.RUB);
            }
        } catch (e) {
            console.warn('⚠️ Ошибка прямой загрузки баланса:', e);
        }
    }
    
    const balanceElement = document.getElementById('balance');
    if (balanceElement) {
        const activeBalance = window.userData.currencies[window.userData.activeCurrency] || 0;
        balanceElement.innerHTML = `
            <span class="balance-amount">${activeBalance.toFixed(2)}</span>
            <span class="currency-symbol">${getCurrencySymbol(window.userData.activeCurrency)}</span>
        `;
    }
}

// Получение символа валюты
function getCurrencySymbol(currency) {
    const symbols = {
        'RUB': '₽',
        'USDT': 'USDT',
        'USD': '$',
        'EUR': '€'
    };
    return symbols[currency] || currency;
}

// Переключение разделов
function showSection(sectionId) {
    console.log('Переключение на раздел:', sectionId);
    
    // Скрываем все разделы
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Убираем активный класс у кнопок навигации
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показываем выбранный раздел
    const targetSection = document.getElementById(`${sectionId}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Активируем соответствующую кнопку навигации
    const activeNavBtn = document.querySelector(`.nav-btn[onclick*="${sectionId}"]`);
    if (activeNavBtn) {
        activeNavBtn.classList.add('active');
    }
    
    currentSection = sectionId;
    
    // Загружаем товары для раздела
    loadProductsForSection(sectionId);
}

// Загрузка товаров для раздела
function loadProductsForSection(sectionId) {
    console.log('Загрузка товаров для раздела:', sectionId);
    
    // Определяем ID контейнера для товаров
    let containerId = '';
    let category = '';
    
    switch(sectionId) {
        case 'telegram':
            containerId = 'telegram-products';
            category = 'telegram';
            break;
        case 'steam':
            containerId = 'steam-products';
            category = 'steam';
            break;
        case 'games':
            containerId = 'games-products';
            category = 'games';
            break;
        case 'all':
            containerId = 'all-products';
            category = 'all';
            break;
        default:
            return;
    }
    
    const productsContainer = document.getElementById(containerId);
    if (!productsContainer) {
        console.error('Контейнер не найден:', containerId);
        return;
    }
    
    // Загружаем товары из базы данных
    const db = window.Database;
    if (db && typeof db.getProducts === 'function') {
        let products = [];
        
        if (category === 'all') {
            // Для раздела "Все товары" собираем товары из всех категорий
            const allProducts = db.getProducts();
            Object.values(allProducts).forEach(categoryProducts => {
                if (Array.isArray(categoryProducts)) {
                    products = products.concat(categoryProducts);
                }
            });
        } else {
            // Для конкретной категории
            products = (typeof db.getProductsByCategory === 'function' ? db.getProductsByCategory(category) : []) || [];
        }
        
        console.log('Загружено товаров:', products.length, 'для категории:', category);
        
        if (products.length === 0) {
            productsContainer.innerHTML = `
                <div class="empty-products">
                    <i class="fas fa-box-open"></i>
                    <p>Товары пока не добавлены</p>
                    <p style="font-size: 0.9rem; color: #666;">Администратор скоро добавит товары</p>
                </div>
            `;
            return;
        }
        
        // Отображаем товары
        productsContainer.innerHTML = products.map(product => `
            <div class="product-card">
                <div class="product-badge ${category}">${product.badge || category}</div>
                <div class="product-image ${category}-img">
                    <i class="${product.icon || 'fas fa-box'}"></i>
                </div>
                <h3>${product.name || 'Товар'}</h3>
                <p class="product-desc">${product.description || 'Описание товара'}</p>
                <div class="product-price">
                    <i class="fas fa-ruble-sign"></i>
                    <span>${product.price || 0} ₽</span>
                </div>
                <button class="buy-btn" onclick="buyProduct('${product.id}', '${product.name}', ${product.price}, '${category}')">
                    <i class="fas fa-shopping-cart"></i> Купить
                </button>
            </div>
        `).join('');
    } else {
        console.error('База данных не загружена');
        productsContainer.innerHTML = `
            <div class="empty-products">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки товаров</p>
            </div>
        `;
    }
}

// Покупка товара
function buyProduct(productId, productName, price, category) {
    console.log('Покупка товара:', productName, 'цена:', price, 'руб.');
    
    // Проверяем баланс в рублях
    if (window.userData.currencies.RUB < price) {
        alert('❌ Недостаточно средств на балансе!');
        return;
    }
    
    // Обновляем попап
    document.getElementById('popupProductName').textContent = productName;
    document.getElementById('popupProductPrice').textContent = `${price} ₽`;
    document.getElementById('popupBalance').textContent = `${window.userData.currencies.RUB.toFixed(2)} ₽`;
    document.getElementById('popupMessage').textContent = 
        `Вы уверены, что хотите купить "${productName}"?`;
    
    // Сохраняем данные о покупке
    window.currentPurchase = { 
        productId, 
        productName, 
        price, 
        category 
    };
    
    // Показываем попап
    document.getElementById('buyPopup').classList.add('active');
}

// Подтверждение покупки
function confirmPurchase() {
    const { productId, productName, price, category } = window.currentPurchase;
    
    // Проверяем баланс в рублях
    if (window.userData.currencies.RUB >= price) {
        // Убеждаемся, что ID есть
        if (!window.userData.id) {
            const tg = window.Telegram?.WebApp;
            const initData = tg?.initDataUnsafe;
            if (initData?.user?.id) {
                window.userData.id = String(initData.user.id);
            } else {
                window.userData.id = 'test_user_default';
            }
        }
        
        // Списание средств в рублях
        window.userData.currencies.RUB -= price;
        
        // КРИТИЧЕСКИ ВАЖНО: Прямое сохранение в localStorage СРАЗУ
        try {
            const usersKey = 'jetstore_users';
            const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
            
            if (!users[window.userData.id]) {
                users[window.userData.id] = { ...window.userData };
            } else {
                if (!users[window.userData.id].currencies) {
                    users[window.userData.id].currencies = {};
                }
                users[window.userData.id].currencies.RUB = window.userData.currencies.RUB;
            }
            
            localStorage.setItem(usersKey, JSON.stringify(users));
            
            // Проверяем
            const check = JSON.parse(localStorage.getItem(usersKey) || '{}');
            if (check[window.userData.id] && check[window.userData.id].currencies && 
                check[window.userData.id].currencies.RUB === window.userData.currencies.RUB) {
                console.log('✅✅✅ ПРЯМОЕ СОХРАНЕНИЕ при покупке: Баланс сохранен!', window.userData.currencies.RUB);
            }
        } catch (error) {
            console.error('❌ Ошибка прямого сохранения при покупке:', error);
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Прямое сохранение в localStorage СРАЗУ
        try {
            const usersKey = 'jetstore_users';
            const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
            
            if (!window.userData.id) {
                window.userData.id = 'test_user_default';
            }
            
            if (!users[window.userData.id]) {
                users[window.userData.id] = JSON.parse(JSON.stringify(window.userData));
            } else {
                users[window.userData.id].currencies = JSON.parse(JSON.stringify(window.userData.currencies));
                users[window.userData.id].id = window.userData.id;
            }
            
            localStorage.setItem(usersKey, JSON.stringify(users));
            console.log('✅✅✅ ПРЯМОЕ СОХРАНЕНИЕ после покупки: Баланс', window.userData.currencies.RUB);
        } catch (error) {
            console.error('❌ Ошибка прямого сохранения после покупки:', error);
        }
        
        // Также сохраняем через Database (дополнительно)
        const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
        if (db && typeof db.saveBalance === 'function' && window.userData.id) {
            db.saveBalance(window.userData.id, 'RUB', window.userData.currencies.RUB);
            console.log('💾 Баланс сохранен через Database');
        }
        
        // Добавление в историю покупок
        if (!window.userData.purchases) {
            window.userData.purchases = [];
        }
        
        window.userData.purchases.push({
            productId: productId,
            product: productName,
            price: price,
            category: category,
            date: new Date().toLocaleString('ru-RU')
        });
        
        // Сохраняем пользователя в базу данных
        saveUserToDatabase();
        
    // Обновление интерфейса
    updateBalanceDisplay();
    
    // Обновляем профиль в главном меню, если оно открыто
    if (typeof updateMainProfile === 'function') {
        updateMainProfile();
    }
    
    // Закрытие попапа
    closePopup();
    
    // Показ успешного сообщения
    showSuccessMessage(productName, price);
    
    // Отправка данных в бот (если нужно)
    sendPurchaseToBot(productName, price);
    } else {
        alert('❌ Недостаточно средств!');
    }
}

// Показ сообщения об успешной покупке
function showSuccessMessage(productName, price) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; 
                    padding: 15px 25px; border-radius: 10px; z-index: 3000; box-shadow: 0 5px 15px rgba(0,0,0,0.2);">
            <i class="fas fa-check-circle"></i>
            <strong>Покупка успешна!</strong><br>
            ${productName} за ${price} ₽
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Отправка данных о покупке в бота
function sendPurchaseToBot(productName, price) {
    if (tg) {
        const data = {
            action: 'purchase',
            product: productName,
            price: price,
            userId: window.userData.id,
            timestamp: new Date().getTime()
        };
        
        tg.sendData(JSON.stringify(data));
        console.log('Данные о покупке отправлены:', data);
    }
}

// Закрытие попапа
function closePopup() {
    document.getElementById('buyPopup').classList.remove('active');
    window.currentPurchase = null;
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Фильтры товаров
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Поиск товаров
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            console.log('Поиск:', searchTerm);
        });
    }
    
    // Обработка нажатия кнопки "Назад" в Telegram
    if (tg) {
        tg.onEvent('backButtonClicked', function() {
            if (document.getElementById('buyPopup').classList.contains('active')) {
                closePopup();
            } else {
                tg.close();
            }
        });
    }
}

// Функции для взаимодействия с ботом
function sendDataToBot(data) {
    if (tg) {
        tg.sendData(JSON.stringify(data));
    }
}

// Добавляем CSS для пустых товаров
const style = document.createElement('style');
style.textContent = `
    .empty-products {
        text-align: center;
        padding: 40px 20px;
        color: #666;
        grid-column: 1 / -1;
    }
    
    .empty-products i {
        font-size: 3rem;
        color: #667eea;
        margin-bottom: 15px;
    }
    
    .empty-products p {
        margin-bottom: 10px;
    }
`;
document.head.appendChild(style);

function goToHistory() {
    window.location.href = 'profile.html';
}

window.goToHistory = goToHistory;

// Экспортируем функции для использования в других файлах
window.getUserData = function() {
    return window.userData;
};

window.updateBalanceDisplay = updateBalanceDisplay;
window.getCurrencySymbol = getCurrencySymbol;

// Экспортируем функции магазина звёзд
window.switchStoreTab = switchStoreTab;
window.selectStars = selectStars;
window.selectStarsByAmount = selectStarsByAmount;
window.calculateCustomStars = calculateCustomStars;
window.selectPremium = selectPremium;
// Открытие попапа Premium
function openPremiumPopup() {
    const popup = document.getElementById('premiumPopup');
    if (!popup) return;
    
    // Сбрасываем выбор
    selectedPremium = { months: 0, price: 0 };
    document.querySelectorAll('.premium-card-compact').forEach(card => card.classList.remove('selected'));
    
    // Загружаем цены
    updatePricesDisplay();
    
    popup.classList.add('active');
}

// Закрытие попапа Premium
function closePremiumPopup() {
    const popup = document.getElementById('premiumPopup');
    if (popup) popup.classList.remove('active');
    
    // Возвращаем на главный экран
    if (typeof showMainMenuView === 'function') {
        showMainMenuView();
    }
}

// Выбор премиума в попапе
function selectPremiumByMonthsPopup(months) {
    const premiumPrices = getPremiumPrices();
    const price = premiumPrices[months] || 0;
    
    selectedPremium = { months, price };
    
    // Убираем выделение со всех карточек
    document.querySelectorAll('.premium-card-compact').forEach(card => card.classList.remove('selected'));
    
    // Выделяем выбранную карточку
    event.currentTarget.classList.add('selected');
    
    // Обновляем кнопку
    updatePremiumPopupButton();
}

// Обновление кнопки в попапе Premium
function updatePremiumPopupButton() {
    const btn = document.getElementById('premiumPopupContinueBtn');
    if (!btn) return;
    
    if (selectedPremium.months > 0) {
        btn.textContent = `Оплатить Premium ${selectedPremium.months} мес. за ${selectedPremium.price.toLocaleString('ru-RU')} ₽`;
        btn.classList.remove('disabled');
        btn.style.opacity = '1';
    } else {
        btn.textContent = 'Выберите период';
        btn.classList.add('disabled');
        btn.style.opacity = '0.6';
    }
}

// Покупка премиума из попапа
function proceedPremiumPurchaseFromPopup() {
    if (selectedPremium.months <= 0) {
        showStoreNotification('Выберите период Premium', 'error');
        return;
    }
    
    // Сохраняем данные покупки и открываем выбор способа оплаты
    currentPurchase = {
        type: 'premium',
        amount: selectedPremium.price,
        months: selectedPremium.months,
        login: document.getElementById('premiumPopupRecipient')?.value || '',
        productId: null,
        productName: `Premium ${selectedPremium.months} мес.`
    };
    
    closePremiumPopup();
    showPaymentMethodSelection('premium');
}

// ====== Покупка TON ======

// Обновление суммы TON из поля ввода
function updateTonAmountFromInput() {
    const input = document.getElementById('tonAmountInput');
    if (!input) return;
    
    const raw = input.value || '';
    let amount = parseInt(raw, 10);
    if (isNaN(amount) || amount <= 0) {
        // позволяем пользователю вводить число по частям; пока невалидно — просто не трогаем selectedTon
        selectedTon = 0;
        updateTonContinueButton();
        return;
    }
    if (amount > 200) {
        amount = 200;
        input.value = String(amount);
    }
    // Минимум 1 TON для покупки, но не мешаем вводу; просто считаем selectedTon валидным только от 1
    selectedTon = (amount >= 1 && amount <= 200) ? amount : 0;
    
    updateTonContinueButton();
}

// Обновление состояния кнопки "Оплатить" для TON
function updateTonContinueButton() {
    const btn = document.getElementById('tonContinueBtn');
    if (!btn) return;
    
    const wallet = (document.getElementById('tonWalletAddress')?.value || '').trim();
    const network = (document.getElementById('tonNetwork')?.value || '').trim() || selectedTonNetwork;
    const ok = selectedTon >= 1 && selectedTon <= 200 && wallet.length > 0 && (network || '').length > 0;
    
    if (ok) {
        const rate = (typeof getTonToRubRate === 'function' ? getTonToRubRate() : 600) || 600;
        const rub = Math.round(selectedTon * rate * 100) / 100;
        btn.textContent = `Оплатить ${rub.toLocaleString('ru-RU')} ₽`;
        btn.classList.remove('disabled');
        btn.style.opacity = '1';
    } else {
        btn.textContent = 'Заполните данные (1–200 TON)';
        btn.classList.add('disabled');
        btn.style.opacity = '0.6';
    }
}

// Открытие окна покупки TON
function openTonPopup() {
    const popup = document.getElementById('tonPopup');
    if (!popup) return;
    
    selectedTon = 0;
    const amountInput = document.getElementById('tonAmountInput');
    if (amountInput) amountInput.value = '';

    const walletInput = document.getElementById('tonWalletAddress');
    if (walletInput) walletInput.value = '';
    const netHidden = document.getElementById('tonNetwork');
    if (netHidden) netHidden.value = '';
    selectedTonNetwork = '';
    document.querySelectorAll('.ton-network-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    
    const preview = document.getElementById('tonUserPreview');
    if (preview) preview.style.display = 'none';
    
    updateTonContinueButton();
    popup.classList.add('active');
}

function selectTonNetwork(networkCode) {
    selectedTonNetwork = networkCode || '';
    const hidden = document.getElementById('tonNetwork');
    if (hidden) hidden.value = selectedTonNetwork;
    document.querySelectorAll('.ton-network-btn').forEach(function(btn) {
        const val = btn.getAttribute('data-network');
        btn.classList.toggle('active', val === selectedTonNetwork);
    });
    updateTonContinueButton();
}

// Закрытие окна покупки TON
function closeTonPopup() {
    const popup = document.getElementById('tonPopup');
    if (popup) popup.classList.remove('active');
}

// Назад из окна TON — возвращаемся на главный экран (а не в звёзды)
function backFromTonPopup() {
    closeTonPopup();
    if (typeof showMainMenuView === 'function') {
        showMainMenuView();
    }
}

// Попап «Обратите внимание» для TON
function openTonAttention() {
    const popup = document.getElementById('tonAttentionPopup');
    if (popup) popup.classList.add('active');
}

function closeTonAttention() {
    const popup = document.getElementById('tonAttentionPopup');
    if (popup) popup.classList.remove('active');
}

// Покупка TON
function proceedTonPurchase() {
    const btn = document.getElementById('tonContinueBtn');
    if (btn && btn.classList.contains('disabled')) return;
    
    const wallet = (document.getElementById('tonWalletAddress')?.value || '').trim();
    const network = (document.getElementById('tonNetwork')?.value || '').trim() || selectedTonNetwork;
    const amountTon = selectedTon || 0;
    
    if (!wallet) {
        showStoreNotification('Введите адрес кошелька', 'error');
        return;
    }
    if (!network) {
        showStoreNotification('Выберите сеть', 'error');
        return;
    }
    if (!amountTon || amountTon < 1 || amountTon > 200) {
        showStoreNotification('Введите сумму TON от 1 до 200', 'error');
        return;
    }
    
    const rate = (typeof getTonToRubRate === 'function' ? getTonToRubRate() : 600) || 600;
    const rubAmount = Math.round(amountTon * rate * 100) / 100;
    
    currentPurchase = {
        type: 'ton',
        amount: rubAmount,          // к оплате в рублях (без комиссии)
        ton_amount: amountTon,      // сколько TON купить
        wallet: wallet,
        network: network,
        productId: null,
        productName: 'Покупка TON'
    };
    
    closeTonPopup();
    // Небольшая задержка для гарантии, что попап TON закрылся перед открытием окна оплаты
    setTimeout(function() {
        showPaymentMethodSelection('ton');
    }, 100);
}

window.selectPremiumByMonths = selectPremiumByMonths;
window.proceedStarsPurchase = proceedStarsPurchase;
window.proceedPremiumPurchase = proceedPremiumPurchase;
window.updateStarsAmountFromInput = updateStarsAmountFromInput;
window.fillOwnUsername = fillOwnUsername;
window.checkTelegramUser = checkTelegramUser;
window.clearStarsRecipient = clearStarsRecipient;
window.backFromSellStars = backFromSellStars;
window.openPremiumPopup = openPremiumPopup;
window.closePremiumPopup = closePremiumPopup;
window.selectPremiumByMonthsPopup = selectPremiumByMonthsPopup;
window.proceedPremiumPurchaseFromPopup = proceedPremiumPurchaseFromPopup;
window.openTonPopup = openTonPopup;
window.closeTonPopup = closeTonPopup;
window.backFromTonPopup = backFromTonPopup;
window.updateTonAmountFromInput = updateTonAmountFromInput;
window.proceedTonPurchase = proceedTonPurchase;
window.openTonAttention = openTonAttention;
window.closeTonAttention = closeTonAttention;

// ====== Продажа звёзд ======
let currentSellMethod = 'wallet';
let currentSellAmount = 0;

function openSellStarsPopup() {
    const popup = document.getElementById('sellStarsPopup');
    if (!popup) return;
    
    currentSellMethod = 'wallet';
    currentSellAmount = 0;
    
    // Сброс полей
    ['sellWalletAddress','sellWalletMemo','sellSbpPhone','sellSbpBank','sellCardNumber','sellCardBank','sellStarsAmountInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    updateSellStarsUI();
    popup.classList.add('active');
}

function closeSellStarsPopup() {
    const popup = document.getElementById('sellStarsPopup');
    if (popup) popup.classList.remove('active');
}

// Возврат из окна продажи звёзд в главное меню
function backFromSellStars() {
    closeSellStarsPopup();
    const mainMenuView = document.getElementById('mainMenuView');
    const storeView = document.getElementById('storeView');
    if (mainMenuView) mainMenuView.classList.remove('hidden');
    if (storeView) storeView.classList.remove('active');
    const mainNavButtons = document.querySelectorAll('.main-nav-btn');
    mainNavButtons.forEach(function(btn) { btn.classList.remove('active'); });
    const homeBtn = Array.from(mainNavButtons).find(function(btn) { return btn.textContent && btn.textContent.includes('Главная'); });
    if (homeBtn) homeBtn.classList.add('active');
}

function switchSellStarsMethod(method) {
    currentSellMethod = method;
    
    // Активные кнопки
    ['wallet','sbp','card'].forEach(m => {
        const btn = document.getElementById('sellMethod' + (m === 'wallet' ? 'Wallet' : m === 'sbp' ? 'Sbp' : 'Card'));
        if (btn) {
            btn.classList.toggle('active', m === method);
        }
    });
    
    // Переключаем формы
    const walletForm = document.getElementById('sellWalletForm');
    const sbpForm = document.getElementById('sellSbpForm');
    const cardForm = document.getElementById('sellCardForm');
    if (walletForm) walletForm.style.display = method === 'wallet' ? 'block' : 'none';
    if (sbpForm) sbpForm.style.display = method === 'sbp' ? 'block' : 'none';
    if (cardForm) cardForm.style.display = method === 'card' ? 'block' : 'none';
    
    updateSellStarsUI();
}

function updateSellStarsUI() {
    const limitText = document.getElementById('sellStarsLimitText');
    const buyRateText = document.getElementById('sellStarsBuyRateText');
    const buyRate = getStarBuyRate();
    
    if (limitText) {
        if (currentSellMethod === 'wallet') {
            limitText.textContent = 'Минимум 100 ⭐, максимум 50 000 ⭐ (продажа на кошелёк).';
        } else if (currentSellMethod === 'sbp') {
            limitText.textContent = 'Минимум 230 ⭐, максимум 50 000 ⭐ (продажа по СБП).';
        } else if (currentSellMethod === 'card') {
            limitText.textContent = 'Минимум 1600 ⭐, максимум 50 000 ⭐ (продажа на карту).';
        }
    }
    if (buyRateText) {
        buyRateText.textContent = `1 звезда = ${buyRate} ₽ (курс скупки)`;
    }
    
    // Обновляем сумму и кнопку
    updateSellStarsAmountFromInput();
}

function updateSellStarsAmountFromInput() {
    const input = document.getElementById('sellStarsAmountInput');
    const rubEl = document.getElementById('sellStarsRubReceive');
    const amountEl = document.getElementById('sellStarsAmountSummary');
    const btn = document.getElementById('sellStarsSubmitBtn');
    
    if (!input || !rubEl || !amountEl || !btn) return;
    
    let amount = parseInt(input.value || '0', 10);
    if (isNaN(amount) || amount < 0) amount = 0;
    
    // Ограничиваем только по максимуму, минимум проверяем при отправке
    const max = 50000;
    if (amount > max) {
        amount = max;
        input.value = amount.toString();
    }
    
    currentSellAmount = amount;
    const buyRate = getStarBuyRate();
    const rub = Math.round(amount * buyRate);
    
    rubEl.textContent = `${rub.toLocaleString('ru-RU')} ₽`;
    amountEl.textContent = `${amount.toLocaleString('ru-RU')} ⭐`;
    
    if (amount > 0) {
        btn.textContent = `Продать ${amount.toLocaleString('ru-RU')} ⭐`;
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.textContent = 'Продать 0 ⭐';
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }
}

function submitSellStars() {
    if (currentSellAmount <= 0) {
        showStoreNotification('Введите количество звёзд для продажи', 'error');
        return;
    }
    
    // Проверяем минимальные и максимальные лимиты перед подтверждением
    let min = 100;
    if (currentSellMethod === 'sbp') min = 230;
    if (currentSellMethod === 'card') min = 1600;
    const max = 50000;
    
    if (currentSellAmount < min) {
        showStoreNotification(`Минимальная продажа для этого способа: ${min.toLocaleString('ru-RU')} ⭐`, 'error');
        return;
    }
    
    if (currentSellAmount > max) {
        showStoreNotification(`Максимальная продажа для этого способа: ${max.toLocaleString('ru-RU')} ⭐`, 'error');
        return;
    }
    
    const confirmPopup = document.getElementById('sellStarsConfirmPopup');
    const textEl = document.getElementById('sellStarsConfirmText');
    const btnEl = document.getElementById('sellStarsConfirmBtn');
    
    const buyRate = getStarBuyRate();
    const rub = Math.round(currentSellAmount * buyRate);
    
    if (textEl) {
        textEl.textContent = `Вы уверены, что хотите продать ${currentSellAmount.toLocaleString('ru-RU')} ⭐ за ${rub.toLocaleString('ru-RU')} ₽?`;
    }
    if (btnEl) {
        btnEl.textContent = `Подтвердить и продать ${currentSellAmount.toLocaleString('ru-RU')} ⭐`;
    }
    
    if (confirmPopup) confirmPopup.classList.add('active');
}

function closeSellStarsConfirm() {
    const confirmPopup = document.getElementById('sellStarsConfirmPopup');
    if (confirmPopup) confirmPopup.classList.remove('active');
}

function confirmSellStars() {
    const buyRate = getStarBuyRate();
    const rub = Math.round(currentSellAmount * buyRate);
    
    // Здесь можно добавить реальную отправку данных боту
    showStoreNotification(`Заявка на продажу ${currentSellAmount.toLocaleString('ru-RU')} ⭐ на сумму ${rub.toLocaleString('ru-RU')} ₽ отправлена`, 'success');
    
    closeSellStarsConfirm();
    closeSellStarsPopup();
}

function openBankSelect(method) {
    // Упрощённый выбор банка: в реальной версии можно сделать отдельное окно/поиск
    const banks = ['Тинькофф Банк','Сбербанк','ВТБ','Газпромбанк','Альфа-Банк'];
    const name = prompt('Введите название банка (например: Тинькофф Банк):', banks[0]);
    if (!name) return;
    if (method === 'sbp') {
        const el = document.getElementById('sellSbpBank');
        if (el) el.value = name;
    } else if (method === 'card') {
        const el = document.getElementById('sellCardBank');
        if (el) el.value = name;
    }
}

// Экспорт функций продажи звёзд
window.openSellStarsPopup = openSellStarsPopup;
window.closeSellStarsPopup = closeSellStarsPopup;
window.switchSellStarsMethod = switchSellStarsMethod;
window.updateSellStarsAmountFromInput = updateSellStarsAmountFromInput;
window.submitSellStars = submitSellStars;
window.closeSellStarsConfirm = closeSellStarsConfirm;
window.confirmSellStars = confirmSellStars;
window.openBankSelect = openBankSelect;
window.updateStoreDisplay = updateStoreDisplay;
window.updatePricesDisplay = updatePricesDisplay;
window.showStoreNotification = showStoreNotification;

// Функции навигации
function showCatalog() {
    showStoreNotification('Каталог скоро будет доступен', 'info');
}

function showSteam() {
    showStoreView('steam');
}

// Переключение между главным меню и магазином
function showMainMenuView() {
    const mainMenuView = document.getElementById('mainMenuView');
    const storeView = document.getElementById('storeView');
    const marketView = document.getElementById('marketView');
    
    if (mainMenuView) mainMenuView.classList.remove('hidden');
    if (storeView) storeView.classList.remove('active');
    if (marketView) marketView.style.display = 'none';
    
    // Обновляем активные кнопки в нижней навигации
    const mainNavButtons = document.querySelectorAll('.main-nav-btn');
    mainNavButtons.forEach(btn => btn.classList.remove('active'));
    const homeBtn = Array.from(mainNavButtons).find(btn => btn.textContent.includes('Главная'));
    if (homeBtn) homeBtn.classList.add('active');
}

function showStoreView(section) {
    const mainMenuView = document.getElementById('mainMenuView');
    const storeView = document.getElementById('storeView');
    const marketView = document.getElementById('marketView');
    
    if (mainMenuView) mainMenuView.classList.add('hidden');
    if (storeView) storeView.classList.add('active');
    if (marketView) marketView.style.display = 'none';
    
    // Обновляем активные кнопки в нижней навигации
    const navButtons = document.querySelectorAll('.main-nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));
    const telegramBtn = Array.from(navButtons).find(btn => btn.textContent.includes('Telegram'));
    if (telegramBtn) telegramBtn.classList.add('active');
    
    // Переключаем на нужную вкладку / окно
    if (section === 'stars') {
        // Откладываем переключение на следующий тик, чтобы storeView успел отрисоваться и секция звёзд показалась с первого раза
        setTimeout(function() {
            switchStoreTab('stars');
        }, 0);
    } else if (section === 'premium') {
        window.location.href = 'premium.html';
    } else if (section === 'sellStars') {
        // Открываем отдельное окно продажи звёзд
        openSellStarsPopup();
    } else if (section === 'ton') {
        // Открываем отдельное окно покупки TON
        openTonPopup();
    } else if (section === 'gifts') {
        showStoreNotification('Подарки скоро будут доступны', 'info');
        showMainMenuView();
    } else if (section === 'steam') {
        showSteamTopup();
    }
}

window.showCatalog = showCatalog;
window.showSteam = showSteam;
window.showMainMenuView = showMainMenuView;
window.showStoreView = showStoreView;

// Функции для маркета
function showMarketView() {
    const mainMenuView = document.getElementById('mainMenuView');
    const storeView = document.getElementById('storeView');
    const marketView = document.getElementById('marketView');
    
    if (mainMenuView) mainMenuView.classList.add('hidden');
    if (storeView) storeView.classList.remove('active');
    if (marketView) {
        marketView.style.display = 'block';
        // Обновляем баланс в маркете
        updateMarketBalance();
    }
    
    // Обновляем активные кнопки в нижней навигации
    const navButtons = document.querySelectorAll('.main-nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));
    const marketBtn = Array.from(navButtons).find(btn => btn.textContent.includes('Маркет'));
    if (marketBtn) marketBtn.classList.add('active');
}

// Показать маркет и прокрутить к секции «Игры»
function showMarketViewToGames() {
    showMarketView();
    // Прокрутка к секции Игры после отображения маркета
    setTimeout(function() {
        const gamesSection = document.getElementById('marketGamesSection');
        if (gamesSection) {
            gamesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

function updateMarketBalance() {
    const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    let currentBalance = 0;
    
    if (db && typeof db.getBalanceFixed === 'function') {
        currentBalance = db.getBalanceFixed('RUB') || 0;
    } else {
        try {
            const balanceKey = 'jetstore_balance_fixed';
            const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            currentBalance = balanceData.RUB || 0;
        } catch (e) {
            console.warn('⚠️ Ошибка загрузки баланса:', e);
        }
    }
    
    // Обновляем баланс в общей шапке (marketBalance убран, используется storeBalance)
    const el = document.getElementById('storeBalance');
    if (el) el.textContent = currentBalance.toLocaleString('ru-RU') + ' ₽';
}

// Функции для окна пополнения Steam
function showSteamTopup() {
    const popup = document.getElementById('steamTopupPopup');
    if (!popup) return;
    
    popup.classList.add('active');
    
    // Баланс в шапке окна
    const balanceEl = document.getElementById('steamTopupBalance');
    if (balanceEl) {
        let v = 0;
        const db = window.Database;
        if (db && typeof db.getBalanceFixed === 'function') v = db.getBalanceFixed('RUB') || 0;
        else if (window.userData?.currencies?.RUB != null) v = window.userData.currencies.RUB;
        else {
            try { v = (JSON.parse(localStorage.getItem('jetstore_balance_fixed') || '{}')).RUB || 0; } catch (e) {}
        }
        balanceEl.textContent = (v || 0).toLocaleString('ru-RU') + ' ₽';
    }
    
    // Текущий курс пополнения Steam
    updateSteamTopupRateText();
    
    const loginInput = document.getElementById('steamLogin');
    const amountInput = document.getElementById('steamAmount');
    if (loginInput) loginInput.value = '';
    if (amountInput) amountInput.value = '';

    // Валюта по умолчанию — RUB
    if (typeof setSteamCurrency === 'function') {
        setSteamCurrency('RUB');
    }
    
    setTimeout(function() { if (loginInput) loginInput.focus(); }, 150);
}

function setSteamAmount(amount) {
    const el = document.getElementById('steamAmount');
    if (el) { el.value = amount; el.dispatchEvent(new Event('input', { bubbles: true })); }
}

// Закрытие попапа при клике вне его
document.addEventListener('click', function(e) {
    const steamPopup = document.getElementById('steamTopupPopup');
    if (steamPopup && steamPopup.classList.contains('active')) {
        if (e.target === steamPopup) {
            closeSteamTopup();
        }
    }
    
    
    const nftPopup = document.getElementById('nftGiftsPopup');
    if (nftPopup && nftPopup.classList.contains('active')) {
        const content = nftPopup.querySelector('.popup-content');
        if (e.target === nftPopup && !content.contains(e.target)) {
            closeNFTGifts();
        }
    }
    
    const gameProductsPopup = document.getElementById('gameProductsPopup');
    if (gameProductsPopup && gameProductsPopup.classList.contains('active')) {
        const content = gameProductsPopup.querySelector('.popup-content');
        if (e.target === gameProductsPopup && !content.contains(e.target)) {
            closeGameProducts();
        }
    }
    
    const paymentMethodPopup = document.getElementById('paymentMethodPopup');
    if (paymentMethodPopup && paymentMethodPopup.classList.contains('active')) {
        const content = paymentMethodPopup.querySelector('.popup-content');
        if (e.target === paymentMethodPopup && !content.contains(e.target)) {
            closePaymentMethodPopup();
        }
    }
    
    const paymentWaitingPopup = document.getElementById('paymentWaitingPopup');
    if (paymentWaitingPopup && paymentWaitingPopup.classList.contains('active')) {
        const content = paymentWaitingPopup.querySelector('.popup-content');
        if (e.target === paymentWaitingPopup && !content.contains(e.target)) {
            // Не закрываем при клике вне - только через кнопку
        }
    }
});

function closeSteamTopup() {
    const popup = document.getElementById('steamTopupPopup');
    if (popup) {
        popup.classList.remove('active');
    }
    // Возвращаем в главное меню
    if (typeof showMainMenuView === 'function') {
        showMainMenuView();
    }
}

function clearSteamInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
    }
}

// Модальное окно «Как узнать свой логин Steam?»
function openSteamLoginHelpModal() {
    const overlay = document.getElementById('steamLoginHelpOverlay');
    const modal = document.getElementById('steamLoginHelpModal');
    if (overlay) overlay.style.display = 'block';
    if (modal) modal.style.display = 'block';
}

function closeSteamLoginHelpModal() {
    const overlay = document.getElementById('steamLoginHelpOverlay');
    const modal = document.getElementById('steamLoginHelpModal');
    if (overlay) overlay.style.display = 'none';
    if (modal) modal.style.display = 'none';
}

// Глобальные переменные для текущей покупки
let currentPurchase = {
    type: null, // 'steam', 'game', 'stars', 'premium'
    amount: 0,
    login: null,
    productId: null,
    productName: null,
    currency: null
};

// Валюта Steam по умолчанию
let currentSteamCurrency = 'RUB';

function setSteamCurrency(code) {
    currentSteamCurrency = code;

    const map = {
        RUB: { icon: '₽', hint: '₽' },
        KZT: { icon: '₸', hint: '₸' },
        UAH: { icon: '₴', hint: '₴' }
    };
    const cfg = map[code] || map.RUB;

    const iconEl = document.getElementById('steamCurrencyIcon');
    const hintEl = document.getElementById('steamCurrencyHint');
    if (iconEl) iconEl.textContent = cfg.icon;
    if (hintEl) hintEl.textContent = cfg.hint;

    ['steamCurRub', 'steamCurKzt', 'steamCurUah'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const isActive =
            (id === 'steamCurRub' && code === 'RUB') ||
            (id === 'steamCurKzt' && code === 'KZT') ||
            (id === 'steamCurUah' && code === 'UAH');
        btn.classList.toggle('active', isActive);
    });

    // Обновляем текст курса в окне Steam под выбранную валюту
    updateSteamTopupRateText();
}

// Сохраняем информацию о предыдущем окне для возврата
let previousView = {
    type: null, // 'steam', 'store', 'game', 'supercell'
    gameCategory: null,
    supercellGame: null
};

// Показать окно выбора способа оплаты
function showPaymentMethodSelection(purchaseType) {
    // Сохраняем данные покупки
    if (purchaseType === 'steam') {
        const login = document.getElementById('steamLogin')?.value.trim();
        const amount = parseFloat(document.getElementById('steamAmount')?.value) || 0; // сколько придёт на Steam
        
        if (!login) {
            showStoreNotification('Введите логин Steam', 'error');
            return;
        }
        
        if (amount <= 0) {
            showStoreNotification('Введите сумму пополнения', 'error');
            return;
        }
        const steamRate = (typeof getSteamTopupRate === 'function' ? getSteamTopupRate(currentSteamCurrency) : 1);
        const payRub = Math.round(amount * steamRate * 100) / 100; // сколько платит клиент
        
        currentPurchase = {
            type: 'steam',
            amount: payRub,           // сумма к оплате
            steam_amount: amount,     // сумма пополнения Steam
            login: login,
            productId: null,
            productName: 'Пополнение Steam',
            currency: currentSteamCurrency,
            steam_rate: steamRate
        };
        
        // Сохраняем информацию о предыдущем окне
        previousView = {
            type: 'steam',
            gameCategory: null,
            supercellGame: null
        };
    } else if (purchaseType === 'stars') {
        // Сохраняем информацию о предыдущем окне
        previousView = {
            type: 'store',
            gameCategory: 'stars',
            supercellGame: null
        };
    } else if (purchaseType === 'premium') {
        // Сохраняем информацию о предыдущем окне
        previousView = {
            type: 'store',
            gameCategory: 'premium',
            supercellGame: null
        };
    } else if (purchaseType === 'ton') {
        // Сохраняем информацию о предыдущем окне
        previousView = {
            type: 'ton',
            gameCategory: null,
            supercellGame: null
        };
    } else if (purchaseType === 'game') {
        // Определяем, из какого окна пришли (обычные игры или supercell)
        // Проверяем, открыто ли окно с играми
        const gameProductsPopup = document.getElementById('gameProductsPopup');
        const supercellProductsPopup = document.getElementById('supercellProductsPopup');
        
        if (supercellProductsPopup && supercellProductsPopup.classList.contains('active')) {
            // Пришли из окна Supercell
            const activeGame = window.currentSupercellGame || null;
            previousView = {
                type: 'supercell',
                gameCategory: null,
                supercellGame: activeGame
            };
        } else if (gameProductsPopup && gameProductsPopup.classList.contains('active')) {
            // Пришли из окна обычных игр
            const activeCategory = window.currentGameCategory || null;
            previousView = {
                type: 'game',
                gameCategory: activeCategory,
                supercellGame: null
            };
        } else {
            // По умолчанию
            previousView = {
                type: 'game',
                gameCategory: currentPurchase.productId?.split('_')[0] || null,
                supercellGame: null
            };
        }
    }
    
    if (typeof window.fetchTonToRubRateFromApi === 'function') {
        window.fetchTonToRubRateFromApi();
    }
    const popup = document.getElementById('paymentMethodPopup');
    if (popup) {
        popup.classList.add('active');
    }
}

// Закрыть окно выбора способа оплаты и вернуться в предыдущее окно
function closePaymentMethodPopup() {
    const popup = document.getElementById('paymentMethodPopup');
    if (popup) {
        popup.classList.remove('active');
    }
    
    // Возвращаем пользователя в предыдущее окно
    if (previousView.type === 'steam') {
        // Возвращаем в окно Steam пополнения
        if (typeof showSteamTopup === 'function') {
            showSteamTopup();
        }
    } else if (previousView.type === 'ton') {
        // Возвращаем в главное меню (покупка TON уже начата, данные в currentPurchase)
        if (typeof showMainMenuView === 'function') {
            showMainMenuView();
        }
    } else if (previousView.type === 'store') {
        // Возвращаем в окно магазина (звезды или премиум)
        if (typeof showStoreView === 'function') {
            showStoreView(previousView.gameCategory);
        }
    } else if (previousView.type === 'supercell') {
        // Возвращаем в окно Supercell продуктов
        if (previousView.supercellGame && typeof showSupercellProducts === 'function') {
            showSupercellProducts(previousView.supercellGame);
        } else if (typeof showSupercellGames === 'function') {
            showSupercellGames();
        }
    } else if (previousView.type === 'game') {
        // Возвращаем в окно продуктов игры
        if (previousView.gameCategory && typeof showGameProducts === 'function') {
            showGameProducts(previousView.gameCategory);
        } else {
            // Если не можем определить категорию, возвращаем в главное меню
            if (typeof showMainMenuView === 'function') {
                showMainMenuView();
            }
        }
    } else {
        // По умолчанию возвращаем в главное меню
        if (typeof showMainMenuView === 'function') {
            showMainMenuView();
        }
    }
}

// Выбрать способ оплаты
function selectPaymentMethod(method, bonusPercent) {
    closePaymentMethodPopup();
    
    // Рассчитываем сумму с учетом комиссии
    const baseAmount = currentPurchase.amount;
    const commission = Math.round(baseAmount * bonusPercent / 100);
    const totalAmount = baseAmount + commission;
    
    // Сохраняем данные для экрана ожидания
    window.paymentData = {
        method: method,
        bonusPercent: bonusPercent,
        baseAmount: baseAmount,
        commission: commission,
        totalAmount: totalAmount,
        purchase: currentPurchase
    };

    // Persist pending payment per Telegram user (so return from CryptoBot restores UI)
    try { savePendingPayment(window.paymentData); } catch (e) {}
    
    // Показываем экран ожидания оплаты
    showPaymentWaiting();
}

// ===========================
// Pending payment persistence
// ===========================
var JET_PENDING_PAYMENT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getJetUserIdForStorage() {
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        var tgId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id ? String(tg.initDataUnsafe.user.id) : null;
        if (tgId) return tgId;
    } catch (e) {}
    try {
        if (window.userData && window.userData.id && String(window.userData.id) !== 'test_user_default') return String(window.userData.id);
    } catch (e) {}
    try {
        var db = window.Database;
        if (db && typeof db.getFixedUserId === 'function') return String(db.getFixedUserId());
    } catch (e) {}
    return 'test_user_default';
}

function getPendingPaymentStorageKey() {
    return 'jetstore_pending_payment_' + getJetUserIdForStorage();
}

function savePendingPayment(data) {
    if (!data || typeof data !== 'object') return;
    var payload = {
        method: data.method,
        bonusPercent: data.bonusPercent,
        baseAmount: data.baseAmount,
        commission: data.commission,
        totalAmount: data.totalAmount,
        purchase: data.purchase || null,
        invoice_id: data.invoice_id || null,
        order_id: data.order_id || null,
        payment_url: data.payment_url || null,
        pay_url: data.pay_url || null,
        createdAt: Date.now()
    };
    localStorage.setItem(getPendingPaymentStorageKey(), JSON.stringify(payload));
}

function loadPendingPayment() {
    try {
        var raw = localStorage.getItem(getPendingPaymentStorageKey());
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (!data.method || !data.purchase) return null;
        if (data.createdAt && (Date.now() - data.createdAt) > JET_PENDING_PAYMENT_TTL_MS) return null;
        return data;
    } catch (e) { return null; }
}

function clearPendingPayment() {
    try { localStorage.removeItem(getPendingPaymentStorageKey()); } catch (e) {}
}

function restorePendingPaymentToUI(reason) {
    var pending = loadPendingPayment();
    if (!pending) return false;
    // If we already have a paymentData in memory, don't override unless it's empty
    if (!window.paymentData || !window.paymentData.method) {
        window.paymentData = pending;
    } else {
        // keep latest ids/urls
        window.paymentData.invoice_id = window.paymentData.invoice_id || pending.invoice_id;
        window.paymentData.order_id = window.paymentData.order_id || pending.order_id;
        window.paymentData.payment_url = window.paymentData.payment_url || pending.payment_url || pending.pay_url;
    }
    // Show popup again
    try { showPaymentWaiting(); } catch (e) {}
    return true;
}

// Показать экран ожидания оплаты
function showPaymentWaiting() {
    const popup = document.getElementById('paymentWaitingPopup');
    if (!popup || !window.paymentData) return;
    
    const data = window.paymentData;
    const methodNames = {
        'sbp': 'СБП',
        'card': 'Карта',
        'ton': 'TON Wallet',
        'cryptobot': 'CryptoBot'
    };
    
    const statusEl = document.getElementById('paymentDetailStatus');
    if (statusEl) statusEl.textContent = 'Ожидание...';

    const primaryBtn = document.getElementById('paymentWaitingPrimaryBtn');
    if (primaryBtn) {
        primaryBtn.disabled = false;
        primaryBtn.textContent = 'Перейти на страницу оплаты';
    }

    // По умолчанию скрываем строку курса
    const steamRateRow = document.getElementById('paymentDetailSteamRateRow');
    if (steamRateRow) {
        steamRateRow.style.display = 'none';
    }

    // Обновляем данные на экране
    const steamCur = data.purchase?.currency || 'RUB';
    const steamSymbols = { RUB: '₽', KZT: '₸', UAH: '₴' };
    const curSym = steamSymbols[steamCur] || '₽';

    if (data.purchase?.type === 'steam') {
        var steamTopupAmount = data.purchase.steam_amount || data.baseAmount || 0; // сколько придёт на Steam
        document.getElementById('paymentWaitingDescription').textContent =
            `Пополнение Steam для ${data.purchase.login} на ${steamTopupAmount.toLocaleString('ru-RU')} ${curSym}`;
        document.getElementById('paymentDetailAmount').textContent = `${steamTopupAmount.toLocaleString('ru-RU')} ${curSym}`;

        // Показываем курс пополнения, если он есть
        if (steamRateRow) {
            const rateValueEl = document.getElementById('paymentDetailSteamRate');
            const rate = data.purchase.steam_rate || (typeof getSteamTopupRate === 'function' ? getSteamTopupRate(data.purchase?.currency || 'RUB') : 1);
            if (rateValueEl && rate && !isNaN(rate)) {
                // Курс пополнения отображаем только в рублях
                rateValueEl.textContent = `${rate.toFixed(2)} ₽ за 1 единицу пополнения на Steam`;
                steamRateRow.style.display = 'flex';
            }
        }
    } else if (data.method === 'cryptobot' && (data.purchase?.type === 'stars' || data.purchase?.type === 'premium')) {
        var totRub = data.totalAmount || data.baseAmount || 0;
        var usdtRt = (typeof getUsdtRate === 'function' ? getUsdtRate() : 80) || 80;
        var usdtAmt = totRub > 0 ? Math.max(0.1, Math.round(totRub / usdtRt * 100) / 100) : 0;
        document.getElementById('paymentWaitingDescription').textContent =
            `Оплатите ${usdtAmt.toFixed(2)} USDT (~${data.totalAmount.toLocaleString('ru-RU')} ₽) через CryptoBot`;
        document.getElementById('paymentDetailAmount').textContent = `${usdtAmt.toFixed(2)} USDT`;
    } else if (data.purchase?.type === 'ton') {
        var tonAmt = parseFloat(data.purchase.ton_amount || 0) || 0;
        var net = (data.purchase.network || '').toString().trim();
        var w = (data.purchase.wallet || '').toString().trim();
        var wShort = w ? (w.length > 18 ? (w.slice(0, 10) + '…' + w.slice(-6)) : w) : '';
        document.getElementById('paymentWaitingDescription').textContent =
            `Покупка ${tonAmt.toLocaleString('ru-RU')} TON (${net || 'сеть не выбрана'}) на кошелёк ${wShort || '—'}`;
        document.getElementById('paymentDetailAmount').textContent = `${tonAmt.toLocaleString('ru-RU')} TON`;
    } else {
        document.getElementById('paymentWaitingDescription').textContent =
            `Оплатите ${data.totalAmount.toLocaleString('ru-RU')} ₽ через ${methodNames[data.method]} (${data.bonusPercent > 0 ? '+' : ''}${data.bonusPercent}%)`;
        document.getElementById('paymentDetailAmount').textContent = `${data.baseAmount.toLocaleString('ru-RU')} ₽`;
    }
    document.getElementById('paymentDetailCommissionLabel').textContent = `Комиссия (${data.bonusPercent}%)`;
    // Комиссию всегда показываем в рублях
    document.getElementById('paymentDetailCommission').textContent = `+${data.commission.toLocaleString('ru-RU')} ₽`;
    var totEl = document.getElementById('paymentDetailTotal');
    if (data.method === 'cryptobot' && (data.purchase?.type === 'stars' || data.purchase?.type === 'premium') && totEl) {
        var tr = data.totalAmount || data.baseAmount || 0;
        var ur = (typeof getUsdtRate === 'function' ? getUsdtRate() : 80) || 80;
        var ua = tr > 0 ? Math.max(0.1, Math.round(tr / ur * 100) / 100) : 0;
        totEl.textContent = ua > 0 ? ua.toFixed(2) + ' USDT' : (data.totalAmount.toLocaleString('ru-RU') + ' ₽');
    } else if (totEl) {
        // Итог к оплате всегда показываем в рублях
        totEl.textContent = `${data.totalAmount.toLocaleString('ru-RU')} ₽`;
    }
    document.getElementById('paymentDetailMethod').textContent = `${methodNames[data.method]} (${data.bonusPercent > 0 ? '+' : ''}${data.bonusPercent}%)`;
    
    popup.classList.add('active');
}

// Закрыть экран ожидания оплаты
function closePaymentWaiting() {
    const popup = document.getElementById('paymentWaitingPopup');
    if (popup) {
        popup.classList.remove('active');
    }
    window.paymentData = null;
    currentPurchase = { type: null, amount: 0, login: null, productId: null, productName: null };
    // Clear pending payment for this user when user closes/finishes flow
    try { clearPendingPayment(); } catch (e) {}
}

// Подтвердить оплату: проверка платёжки, при успехе — выдача товара (Steam = DonateHub, звёзды/премиум — позже)
function confirmPayment() {
    if (!window.paymentData) return;
    var data = window.paymentData;
    var statusEl = document.getElementById('paymentDetailStatus');
    var confirmBtn = document.getElementById('paymentWaitingConfirmBtn');
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        var url = typeof prompt !== 'undefined' ? prompt('Введите URL бота (Railway):\n\nПример: https://jet-store-bot-production.up.railway.app') : '';
        if (url && (url = url.trim().replace(/\/$/, ''))) {
            try { localStorage.setItem('jet_api_base', url); } catch (e) {}
            window.JET_API_BASE = url;
            if (typeof showStoreNotification === 'function') showStoreNotification('Адрес API сохранён. Нажмите «Подтвердить оплату» снова.', 'success');
        } else {
            if (typeof showStoreNotification === 'function') showStoreNotification('Укажите адрес API бота (сервер, где запущен бот).', 'error');
        }
        return;
    }
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Проверяем...';
    }
    if (statusEl) statusEl.textContent = 'Проверка оплаты...';

    var purchase = data.purchase || {};
    var checkPayload = {
        method: data.method,
        totalAmount: data.totalAmount,
        baseAmount: data.baseAmount,
        purchase: purchase
    };
    if (data.order_id) checkPayload.order_id = data.order_id;
    if (data.transaction_id) checkPayload.transaction_id = data.transaction_id;
    if (data.invoice_id) checkPayload.invoice_id = data.invoice_id;
    var url = (apiBase.replace(/\/$/, '') + '/api/payment/check');
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkPayload)
    })
        .then(function(r) {
            return r.json().catch(function() { return {}; }).then(function(json) {
                return { ok: r.ok, status: r.status, json: json };
            });
        })
        .then(function(result) {
            var res = result.json;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Подтвердить оплату';
            }
            if (!result.ok) {
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (typeof showStoreNotification === 'function') {
                    showStoreNotification('Ошибка связи с сервером (HTTP ' + result.status + '). Проверьте адрес API в настройках.', 'error');
                }
                return;
            }
            if (res.paid === true) {
                if (statusEl) statusEl.textContent = res.delivered_by_fragment ? 'Оплата подтверждена.' : 'Оплата подтверждена. Выдача...';
                runDeliveryAfterPayment(data, res);
            } else {
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (typeof showStoreNotification === 'function') {
                    showStoreNotification('Оплата не найдена.', 'error');
                }
            }
        })
        .catch(function(err) {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Подтвердить оплату';
            }
            if (statusEl) statusEl.textContent = 'Ожидание...';
            if (typeof showStoreNotification === 'function') {
                showStoreNotification('Ошибка связи с сервером. Проверьте адрес API в настройках.', 'error');
            }
        });
}

// Выдача товара после подтверждённой оплаты (Steam = DonateHub, звёзды/премиум = Fragment.com)
function runDeliveryAfterPayment(data, checkResponse) {
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var statusEl = document.getElementById('paymentDetailStatus');
    // Оплата через Fragment (TonKeeper): товар уже выдан по вебхуку order.completed
    if (checkResponse && checkResponse.delivered_by_fragment === true) {
        if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
        closePaymentWaiting();
        return;
    }

    if (data.purchase && data.purchase.type === 'steam') {
        if (statusEl) statusEl.textContent = 'Запуск пополнения Steam...';
        fetch(apiBase + '/api/donatehub/steam/topup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account: data.purchase.login,
                amount: data.purchase.steam_amount || data.baseAmount,
                currency: data.purchase.currency || 'RUB'
            })
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(result) {
                var orderId = result && result.order && result.order.id;
                if (!orderId) {
                    if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка создания заказа Steam', 'error');
                    return;
                }
                if (typeof showStoreNotification === 'function') showStoreNotification('✅ Заказ Steam создан. Пополнение в процессе.', 'success');
                try {
                    addPurchaseHistoryEntry({
                        type: 'steam',
                        productName: 'Пополнение Steam',
                        price: data.baseAmount || 0,
                        steamLogin: data.purchase.login || '',
                        currency: data.purchase.currency || 'RUB'
                    });
                } catch (e) {}
                closePaymentWaiting();
                if (typeof closeSteamTopup === 'function') closeSteamTopup();
            })
            .catch(function() {
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка DonateHub', 'error');
            });
        return;
    }

    // Fragment (ezstar): после оплаты CryptoBot вызываем deliver-stars — бот отправляет TON с кошелька, звёзды приходят получателю
    if (data.purchase && data.purchase.type === 'stars') {
        var recipient = (data.purchase.login || '').toString().trim().replace(/^@/, '');
        var starsAmount = data.purchase.stars_amount || data.baseAmount || 0;
        if (!recipient || !starsAmount) {
            if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка: укажите получателя и количество звёзд.', 'error');
            if (statusEl) statusEl.textContent = 'Ожидание...';
            return;
        }
        if (statusEl) statusEl.textContent = 'Отправка звёзд...';
        fetch(apiBase.replace(/\/$/, '') + '/api/fragment/deliver-stars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stars_amount: starsAmount, recipient: recipient })
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(res) {
                if (res.success) {
                    if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
                    try {
                        var totalRub = parseFloat(data.totalAmount) || parseFloat(data.baseAmount) || 0;
                        addPurchaseHistoryEntry({
                            type: 'stars',
                            productName: 'Звёзды Telegram',
                            price: totalRub,
                            starsAmount: starsAmount,
                            recipient: recipient,
                            method: data.method || ''
                        });
                    } catch (e) {}
                    closePaymentWaiting();
                } else {
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification(res.message || 'Ошибка выдачи звёзд.', 'error');
                    }
                    if (statusEl) statusEl.textContent = 'Ожидание...';
                }
            })
            .catch(function() {
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка выдачи звёзд.', 'error');
                if (statusEl) statusEl.textContent = 'Ожидание...';
            });
        return;
    }

    // Fragment.com: выдача Premium через iStar API (оплата TonKeeper)
    if (data.purchase && data.purchase.type === 'premium') {
        var recipient = (data.purchase.login || '').toString().trim().replace(/^@/, '');
        var months = data.purchase.months || 3;
        if ([3, 6, 12].indexOf(months) === -1) months = 3;
        if (!recipient) {
            if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка: укажите получателя.', 'error');
            if (statusEl) statusEl.textContent = 'Ожидание...';
            return;
        }
        if (statusEl) statusEl.textContent = 'Выдача Premium...';
        fetch(apiBase + '/api/fragment/deliver-premium', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ months: months, recipient: recipient })
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(res) {
                if (res.success) {
                    if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
                    try {
                        var totalRub = parseFloat(data.totalAmount) || parseFloat(data.baseAmount) || 0;
                        addPurchaseHistoryEntry({
                            type: 'premium',
                            productName: 'Premium Telegram',
                            price: totalRub,
                            months: months,
                            recipient: recipient,
                            method: data.method || ''
                        });
                    } catch (e) {}
                    closePaymentWaiting();
                } else {
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification(res.message || 'Ошибка выдачи товара.', 'error');
                    }
                    if (statusEl) statusEl.textContent = 'Ожидание...';
                }
            })
            .catch(function() {
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка выдачи товара.', 'error');
                if (statusEl) statusEl.textContent = 'Ожидание...';
            });
        return;
    }

    // Покупка TON как отдельного товара
    if (data.purchase && data.purchase.type === 'ton') {
        // После подтверждения оплаты отправляем заявку в рабочую группу
        var buyer = null;
        try {
            var tg = window.Telegram && window.Telegram.WebApp;
            var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
            if (u) {
                buyer = {
                    id: u.id != null ? String(u.id) : null,
                    username: u.username || null,
                    first_name: u.first_name || null,
                    last_name: u.last_name || null
                };
            }
        } catch (e) {}
        var payload = {
            purchase: data.purchase || {},
            method: data.method || '',
            total_rub: parseFloat(data.totalAmount) || parseFloat(data.baseAmount) || 0,
            base_rub: parseFloat(data.baseAmount) || 0,
            invoice_id: data.invoice_id || null,
            order_id: data.order_id || null,
            buyer: buyer
        };
        if (statusEl) statusEl.textContent = 'Отправляем заявку...';
        fetch(apiBase.replace(/\/$/, '') + '/api/ton/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(res) {
                if (res && res.success) {
                    try {
                        var totalRubTon = parseFloat(data.totalAmount) || parseFloat(data.baseAmount) || 0;
                        addPurchaseHistoryEntry({
                            type: 'ton',
                            productName: 'Покупка TON',
                            price: totalRubTon,
                            tonAmount: data.purchase.ton_amount || 0,
                            wallet: data.purchase.wallet || '',
                            network: data.purchase.network || '',
                            method: data.method || ''
                        });
                    } catch (e) {}
                    if (typeof showStoreNotification === 'function') showStoreNotification('Заявка отправлена. Ожидайте обработки.', 'success');
                    closePaymentWaiting();
                } else {
                    if (typeof showStoreNotification === 'function') showStoreNotification((res && res.message) || 'Не удалось отправить заявку. Попробуйте ещё раз.', 'error');
                    if (statusEl) statusEl.textContent = 'Ожидание...';
                }
            })
            .catch(function() {
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка связи при отправке заявки. Попробуйте ещё раз.', 'error');
                if (statusEl) statusEl.textContent = 'Ожидание...';
            });
        return;
    }

    if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
    closePaymentWaiting();
}

// Открыть страницу оплаты
function openPaymentPage() {
    if (!window.paymentData) return;
    
    const data = window.paymentData;
    const statusEl = document.getElementById('paymentDetailStatus');
    const primaryBtn = document.getElementById('paymentWaitingPrimaryBtn');

    // CryptoBot: счёт в USDT — проверяем ПЕРВЫМ, иначе звёзды/премиум идут в Fragment
    if (data.method === 'cryptobot') {
        var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBase) {
            if (typeof showStoreNotification === 'function') showStoreNotification('API бота не настроен. Укажите URL в js/config.js (JET_BOT_API_URL).', 'error');
            return;
        }
        if (statusEl) statusEl.textContent = 'Создаём счёт CryptoBot...';
        if (primaryBtn) primaryBtn.disabled = true;
        var desc = 'Оплата в JET Store';
        if (data.purchase) {
            if (data.purchase.type === 'stars') desc = 'Звёзды Telegram — ' + (data.purchase.stars_amount || data.baseAmount || 0) + ' шт.';
            else if (data.purchase.type === 'premium') desc = 'Premium Telegram — ' + (data.purchase.months || 3) + ' мес.';
        }
        var amountUsdt;
        var totalRub = parseFloat(data.totalAmount) || parseFloat(data.baseAmount) || (data.purchase && parseFloat(data.purchase.amount)) || (data.purchase && parseFloat(data.purchase.price)) || 0;
        if (totalRub > 0) {
            var usdtRate = (typeof getUsdtRate === 'function' ? getUsdtRate() : 80) || 80;
            amountUsdt = Math.max(0.1, Math.round(totalRub / usdtRate * 100) / 100);
        } else {
            amountUsdt = parseFloat(localStorage.getItem('jetstore_cryptobot_usdt_amount')) || 
                (window.JET_CRYPTOBOT_USDT_AMOUNT != null ? parseFloat(window.JET_CRYPTOBOT_USDT_AMOUNT) : null) || 1;
            if (amountUsdt < 0.1) amountUsdt = 1;
        }
        var createUrl = apiBase.replace(/\/$/, '') + '/api/cryptobot/create-invoice';
        fetch(createUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount_usdt: amountUsdt,
                description: desc,
                payload: JSON.stringify({
                    purchase: data.purchase,
                    userId: (window.userData && window.userData.id) || 'unknown',
                    timestamp: Date.now()
                })
            })
        })
            .then(function(r) {
                return r.json().catch(function() { return { error: 'parse_error', message: 'Ответ сервера не JSON. Status: ' + r.status }; }).then(function(json) {
                    return { ok: r.ok, status: r.status, json: json };
                });
            })
            .then(function(result) {
                var res = result.json || {};
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (!result.ok && res.error === undefined) {
                    res.message = res.message || 'Сервер вернул ошибку ' + result.status;
                }
                if (res.success && (res.payment_url || res.pay_url)) {
                    window.paymentData = window.paymentData || {};
                    window.paymentData.invoice_id = res.invoice_id;
                    window.paymentData.payment_url = res.payment_url || res.pay_url;
                    try { savePendingPayment(window.paymentData); } catch (e) {}
                    var payUrl = (res.payment_url || res.pay_url || '').trim();
                    if (!payUrl) {
                        if (typeof showStoreNotification === 'function') showStoreNotification('Ссылка на оплату не получена от CryptoBot', 'error');
                        return;
                    }
                    var tg = window.Telegram && window.Telegram.WebApp;
                    if (tg && tg.openLink) {
                        try { tg.openLink(payUrl); } catch (e) { console.warn('openLink failed:', e); window.open(payUrl, '_blank'); }
                    } else if (tg && tg.openTelegramLink) {
                        try { tg.openTelegramLink(payUrl); } catch (e) { console.warn('openTelegramLink failed:', e); window.open(payUrl, '_blank'); }
                    } else {
                        window.open(payUrl, '_blank');
                    }
                    if (typeof showStoreNotification === 'function') showStoreNotification('Откройте оплату в CryptoBot, затем нажмите «Подтвердить оплату»', 'info');
                    if (statusEl) {
                        statusEl.innerHTML = 'Счёт создан. <a href="#" id="cryptobotOpenLink" style="color:#00d4ff;text-decoration:underline;">Открыть оплату</a>';
                        var linkEl = document.getElementById('cryptobotOpenLink');
                        if (linkEl) {
                            linkEl.onclick = function(e) {
                                e.preventDefault();
                                var t = window.Telegram && window.Telegram.WebApp;
                                if (t && t.openLink) t.openLink(payUrl);
                                else window.open(payUrl, '_blank');
                            };
                        }
                    }
                } else {
                    var errMsg = res.message || res.error || 'Ошибка создания счёта CryptoBot';
                    if (res.details && typeof res.details === 'object') {
                        if (res.details.name) errMsg += ' (' + res.details.name + ')';
                        else if (typeof res.details === 'string') errMsg += ': ' + res.details;
                    }
                    if (typeof showStoreNotification === 'function') showStoreNotification(errMsg, 'error');
                }
            })
            .catch(function(err) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                var msg = 'Нет связи с API. Проверьте URL бота в config.js. ' + (apiBase || '(URL пуст)');
                if (typeof showStoreNotification === 'function') showStoreNotification(msg, 'error');
            });
        return;
    }

    // Steam: переход на страницу оплаты (пополнение Steam запускается только после успешной оплаты в confirmPayment → runDeliveryAfterPayment)
    if (data.purchase?.type === 'steam') {
        if (typeof showStoreNotification === 'function') {
            showStoreNotification('Открываем страницу оплаты...', 'info');
        }
        const payUrl = data.payment_url || data.pay_url;
        if (payUrl && (window.Telegram?.WebApp?.openLink || window.open)) {
            if (window.Telegram?.WebApp?.openLink) {
                window.Telegram.WebApp.openLink(payUrl);
            } else {
                window.open(payUrl, '_blank');
            }
        }
        return;
    }

    // TON (Tonkeeper): оплата сразу через привязанный Tonkeeper, без CryptoBot
    if (data.method === 'ton') {
        var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBase) {
            if (typeof showStoreNotification === 'function') showStoreNotification('API бота не настроен. Укажите URL в настройках.', 'error');
            return;
        }
        var totalRub = parseFloat(data.totalAmount) || parseFloat(data.baseAmount) || 0;
        if (totalRub <= 0) {
            if (typeof showStoreNotification === 'function') showStoreNotification('Сумма должна быть больше 0.', 'error');
            return;
        }
        if (statusEl) statusEl.textContent = 'Создаём заказ...';
        if (primaryBtn) primaryBtn.disabled = true;
        fetch(apiBase.replace(/\/$/, '') + '/api/ton/create-order', {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount_rub: totalRub,
                purchase: data.purchase || {},
                user_id: (window.userData && window.userData.id) ? String(window.userData.id) : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : 'unknown')
            })
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(res) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (!res.success || !res.order_id || !res.payment_address || res.amount_nanoton == null) {
                    if (typeof showStoreNotification === 'function') showStoreNotification(res.message || 'Ошибка создания заказа TON.', 'error');
                    return;
                }
                var orderId = res.order_id;
                var address = (res.payment_address || '').toString().trim();
                if (!address) {
                    if (typeof showStoreNotification === 'function') showStoreNotification('Адрес приёма TON не задан на сервере (TON_PAYMENT_ADDRESS).', 'error');
                    return;
                }
                var amountNanoton = res.amount_nanoton;
                window.paymentData = window.paymentData || {};
                window.paymentData.order_id = orderId;
                try { savePendingPayment(window.paymentData); } catch (e) {}
                // Формируем HTTPS‑deeplink для Tonkeeper (WebApp принимает только http/https)
                // Tonkeeper сам перехватит https://app.tonkeeper.com/transfer/... и откроется.
                var link = 'https://app.tonkeeper.com/transfer/' + encodeURIComponent(address) +
                    '?amount=' + encodeURIComponent(String(amountNanoton)) +
                    '&text=' + encodeURIComponent(orderId);
                var tg = window.Telegram && window.Telegram.WebApp;
                try {
                    // Для внешних ссылок (Tonkeeper) используем только openLink или fallback window.open.
                    if (tg && typeof tg.openLink === 'function') {
                        tg.openLink(link);
                    } else {
                        window.open(link, '_blank');
                    }
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification('Откройте Tonkeeper, подтвердите перевод, затем нажмите «Подтвердить оплату».', 'info');
                    }
                    if (statusEl) statusEl.textContent = 'Ожидание перевода в Tonkeeper...';
                } catch (err) {
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification('Не удалось открыть Tonkeeper: ' + (err && err.message ? err.message : ''), 'error');
                    }
                    if (statusEl) statusEl.textContent = 'Ожидание...';
                }
            })
            .catch(function() {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка связи с сервером.', 'error');
            });
        return;
    }

    // Звёзды: Fragment.com (только при выборе CryptoBot — при TON оплата уже выше через Tonkeeper)
    if (data.purchase?.type === 'stars') {
        var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var recipient = (data.purchase.login || '').toString().trim().replace(/^@/, '');
        var starsAmount = data.purchase.stars_amount || data.baseAmount || 0;
        if (!apiBase || !recipient || !starsAmount) {
            if (typeof showStoreNotification === 'function') showStoreNotification('Укажите получателя и количество звёзд.', 'error');
            return;
        }
        if (statusEl) statusEl.textContent = 'Создаём заказ...';
        if (primaryBtn) primaryBtn.disabled = true;
        fetch(apiBase.replace(/\/$/, '') + '/api/fragment/create-star-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: recipient, stars_amount: starsAmount })
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(res) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (res.success && (res.order_id != null || res.mode === 'wallet')) {
                    window.paymentData = window.paymentData || {};
                    window.paymentData.order_id = res.order_id;
                    window.paymentData.payment_url = res.payment_url || null;
                    try { savePendingPayment(window.paymentData); } catch (e) {}
                    var payUrl = res.payment_url || res.pay_url || data.payment_url || data.pay_url;
                    if (payUrl && (window.Telegram?.WebApp?.openLink || window.open)) {
                        if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(payUrl);
                        else window.open(payUrl, '_blank');
                    } else {
                        if (typeof showStoreNotification === 'function') {
                            showStoreNotification(res.message || 'Оплатите через CryptoBot; после оплаты нажмите «Подтвердить оплату» — звёзды будут отправлены.', 'info');
                        }
                    }
                } else {
                    if (typeof showStoreNotification === 'function') showStoreNotification(res.message || 'Ошибка создания заказа.', 'error');
                }
            })
            .catch(function() {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка создания заказа.', 'error');
            });
        return;
    }

    // Premium: Fragment.com / TonKeeper — создать заказ, получить order_id и ссылку оплаты
    if (data.purchase?.type === 'premium') {
        var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var recipient = (data.purchase.login || '').toString().trim().replace(/^@/, '');
        var months = data.purchase.months || 3;
        if ([3, 6, 12].indexOf(months) === -1) months = 3;
        if (!apiBase || !recipient) {
            if (typeof showStoreNotification === 'function') showStoreNotification('Укажите получателя.', 'error');
            return;
        }
        if (statusEl) statusEl.textContent = 'Создаём заказ...';
        if (primaryBtn) primaryBtn.disabled = true;
        fetch(apiBase.replace(/\/$/, '') + '/api/fragment/create-premium-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: recipient, months: months })
        })
            .then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(res) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (res.success && res.order_id) {
                    window.paymentData = window.paymentData || {};
                    window.paymentData.order_id = res.order_id;
                    if (res.payment_url) window.paymentData.payment_url = res.payment_url;
                    try { savePendingPayment(window.paymentData); } catch (e) {}
                    var payUrl = res.payment_url || res.pay_url || data.payment_url || data.pay_url;
                    if (payUrl && (window.Telegram?.WebApp?.openLink || window.open)) {
                        if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(payUrl);
                        else window.open(payUrl, '_blank');
                    } else {
                        if (typeof showStoreNotification === 'function') showStoreNotification('Оплатите в TonKeeper по заказу Fragment, затем нажмите «Подтвердить оплату».', 'info');
                    }
                } else {
                    if (typeof showStoreNotification === 'function') showStoreNotification(res.message || 'Ошибка создания заказа.', 'error');
                }
            })
            .catch(function() {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка создания заказа.', 'error');
            });
        return;
    }
    
    if (data.method === 'sbp') {
        showStoreNotification('Открываем страницу оплаты СБП...', 'info');
    } else if (data.method === 'card') {
        showStoreNotification('Открываем страницу оплаты картой...', 'info');
    }
}

// Функции для окна "Активы"
function showAssetsView() {
    window.location.href = 'assets.html';
}

function showNFTGifts() {
    const popup = document.getElementById('nftGiftsPopup');
    if (popup) {
        popup.classList.add('active');
    }
}

function closeNFTGifts() {
    const popup = document.getElementById('nftGiftsPopup');
    if (popup) {
        popup.classList.remove('active');
    }
}

// Экспортируем функции
window.showMarketView = showMarketView;
window.showMarketViewToGames = showMarketViewToGames;
window.showSteamTopup = showSteamTopup;
window.closeSteamTopup = closeSteamTopup;
window.clearSteamInput = clearSteamInput;
window.setSteamAmount = setSteamAmount;
window.processSteamPayment = function processSteamPayment() {
    if (typeof showStoreNotification === 'function') {
        showStoreNotification('Выберите способ оплаты и нажмите «Оплатить»', 'info');
    }
    if (typeof showPaymentMethodSelection === 'function') {
        showPaymentMethodSelection('steam');
    }
};
window.openSteamLoginHelpModal = openSteamLoginHelpModal;
window.closeSteamLoginHelpModal = closeSteamLoginHelpModal;
window.showAssetsView = showAssetsView;
window.showNFTGifts = showNFTGifts;
window.closeNFTGifts = closeNFTGifts;

// Функция для перехода в реферальную программу с активным состоянием
function goToReferral() {
    // Устанавливаем флаг активной кнопки перед переходом
    sessionStorage.setItem('activeNav', 'referral');
    window.location.href = 'referral.html';
}

// Переменные уже объявлены выше

function showSupercellGames() {
    const popup = document.getElementById('supercellGamesPopup');
    if (popup) popup.classList.add('active');
}

function closeSupercellGames() {
    const popup = document.getElementById('supercellGamesPopup');
    if (popup) popup.classList.remove('active');
}

function showSupercellProducts(game) {
    currentSupercellGame = game;
    window.currentSupercellGame = game;
    const gamesPopup = document.getElementById('supercellGamesPopup');
    const productsPopup = document.getElementById('supercellProductsPopup');
    const gameTitle = document.getElementById('supercellGameTitle');
    const productsList = document.getElementById('supercellProductsList');
    
    if (gamesPopup) gamesPopup.classList.remove('active');
    if (productsPopup) productsPopup.classList.add('active');
    
    const gameNames = {
        'clashroyale': 'Clash Royale',
        'clashofclans': 'Clash of Clans',
        'brawlstars': 'Brawl Stars'
    };
    if (gameTitle) gameTitle.textContent = gameNames[game] || 'Supercell';
    
    // Загружаем товары из localStorage
    loadSupercellProducts(game, productsList);
}

function closeSupercellProducts() {
    const popup = document.getElementById('supercellProductsPopup');
    if (popup) popup.classList.remove('active');
    currentSupercellGame = null;
}

// Функции для товаров игр
function showGameProducts(gameCategory) {
    currentGameCategory = gameCategory;
    window.currentGameCategory = gameCategory;
    const popup = document.getElementById('gameProductsPopup');
    const title = document.getElementById('gameProductsTitle');
    const productsList = document.getElementById('gameProductsList');
    
    if (!popup || !title || !productsList) return;
    
    const gameNames = {
        'brawlstars': 'Brawl Stars',
        'clashroyale': 'Clash Royale',
        'clashofclans': 'Clash of Clans',
        'standoff2': 'Standoff 2',
        'pubgmobile': 'PUBG Mobile'
    };
    
    title.textContent = gameNames[gameCategory] || 'Игра';
    popup.classList.add('active');
    
    // Загружаем товары
    loadGameProducts(gameCategory, productsList);
}

function closeGameProducts() {
    const popup = document.getElementById('gameProductsPopup');
    if (popup) popup.classList.remove('active');
    currentGameCategory = null;
}

function loadGameProducts(gameCategory, container) {
    if (!container) return;
    
    try {
        // Загружаем товары из базы данных
        const database = window.Database;
        const products = (database && typeof database.getProductsByCategory === 'function' ? database.getProductsByCategory(gameCategory) : null) || [];
        
        if (products.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Товары пока не добавлены</div>';
            return;
        }
        
        container.innerHTML = products.map((product, index) => `
            <div class="supercell-product-item" onclick="buyGameProduct('${gameCategory}', ${index})">
                <div class="supercell-product-info">
                    <h3>${product.name || 'Товар'}</h3>
                    <p>${product.description || ''}</p>
                </div>
                <div class="supercell-product-price">
                    ${product.price || 0} ₽
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Ошибка загрузки товаров</div>';
    }
}

function buyGameProduct(gameCategory, productIndex) {
    try {
        const db = window.Database;
        const products = (db && typeof db.getProductsByCategory === 'function' ? db.getProductsByCategory(gameCategory) : null) || [];
        if (!products[productIndex]) {
            return;
        }
        
        const product = products[productIndex];
        const price = product.price || 0;
        
        // Сохраняем данные покупки и открываем выбор способа оплаты
        currentPurchase = {
            type: 'game',
            amount: price,
            login: null,
            productId: product.id || `${gameCategory}_${productIndex}`,
            productName: product.name || 'Товар игры'
        };
        
        showPaymentMethodSelection('game');
    } catch (error) {
        console.error('Ошибка покупки:', error);
        showStoreNotification('Ошибка при оформлении покупки', 'error');
    }
}

function loadSupercellProducts(game, container) {
    if (!container) return;
    
    try {
        const productsKey = `jetstore_supercell_${game}`;
        const products = JSON.parse(localStorage.getItem(productsKey) || '[]');
        
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Товары пока не добавлены</p>';
            return;
        }
        
        products.forEach((product, index) => {
            const item = document.createElement('div');
            item.className = 'supercell-product-item';
            item.innerHTML = `
                <div class="supercell-product-info">
                    <div class="supercell-product-name">${product.name || 'Товар'}</div>
                    <div class="supercell-product-price">${product.price || 0} ₽</div>
                </div>
                <button class="supercell-product-buy" onclick="buySupercellProduct('${game}', ${index})">
                    Купить
                </button>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Ошибка загрузки товаров Supercell:', error);
        container.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Ошибка загрузки товаров</p>';
    }
}

function buySupercellProduct(game, productIndex) {
    try {
        const productsKey = `jetstore_supercell_${game}`;
        const products = JSON.parse(localStorage.getItem(productsKey) || '[]');
        const product = products[productIndex];
        
        if (!product) {
            showStoreNotification('Товар не найден', 'error');
            return;
        }
        
        const price = parseFloat(product.price) || 0;
        if (price <= 0) {
            showStoreNotification('Неверная цена товара', 'error');
            return;
        }
        
        // Проверяем баланс
        const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
        let balance = 0;
        if (db && typeof db.getBalanceFixed === 'function') {
            balance = db.getBalanceFixed('RUB') || 0;
        } else {
            try {
                const d = JSON.parse(localStorage.getItem('jetstore_balance_fixed') || '{}');
                balance = d.RUB || 0;
            } catch (e) { balance = 0; }
        }
        
        if (balance < price) {
            showStoreNotification('Недостаточно средств на балансе', 'error');
            // Перенаправляем на пополнение
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1500);
            return;
        }
        
        // Списываем с баланса
        const newBalance = balance - price;
        if (db && typeof db.saveBalanceFixed === 'function') {
            db.saveBalanceFixed('RUB', newBalance);
        } else {
            try {
                const d = JSON.parse(localStorage.getItem('jetstore_balance_fixed') || '{}');
                d.RUB = newBalance;
                d.lastUpdate = Date.now();
                localStorage.setItem('jetstore_balance_fixed', JSON.stringify(d));
            } catch (e) {}
        }
        
        if (window.userData && window.userData.currencies) {
            window.userData.currencies.RUB = newBalance;
        }
        
        // Сохраняем покупку
        const purchase = {
            id: 'supercell_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: 'supercell',
            game: game,
            productName: product.name,
            price: price,
            status: 'в процессе',
            date: new Date().toISOString()
        };
        
        let purchases = JSON.parse(localStorage.getItem('jetstore_purchases') || '[]');
        purchases.unshift(purchase);
        localStorage.setItem('jetstore_purchases', JSON.stringify(purchases));
        
        // Обновляем баланс
        if (typeof updateStoreDisplay === 'function') updateStoreDisplay();
        if (typeof updateMarketBalance === 'function') updateMarketBalance();
        
        closeSupercellProducts();
        showStoreNotification('Покупка оформлена! Статус: в процессе', 'success');
        
    } catch (error) {
        console.error('Ошибка покупки товара Supercell:', error);
        showStoreNotification('Ошибка при оформлении покупки', 'error');
    }
}

// Закрытие попапов при клике вне их
document.addEventListener('click', function(e) {
    const supercellGamesPopup = document.getElementById('supercellGamesPopup');
    const supercellProductsPopup = document.getElementById('supercellProductsPopup');
    const gameProductsPopup = document.getElementById('gameProductsPopup');
    
    if (supercellGamesPopup && supercellGamesPopup.classList.contains('active')) {
        if (e.target === supercellGamesPopup) closeSupercellGames();
    }
    if (supercellProductsPopup && supercellProductsPopup.classList.contains('active')) {
        if (e.target === supercellProductsPopup) closeSupercellProducts();
    }
    if (gameProductsPopup && gameProductsPopup.classList.contains('active')) {
        if (e.target === gameProductsPopup) closeGameProducts();
    }
});

// Экспортируем функции
window.showSupercellGames = showSupercellGames;
window.closeSupercellGames = closeSupercellGames;
window.showSupercellProducts = showSupercellProducts;
window.closeSupercellProducts = closeSupercellProducts;
window.buySupercellProduct = buySupercellProduct;
window.showGameProducts = showGameProducts;
window.closeGameProducts = closeGameProducts;
window.buyGameProduct = buyGameProduct;
window.showPaymentMethodSelection = showPaymentMethodSelection;
window.closePaymentMethodPopup = closePaymentMethodPopup;
window.selectPaymentMethod = selectPaymentMethod;
window.showPaymentWaiting = showPaymentWaiting;
window.closePaymentWaiting = closePaymentWaiting;
window.openPaymentPage = openPaymentPage;

// Открыть рулетку
function openRoulette() {
    if (typeof showStoreNotification === 'function') {
        showStoreNotification('Рулетка скоро будет доступна!', 'info');
    }
}
window.openRoulette = openRoulette;