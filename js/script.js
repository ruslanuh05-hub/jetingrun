// script.js - Исправленный скрипт
const tg = window.Telegram?.WebApp;

// ============ ЗАЩИТА ОТ ХАКЕРОВ: валидация и санитизация ввода ============
var VALIDATION_LIMITS = {
    starsMin: 50,
    starsMax: 50000,
    steamMin: 50,
    steamMax: 500000,
    loginMaxLen: 32,
    premiumMonths: [3, 6, 12]
};

function sanitizeLogin(val) {
    if (val == null || typeof val !== 'string') return '';
    var s = val.trim().replace(/^@/, '');
    s = s.replace(/[^a-zA-Z0-9_]/g, '');
    return s.slice(0, VALIDATION_LIMITS.loginMaxLen);
}

function validateStarsAmount(amount) {
    var n = parseInt(amount, 10);
    if (isNaN(n) || n < VALIDATION_LIMITS.starsMin) return { ok: false, msg: 'Минимум 50 звёзд' };
    if (n > VALIDATION_LIMITS.starsMax) return { ok: false, msg: 'Максимум 50 000 звёзд за одну покупку' };
    return { ok: true, value: n };
}

function validateSteamAmount(amount) {
    var n = parseFloat(amount);
    if (isNaN(n) || !isFinite(n)) return { ok: false, msg: 'Введите корректную сумму' };
    if (n < VALIDATION_LIMITS.steamMin) return { ok: false, msg: 'Минимум 50 ₽ для Steam' };
    if (n > VALIDATION_LIMITS.steamMax) return { ok: false, msg: 'Максимум 500 000 ₽' };
    return { ok: true, value: n };
}

function validatePremiumMonths(months) {
    var n = parseInt(months, 10);
    if (VALIDATION_LIMITS.premiumMonths.indexOf(n) === -1) return { ok: false, msg: 'Выберите период: 3, 6 или 12 мес.' };
    return { ok: true, value: n };
}

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

// Управление экраном загрузки
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const progressBar = document.getElementById('loadingProgressBar');
    
    if (!loadingScreen) return;

    // Если мы пришли с premium.html для оплаты — не показываем splash/загрузку,
    // чтобы не было "прыжка" на главный экран перед выбором способа оплаты.
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('pay') === 'premium') {
            loadingScreen.classList.add('hidden');
            return;
        }
    } catch (e) {}
    
    // Проверяем, первый ли это вход
    const isFirstVisit = !localStorage.getItem('jetstore_visited');
    
    if (isFirstVisit) {
        loadingScreen.classList.remove('hidden');
        
        // Анимация прогресса загрузки
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15 + 5; // Случайный шаг от 5 до 20%
            if (progress > 90) progress = 90; // Останавливаемся на 90%, остальное после загрузки
            if (progressBar) {
                progressBar.style.width = progress + '%';
            }
        }, 200);
        
        // Сохраняем интервал для остановки
        window.loadingProgressInterval = interval;
    } else {
        // Если не первый визит, сразу скрываем
        loadingScreen.classList.add('hidden');
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const progressBar = document.getElementById('loadingProgressBar');
    
    if (!loadingScreen) return;
    
    // Останавливаем анимацию прогресса
    if (window.loadingProgressInterval) {
        clearInterval(window.loadingProgressInterval);
        window.loadingProgressInterval = null;
    }
    
    // Завершаем прогресс до 100%
    if (progressBar) {
        progressBar.style.width = '100%';
    }
    
    // Скрываем экран через небольшую задержку
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        // Помечаем, что пользователь уже посещал приложение
        localStorage.setItem('jetstore_visited', 'true');
    }, 300);
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация магазина...');
    
    // Показываем экран загрузки при первом входе
    showLoadingScreen();
    
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
    
    // Загружаем товары для активного раздела
    loadProductsForSection(currentSection);
    
    // Настраиваем обработчики событий
    setupEventListeners();

    // Подтягиваем актуальный курс звёзд с бэкенда (если доступен),
    // чтобы цены и курс были одинаковыми на всех устройствах.
    loadStarRateFromApi(function() {
        // После загрузки курса обновляем цены
        updatePricesDisplay();
    });
    
    // Загружаем курс TON↔RUB (для активов, аренды)
    if (typeof window.fetchTonToRubRateFromApi === 'function') {
        window.fetchTonToRubRateFromApi().then(function(rate) {
            if (rate != null) updatePricesDisplay();
        });
    }
    
    // Слушаем изменения цен в localStorage (если админ изменил цены)
    window.addEventListener('storage', function(e) {
        if (e.key === 'jetstore_stars_prices' || e.key === 'jetstore_premium_prices' || e.key === 'jetstore_star_rate' || e.key === 'jetstore_usd_rate') {
            updatePricesDisplay();
        }
    });
    
    // Также проверяем изменения каждые 2 секунды (на случай, если изменения в том же окне)
    setInterval(() => {
        updatePricesDisplay();
    }, 2000);
    
    // Переход с spin.html по кнопке «Купить»: открыть выбор способа оплаты
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pay') === 'spin') {
        const currency = urlParams.get('currency') || 'RUB';
        let spinData = {};
        try {
            spinData = JSON.parse(sessionStorage.getItem('spin_pay_data') || '{}');
        } catch (e) {}
        const amount = currency === 'RUB' ? 100 : 1.5;
        currentPurchase = {
            type: 'spin',
            amount: amount,
            amount_rub: currency === 'RUB' ? 100 : 0,
            amount_usdt: currency === 'USDT' ? 1.5 : 0,
            productName: '1 спин рулетки',
            currency: currency
        };
        if (typeof history.replaceState === 'function') {
            history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
        }
        if (typeof showPaymentMethodSelection === 'function') {
            showPaymentMethodSelection('spin');
        }
    } else if (urlParams.get('pay') === 'balance') {
        var amount = parseFloat(urlParams.get('amount') || '0') || 0;
        if (amount >= 100) {
            currentPurchase = {
                type: 'balance',
                amount: amount,
                currency: 'RUB',
                productName: 'Пополнение баланса'
            };
            previousView = { type: 'profile', gameCategory: null, supercellGame: null };
            if (typeof history.replaceState === 'function') {
                history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
            }
            if (typeof showPaymentMethodSelection === 'function') {
                showPaymentMethodSelection('balance');
            }
        }
    }
    // Переход с premium.html по кнопке «Оплатить»: открыть выбор способа оплаты
    else if (urlParams.get('pay') === 'premium') {
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
                months: parseInt(months, 10) || 3,
                login: recipient || null,
                productId: null,
                productName: 'Premium ' + months + ' мес.'
            };
            if (typeof history.replaceState === 'function') {
                history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
            }
            if (typeof showPaymentMethodSelection === 'function') {
                showPaymentMethodSelection('premium');
            }
        }
    }
    
    // Восстанавливаем незавершённый счёт CryptoBot (если пользователь вернулся после оплаты)
    restorePendingPayment();
    
    console.log('Магазин инициализирован. Баланс RUB:', window.userData?.currencies?.RUB);
    
    // Скрываем экран загрузки после завершения инициализации
    setTimeout(() => {
        hideLoadingScreen();
    }, 800);
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
    } else {
        // Если Telegram WebApp недоступен — не инициализируем тестового пользователя
        userId = null;
        window.userData.id = null;
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
        } else {
            // Прямая проверка localStorage
            const balanceKey = 'jetstore_balance_fixed';
            const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            savedBalance = balanceData.RUB || 0;
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

// Загрузка курса 1 звезды из localStorage / API
function getStarRate() {
    try {
        const rate = parseFloat(localStorage.getItem('jetstore_star_rate'));
        return rate && !isNaN(rate) ? rate : 1.37;
    } catch (error) {
        console.error('Ошибка загрузки курса 1 звезды:', error);
        return 1.37;
    }
}

// Актуализация курса 1 звезды с бэкенда (/api/star-rate), чтобы все устройства
// использовали общий курс из БД, а не только локальный кэш админки.
function loadStarRateFromApi(callback) {
    try {
        const apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBase) {
            if (typeof callback === 'function') callback();
            return;
        }
        fetch(apiBase.replace(/\/$/, '') + '/api/star-rate', { method: 'GET', mode: 'cors' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && typeof data.star_price_rub === 'number' && data.star_price_rub > 0) {
                    try { localStorage.setItem('jetstore_star_rate', String(data.star_price_rub)); } catch (e) {}
                }
                if (data && typeof data.star_buy_rate_rub === 'number' && data.star_buy_rate_rub > 0) {
                    try { localStorage.setItem('jetstore_star_buy_rate', String(data.star_buy_rate_rub)); } catch (e) {}
                }
                if (typeof callback === 'function') callback();
            })
            .catch(function() {
                if (typeof callback === 'function') callback();
            });
    } catch (e) {
        if (typeof callback === 'function') callback();
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
// Загрузка курса USD из админки / настроек
function getUsdRate() {
    try {
        const r = localStorage.getItem('jetstore_usd_rate');
        if (r && parseFloat(r) > 0) return parseFloat(r);
        const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
        if (db && typeof db.getCurrencyRates === 'function') {
            const rates = db.getCurrencyRates();
            if (rates && rates.USD) return rates.USD;
        }
        const settingsStr = localStorage.getItem('jetStoreAdminSettings');
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            if (settings?.currencyRates?.USD) return settings.currencyRates.USD;
            if (settings?.USD) return settings.USD;
        }
    } catch (error) {
        console.error('Ошибка загрузки курса USD:', error);
    }
    return 100;  // fallback для отображения цены в $
}

