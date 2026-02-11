// database.js - База данных (анонимный класс, чтобы не конфликтовать с admin.js)
// ВАЖНО: оборачиваем в guard, чтобы файл мог быть подключён повторно
// (например, через SPA или сниппеты) без ошибки "Identifier 'Database' has already been declared".
if (!(typeof window !== 'undefined' && window.Database)) {

const Database = class {
    constructor() {
        this.storageKey = 'jetstore_db';
        this.usersKey = 'jetstore_users';
        this.productsKey = 'jetstore_products';
        // ФИКСИРОВАННЫЙ ключ для баланса (независимо от пользователя)
        this.balanceKey = 'jetstore_balance_fixed';
        this.userIdKey = 'jetstore_user_id_fixed';
    }
    
    // Получение фиксированного ID пользователя
    getFixedUserId() {
        try {
            const tg = window.Telegram?.WebApp;
            const initData = tg?.initDataUnsafe;
            const tgId = initData?.user?.id ? String(initData.user.id) : null;

            let storedId = localStorage.getItem(this.userIdKey);

            // Если в localStorage уже был другой пользователь — считаем это новым пользователем
            // и сбрасываем "доступный баланс" на 0.
            if (storedId && tgId && storedId !== tgId) {
                localStorage.setItem(this.userIdKey, tgId);

                // Новый пользователь -> баланс 0
                const zeroBalance = {
                    RUB: 0,
                    TON: 0,
                    USDT: 0,
                    USD: 0,
                    EUR: 0,
                    lastUpdate: new Date().getTime(),
                    _resetReason: 'new_user'
                };
                localStorage.setItem(this.balanceKey, JSON.stringify(zeroBalance));

                return tgId;
            }

            if (!storedId) {
                // Первый запуск для пользователя
                storedId = tgId || '';
                if (storedId) {
                    localStorage.setItem(this.userIdKey, storedId);
                }

                // Первый запуск -> баланс 0 (явно фиксируем ключ)
                if (!localStorage.getItem(this.balanceKey)) {
                    const zeroBalance = {
                        RUB: 0,
                        TON: 0,
                        USDT: 0,
                        USD: 0,
                        EUR: 0,
                        lastUpdate: new Date().getTime(),
                        _resetReason: 'first_run'
                    };
                    localStorage.setItem(this.balanceKey, JSON.stringify(zeroBalance));
                }
            }

            return storedId;
        } catch (error) {
            console.error('Ошибка получения фиксированного ID:', error);
            return '';
        }
    }
    
    // Сохранение баланса с фиксированным ключом
    saveBalanceFixed(currency, amount) {
        try {
            const balanceData = JSON.parse(localStorage.getItem(this.balanceKey) || '{}');
            balanceData[currency] = amount;
            balanceData.lastUpdate = new Date().getTime();
            localStorage.setItem(this.balanceKey, JSON.stringify(balanceData));
            
            return true;
        } catch (error) {
            console.error('Ошибка сохранения баланса (фиксированный):', error);
            return false;
        }
    }
    
    // Получение баланса с фиксированным ключом
    getBalanceFixed(currency = 'RUB') {
        try {
            const balanceData = JSON.parse(localStorage.getItem(this.balanceKey) || '{}');
            return balanceData[currency] || 0;
        } catch (error) {
            console.error('Ошибка получения баланса (фиксированный):', error);
            return 0;
        }
    }

    // Инициализация базы данных
    init() {
        console.log('Инициализация базы данных...');
        
        // Проверяем наличие данных
        if (!localStorage.getItem(this.usersKey)) {
            localStorage.setItem(this.usersKey, JSON.stringify({}));
        }
        
        if (!localStorage.getItem(this.productsKey)) {
            // Загружаем товары из products.json, если есть
            this.loadDefaultProducts();
        }
        
        console.log('База данных инициализирована');
    }

    // Загрузка товаров по умолчанию
    loadDefaultProducts() {
        const defaultProducts = {
            telegram: [
                {
                    id: 'tg_stars_100',
                    name: 'Telegram Stars 100',
                    description: '100 звезд для Telegram',
                    price: 100,
                    category: 'telegram',
                    icon: 'fas fa-star',
                    badge: 'Telegram'
                },
                {
                    id: 'tg_stars_500',
                    name: 'Telegram Stars 500',
                    description: '500 звезд для Telegram',
                    price: 450,
                    category: 'telegram',
                    icon: 'fas fa-star',
                    badge: 'Telegram'
                },
                {
                    id: 'tg_stars_1000',
                    name: 'Telegram Stars 1000',
                    description: '1000 звезд для Telegram',
                    price: 800,
                    category: 'telegram',
                    icon: 'fas fa-star',
                    badge: 'Telegram'
                }
            ],
            steam: [
                {
                    id: 'steam_wallet_500',
                    name: 'Steam Wallet 500₽',
                    description: 'Пополнение кошелька Steam на 500₽',
                    price: 500,
                    category: 'steam',
                    icon: 'fab fa-steam',
                    badge: 'Steam'
                },
                {
                    id: 'steam_wallet_1000',
                    name: 'Steam Wallet 1000₽',
                    description: 'Пополнение кошелька Steam на 1000₽',
                    price: 1000,
                    category: 'steam',
                    icon: 'fab fa-steam',
                    badge: 'Steam'
                }
            ],
            games: [],
            brawlstars: [
                {
                    id: 'brawlstars_test_1',
                    name: 'Brawl Pass',
                    description: 'Тестовый товар для Brawl Stars',
                    price: 299,
                    category: 'brawlstars',
                    icon: 'fas fa-star',
                    badge: 'Brawl Stars'
                }
            ],
            clashroyale: [
                {
                    id: 'clashroyale_test_1',
                    name: 'Royal Pass',
                    description: 'Тестовый товар для Clash Royale',
                    price: 399,
                    category: 'clashroyale',
                    icon: 'fas fa-crown',
                    badge: 'Clash Royale'
                }
            ],
            clashofclans: [
                {
                    id: 'clashofclans_test_1',
                    name: 'Pass',
                    description: 'Тестовый товар для Clash of Clans',
                    price: 349,
                    category: 'clashofclans',
                    icon: 'fas fa-shield-alt',
                    badge: 'Clash of Clans'
                }
            ],
            standoff2: [
                {
                    id: 'standoff2_test_1',
                    name: 'Gold',
                    description: 'Тестовый товар для Standoff 2',
                    price: 199,
                    category: 'standoff2',
                    icon: 'fas fa-coins',
                    badge: 'Standoff 2'
                }
            ],
            pubgmobile: [
                {
                    id: 'pubgmobile_test_1',
                    name: 'UC',
                    description: 'Тестовый товар для PUBG Mobile',
                    price: 249,
                    category: 'pubgmobile',
                    icon: 'fas fa-coins',
                    badge: 'PUBG Mobile'
                }
            ]
        };
        
        localStorage.setItem(this.productsKey, JSON.stringify(defaultProducts));
    }

    // Получение пользователя
    getUser(userId) {
        try {
            const users = JSON.parse(localStorage.getItem(this.usersKey) || '{}');
            return users[userId] || null;
        } catch (error) {
            console.error('Ошибка получения пользователя:', error);
            return null;
        }
    }

    // Сохранение пользователя с несколькими попытками
    saveUser(userData) {
        if (!userData || !userData.id) {
            console.error('❌ Ошибка: userData или userData.id отсутствует!');
            return false;
        }
        
        // Делаем несколько попыток сохранения
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const users = JSON.parse(localStorage.getItem(this.usersKey) || '{}');
                
                // Убеждаемся, что currencies инициализированы
                if (!userData.currencies) {
                    userData.currencies = {
                        RUB: 0,
                        USDT: 0,
                        USD: 0,
                        EUR: 0
                    };
                }
                
                // Сохраняем полную копию данных пользователя
                users[userData.id] = JSON.parse(JSON.stringify(userData)); // Глубокая копия
                
                // Сохраняем в localStorage
                localStorage.setItem(this.usersKey, JSON.stringify(users));
                
                // Сразу проверяем сохранение
                const saved = JSON.parse(localStorage.getItem(this.usersKey) || '{}');
                if (saved[userData.id] && saved[userData.id].currencies) {
                    const savedBalance = saved[userData.id].currencies.RUB;
                    const expectedBalance = userData.currencies.RUB;
                    
                    if (savedBalance === expectedBalance) {
                        console.log(`✅ Пользователь сохранен (попытка ${attempt}):`, userData.id);
                        console.log('✅ Баланс RUB в сохраненных данных:', savedBalance);
                        return true;
                    } else {
                        console.warn(`⚠️ Попытка ${attempt}: Баланс не совпадает. Ожидалось: ${expectedBalance}, Получено: ${savedBalance}`);
                        if (attempt < 3) continue; // Пробуем еще раз
                    }
                } else {
                    console.warn(`⚠️ Попытка ${attempt}: Данные не найдены после сохранения`);
                    if (attempt < 3) continue; // Пробуем еще раз
                }
            } catch (error) {
                console.error(`❌ Ошибка сохранения пользователя (попытка ${attempt}):`, error);
                if (attempt < 3) {
                    // Небольшая задержка перед следующей попыткой
                    setTimeout(() => {}, 10);
                    continue;
                }
                console.error('Stack:', error.stack);
                return false;
            }
        }
        
        console.error('❌ Не удалось сохранить после 3 попыток!');
        return false;
    }
    
    // Быстрое сохранение баланса (только баланс)
    saveBalance(userId, currency, amount) {
        try {
            const users = JSON.parse(localStorage.getItem(this.usersKey) || '{}');
            if (!users[userId]) {
                console.error('❌ Пользователь не найден для сохранения баланса');
                return false;
            }
            
            if (!users[userId].currencies) {
                users[userId].currencies = {};
            }
            
            users[userId].currencies[currency] = amount;
            localStorage.setItem(this.usersKey, JSON.stringify(users));
            
            // Проверяем сохранение
            const saved = JSON.parse(localStorage.getItem(this.usersKey) || '{}');
            if (saved[userId] && saved[userId].currencies && saved[userId].currencies[currency] === amount) {
                console.log(`✅ Баланс ${currency} сохранен:`, amount);
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Ошибка сохранения баланса:', error);
            return false;
        }
    }

    // Получение всех товаров
    getProducts() {
        try {
            return JSON.parse(localStorage.getItem(this.productsKey) || '{}');
        } catch (error) {
            console.error('Ошибка получения товаров:', error);
            return {};
        }
    }

    // Получение товаров по категории
    getProductsByCategory(category) {
        try {
            const products = this.getProducts();
            return products[category] || [];
        } catch (error) {
            console.error('Ошибка получения товаров по категории:', error);
            return [];
        }
    }

    // Сохранение товаров
    saveProducts(products) {
        try {
            localStorage.setItem(this.productsKey, JSON.stringify(products));
            console.log('Товары сохранены');
            return true;
        } catch (error) {
            console.error('Ошибка сохранения товаров:', error);
            return false;
        }
    }

    // Добавление товара
    addProduct(product) {
        try {
            const products = this.getProducts();
            const category = product.category || 'all';
            
            if (!products[category]) {
                products[category] = [];
            }
            
            products[category].push(product);
            this.saveProducts(products);
            return true;
        } catch (error) {
            console.error('Ошибка добавления товара:', error);
            return false;
        }
    }

    // Удаление товара
    removeProduct(productId, category) {
        try {
            const products = this.getProducts();
            if (products[category]) {
                products[category] = products[category].filter(p => p.id !== productId);
                this.saveProducts(products);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка удаления товара:', error);
            return false;
        }
    }

    // Получение всех пользователей (для админки)
    getAllUsers() {
        try {
            return JSON.parse(localStorage.getItem(this.usersKey) || '{}');
        } catch (error) {
            console.error('Ошибка получения всех пользователей:', error);
            return {};
        }
    }
    
    // Получение курсов валют
    getCurrencyRates() {
        try {
            const defaultRates = {
                RUB: 1,
                USDT: 80,
                USD: 90,
                EUR: 100,
                TON: 600
            };
            const saved = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}');
            return { ...defaultRates, ...saved };
        } catch (error) {
            console.error('Ошибка получения курсов валют:', error);
            return { RUB: 1, USDT: 80, USD: 90, EUR: 100, TON: 600 };
        }
    }
    
    // Обновление курсов валют
    updateCurrencyRates(rates) {
        try {
            localStorage.setItem('jetstore_currency_rates', JSON.stringify(rates));
            // Отдельно сохраняем курс USDT для profile.js
            if (rates.USDT) {
                localStorage.setItem('jetstore_usdt_rate', rates.USDT.toString());
            }
            console.log('✅ Курсы валют сохранены:', rates);
            return true;
        } catch (error) {
            console.error('Ошибка сохранения курсов валют:', error);
            return false;
        }
    }
    
    // Сводная статистика для админ-панели
    getStatistics() {
        try {
            // Пользователи и их балансы
            const users = this.getAllUsers() || {};
            const userList = Object.values(users);
            const totalUsers = userList.length;
            let totalBalance = 0;
            userList.forEach(u => {
                const rub = u?.currencies?.RUB;
                if (typeof rub === 'number') totalBalance += rub;
                else if (typeof rub === 'string') totalBalance += parseFloat(rub) || 0;
            });

            // Товары
            const products = this.getProducts() || {};
            let totalProducts = 0;
            Object.values(products).forEach(arr => {
                if (Array.isArray(arr)) totalProducts += arr.length;
            });

            // История заказов (локальная) — для оборота и динамики
            const purchases = JSON.parse(localStorage.getItem('jetstore_purchases') || '[]');
            let totalTurnoverRub = 0;
            let lastUpdated = '-';
            let salesToday = 0, salesWeek = 0, salesMonth = 0;
            let turnoverToday = 0, turnoverWeek = 0, turnoverMonth = 0;
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const todayStart = new Date(new Date().toDateString()).getTime();
            const weekStart = now - 7 * dayMs;
            const monthStart = now - 30 * dayMs;

            if (Array.isArray(purchases) && purchases.length > 0) {
                purchases.forEach(p => {
                    const price = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
                    totalTurnoverRub += price;
                    const d = p.date || p.created_at || p.timestamp;
                    let ts = 0;
                    if (typeof d === 'number') ts = d * 1000;
                    else if (typeof d === 'string') ts = new Date(d).getTime();
                    if (ts >= todayStart) { salesToday++; turnoverToday += price; }
                    if (ts >= weekStart) { salesWeek++; turnoverWeek += price; }
                    if (ts >= monthStart) { salesMonth++; turnoverMonth += price; }
                });
                lastUpdated = purchases[0].date || purchases[0].created_at || purchases[0].timestamp || '-';
            }

            return {
                totalUsers,
                totalProducts,
                totalBalance: Math.round(totalBalance),
                totalTurnoverRub: Math.round(totalTurnoverRub),
                totalSales: (purchases && purchases.length) || 0,
                lastUpdated,
                salesToday,
                salesWeek,
                salesMonth,
                turnoverToday: Math.round(turnoverToday * 100) / 100,
                turnoverWeek: Math.round(turnoverWeek * 100) / 100,
                turnoverMonth: Math.round(turnoverMonth * 100) / 100,
                regsDay: 0,
                regsWeek: 0,
                regsMonth: 0,
                activityDay: 0,
                activityWeek: 0,
                activityMonth: 0
            };
        } catch (error) {
            console.error('Ошибка getStatistics:', error);
            return {
                totalUsers: 0,
                totalProducts: 0,
                totalBalance: 0,
                totalTurnoverRub: 0,
                totalSales: 0,
                lastUpdated: '-',
                salesToday: 0, salesWeek: 0, salesMonth: 0,
                turnoverToday: 0, turnoverWeek: 0, turnoverMonth: 0,
                regsDay: 0, regsWeek: 0, regsMonth: 0,
                activityDay: 0, activityWeek: 0, activityMonth: 0
            };
        }
    }
    
    getAdminSettings() {
        try {
            const raw = localStorage.getItem('jetstore_admin_settings');
            const defaultRates = { RUB: 1, USDT: 80, USD: 90, EUR: 100, TON: 600 };
            const savedRates = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}');
            const currencyRates = { ...defaultRates, ...savedRates };
            if (!raw) return { password: 'admin', currencyRates };
            const parsed = JSON.parse(raw);
            return { ...parsed, password: parsed.password || 'admin' };
        } catch (e) { return { password: 'admin' }; }
    }
    checkAdminPassword(inputPassword) {
        if (!inputPassword || typeof inputPassword !== 'string') return false;
        const settings = this.getAdminSettings();
        const saved = (settings && settings.password) || 'admin';
        return String(inputPassword).trim() === String(saved).trim();
    }
    changeAdminPassword(newPassword) {
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) return false;
        try {
            const settings = this.getAdminSettings();
            settings.password = String(newPassword).trim();
            localStorage.setItem('jetstore_admin_settings', JSON.stringify(settings));
            return true;
        } catch (e) { console.error('Ошибка смены пароля:', e); return false; }
    }
}

// Создаем глобальный экземпляр базы данных (только если ещё не создан)
if (typeof window !== 'undefined' && !window.Database) {
    window.Database = new Database();
    console.log('✅ Database создан и доступен глобально через window.Database');
    console.log('✅ Database.getUser:', typeof window.Database.getUser);
    console.log('✅ Database.saveBalanceFixed:', typeof window.Database.saveBalanceFixed);
} else if (typeof window === 'undefined') {
    console.error('❌ window не определен!');
}

} // end guard for window.Database