// Загрузка цен на звёзды из localStorage
function getStarsPrices() {
    try {
        const prices = JSON.parse(localStorage.getItem('jetstore_stars_prices') || '{}');
        const rate = getStarRate();
        const calc = (amount, fallback) => {
            const p = prices[amount];
            if (typeof p === 'number' && p > 0) return p;
            if (rate && !isNaN(rate) && rate > 0) {
                // Базовая цена от курса: amount * star_rate, с округлением до ₽
                return Math.round(amount * rate);
            }
            return fallback;
        };
        return {
            50: calc(50, 69),
            100: calc(100, 137),
            250: calc(250, 343),
            500: calc(500, 685),
            1000: calc(1000, 1370)
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
    
    // Обновляем цены на Premium (обычные карточки) — главная цена в $
    const premiumCards = document.querySelectorAll('.premium-card');
    premiumCards.forEach(card => {
        const months = parseInt(card.getAttribute('data-months'));
        if (months && premiumPrices[months]) {
            const priceRubEl = card.querySelector('.premium-price-rub');
            const priceUsdEl = card.querySelector('.premium-price-usd');
            const price = premiumPrices[months];
            const usdValue = (price / usdRate).toFixed(2);
            if (priceRubEl) priceRubEl.textContent = price.toLocaleString('ru-RU') + ' ₽';
            if (priceUsdEl) priceUsdEl.textContent = usdValue + ' $';
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
            const usdValue = (price / usdRate).toFixed(2);
            if (priceRubEl) priceRubEl.textContent = price.toLocaleString('ru-RU') + ' ₽';
            if (priceUsdEl) priceUsdEl.textContent = usdValue + ' $';
        }
    });
}

// Переключение вкладок магазина
function switchStoreTab(tab) {
    // Убираем активный класс у всех вкладок
    document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
    // Скрываем все секции и принудительно сбрасываем их высоту, чтобы убрать пустое пространство
    document.querySelectorAll('.store-section').forEach(s => {
        s.classList.remove('active');
        s.style.height = '0';
        s.style.overflow = 'hidden';
    });
    
    // Активируем выбранную вкладку
    const tabBtn = document.querySelector('.store-tab[data-tab="' + tab + '"]');
    // ВАЖНО: не используем неявную глобальную переменную `event` (на некоторых устройствах её нет),
    // иначе функция падает и вкладка остаётся пустой при повторном входе.
    if (tabBtn) {
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
        // Сначала принудительно показываем секцию (height: auto), затем добавляем класс active
        section.style.height = 'auto';
        section.style.overflow = 'visible';
        section.classList.add('active');
        
        // Агрессивный сброс скролла: вызываем несколько раз с задержками,
        // чтобы гарантированно убрать пустой отступ при повторном входе.
        function forceScrollReset() {
            try {
                if (typeof window !== 'undefined') {
                    window.scrollTo(0, 0);
                }
                if (document.documentElement) {
                    document.documentElement.scrollTop = 0;
                }
                if (document.body) {
                    document.body.scrollTop = 0;
                }
                const storeContent = document.querySelector('.store-content');
                if (storeContent) {
                    storeContent.scrollTop = 0;
                }
                const storeView = document.getElementById('storeView');
                if (storeView) {
                    storeView.scrollTop = 0;
                }
                const mainMenuContainer = document.querySelector('.main-menu-container');
                if (mainMenuContainer) {
                    mainMenuContainer.scrollTop = 0;
                }
            } catch (e) {}
        }
        
        // Сбрасываем скролл сразу и с задержками для надёжности
        forceScrollReset();
        setTimeout(forceScrollReset, 0);
        setTimeout(forceScrollReset, 50);
        setTimeout(forceScrollReset, 150);
        // Дополнительный сброс после того, как секция полностью отрисуется
        setTimeout(forceScrollReset, 300);
    }
    
    // Обновляем индикаторы
    const dots = document.querySelectorAll('.page-dot');
    dots.forEach((dot, index) => dot.classList.remove('active'));
    if (tab === 'stars') dots[0]?.classList.add('active');
    if (tab === 'rating') dots[1]?.classList.add('active');
    
    // Обновляем цены при переключении
    updatePricesDisplay();
    
    if (tab === 'rating') {
        initRatingSection();
    }
}

// ====== Рейтинг (топ покупателей) ======
let currentRatingPeriod = 'all';
let ratingInitialized = false;

function initRatingSection() {
    if (ratingInitialized) {
        loadRatingLeaderboard(currentRatingPeriod);
        return;
    }
    ratingInitialized = true;
    
    document.querySelectorAll('.rating-period-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.rating-period-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentRatingPeriod = this.getAttribute('data-period') || 'all';
            loadRatingLeaderboard(currentRatingPeriod);
        });
    });
    
    const toggle = document.getElementById('ratingShowMeToggle');
    if (toggle) {
        const saved = localStorage.getItem('jetstore_rating_show_me');
        if (saved !== null) toggle.checked = saved === 'true';
        toggle.addEventListener('change', function() {
            const checked = this.checked;
            localStorage.setItem('jetstore_rating_show_me', String(checked));
            // Ждём, пока сервер сохранит настройку, чтобы рейтинг не "мигал через раз"
            saveRatingAnonymity(checked)
                .then(function(ok) {
                    if (!ok) {
                        // В случае ошибки откатываем переключатель
                        toggle.checked = !checked;
                        localStorage.setItem('jetstore_rating_show_me', String(!checked));
                    }
                    loadRatingLeaderboard(currentRatingPeriod);
                });
        });
    }
    
    loadRatingLeaderboard(currentRatingPeriod);
}

function saveRatingAnonymity(show) {
    const apiBase = (typeof getJetApiBase === 'function' ? getJetApiBase() : '') || window.JET_API_BASE || '';
    if (!apiBase) return Promise.resolve(false);
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || window.userData;
    const userId = tgUser?.id || window.userData?.id;
    if (!userId) return Promise.resolve(false);
    return fetch(apiBase.replace(/\/$/, '') + '/api/rating/anonymity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show: !!show, userId: userId })
    })
        .then(function(r) { return r.ok; })
        .catch(function() { return false; });
}

function loadRatingLeaderboard(period) {
    const listEl = document.getElementById('ratingList');
    const loadingEl = document.getElementById('ratingLoading');
    const emptyEl = document.getElementById('ratingEmpty');
    if (!listEl) return;
    
    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.querySelectorAll('.rating-entry').forEach(el => el.remove());
    
    const apiBase = (typeof getJetApiBase === 'function' ? getJetApiBase() : '') || window.JET_API_BASE || '';
    const url = apiBase ? (apiBase.replace(/\/$/, '') + '/api/rating/leaderboard?period=' + encodeURIComponent(period)) : '';
    
    function renderEntries(entries) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (!entries || entries.length === 0) {
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || window.userData;
        const myId = (tgUser?.id || window.userData?.id) ? String(tgUser?.id || window.userData?.id) : null;
        
        entries.forEach(function(item, index) {
            const rank = index + 1;
            const isMe = myId && String(item.userId) === myId;
            const isHidden = !!item.hidden;
            const rankClass = rank === 1 ? 'rating-rank-1' : rank === 2 ? 'rating-rank-2' : rank === 3 ? 'rating-rank-3' : 'rating-rank-n';
            const rankHtml = rank <= 3
                ? '<span class="rating-medal ' + rankClass + '"><i class="fas fa-medal"></i><span class="rating-medal-num">' + rank + '</span></span>'
                : '<span class="' + rankClass + '">#' + rank + '</span>';
            
            let nameHtml;
            if (isHidden) {
                // Для себя показываем, что вы скрыты, но оставляем строку с очками
                nameHtml = isMe
                    ? '<i class="fas fa-lock rating-lock"></i>Вы скрыты'
                    : '<i class="fas fa-lock rating-lock"></i>Скрыто';
            } else {
                const firstName = (item.firstName || '').trim();
                nameHtml = firstName || 'Пользователь';
            }
            
            const orders = item.ordersCount || 0;
            const ordersText = orders === 1 ? '1 заказ' : orders >= 2 && orders <= 4 ? orders + ' заказа' : orders + ' заказов';
            
            const div = document.createElement('div');
            div.className = 'rating-entry' + (isMe ? ' rating-entry-me' : '');
            div.innerHTML =
                '<div class="rating-rank ' + rankClass + '">' + rankHtml + '</div>' +
                '<div class="rating-entry-info">' +
                    '<div class="rating-entry-name' + (isHidden ? ' hidden' : '') + '">' + nameHtml + '</div>' +
                    '<div class="rating-entry-orders">' + ordersText + '</div>' +
                '</div>' +
                '<div class="rating-entry-score">' + (item.score || 0).toLocaleString('ru-RU') + ' <i class="fas fa-star"></i></div>';
            listEl.appendChild(div);
        });
    }
    
    if (url) {
        fetch(url)
            .then(function(r) { return r.json().catch(function() { return null; }); })
            .then(function(data) {
                const entries = (data && data.entries) ? data.entries : [];
                renderEntries(entries);
            })
            .catch(function() {
                renderEntries([]);
            });
    } else {
        renderEntries([]);
    }
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
            price = Math.round(price * 0.96); // -4%
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
        const usdRate = getUsdRate();
        const priceUsd = (selectedPremium.price / usdRate).toFixed(2);
        btn.textContent = `Оплатить Premium ${selectedPremium.months} мес. за ${priceUsd} $`;
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
    var v = validateStarsAmount(selectedStars.amount);
    if (!v.ok) {
        showStoreNotification(v.msg, 'error');
        return;
    }
    
    // Санитизация получателя
    var recipientInput = document.getElementById('starsRecipient');
    var recipient = recipientInput ? sanitizeLogin(recipientInput.value) : '';
    if (!recipient) {
        showStoreNotification('Укажите получателя звёзд (@username)', 'error');
        return;
    }
    console.log('[proceedStarsPurchase] recipient из поля:', recipient, 'input value:', recipientInput ? recipientInput.value : 'input not found');
    
    // Сохраняем данные покупки (recipient уже санитизирован)
    currentPurchase = {
        type: 'stars',
        amount: selectedStars.price,
        stars_amount: selectedStars.amount,
        login: recipient,
        productId: null,
        productName: 'Покупка ' + selectedStars.amount + ' звёзд'
    };
    console.log('[proceedStarsPurchase] currentPurchase:', currentPurchase);
    
    showPaymentMethodSelection('stars');
}

// Покупка премиума
function proceedPremiumPurchase() {
    var pmCheck = validatePremiumMonths(selectedPremium.months);
    if (!pmCheck.ok) {
        showStoreNotification(pmCheck.msg, 'error');
        return;
    }
    
    // Санитизация получателя
    var recipientInput = document.getElementById('premiumRecipient') || document.getElementById('premiumPopupRecipient');
    var recipient = recipientInput ? sanitizeLogin(recipientInput.value) : '';
    
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
    // Сбрасываем превью получателя (чип), чтобы показать введённый username
    if (inputId === 'premiumRecipient' && typeof setPremiumRecipientState === 'function') {
        setPremiumRecipientState('empty');
    }

    // Как во Fragment: сразу ищем профиль по username
    if (inputId === 'starsRecipient' || inputId === 'premiumRecipient') {
        try { checkTelegramUser(inputId); } catch (e) {}
    }
}

function checkTelegramUser(inputId, previewId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const raw = (input.value || '').toString().trim();
    const clean = sanitizeLogin(raw);
    if (!clean || clean.length < 3) {
        if (inputId === 'starsRecipient') setStarsRecipientState('empty');
        if (inputId === 'premiumRecipient') setPremiumRecipientState('empty');
        if (inputId === 'march8Recipient') setMarch8RecipientState('empty');
        return;
    }

    if (inputId === 'starsRecipient') setStarsRecipientState('loading', { username: clean });
    if (inputId === 'premiumRecipient') setPremiumRecipientState('loading', { username: clean });
    if (inputId === 'march8Recipient') setMarch8RecipientState('loading', { username: clean });

    const apiBase = (typeof getJetApiBase === 'function' ? getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        // Если backend не настроен, не показываем ошибку — просто оставляем введённый @username
        if (clean) {
            input.value = '@' + clean.replace(/^@/, '');
        }
        if (inputId === 'starsRecipient') setStarsRecipientState('empty');
        if (inputId === 'premiumRecipient') setPremiumRecipientState('empty');
        if (inputId === 'march8Recipient') setMarch8RecipientState('empty');
        return;
    }
    const url = (apiBase || '').replace(/\/$/, '') + '/api/telegram/user?username=' + encodeURIComponent(clean);

    fetch(url, { method: 'GET', mode: 'cors' })
        .then(function(r) {
            if (!r.ok) {
                return r.json().catch(function() { return null; }).then(function(err) { throw err || new Error('not_found'); });
            }
            return r.json();
        })
        .then(function(u) {
            if (!u || u.error) throw u || new Error('not_found');

            let avatar = u.avatar || '';
            // Если Fragment вернул HTML тега <img>, аккуратно вытаскиваем src
            if (avatar && typeof avatar === 'string' && avatar.indexOf('<img') !== -1) {
                const m = avatar.match(/src=["']([^"']+)["']/i);
                if (m && m[1]) avatar = m[1];
            }

            const userData = {
                username: (u.username || clean || '').toString().replace(/^@/, ''),
                firstName: (u.first_name || u.firstName || '').toString(),
                avatar: avatar
            };

            // Нормализуем поле ввода: всегда @username
            if (userData.username) input.value = '@' + userData.username;

            if (inputId === 'starsRecipient') setStarsRecipientState('found', userData);
            if (inputId === 'premiumRecipient') setPremiumRecipientState('found', userData);
            if (inputId === 'march8Recipient') setMarch8RecipientState('found', userData);
        })
        .catch(function(err) {
            // Для пользователя всегда показываем простое сообщение "Пользователь не найден"
            const msg = 'Пользователь не найден';
            if (inputId === 'starsRecipient') setStarsRecipientState('not_found', { message: msg });
            if (inputId === 'premiumRecipient') setPremiumRecipientState('not_found', { message: msg });
            if (inputId === 'march8Recipient') setMarch8RecipientState('not_found', { message: msg });
        });
}

// Нормализация отображаемого имени (убираем @username из строки имени)
function normalizeDisplayName(userData) {
    const rawName = ((userData.firstName || userData.first_name || '') + '').trim();
    const uname = ((userData.username || '') + '').replace(/^@/, '');
    let base = rawName || uname;
    if (!base) return '';
    // Удаляем в имени куски вида "@Desperado9"
    base = base.replace(/@[\w\d_]+/g, '').trim();
    // Если после чистки ничего не осталось — показываем просто username без @
    return base || uname;
}

// Отображение превью пользователя
function showUserPreview(previewId, userData) {
    const preview = document.getElementById(previewId);
    if (!preview) return;
    
    const avatarEl = preview.querySelector('img');
    const nameEl = preview.querySelector('span');
    
    if (avatarEl) {
        const displayName = normalizeDisplayName(userData);
        avatarEl.src = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || userData.username || '')}&background=00d4ff&color=fff&size=128`;
        avatarEl.alt = displayName || userData.username || '';
    }
    
    if (nameEl) {
        nameEl.textContent = normalizeDisplayName(userData);
    }
    
    preview.style.display = 'flex';
}

// Состояния поля получателя в покупке звёзд
function setStarsRecipientState(state, userData) {
    const wrapper = document.getElementById('starsRecipientWrapper');
    const chip = document.getElementById('starsUserPreview');
    const errorText = document.getElementById('starsUserError');
    const avatarImg = document.getElementById('starsUserAvatar');
    const nameSpan = document.getElementById('starsUserName');

    if (!wrapper || !chip || !errorText) return;

    // Сброс
    wrapper.classList.remove('tg-user-input-error');
    chip.classList.remove('visible');
    errorText.style.display = 'none';

    if (state === 'empty') {
        if (avatarImg) {
            avatarImg.src = '';
            avatarImg.style.display = 'none';
        }
        if (nameSpan) {
            nameSpan.textContent = '';
        }
        chip.classList.remove('visible');
        return;
    }

    if (state === 'loading') {
        if (avatarImg) {
            avatarImg.style.display = 'block';
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                userData?.username || ''
            )}&background=00d4ff&color=fff&size=128`;
        }
        if (nameSpan) {
            nameSpan.textContent = 'Поиск пользователя...';
        }
        chip.classList.add('visible');
        return;
    }

    if (state === 'found' && userData) {
        if (avatarImg) {
            avatarImg.style.display = 'block';
            avatarImg.src =
                userData.avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    normalizeDisplayName(userData) || userData.username || ''
                )}&background=00d4ff&color=fff&size=128`;
        }
        if (nameSpan) {
            // В chip для звёзд показываем только имя (после очистки), без (@username)
            nameSpan.textContent = normalizeDisplayName(userData);
        }

        chip.classList.add('visible');
        return;
    }

    if (state === 'not_found') {
        wrapper.classList.add('tg-user-input-error');
        if (userData && userData.message) errorText.textContent = userData.message;
        else errorText.textContent = 'Пользователь не найден';
        errorText.style.display = 'block';
    }
}

function clearStarsRecipient() {
    const input = document.getElementById('starsRecipient');
    if (input) input.value = '';
    const nameSpan = document.getElementById('starsUserName');
    if (nameSpan) nameSpan.textContent = '';
    setStarsRecipientState('empty');
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
    chip.classList.remove('visible');
    errorText.style.display = 'none';
    input.style.display = 'block';
    if (state === 'empty') {
        if (avatarImg) {
            avatarImg.src = '';
            avatarImg.style.display = 'none';
        }
        if (nameSpan) {
            nameSpan.textContent = '';
        }
        chip.classList.remove('visible');
        return;
    }
    if (state === 'loading') {
        if (avatarImg) {
            avatarImg.style.display = 'block';
            avatarImg.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userData?.username || '') + '&background=00d4ff&color=fff&size=128';
        }
        if (nameSpan) nameSpan.textContent = 'Поиск пользователя...';
        chip.classList.add('visible');
        input.style.display = 'none';
        return;
    }
    if (state === 'found' && userData) {
        if (avatarImg) {
            avatarImg.style.display = 'block';
            avatarImg.src = userData.avatar || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(userData.username || userData.firstName || '') + '&background=00d4ff&color=fff&size=128');
        }
        if (nameSpan) {
            // В chip для Premium показываем только имя после очистки
            nameSpan.textContent = normalizeDisplayName(userData);
        }
        chip.classList.add('visible');
        input.style.display = 'none';
        return;
    }
    if (state === 'not_found') {
        wrapper.classList.add('tg-user-input-error');
        if (userData && userData.message) errorText.textContent = userData.message;
        else errorText.textContent = 'Пользователь не найден';
        errorText.style.display = 'block';
    }
}

function clearPremiumRecipient() {
    var input = document.getElementById('premiumRecipient');
    if (input) input.value = '';
    setPremiumRecipientState('empty');
}

function setMarch8RecipientState(state, userData) {
    const wrapper = document.getElementById('march8RecipientWrapper');
    const chip = document.getElementById('march8UserPreview');
    const errorText = document.getElementById('march8UserError');
    const avatarImg = document.getElementById('march8UserAvatar');
    const nameSpan = document.getElementById('march8UserName');
    if (!wrapper || !chip || !errorText) return;
    wrapper.classList.remove('tg-user-input-error');
    chip.classList.remove('visible');
    errorText.style.display = 'none';

    if (state === 'empty') {
        if (avatarImg) {
            avatarImg.src = '';
            avatarImg.style.display = 'none';
        }
        if (nameSpan) {
            nameSpan.textContent = '';
        }
        chip.classList.remove('visible');
        return;
    }
    if (state === 'loading') {
        if (avatarImg) {
            avatarImg.style.display = 'block';
            avatarImg.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userData?.username || '') + '&background=ff6bc2&color=fff&size=128';
        }
        if (nameSpan) nameSpan.textContent = 'Поиск пользователя...';
        chip.classList.add('visible');
        return;
    }
    if (state === 'found' && userData) {
        if (avatarImg) {
            avatarImg.style.display = 'block';
            avatarImg.src =
                userData.avatar ||
                'https://ui-avatars.com/api/?name=' +
                    encodeURIComponent(normalizeDisplayName(userData) || userData.username || '') +
                    '&background=ff6bc2&color=fff&size=128';
        }
        if (nameSpan) {
            nameSpan.textContent = normalizeDisplayName(userData);
        }
        chip.classList.add('visible');
        return;
    }
    if (state === 'not_found') {
        wrapper.classList.add('tg-user-input-error');
        if (userData && userData.message) errorText.textContent = userData.message;
        else errorText.textContent = 'Пользователь не найден';
        errorText.style.display = 'block';
    }
}

function clearMarch8Recipient() {
    const input = document.getElementById('march8Recipient');
    if (input) input.value = '';
    setMarch8RecipientState('empty');
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
        z-index: 99999;
        box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        text-align: center;
        font-weight: 600;
        animation: slideDown 0.4s ease-out;
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

    // Автопоиск получателя звёзд (как во Fragment): input (debounce) + Enter + blur
    const starsRecipientInput = document.getElementById('starsRecipient');
    if (starsRecipientInput) {
        let lookupTimer = null;
        const triggerLookup = function() {
            try { checkTelegramUser('starsRecipient', 'starsUserPreview'); } catch (e) {}
        };

        starsRecipientInput.addEventListener('input', function() {
            if (lookupTimer) clearTimeout(lookupTimer);
            lookupTimer = setTimeout(triggerLookup, 350);
        });
        starsRecipientInput.addEventListener('blur', function() {
            if (lookupTimer) clearTimeout(lookupTimer);
            triggerLookup();
        });
        starsRecipientInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (lookupTimer) clearTimeout(lookupTimer);
                triggerLookup();
                try { starsRecipientInput.blur(); } catch (err) {}
            }
        });
    }

    // Автопоиск получателя подарка на 8 марта
    const march8RecipientInput = document.getElementById('march8Recipient');
    if (march8RecipientInput) {
        let march8LookupTimer = null;
        const triggerMarch8Lookup = function() {
            try { checkTelegramUser('march8Recipient', 'march8UserPreview'); } catch (e) {}
        };

        march8RecipientInput.addEventListener('input', function() {
            if (march8LookupTimer) clearTimeout(march8LookupTimer);
            march8LookupTimer = setTimeout(triggerMarch8Lookup, 350);
        });
        march8RecipientInput.addEventListener('blur', function() {
            if (march8LookupTimer) clearTimeout(march8LookupTimer);
            triggerMarch8Lookup();
        });
        march8RecipientInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (march8LookupTimer) clearTimeout(march8LookupTimer);
                triggerMarch8Lookup();
                try { march8RecipientInput.blur(); } catch (err) {}
            }
        });
    }

    // Автопоиск получателя Premium: input (debounce) + Enter + blur
    const premiumRecipientInput = document.getElementById('premiumRecipient');
    if (premiumRecipientInput) {
        let premiumLookupTimer = null;
        const triggerPremiumLookup = function() {
            try { checkTelegramUser('premiumRecipient', 'premiumUserPreview'); } catch (e) {}
        };

        premiumRecipientInput.addEventListener('input', function() {
            if (premiumLookupTimer) clearTimeout(premiumLookupTimer);
            premiumLookupTimer = setTimeout(triggerPremiumLookup, 350);
        });
        premiumRecipientInput.addEventListener('blur', function() {
            if (premiumLookupTimer) clearTimeout(premiumLookupTimer);
            triggerPremiumLookup();
        });
        premiumRecipientInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (premiumLookupTimer) clearTimeout(premiumLookupTimer);
                triggerPremiumLookup();
                try { premiumRecipientInput.blur(); } catch (err) {}
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
        const usdRate = getUsdRate();
        const priceUsd = (selectedPremium.price / usdRate).toFixed(2);
        btn.textContent = `Оплатить Premium ${selectedPremium.months} мес. за ${priceUsd} $`;
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
    
    let amount = parseInt(input.value || '0', 10) || 0;
    
    if (amount < 1) amount = 0;
    if (amount > 200) amount = 200;
    
    input.value = amount ? amount : '';
    selectedTon = amount;
    
    updateTonContinueButton();
}

// Обновление состояния кнопки "Оплатить" для TON
function updateTonContinueButton() {
    const btn = document.getElementById('tonContinueBtn');
    if (!btn) return;
    
    if (selectedTon > 0) {
        btn.textContent = 'Оплатить';
        btn.classList.remove('disabled');
        btn.style.opacity = '1';
    } else {
        btn.textContent = 'Введите число от 1 до 200';
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
    
    const preview = document.getElementById('tonUserPreview');
    if (preview) preview.style.display = 'none';
    
    updateTonContinueButton();
    popup.classList.add('active');
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
    if (selectedTon <= 0) {
        showStoreNotification('Введите количество TON от 1 до 200', 'error');
        return;
    }
    
    const recipient = document.getElementById('tonRecipient')?.value || '';
    
    currentPurchase = {
        type: 'ton',
        amount: selectedTon,
        login: recipient,
        productId: null,
        productName: `Покупка ${selectedTon} TON`
    };
    
    closeTonPopup();
    showPaymentMethodSelection('ton');
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
    if (storeView) {
        storeView.classList.remove('active');
        // Сбрасываем inline-стили секций, иначе при 2-м заходе остаётся пустой экран
        document.querySelectorAll('.store-section').forEach(function(s) {
            s.style.height = '';
            s.style.overflow = '';
        });
    }
    if (marketView) marketView.style.display = 'none';
    
    // Выходим из режима магазина — возвращаем подвал
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('store-open');
    }
    
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
    
    // Включаем режим магазина — прячем подвал
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('store-open');
    }

    // Всегда прокручиваем окно и контент магазина в начало,
    // чтобы при повторном заходе не оставалось пустого пространства сверху.
    function resetStoreScroll() {
        try {
            if (typeof window !== 'undefined') {
                window.scrollTo(0, 0);
            }
            if (document.documentElement) {
                document.documentElement.scrollTop = 0;
            }
            if (document.body) {
                document.body.scrollTop = 0;
            }
            const storeContent = document.querySelector('.store-content');
            if (storeContent) {
                storeContent.scrollTop = 0;
            }
            const mainMenuContainer = document.querySelector('.main-menu-container');
            if (mainMenuContainer) {
                mainMenuContainer.scrollTop = 0;
            }
        } catch (e) {}
    }
    resetStoreScroll();
    // На некоторых устройствах Telegram сначала меняет высоту webview,
    // поэтому дублируем сброс скролла на следующий тик.
    setTimeout(resetStoreScroll, 0);
    
    // Обновляем активные кнопки в нижней навигации
    const navButtons = document.querySelectorAll('.main-nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));
    const telegramBtn = Array.from(navButtons).find(btn => btn.textContent.includes('Telegram'));
    if (telegramBtn) telegramBtn.classList.add('active');
    
    // Переключаем на нужную вкладку / окно
    if (section === 'stars') {
        // Сбрасываем inline-стили секций (важно при 2-м заходе — иначе пустой экран)
        document.querySelectorAll('.store-section').forEach(function(s) {
            s.style.height = '';
            s.style.overflow = '';
        });
        const starsSection = document.getElementById('starsSection');
        if (starsSection) {
            document.querySelectorAll('.store-section').forEach(function(s) {
                s.classList.remove('active');
                s.style.height = '0';
                s.style.overflow = 'hidden';
            });
            starsSection.classList.add('active');
            starsSection.style.height = 'auto';
            starsSection.style.overflow = 'visible';
        }
        const starsTab = document.querySelector('.store-tab[data-tab="stars"]');
        if (starsTab) {
            document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
            starsTab.classList.add('active');
        }
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
        showStoreNotification('Пополнение Steam временно недоступно', 'info');
        showMainMenuView();
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

// Курс Steam: 1 ₽ на Steam = X ₽ (с бэкенда /api/steam-rate или из админки localStorage)
var _steamRateCache = null;
function getSteamRate() {
    if (_steamRateCache != null && _steamRateCache > 0) return _steamRateCache;
    try {
        var v = parseFloat(localStorage.getItem('jetstore_steam_rate') || '1.06');
        return v > 0 ? v : 1.06;
    } catch (e) { return 1.06; }
}
function updateSteamPayTotalDisplay() {
    var amount = parseFloat(document.getElementById('steamAmount')?.value) || 0;
    var rate = getSteamRate();
    var total = amount > 0 ? (Math.round(amount * rate * 100) / 100) : 0;
    var el = document.getElementById('steamPayTotalDisplay');
    if (el) el.textContent = 'К оплате: ' + (total > 0 ? total.toLocaleString('ru-RU') + ' ₽' : '0 ₽');
}
// Загрузить курс Steam с бэкенда (курс из админки / env)
function loadSteamRateFromApi(callback) {
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        if (callback) callback();
        return;
    }
    fetch(apiBase.replace(/\/$/, '') + '/api/steam-rate', { method: 'GET', mode: 'cors' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (data && typeof data.steam_rate_rub === 'number' && data.steam_rate_rub > 0) {
                _steamRateCache = data.steam_rate_rub;
                try { localStorage.setItem('jetstore_steam_rate', String(_steamRateCache)); } catch (e) {}
            }
            if (callback) callback();
        })
        .catch(function() { if (callback) callback(); });
}

// Функции для окна пополнения Steam
function showSteamTopup() {
    const popup = document.getElementById('steamTopupPopup');
    if (!popup) return;
    document.body.classList.add('steam-popup-open');
    var rateEl = document.getElementById('steamRateDisplay');
    var payTotalEl = document.getElementById('steamPayTotalDisplay');
    function applyRate() {
        var rate = getSteamRate();
        if (rateEl) rateEl.textContent = '1 ₽ на Steam = ' + rate.toFixed(2).replace('.', ',') + ' ₽';
        updateSteamPayTotalDisplay();
    }
    loadSteamRateFromApi(applyRate);
    applyRate();
    popup.classList.add('active');
    var amountInput = document.getElementById('steamAmount');
    if (amountInput) {
        if (window._steamAmountInputHandler) {
            amountInput.removeEventListener('input', window._steamAmountInputHandler);
        }
        // Обновляем отображение и ограничиваем ввод: только max (мин проверяем при отправке)
        window._steamAmountInputHandler = function() {
            var el = document.getElementById('steamAmount');
            if (el) {
                var v = parseFloat(el.value);
                if (!isNaN(v) && v > VALIDATION_LIMITS.steamMax) {
                    el.value = VALIDATION_LIMITS.steamMax;
                }
            }
            updateSteamPayTotalDisplay();
        };
        amountInput.addEventListener('input', window._steamAmountInputHandler);
    }
    
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
    
    const loginInput = document.getElementById('steamLogin');
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
    document.body.classList.remove('steam-popup-open');
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
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
}

function closeSteamLoginHelpModal() {
    const overlay = document.getElementById('steamLoginHelpOverlay');
    const modal = document.getElementById('steamLoginHelpModal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.remove('active');
}

// Модальное окно с важной инструкцией по пополнению Steam
function openSteamImportantInfo() {
    const overlay = document.getElementById('steamImportantOverlay');
    const modal = document.getElementById('steamImportantModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
}

function closeSteamImportantInfo() {
    const overlay = document.getElementById('steamImportantOverlay');
    const modal = document.getElementById('steamImportantModal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.remove('active');
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
        RUB: { icon: '₽', hint: '₽' }
    };
    const cfg = map[code] || map.RUB;

    const iconEl = document.getElementById('steamCurrencyIcon');
    const hintEl = document.getElementById('steamCurrencyHint');
    if (iconEl) iconEl.textContent = cfg.icon;
    if (hintEl) hintEl.textContent = cfg.hint;

    const btn = document.getElementById('steamCurRub');
    if (btn) btn.classList.add('active');
}

// Сохраняем информацию о предыдущем окне для возврата
let previousView = {
    type: null, // 'steam', 'store', 'game', 'supercell'
    gameCategory: null,
    supercellGame: null
};

// Комиссия Platega (СБП %, Карты %) — при каждом открытии выбора способа оплаты запрашиваем актуальные значения с сервера
function loadPlategaCommissionIfNeeded() {
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) return;
    fetch(apiBase.replace(/\/$/, '') + '/api/platega-commission', { method: 'GET', mode: 'cors' })
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(data) {
            window._plategaCommission = {
                sbp: (data.sbp_percent != null && !isNaN(data.sbp_percent)) ? Number(data.sbp_percent) : 10,
                cards: (data.cards_percent != null && !isNaN(data.cards_percent)) ? Number(data.cards_percent) : 14
            };
        })
        .catch(function() {
            window._plategaCommission = window._plategaCommission || { sbp: 10, cards: 14 };
        });
}

// Показать окно выбора способа оплаты
function showPaymentMethodSelection(purchaseType) {
    loadPlategaCommissionIfNeeded();
    // Сохраняем данные покупки
    if (purchaseType === 'steam') {
        var steamLoginEl = document.getElementById('steamLogin');
        var steamAmountEl = document.getElementById('steamAmount');
        var loginVal = steamLoginEl ? sanitizeLogin(steamLoginEl.value) : '';
        var amountVal = steamAmountEl ? parseFloat(steamAmountEl.value) : 0;
        
        if (!loginVal) {
            showStoreNotification('Введите логин Steam', 'error');
            return;
        }
        
        var steamCheck = validateSteamAmount(amountVal);
        if (!steamCheck.ok) {
            showStoreNotification(steamCheck.msg, 'error');
            return;
        }
        amountVal = steamCheck.value;
        
        currentPurchase = {
            type: 'steam',
            amount: amountVal,
            login: loginVal,
            productId: null,
            productName: 'Пополнение Steam',
            currency: currentSteamCurrency
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
            type: 'store',
            gameCategory: 'ton',
            supercellGame: null
        };
    } else if (purchaseType === 'spin') {
        previousView = { type: 'spin', gameCategory: null, supercellGame: null };
        // Для спина: показываем только подходящие способы оплаты (RUB → FreeKassa, USDT → CryptoBot)
        var rubSection = document.querySelector('#paymentMethodPopup .payment-category:first-of-type');
        var cryptoSection = document.querySelector('#paymentMethodPopup .payment-category:last-of-type');
        if (rubSection && cryptoSection && currentPurchase) {
            var cur = currentPurchase.currency || 'RUB';
            rubSection.style.display = cur === 'RUB' ? '' : 'none';
            cryptoSection.style.display = cur === 'USDT' ? '' : 'none';
        }
    } else if (purchaseType === 'balance') {
        if (window.currentPurchase && window.currentPurchase.type === 'balance') {
            currentPurchase = window.currentPurchase;
        }
        previousView = { type: 'profile', gameCategory: null, supercellGame: null };
        // Пополнение баланса: те же способы оплаты, что и везде (рубли + крипто)
        var rubSection = document.querySelector('#paymentMethodPopup .payment-category:first-of-type');
        var cryptoSection = document.querySelector('#paymentMethodPopup .payment-category:last-of-type');
        if (rubSection) rubSection.style.display = '';
        if (cryptoSection) cryptoSection.style.display = '';
    } else if (purchaseType !== 'spin') {
        // Сбрасываем скрытие для других типов покупок
        var rubSection = document.querySelector('#paymentMethodPopup .payment-category:first-of-type');
        var cryptoSection = document.querySelector('#paymentMethodPopup .payment-category:last-of-type');
        if (rubSection) rubSection.style.display = '';
        if (cryptoSection) cryptoSection.style.display = '';
    }
    
    if (purchaseType === 'game') {
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
    
    const popup = document.getElementById('paymentMethodPopup');
    if (popup) {
        popup.classList.add('active');
    }
}

// Закрыть окно выбора способа оплаты и (опционально) вернуться в предыдущее окно
// skipReturnToPrevious = true: только закрыть попап, не возвращаться (при выборе способа оплаты)
function closePaymentMethodPopup(skipReturnToPrevious) {
    const popup = document.getElementById('paymentMethodPopup');
    if (popup) {
        popup.classList.remove('active');
    }
    
    if (skipReturnToPrevious) return;
    
    // Возвращаем пользователя в предыдущее окно
    if (previousView.type === 'steam') {
        // Возвращаем в окно Steam пополнения
        if (typeof showSteamTopup === 'function') {
            showSteamTopup();
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
    } else if (previousView.type === 'spin') {
        var spinUrl = 'spin.html';
        if (window.location.pathname.indexOf('/html/') < 0) spinUrl = 'html/spin.html';
        window.location.href = spinUrl;
        return;
    } else if (previousView.type === 'profile') {
        var profileUrl = 'profile.html';
        if (window.location.pathname.indexOf('/html/') < 0) profileUrl = 'html/profile.html';
        window.location.href = profileUrl;
        return;
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

// ======== Предложить идею ========
var ideaCooldownInterval = null;

function getIdeaUserIdForCooldown() {
    var tgUser = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe
        ? window.Telegram.WebApp.initDataUnsafe.user
        : null;
    if (tgUser && tgUser.id) return String(tgUser.id);
    if (window.userData && window.userData.id) return String(window.userData.id);
    return null;
}

function getIdeaCooldownStorageKey(userId) {
    return 'jet_idea_cooldown_' + (userId || 'anon');
}

function applyIdeaCooldown(nextTs) {
    var btn = document.getElementById('ideaSubmitBtn');
    var hint = document.getElementById('ideaCooldownHint');
    if (!btn || !hint) return;

    function updateCooldownText() {
        var nowSec = Math.floor(Date.now() / 1000);
        var remaining = Math.max(0, Math.floor(nextTs - nowSec));
        if (remaining <= 0) {
            hint.style.display = 'none';
            hint.textContent = '';
            btn.disabled = false;
            btn.textContent = 'Отправить';
            if (ideaCooldownInterval) {
                clearInterval(ideaCooldownInterval);
                ideaCooldownInterval = null;
            }
            var uid = getIdeaUserIdForCooldown();
            if (uid) {
                try { localStorage.removeItem(getIdeaCooldownStorageKey(uid)); } catch (e) {}
            }
            return;
        }
        var hours = Math.floor(remaining / 3600);
        var minutes = Math.floor((remaining % 3600) / 60);
        var text = 'Новую идею можно будет отправить через ';
        if (hours > 0) {
            text += hours + ' ч';
            if (minutes > 0) text += ' ' + minutes + ' мин';
        } else {
            text += minutes + ' мин';
        }
        hint.textContent = text;
        hint.style.display = 'block';
        btn.disabled = true;
        btn.textContent = 'Таймер...';
    }

    updateCooldownText();
    if (ideaCooldownInterval) clearInterval(ideaCooldownInterval);
    ideaCooldownInterval = setInterval(updateCooldownText, 60000);
}

function restoreIdeaCooldownIfNeeded() {
    var uid = getIdeaUserIdForCooldown();
    if (!uid) return;
    var key = getIdeaCooldownStorageKey(uid);
    var storedTs = 0;
    try {
        storedTs = parseInt(localStorage.getItem(key) || '0', 10);
    } catch (e) {
        storedTs = 0;
    }
    if (!storedTs) return;
    var nowSec = Math.floor(Date.now() / 1000);
    if (storedTs > nowSec) {
        applyIdeaCooldown(storedTs);
    } else {
        try { localStorage.removeItem(key); } catch (e) {}
    }
}

function openIdeaModal() {
    var overlay = document.getElementById('ideaOverlay');
    var modal = document.getElementById('ideaModal');
    var textarea = document.getElementById('ideaText');
    var counter = document.getElementById('ideaCounter');
    var btn = document.getElementById('ideaSubmitBtn');
    if (!overlay || !modal || !textarea || !btn) return;
    overlay.classList.add('active');
    modal.classList.add('active');
    textarea.value = '';
    if (counter) counter.textContent = '0 / 500';
    btn.disabled = false;
    btn.textContent = 'Отправить';
    // Проверяем, есть ли активный таймер на отправку идеи
    restoreIdeaCooldownIfNeeded();
    setTimeout(function() { textarea.focus(); }, 50);
}

function closeIdeaModal() {
    var overlay = document.getElementById('ideaOverlay');
    var modal = document.getElementById('ideaModal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.remove('active');
}

function updateIdeaCounter() {
    var textarea = document.getElementById('ideaText');
    var counter = document.getElementById('ideaCounter');
    if (!textarea || !counter) return;
    var len = (textarea.value || '').length;
    counter.textContent = len + ' / 500';
}

async function submitIdea() {
    var textarea = document.getElementById('ideaText');
    var btn = document.getElementById('ideaSubmitBtn');
    if (!textarea || !btn) return;
    var text = (textarea.value || '').trim();
    if (!text || text.length < 5) {
        if (typeof showStoreNotification === 'function') {
            showStoreNotification('Опишите идею чуть подробнее (минимум 5 символов).', 'info');
        } else {
            alert('Опишите идею чуть подробнее (минимум 5 символов).');
        }
        return;
    }
    if (text.length > 500) {
        text = text.slice(0, 500);
        textarea.value = text;
    }

    // Локальная проверка таймера перед отправкой (12 часов на одного пользователя)
    var localUserId = getIdeaUserIdForCooldown();
    if (localUserId) {
        var key = getIdeaCooldownStorageKey(localUserId);
        var storedTs = 0;
        try {
            storedTs = parseInt(localStorage.getItem(key) || '0', 10);
        } catch (e) {
            storedTs = 0;
        }
        var nowSecCheck = Math.floor(Date.now() / 1000);
        if (storedTs && storedTs > nowSecCheck) {
            applyIdeaCooldown(storedTs);
            // Показываем всплывающее окно с оставшимся временем
            var remaining = storedTs - nowSecCheck;
            openIdeaCooldownModal(remaining);
            return;
        }
    }

    btn.disabled = true;
    btn.textContent = 'Отправка...';

    // Жёстко берём данные из Telegram WebApp (чтобы разные аккаунты на одном устройстве не путались)
    var tgUser = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe
        ? window.Telegram.WebApp.initDataUnsafe.user
        : null;
    var userId = localUserId;
    var username = tgUser && tgUser.username
        ? tgUser.username
        : (window.userData && window.userData.username ? window.userData.username : '');
    var firstName = tgUser && tgUser.first_name
        ? tgUser.first_name
        : (window.userData && window.userData.firstName ? window.userData.firstName : '');

    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || '';
    if (!apiBase) {
        apiBase = window.JET_BOT_API_URL || window.JET_BOT_API_FALLBACK || '';
    }
    apiBase = String(apiBase || '').replace(/\/$/, '');

    try {
        if (!apiBase) throw new Error('API URL empty');
        var resp = await fetch(apiBase + '/api/idea/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                username: username,
                first_name: firstName,
                text: text,
                source: 'webapp_main'
            })
        });
        var data = {};
        try { data = await resp.json(); } catch (e) {}
        if (resp.ok && data && data.success) {
                if (typeof showStoreNotification === 'function') {
                showStoreNotification('Спасибо! Идея отправлена команде JET.', 'success');
            } else {
                alert('Спасибо! Идея отправлена команде JET.');
            }
            // Фиксируем локальный таймер на 12 часов вперёд
            if (userId) {
                var nextTsSuccess = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
                try {
                    localStorage.setItem(getIdeaCooldownStorageKey(userId), String(nextTsSuccess));
                } catch (e) {}
                applyIdeaCooldown(nextTsSuccess);
            }
            closeIdeaModal();
            } else {
            var msg = (data && data.message) || 'Не удалось отправить идею. Попробуйте позже.';
                if (typeof showStoreNotification === 'function') {
                showStoreNotification(msg, 'error');
            } else {
                alert(msg);
            }
            // Если сервер вернул, что сработал лимит (cooldown) — фиксируем таймер локально
            if (data && data.error === 'cooldown' && data.retry_after_seconds && userId) {
                var nextTs = Math.floor(Date.now() / 1000) + Number(data.retry_after_seconds || 0);
                try {
                    localStorage.setItem(getIdeaCooldownStorageKey(userId), String(nextTs));
                } catch (e) {}
                applyIdeaCooldown(nextTs);
                openIdeaCooldownModal(Number(data.retry_after_seconds || 0));
            } else {
                btn.disabled = false;
                btn.textContent = 'Отправить';
            }
        }
    } catch (e) {
        console.warn('submitIdea error:', e);
            if (typeof showStoreNotification === 'function') {
            showStoreNotification('Сеть недоступна. Попробуйте ещё раз позже.', 'error');
        } else {
            alert('Сеть недоступна. Попробуйте ещё раз позже.');
        }
        btn.disabled = false;
        btn.textContent = 'Отправить';
    }
}

function openIdeaCooldownModal(remainingSeconds) {
    var overlay = document.getElementById('ideaCooldownOverlay');
    var modal = document.getElementById('ideaCooldownModal');
    var textEl = document.getElementById('ideaCooldownModalText');
    if (!overlay || !modal || !textEl) return;

    var sec = Math.max(0, Math.floor(remainingSeconds || 0));
    var hours = Math.floor(sec / 3600);
    var minutes = Math.floor((sec % 3600) / 60);
    if (minutes <= 0 && hours === 0) minutes = 1;

    var text = 'Новую идею можно будет отправить через ';
    if (hours > 0) {
        text += hours + ' ч';
        if (minutes > 0) text += ' ' + minutes + ' мин';
    } else {
        text += minutes + ' мин';
    }
    textEl.textContent = text + '.';

    overlay.classList.add('active');
    modal.classList.add('active');
}

function closeIdeaCooldownModal() {
    var overlay = document.getElementById('ideaCooldownOverlay');
    var modal = document.getElementById('ideaCooldownModal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.remove('active');
}

// Экспорт в глобальную область
window.openIdeaModal = openIdeaModal;
window.closeIdeaModal = closeIdeaModal;
window.submitIdea = submitIdea;
window.updateIdeaCounter = updateIdeaCounter;
window.openIdeaCooldownModal = openIdeaCooldownModal;
window.closeIdeaCooldownModal = closeIdeaCooldownModal;

// Выбрать способ оплаты
// plategaMethod: 2 = СБП, 10 = Карты (для Platega)
// Для FreeKassa через методы 'sbp' / 'card' третий параметр используется как значение i (44 = СБП (QR), 36 = карты РФ)
function selectPaymentMethod(method, bonusPercent, plategaMethod) {
    // Синхронизация с window.currentPurchase (например, при пополнении баланса из профиля)
    if (window.currentPurchase && window.currentPurchase.type) {
        currentPurchase = window.currentPurchase;
    }
    
    closePaymentMethodPopup(true);  // Не возвращаться назад — идём к оплате
    
    var baseAmount, commission, totalAmount, purchase;
    var isPlatega = (method === 'platega');
    var isFreeKassa = (method === 'sbp' || method === 'card');
    var plategaCommissionPct = 0;
    if (isPlatega && (plategaMethod === 2 || plategaMethod === 10)) {
        var c = window._plategaCommission || {};
        plategaCommissionPct = (plategaMethod === 2) ? (c.sbp != null ? c.sbp : 10) : (c.cards != null ? c.cards : 14);
    }
    if (currentPurchase.type === 'steam') {
        var amountSteam = currentPurchase.amount;  // рубли на Steam (что вводил пользователь)
        var amountRub = Math.round(amountSteam * getSteamRate() * 100) / 100;  // базовая сумма по курсу
        baseAmount = amountRub;
        // Для FreeKassa комиссия только для отображения — FreeKassa сама добавит комиссию при оплате
        if (isFreeKassa) {
            commission = 0;  // Не добавляем к сумме
            totalAmount = baseAmount;  // Отправляем сумму без комиссии
        } else {
            commission = isPlatega ? Math.round(baseAmount * plategaCommissionPct / 100) : Math.round(baseAmount * (bonusPercent || 0) / 100);
            totalAmount = baseAmount + commission;
        }
        purchase = {
            type: 'steam',
            amount_steam: amountSteam,
            amount: amountRub,
            login: currentPurchase.login,
            currency: currentPurchase.currency || 'RUB',
            productId: currentPurchase.productId,
            productName: currentPurchase.productName
        };
    } else {
        baseAmount = currentPurchase.amount;
        if (currentPurchase.type === 'balance') {
            baseAmount = parseFloat(currentPurchase.amount) || 0;
        }
        // Для FreeKassa комиссия только для отображения — FreeKassa сама добавит комиссию при оплате
        if (isFreeKassa) {
            commission = 0;  // Не добавляем к сумме
            totalAmount = baseAmount;  // Отправляем сумму без комиссии
        } else {
            commission = isPlatega ? Math.round(baseAmount * plategaCommissionPct / 100) : Math.round(baseAmount * (bonusPercent || 0) / 100);
            totalAmount = baseAmount + commission;
        }
        purchase = currentPurchase;
        if (purchase.type === 'balance') purchase.amount = baseAmount;
    }
    
    // Дополняем purchase username / first_name из Telegram WebApp / userData,
    // чтобы рейтинг и рефералка видели логин, а не "Пользователь".
    try {
        var tgUser = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) || null;
        var localUser = (window.userData && (window.userData.user || window.userData)) || null;
        var srcUser = tgUser || localUser;
        if (srcUser) {
            if (!purchase.username && srcUser.username) {
                purchase.username = String(srcUser.username).trim();
            }
            if (!purchase.first_name && (srcUser.first_name || srcUser.firstName)) {
                purchase.first_name = String(srcUser.first_name || srcUser.firstName).trim();
            }
        }
    } catch (e) {
        console.warn('[selectPaymentMethod] failed to enrich purchase with username:', e);
    }
    
    // Глобальный уникальный ID заказа для связи админ‑поиска и истории (#ABC123)
    try {
        var existing = [];
        try {
            existing = JSON.parse(localStorage.getItem('jetstore_purchases') || '[]');
            if (!Array.isArray(existing)) existing = [];
        } catch (e) {
            existing = [];
        }
        var usedIds = {};
        for (var ei = 0; ei < existing.length; ei++) {
            var eo = existing[ei] && existing[ei].orderId;
            if (eo) usedIds[String(eo).toUpperCase()] = true;
        }
        function genOrderId() {
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            var code = '';
            for (var j = 0; j < 6; j++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return '#' + code;
        }
        if (!purchase.order_id) {
            var oid = '';
            var tries = 0;
            do {
                oid = genOrderId();
                tries++;
            } while (usedIds[oid.toUpperCase()] && tries < 50);
            purchase.order_id = oid;
        }
    } catch (e) {
        console.warn('[selectPaymentMethod] order_id generation error:', e);
    }
    
    // Убеждаемся, что для звёзд и премиума login сохраняется
    if ((purchase.type === 'stars' || purchase.type === 'premium') && !purchase.login) {
        console.warn('[selectPaymentMethod] ВНИМАНИЕ: purchase.login отсутствует для', purchase.type, 'purchase:', purchase);
    }
    
    window.paymentData = {
        method: method,
        // Для FreeKassa bonusPercent используется только для отображения в UI (комиссия FreeKassa добавляется на их стороне)
        bonusPercent: isPlatega ? plategaCommissionPct : bonusPercent,  // Для FreeKassa: 5 (sbp) или 6 (card)
        baseAmount: baseAmount,
        commission: commission,  // Для FreeKassa = 0, т.к. комиссия добавляется на стороне FreeKassa
        totalAmount: totalAmount,  // Для FreeKassa = baseAmount (без комиссии)
        purchase: purchase
    };
    if (purchase.order_id) {
        window.paymentData.order_id = purchase.order_id;
    }
    if (method === 'platega' && (plategaMethod === 2 || plategaMethod === 10)) {
        window.paymentData.platega_method = plategaMethod;
    }
    
    console.log('[selectPaymentMethod] window.paymentData.purchase:', window.paymentData.purchase);
    
    // Перед оплатой всегда показываем экран с приёмом Оферты и Политики.
    // Кнопка "Оплатить" на этом экране становится доступна только после галочки.
    showPaymentWaiting();
}

// Показать экран ожидания оплаты
function showPaymentWaiting() {
    const popup = document.getElementById('paymentWaitingPopup');
    if (!popup || !window.paymentData) return;
    
    const data = window.paymentData;
    // Для пополнения баланса: если baseAmount не передан/0, берём из purchase.amount
    if (data.purchase && data.purchase.type === 'balance' && (data.baseAmount == null || data.baseAmount === 0) && data.purchase.amount > 0) {
        data.baseAmount = parseFloat(data.purchase.amount) || 0;
        data.commission = (data.method === 'sbp' || data.method === 'card') ? 0 : (data.commission || 0);
        data.totalAmount = (data.method === 'sbp' || data.method === 'card') ? data.baseAmount : (data.baseAmount + (data.commission || 0));
    }
    const methodNames = {
        'sbp': 'СБП (FreeKassa)',
        'card': 'Карта (FreeKassa)',
        'cryptobot': 'CryptoBot',
        'platega': (data.platega_method === 2 ? 'СБП (Platega)' : 'Карты (Platega)')
    };
    
    const statusEl = document.getElementById('paymentDetailStatus');
    if (statusEl) statusEl.textContent = 'Ожидание оплаты...';

    const primaryBtn = document.getElementById('paymentWaitingPrimaryBtn');
    const termsCheckbox = document.getElementById('paymentTermsCheckbox');
    if (primaryBtn) {
        primaryBtn.textContent = 'Оплатить';
    }

    // Изначально скрываем/блокируем кнопку до принятия оферты и политики
    function updateTermsState() {
        const accepted = !!(termsCheckbox && termsCheckbox.checked);
        if (primaryBtn) {
            primaryBtn.disabled = !accepted;
            primaryBtn.classList.toggle('disabled', !accepted);
            primaryBtn.style.visibility = accepted ? 'visible' : 'hidden';
        }
    }
    if (termsCheckbox) {
        termsCheckbox.checked = false;
        termsCheckbox.onchange = updateTermsState;
    }
    updateTermsState();

    // Обновляем данные на экране
    const steamCur = data.purchase?.currency || 'RUB';
    const steamSymbols = { RUB: '₽' };
    const curSym = steamSymbols[steamCur] || '₽';

    if (data.purchase?.type === 'steam') {
        var amountSteam = data.purchase.amount_steam != null ? data.purchase.amount_steam : data.baseAmount;
        document.getElementById('paymentWaitingDescription').textContent =
            'Пополнение Steam для ' + (data.purchase.login || '') + ' на ' + (amountSteam.toLocaleString('ru-RU')) + ' ₽ (на кошелёк)';
        document.getElementById('paymentDetailAmount').textContent = data.baseAmount.toLocaleString('ru-RU') + ' ₽';
    } else if (data.purchase?.type === 'spin') {
        var spinCur = data.purchase.currency || 'RUB';
        var spinAmt = spinCur === 'RUB' ? data.baseAmount : data.baseAmount;
        var spinSym = spinCur === 'RUB' ? ' ₽' : ' USDT';
        var methodLabel = (data.method === 'sbp' || data.method === 'card') ? (methodNames[data.method] + (data.bonusPercent ? ' (' + data.bonusPercent + '%)' : '')) : methodNames[data.method];
        document.getElementById('paymentWaitingDescription').textContent =
            '1 спин рулетки — оплатите ' + spinAmt.toLocaleString('ru-RU') + spinSym + ' через ' + methodLabel;
        document.getElementById('paymentDetailAmount').textContent = spinAmt.toLocaleString('ru-RU') + spinSym;
    } else {
        var isFreeKassa = (data.method === 'sbp' || data.method === 'card');
        var methodLabel = methodNames[data.method] + (data.bonusPercent ? ` (${data.bonusPercent > 0 ? '+' : ''}${data.bonusPercent}%)` : '');
        // Для FreeKassa показываем, что комиссия будет добавлена на их стороне
        if (isFreeKassa) {
            document.getElementById('paymentWaitingDescription').textContent =
                'Оплатите ' + data.baseAmount.toLocaleString('ru-RU') + ' ₽ через ' + methodLabel + ' (комиссия FreeKassa будет добавлена при оплате)';
        } else {
            document.getElementById('paymentWaitingDescription').textContent =
                'Оплатите ' + data.totalAmount.toLocaleString('ru-RU') + ' ₽ через ' + methodLabel;
        }
        document.getElementById('paymentDetailAmount').textContent = data.baseAmount.toLocaleString('ru-RU') + ' ₽';
    }
    var isFreeKassa = (data.method === 'sbp' || data.method === 'card');
    var isSpin = data.purchase?.type === 'spin';
    var spinCurSym = isSpin && (data.purchase?.currency || 'RUB') === 'USDT' ? ' USDT' : '₽';
    // Для FreeKassa всегда показываем комиссию (5% для СБП, 6% для карт)
    if (isFreeKassa) {
        var fkCommissionPct = data.method === 'sbp' ? 5 : 6;  // FreeKassa комиссии: СБП 5%, карты 6%
        document.getElementById('paymentDetailCommissionLabel').textContent = 'Комиссия FreeKassa (' + fkCommissionPct + '%)';
        var estimatedCommission = Math.round(data.baseAmount * fkCommissionPct / 100);
        document.getElementById('paymentDetailCommission').textContent = '~+' + estimatedCommission.toLocaleString('ru-RU') + ' ' + (isSpin ? spinCurSym : (data.purchase?.type === 'steam' ? curSym : '₽'));
        // Итого = базовая сумма (комиссия добавится на стороне FreeKassa)
        var estimatedTotal = data.baseAmount + estimatedCommission;
        document.getElementById('paymentDetailTotal').textContent = estimatedTotal.toLocaleString('ru-RU') + ' ' + (isSpin ? spinCurSym : (data.purchase?.type === 'steam' ? curSym : '₽'));
    } else {
        document.getElementById('paymentDetailCommissionLabel').textContent = 'Комиссия (' + (data.bonusPercent || 0) + '%)';
        var commSym = (data.purchase?.type === 'spin' && data.purchase?.currency === 'USDT') ? ' USDT' : (data.purchase?.type === 'steam' ? curSym : '₽');
        document.getElementById('paymentDetailCommission').textContent = '+' + data.commission.toLocaleString('ru-RU') + ' ' + commSym;
        document.getElementById('paymentDetailTotal').textContent = data.totalAmount.toLocaleString('ru-RU') + ' ' + commSym;
    }
    document.getElementById('paymentDetailMethod').textContent = methodNames[data.method] + (data.bonusPercent ? ' (' + (data.bonusPercent > 0 ? '+' : '') + data.bonusPercent + '%)' : '');
    
    popup.classList.add('active');
    
    // Запускаем автоматический polling для проверки оплаты
    if (typeof window.startPaymentPolling === 'function') {
        window.startPaymentPolling();
    }
}

// savePendingPayment и restorePendingPayment вынесены в js/payment.js

// Закрыть экран ожидания оплаты
function closePaymentWaiting() {
    // Останавливаем polling при закрытии попапа
    if (typeof window.stopPaymentPolling === 'function') {
        window.stopPaymentPolling();
    }
    
    const popup = document.getElementById('paymentWaitingPopup');
    if (popup) {
        popup.classList.remove('active');
    }
    try {
        localStorage.removeItem('jetstore_pending_payment_order');
    } catch (e) {
        console.warn('Ошибка очистки незавершённого счёта:', e);
    }
    window.paymentData = null;
    currentPurchase = { type: null, amount: 0, login: null, productId: null, productName: null };
}

// Функции платежей, выдачи и покупок вынесены в отдельные модули:
// - js/payment.js - confirmPayment, savePendingPayment, restorePendingPayment
// - js/delivery.js - runDeliveryAfterPayment
// - js/purchases.js - recordPurchaseSuccess, recordPurchaseIntent

// Открыть страницу оплаты
function openPaymentPage() {
    if (!window.paymentData) return;
    
    const data = window.paymentData;
    if (typeof recordPurchaseIntent === 'function') recordPurchaseIntent(data);
    const statusEl = document.getElementById('paymentDetailStatus');
    const primaryBtn = document.getElementById('paymentWaitingPrimaryBtn');

    // CryptoBot: создание инвойса (для всех типов, включая звёзды)
    if (data.method === 'cryptobot') {
        var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBase) {
            if (typeof showStoreNotification === 'function') showStoreNotification('API бота не настроен. Укажите URL в js/config.js (JET_BOT_API_URL).', 'error');
            return;
        }
        if (statusEl) statusEl.textContent = 'Создаём счёт CryptoBot...';
        if (primaryBtn) primaryBtn.disabled = true;
        // Безопасность: передаём ТОЛЬКО type + минимальные данные. Цена и payload — на бэке.
        var p = data.purchase || {};
        var userId = (window.userData && window.userData.id) || (window.userData && window.userData.user && window.userData.user.id) || 'unknown';
        var createUrl = apiBase.replace(/\/$/, '') + '/api/cryptobot/create-invoice';
        var bodyPayload;
        if (p.type === 'balance') {
            bodyPayload = {
                context: 'deposit',
                user_id: userId,
                amount: parseFloat(p.amount) || 0
            };
        } else {
            var purchaseMinimal = { type: p.type };
            if (p.type === 'stars') {
                purchaseMinimal.stars_amount = p.stars_amount;
                purchaseMinimal.login = p.login;
            } else if (p.type === 'premium') {
                purchaseMinimal.months = p.months;
            } else if (p.type === 'steam') {
                purchaseMinimal.amount_steam = p.amount_steam != null ? p.amount_steam : p.amount;
                purchaseMinimal.login = p.login;
            } else if (p.type === 'spin') {
                purchaseMinimal.amount_usdt = 1.5;
            } else if (p.type === 'gift_pack') {
                purchaseMinimal.pack_id = p.pack_id;
            } else if (p.type === 'march8') {
                purchaseMinimal.stars_amount = p.stars_amount;
                purchaseMinimal.login = p.login;
                purchaseMinimal.gifts = p.gifts || {};
                purchaseMinimal.message = p.message || '';
            }
            bodyPayload = {
                context: 'purchase',
                user_id: userId,
                purchase: purchaseMinimal
            };
        }
        console.log('[CryptoBot] Отправка запроса на:', createUrl);
        
        // Таймаут для fetch (30 секунд)
        var timeoutPromise = new Promise(function(resolve, reject) {
            setTimeout(function() {
                reject(new Error('Таймаут запроса (30 сек). Проверьте, что бот запущен на Railway.'));
            }, 30000);
        });
        
        var fetchPromise = fetch(createUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
        });
        
        Promise.race([fetchPromise, timeoutPromise])
            .then(function(r) {
                console.log('[CryptoBot] Получен ответ, status:', r.status, 'ok:', r.ok);
                if (!r.ok) {
                    return r.text().then(function(text) {
                        console.error('[CryptoBot] Ошибка HTTP:', r.status, 'body:', text);
                        return { ok: false, status: r.status, json: { error: 'http_error', message: 'HTTP ' + r.status + ': ' + (text || 'пустой ответ') } };
                    });
                }
                return r.json().catch(function(e) {
                    console.error('[CryptoBot] Ошибка парсинга JSON:', e);
                    return r.text().then(function(text) {
                        return { ok: r.ok, status: r.status, json: { error: 'parse_error', message: 'Ответ сервера не JSON. Status: ' + r.status + ', body: ' + (text || 'пусто') } };
                    });
                }).then(function(json) {
                    return { ok: r.ok, status: r.status, json: json };
                });
            })
            .then(function(result) {
                console.log('[CryptoBot] Результат обработки:', result);
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
                    // Сохраняем незавершённый счёт CryptoBot, чтобы его можно было продолжить после перезахода
                    if (typeof savePendingPayment === 'function') {
                        savePendingPayment();
                    }
                    // Теперь, когда invoice_id создан, запускаем polling для проверки оплаты
                    if (typeof window.startPaymentPolling === 'function') {
                        window.startPaymentPolling();
                    }
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
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification('Мы открыли страницу оплаты. После оплаты статус обновится автоматически.', 'info');
                    }
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
                    if (res.details) {
                        if (typeof res.details === 'string') errMsg += ': ' + res.details;
                        else if (typeof res.details === 'object' && res.details.name) errMsg += ' (' + res.details.name + ')';
                    }
                    if (res.details === 'Not Found' || (errMsg + '').indexOf('Not Found') >= 0) {
                        errMsg = 'Сервер API не найден. Проверьте, что бот запущен и JET_BOT_API_URL в config.js указывает на корректный URL.';
                    }
                    console.error('[CryptoBot] Ошибка от сервера. Полный ответ:', JSON.stringify(res, null, 2), 'URL:', createUrl, 'Status:', result.status);
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification(errMsg, 'error');
                    }
                }
            })
            .catch(function(err) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                var errMsg = err && err.message ? err.message : String(err || 'Неизвестная ошибка');
                console.error('[CryptoBot] Критическая ошибка:', err, 'apiBase:', apiBase, 'URL:', createUrl);
                var msg = 'Ошибка создания счёта: ' + errMsg + '. Проверьте: 1) URL бота в config.js (' + (apiBase || 'не задан') + ') 2) Бот запущен на Railway 3) Откройте консоль браузера (F12) для деталей.';
                if (typeof showStoreNotification === 'function') showStoreNotification(msg, 'error');
            });
        return;
    }

    // Platega (карты / СБП): создание транзакции и переход по redirect
    if (data.method === 'platega') {
        var apiBasePlatega = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBasePlatega) {
            if (typeof showStoreNotification === 'function') showStoreNotification('API бота не настроен. Укажите URL в js/config.js.', 'error');
            return;
        }
        var plategaLabel = (data.platega_method === 2) ? 'СБП' : 'Карты';
        if (statusEl) statusEl.textContent = 'Создаём платёж (' + plategaLabel + ')...';
        if (primaryBtn) primaryBtn.disabled = true;
        var createUrlPlatega = apiBasePlatega.replace(/\/$/, '') + '/api/platega/create-transaction';
        fetch(createUrlPlatega, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context: 'purchase',
                user_id: (window.userData && window.userData.id) || (window.userData && window.userData.user && window.userData.user.id) || 'unknown',
                purchase: data.purchase || {},
                platega_method: (data.platega_method === 2 || data.platega_method === 10) ? data.platega_method : 10
            })
        })
            .then(function(r) {
                return r.text().then(function(t) {
                    var j = null;
                    try { j = t ? JSON.parse(t) : {}; } catch (e) {}
                    return { ok: r.ok, status: r.status, text: t, json: j };
                });
            })
            .then(function(result) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание оплаты...';
                if (!result.ok) {
                    var errMsg = (result.json && result.json.message) || (result.json && result.json.error) || result.text || ('Ошибка ' + result.status);
                    if (typeof showStoreNotification === 'function') showStoreNotification(errMsg, 'error');
                    console.error('[Platega] create-transaction failed:', result.status, result.json || result.text);
                    return;
                }
                var res = result.json || {};
                if (res.success && res.redirect) {
                    window.paymentData = window.paymentData || {};
                    window.paymentData.transaction_id = res.transaction_id;
                    if (typeof savePendingPayment === 'function') savePendingPayment();
                    if (typeof window.startPaymentPolling === 'function') window.startPaymentPolling();
                    var payUrl = (res.redirect || '').trim();
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                        try { window.Telegram.WebApp.openLink(payUrl); } catch (e) { window.open(payUrl, '_blank'); }
                    } else {
                        window.open(payUrl, '_blank');
                    }
                    if (typeof showStoreNotification === 'function') showStoreNotification('Открыта страница оплаты. После оплаты статус обновится автоматически.', 'info');
                    if (statusEl) {
                        statusEl.innerHTML = 'Платёж создан. <a href="#" id="plategaOpenLink" style="color:#00d4ff;text-decoration:underline;">Открыть оплату</a>';
                        var linkEl = document.getElementById('plategaOpenLink');
                        if (linkEl) linkEl.onclick = function(e) {
                            e.preventDefault();
                            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(payUrl);
                            else window.open(payUrl, '_blank');
                        };
                    }
                } else {
                    if (typeof showStoreNotification === 'function') showStoreNotification((res.message || res.error || 'Ошибка создания платежа') + '', 'error');
                }
            })
            .catch(function(err) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание оплаты...';
                if (typeof showStoreNotification === 'function') showStoreNotification('Ошибка сети. Попробуйте позже.', 'error');
            });
        return;
    }

    // FreeKassa (СБП / карты): создание заказа и переход по ссылке оплаты
    if (data.method === 'sbp' || data.method === 'card') {
        var apiBaseFk = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBaseFk) {
            if (typeof showStoreNotification === 'function') showStoreNotification('API бота не настроен. Укажите URL в js/config.js.', 'error');
            return;
        }
        var fkLabel = data.method === 'sbp' ? 'СБП (FreeKassa)' : 'Карта (FreeKassa)';
        if (statusEl) statusEl.textContent = 'Создаём платёж (' + fkLabel + ')...';
        if (primaryBtn) primaryBtn.disabled = true;
        // Параметр i для FreeKassa: 44 — СБП (QR), 36 — карты РФ
        var fkI = data.method === 'sbp' ? 44 : 36;
        var createUrlFk = apiBaseFk.replace(/\/$/, '') + '/api/freekassa/create-order';
        var requestBody = {
            context: 'purchase',
            user_id: (window.userData && window.userData.id) || (window.userData && window.userData.user && window.userData.user.id) || 'unknown',
            purchase: data.purchase || {},
            method: data.method,
            i: fkI
        };
        console.log('[FreeKassa] Sending request to:', createUrlFk);
        console.log('[FreeKassa] Request body:', requestBody);
        fetch(createUrlFk, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        })
            .then(function(r) {
                return r.text().then(function(t) {
                    var j = null;
                    try { j = t ? JSON.parse(t) : {}; } catch (e) {}
                    return { ok: r.ok, status: r.status, text: t, json: j };
                });
            })
            .then(function(result) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание оплаты...';
                if (!result.ok) {
                    var errMsg = (result.json && (result.json.message || result.json.error)) || result.text || ('Ошибка ' + result.status);
                    if (result.json && result.json.error === 'not_configured') errMsg = 'FreeKassa не настроена (заданы ли FREEKASSA_SHOP_ID, FREEKASSA_API_KEY и FREEKASSA_SECRET2 на сервере?).';
                    else if ((result.json && result.json.details === 'Not Found') || (errMsg + '').indexOf('Not Found') >= 0) errMsg = 'Сервер API не найден. Проверьте JET_BOT_API_URL в config.js и что бот запущен на Railway.';
                    if (typeof showStoreNotification === 'function') showStoreNotification(errMsg, 'error');
                    console.error('[FreeKassa] create-order failed:', result.status, result.json || result.text);
                    return;
                }
                var res = result.json || {};
                if (res.success && res.payment_url) {
                    window.paymentData = window.paymentData || {};
                    if (res.order_id) window.paymentData.order_id = res.order_id;
                    window.paymentData.payment_url = res.payment_url;
                    if (typeof window.startPaymentPolling === 'function') window.startPaymentPolling();
                    var payUrl = (res.payment_url || '').trim();
                    if (payUrl) {
                        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
                            try { window.Telegram.WebApp.openLink(payUrl); } catch (e) { window.open(payUrl, '_blank'); }
                        } else {
                            window.open(payUrl, '_blank');
                        }
                        if (typeof showStoreNotification === 'function') showStoreNotification('Открыта страница оплаты. После оплаты статус обновится автоматически.', 'info');
                        if (statusEl) {
                            statusEl.innerHTML = 'Платёж создан. <a href="#" id="freekassaOpenLink" style="color:#00d4ff;text-decoration:underline;">Открыть оплату</a>';
                            var linkEl = document.getElementById('freekassaOpenLink');
                            if (linkEl) linkEl.onclick = function(e) {
                                e.preventDefault();
                                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(payUrl);
                                else window.open(payUrl, '_blank');
                            };
                        }
                    }
                } else {
                    if (typeof showStoreNotification === 'function') showStoreNotification((res.message || res.error || 'Ошибка создания платежа') + '', 'error');
                }
            })
            .catch(function(err) {
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = '';
                var errMsg = 'Ошибка сети';
                if (err && err.message) {
                    errMsg += ': ' + err.message;
                } else {
                    errMsg += '. Не удалось подключиться к серверу.';
                }
                errMsg += ' Проверьте подключение к интернету и попробуйте позже.';
                console.error('[FreeKassa] create-order network error:', err);
                console.error('[FreeKassa] URL was:', createUrlFk);
                if (typeof showStoreNotification === 'function') showStoreNotification(errMsg, 'error');
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

    // Звёзды: Fragment.com / TonKeeper — этот путь используется только если method НЕ 'cryptobot'
    if (data.purchase?.type === 'stars' && data.method !== 'cryptobot') {
        console.log('[Fragment Stars] Начинаем создание заказа звёзд через Fragment');
        var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var recipient = (data.purchase.login || '').toString().trim().replace(/^@/, '');
        var starsAmount = data.purchase.stars_amount || data.baseAmount || 0;
        console.log('[Fragment Stars] apiBase:', apiBase, 'recipient:', recipient, 'starsAmount:', starsAmount);
        if (!apiBase || !recipient || !starsAmount) {
            console.error('[Fragment Stars] Недостаточно данных для создания заказа');
            if (typeof showStoreNotification === 'function') showStoreNotification('Укажите получателя и количество звёзд.', 'error');
            return;
        }
        if (statusEl) statusEl.textContent = 'Создаём заказ...';
        if (primaryBtn) primaryBtn.disabled = true;
        var fragmentUrl = apiBase.replace(/\/$/, '') + '/api/fragment/create-star-order';
        console.log('[Fragment Stars] Отправка POST на:', fragmentUrl);
        fetch(fragmentUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: recipient, stars_amount: starsAmount })
        })
            .then(function(r) {
                console.log('[Fragment Stars] Получен ответ от сервера, status:', r.status, 'ok:', r.ok);
                return r.json().catch(function(e) {
                    console.error('[Fragment Stars] Ошибка парсинга JSON:', e);
                    return r.text().then(function(text) {
                        console.error('[Fragment Stars] Тело ответа (не JSON):', text);
                        return { error: 'parse_error', message: 'Ответ не JSON: ' + text };
                    });
                });
            })
            .then(function(res) {
                console.log('[Fragment Stars] Результат от сервера:', res);
                if (primaryBtn) primaryBtn.disabled = false;
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (res.success && res.order_id) {
                    window.paymentData = window.paymentData || {};
                    window.paymentData.order_id = res.order_id;
                    if (res.payment_url) window.paymentData.payment_url = res.payment_url;
                    var payUrl = res.payment_url || res.pay_url || data.payment_url || data.pay_url;
                    if (payUrl && (window.Telegram?.WebApp?.openLink || window.open)) {
                        if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(payUrl);
                        else window.open(payUrl, '_blank');
                    } else {
                        if (typeof showStoreNotification === 'function') showStoreNotification('Оплатите в TonKeeper по заказу Fragment. Статус обновится автоматически после оплаты.', 'info');
                    }
                } else if (res.success && !res.order_id && res.mode === 'wallet') {
                    // Режим кошелька (TON / внешний платёж): backend вернул текстовое сообщение,
                    // показываем его как информационное, а не как ошибку.
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification(
                            res.message || 'Мы открыли способ оплаты. После оплаты статус обновится автоматически.',
                            'info'
                        );
                    }
                } else {
                    if (typeof showStoreNotification === 'function') {
                        showStoreNotification(res.message || 'Ошибка создания заказа.', 'error');
                    }
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
                    var payUrl = res.payment_url || res.pay_url || data.payment_url || data.pay_url;
                    if (payUrl && (window.Telegram?.WebApp?.openLink || window.open)) {
                        if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(payUrl);
                        else window.open(payUrl, '_blank');
                    } else {
                        if (typeof showStoreNotification === 'function') showStoreNotification('Оплатите в TonKeeper по заказу Fragment. Статус обновится автоматически после оплаты.', 'info');
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
    } else if (data.method === 'sbp') {
        // Здесь будет логика для СБП
        showStoreNotification('Открываем страницу оплаты СБП...', 'info');
    } else if (data.method === 'card') {
        // Здесь будет логика для карты
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
// processSteamPayment устарела и больше не используется:
// логика оплаты перенесена в showPaymentMethodSelection / selectPaymentMethod / showPaymentWaiting.
// Чтобы не ронять скрипт на хостинге, экспорт этой несуществующей функции убираем.
// window.processSteamPayment = processSteamPayment;
window.openSteamLoginHelpModal = openSteamLoginHelpModal;
window.closeSteamLoginHelpModal = closeSteamLoginHelpModal;
window.showAssetsView = showAssetsView;
window.showNFTGifts = showNFTGifts;
window.closeNFTGifts = closeNFTGifts;

// -------- Подарок на 8 марта --------

var MARCH8_GIFTS = {
    rose:    { priceRub: 40,  name: 'Роза' },
    diamond: { priceRub: 140, name: 'Алмаз' },
    bouquet: { priceRub: 70,  name: 'Букет' },
    heart:   { priceRub: 30,  name: 'Сердечко' },
    ring:    { priceRub: 140, name: 'Кольцо' },
    bear:    { priceRub: 70,  name: 'Мишка' }
};

var march8Quantities = { rose: 0, diamond: 0, bouquet: 0, heart: 0, ring: 0, bear: 0 };

function openMarch8Popup() {
    var popup = document.getElementById('nftGiftsPopup');
    if (!popup) return;
    march8Quantities = { rose: 0, diamond: 0, bouquet: 0, heart: 0, ring: 0, bear: 0 };
    var starsEl = document.getElementById('march8StarsAmount');
    var recipientEl = document.getElementById('march8Recipient');
    var messageEl = document.getElementById('march8Message');
    if (starsEl) starsEl.value = '';
    if (recipientEl) recipientEl.value = '';
    if (messageEl) messageEl.value = '';
    document.getElementById('march8QtyRose').textContent = '0';
    document.getElementById('march8QtyDiamond').textContent = '0';
    document.getElementById('march8QtyBouquet').textContent = '0';
    document.getElementById('march8QtyHeart').textContent = '0';
    document.getElementById('march8QtyRing').textContent = '0';
    var bearEl = document.getElementById('march8QtyBear');
    if (bearEl) bearEl.textContent = '0';
    popup.classList.add('active');
    if (typeof loadStarRateFromApi === 'function') {
        loadStarRateFromApi(updateMarch8Summary);
    } else {
        updateMarch8Summary();
    }
}

function changeMarch8GiftQty(id, delta) {
    if (!MARCH8_GIFTS[id]) return;
    var q = (march8Quantities[id] || 0) + delta;
    if (q < 0) q = 0;
    march8Quantities[id] = q;
    var el = document.getElementById('march8Qty' + (id.charAt(0).toUpperCase() + id.slice(1)));
    if (el) {
        el.textContent = String(q);
        el.classList.remove('qty-update');
        el.offsetHeight;
        el.classList.add('qty-update');
        setTimeout(function() { el.classList.remove('qty-update'); }, 350);
    }
    updateMarch8Summary();
}

function updateMarch8Summary() {
    var starsInput = parseInt(document.getElementById('march8StarsAmount')?.value || '0', 10) || 0;
    var giftRub = 0;
    var parts = [];
    for (var k in MARCH8_GIFTS) {
        var q = march8Quantities[k] || 0;
        if (q > 0) {
            var gr = (MARCH8_GIFTS[k].priceRub || 0) * q;
            giftRub += gr;
            parts.push(q + ' × ' + (MARCH8_GIFTS[k].name || ''));
        }
    }
    var totalStars = starsInput;
    var starRate = (typeof getStarRate === 'function') ? getStarRate() : 1.37;
    var starsRub = totalStars > 0 ? totalStars * starRate : 0;
    var totalRub = Math.round((starsRub + giftRub) * 100) / 100;
    document.getElementById('march8SummaryStars').textContent = totalStars + '⭐ Stars';
    document.getElementById('march8SummaryGifts').textContent = parts.length ? parts.join(', ') : '—';
    document.getElementById('march8SummaryTotal').textContent = 'Итого: ' + totalRub.toLocaleString('ru-RU') + ' ₽';
    var payBtn = document.getElementById('march8PayBtn');
    var payAmount = document.getElementById('march8PayAmount');
    if (payAmount) payAmount.textContent = totalRub.toLocaleString('ru-RU');
    if (payBtn) {
        payBtn.disabled = totalRub <= 0;
    }
}

function fillMarch8Recipient() {
    var tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user;
    var el = document.getElementById('march8Recipient');
    if (el && tg && tg.username) {
        el.value = tg.username.startsWith('@') ? tg.username : '@' + tg.username;
    }
}

function submitMarch8Gift() {
    var starsInput = parseInt(document.getElementById('march8StarsAmount')?.value || '0', 10) || 0;
    if (starsInput < 50) {
        if (typeof showStoreNotification === 'function') showStoreNotification('Минимум 50 Stars', 'error');
        return;
    }
    var giftRub = 0;
    for (var k in MARCH8_GIFTS) {
        giftRub += (MARCH8_GIFTS[k].priceRub || 0) * (march8Quantities[k] || 0);
    }
    var totalStars = starsInput;
    var starRate = (typeof getStarRate === 'function') ? getStarRate() : 1.37;
    var starsRub = totalStars * starRate;
    var totalRub = Math.round((starsRub + giftRub) * 100) / 100;
    var recipient = (document.getElementById('march8Recipient')?.value || '').trim().replace(/^@/, '');
    if (!recipient) {
        if (typeof showStoreNotification === 'function') showStoreNotification('Укажите получателя', 'error');
        return;
    }
    var message = (document.getElementById('march8Message')?.value || '').trim();
    currentPurchase = {
        type: 'march8',
        amount: totalRub,
        stars_amount: totalStars,
        login: recipient,
        gifts: {
            rose: march8Quantities.rose || 0,
            diamond: march8Quantities.diamond || 0,
            bouquet: march8Quantities.bouquet || 0,
            heart: march8Quantities.heart || 0,
            ring: march8Quantities.ring || 0,
            bear: march8Quantities.bear || 0
        },
        message: message,
        productName: 'Подарок на 8 марта'
    };
    previousView = { type: 'store', gameCategory: 'steam', supercellGame: null };
    closeNFTGifts();
    showPaymentMethodSelection('march8');
}

window.openMarch8Popup = openMarch8Popup;
window.changeMarch8GiftQty = changeMarch8GiftQty;
window.updateMarch8Summary = updateMarch8Summary;
window.fillMarch8Recipient = fillMarch8Recipient;
window.submitMarch8Gift = submitMarch8Gift;

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
        
        // Определяем пользователя (для разделения истории по аккаунтам)
        let uid = null;
        try {
            const tg = window.Telegram && window.Telegram.WebApp;
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
                uid = tg.initDataUnsafe.user.id;
            }
        } catch (e) {}
        if (!uid && window.userData && window.userData.id) {
            uid = window.userData.id;
        }
        if (uid != null && uid !== undefined) uid = String(uid); else uid = null;
        
        // Сохраняем покупку
        const purchase = {
            id: 'supercell_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: 'supercell',
            game: game,
            productName: product.name,
            price: price,
            status: 'в процессе',
            date: new Date().toISOString(),
            userId: uid
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

// Открыть юридические документы (оферта, политика) из любого экрана
function openLegalDocument(type) {
    var urls = {
        offer: 'https://telegra.ph/Dogovor-Oferty-02-11-4',
        agreement: 'https://telegra.ph/Polzovatelskoe-soglashenie-02-11-33',
        privacy: 'https://telegra.ph/Politika-konfidecialnosti-02-11'
    };
    var url = urls[type] || null;
    if (!url) return;
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.openLink) {
        tg.openLink(url);
    } else {
        window.open(url, '_blank');
    }
}
window.openLegalDocument = openLegalDocument;
window.closePaymentMethodPopup = closePaymentMethodPopup;
window.selectPaymentMethod = selectPaymentMethod;
window.showPaymentWaiting = showPaymentWaiting;
window.closePaymentWaiting = closePaymentWaiting;
window.openPaymentPage = openPaymentPage;

// Открыть рулетку
function openRoulette() {
    var spinUrl = (window.location.pathname.indexOf('/html/') >= 0) ? 'spin.html' : 'html/spin.html';
    window.location.href = spinUrl;
}
window.openRoulette = openRoulette;