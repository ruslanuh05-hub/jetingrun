
// Загружаем данные пользователя из глобального объекта
let userData = window.userData || {
    id: null,
    username: null,
    firstName: null,
    lastName: null,
    photoUrl: null,
    currencies: {
        RUB: 0,  // Будет загружено из базы
        USDT: 0,
        USD: 0,
        EUR: 0
    },
    activeCurrency: 'RUB',
    purchases: [],
    registrationDate: new Date().toLocaleDateString('ru-RU')
};

// Функция автоматического сохранения баланса
function autoSaveBalance() {
    if (!userData.currencies || userData.currencies.RUB === undefined) {
        console.warn('⚠️ Невозможно сохранить: нет данных о балансе');
        return;
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Сохранение в ФИКСИРОВАННЫЙ ключ
    const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    if (db && typeof db.saveBalanceFixed === 'function') {
        const saved = db.saveBalanceFixed('RUB', userData.currencies.RUB);
        if (saved) {
            console.log('💾 Автосохранение баланса (фиксированный ключ):', userData.currencies.RUB);
        }
    }
    
    // Дополнительно: прямое сохранение
    try {
        const balanceKey = 'jetstore_balance_fixed';
        const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
        balanceData.RUB = userData.currencies.RUB;
        balanceData.lastUpdate = new Date().getTime();
        localStorage.setItem(balanceKey, JSON.stringify(balanceData));
    } catch (error) {
        console.error('❌ Ошибка автосохранения:', error);
    }
    
    // Синхронизируем с window.userData
    if (window.userData) {
        window.userData.currencies = { ...userData.currencies };
    }
}

// Сохраняем перед закрытием страницы
window.addEventListener('beforeunload', function() {
    autoSaveBalance();
});

// Сохраняем при потере фокуса
window.addEventListener('blur', function() {
    autoSaveBalance();
});

// Периодическое автосохранение каждые 5 секунд (только если баланс изменился)
let lastSavedBalance = null;
setInterval(function() {
    if (userData && userData.currencies && userData.currencies.RUB !== undefined) {
        const currentBalance = userData.currencies.RUB;
        if (lastSavedBalance !== currentBalance && userData.id) {
            autoSaveBalance();
            lastSavedBalance = currentBalance;
        }
    }
}, 5000); // Каждые 5 секунд

// Инициализация профиля (работает и при обычной загрузке, и при SPA-подгрузке)
let profilePageInitialized = false;
function initProfilePage() {
    if (profilePageInitialized) return;
    profilePageInitialized = true;
    
    // Инициализируем базу данных (через ГЛОБАЛЬНЫЙ экземпляр window.Database)
    try {
        const db = window.Database || (typeof Database !== 'undefined' ? new Database() : null);
        if (db && typeof db.init === 'function') {
            db.init();
        } else {
            console.warn('Database.init недоступен, пропускаем инициализацию БД');
        }
    } catch (e) {
        console.warn('Ошибка инициализации Database в профиле:', e);
    }
    
    // Загружаем данные пользователя
    loadUserData();
    
    // Обновляем отображение профиля
    updateProfileDisplay();
    
    // Загружаем историю покупок
    loadUserPurchases();
    
    // Загружаем покупки, если активна вкладка "Мои покупки"
    setTimeout(() => {
        if (document.getElementById('purchasesTab')?.classList.contains('active')) {
            if (typeof loadPurchases === 'function') {
                loadPurchases();
            } else if (typeof window.loadPurchases === 'function') {
                window.loadPurchases();
            }
        }
    }, 500);
    
}
// ==================== ВКЛАДКИ "ИСТОРИЯ / ТРАНЗАКЦИИ" ====================
function switchTab(tab) {
    var purchasesBtn = document.querySelector('.tabs-container .tab-btn:nth-child(1)');
    var txBtn = document.querySelector('.tabs-container .tab-btn:nth-child(2)');
    var purchasesPane = document.getElementById('purchasesTab');
    var txPane = document.getElementById('transactionsTab');
    if (!purchasesBtn || !txBtn || !purchasesPane || !txPane) return;

    if (tab === 'transactions') {
        purchasesBtn.classList.remove('active');
        purchasesPane.classList.remove('active');
        txBtn.classList.add('active');
        txPane.classList.add('active');
        renderTransactions();
    } else {
        txBtn.classList.remove('active');
        txPane.classList.remove('active');
        purchasesBtn.classList.add('active');
        purchasesPane.classList.add('active');
    }
}

// Рендерим список транзакций (вкладка "Транзакции")
function renderTransactions() {
    const container = document.getElementById('transactionsTab');
    if (!container) return;

    const listId = 'transactionsList';
    let list = document.getElementById(listId);
    if (!list) {
        list = document.createElement('div');
        list.id = listId;
        list.className = 'transactions-list';
        container.innerHTML = '';
        container.appendChild(list);
    }

    const txs = (userData.transactions || []).slice().sort(function (a, b) {
        return new Date(b.date || 0) - new Date(a.date || 0);
    });

    if (!txs.length) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exchange-alt"></i>
                <p>Пока нет транзакций</p>
            </div>
        `;
        return;
    }

    list.innerHTML = txs.map(function (tx) {
        var sign = tx.type === 'deposit' || tx.type === 'promo' ? '+' : '-';
        var color = tx.type === 'deposit' || tx.type === 'promo' ? '#22c55e' : '#ef4444';
        var title = tx.type === 'deposit' ? 'Пополнение баланса' :
                    tx.type === 'promo' ? 'Бонус по промокоду' :
                    tx.type === 'spin' ? 'Игра в рулетку' :
                    'Транзакция';
        var amount = (tx.amount || 0).toLocaleString('ru-RU');
        var dateStr = tx.date || '';
        return `
            <div class="transaction-item">
                <div class="transaction-main">
                    <div class="transaction-title">${title}</div>
                    <div class="transaction-date">${dateStr}</div>
                </div>
                <div class="transaction-amount" style="color:${color};">
                    ${sign}${amount} ₽
                </div>
            </div>
        `;
    }).join('');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
} else {
    initProfilePage();
}

// Загрузка данных пользователя
function loadUserData() {
    // Сначала получаем ID пользователя
    let userId = null;
    
    // Загружаем из Telegram
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initDataUnsafe;
    
    if (initData?.user) {
        userId = initData.user.id;
        userData.id = userId;
        userData.username = initData.user.username || '';
        userData.firstName = initData.user.first_name || '';
        userData.lastName = initData.user.last_name || '';
        userData.photoUrl = initData.user.photo_url || null;
    } else {
        // Если Telegram WebApp недоступен — оставляем id пустым
        userId = null;
        userData.id = null;
        userData.username = '';
        userData.firstName = '';
        userData.lastName = '';
        userData.photoUrl = null;
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что ID всегда строка
    if (userData.id) {
        userData.id = String(userData.id);
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
    
    // Инициализируем валюты с загруженным балансом
    if (!userData.currencies) {
        userData.currencies = {
            RUB: savedBalance || 0,
            USDT: 0,
            USD: 0,
            EUR: 0
        };
    } else {
        // Обновляем баланс из фиксированного ключа
        userData.currencies.RUB = savedBalance || userData.currencies.RUB || 0;
    }
    
    try {
        const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
        if (db && typeof db.getUser === 'function' && userId) {
            const savedData = db.getUser(userId);
            
            if (savedData) {
                console.log('✅ Найден сохраненный пользователь, загружаем данные из базы...');
                
                // ВАЖНО: Полностью перезаписываем userData данными из базы
                // Сохраняем только актуальные данные из Telegram (имя, фото и т.д.)
                const telegramData = {
                    username: userData.username,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    photoUrl: userData.photoUrl
                };
                
                // Объединяем: база данных имеет приоритет, но обновляем актуальные данные из Telegram
                userData = {
                    ...savedData,
                    ...telegramData,
                    // КРИТИЧЕСКИ ВАЖНО: баланс из фиксированного ключа (приоритет)
                    currencies: {
                        RUB: savedBalance || savedData.currencies?.RUB || 0,
                        USDT: savedData.currencies?.USDT || 0,
                        USD: savedData.currencies?.USD || 0,
                        EUR: savedData.currencies?.EUR || 0
                    },
                    // Сохраняем другие важные данные из базы
                    purchases: savedData.purchases || [],
                    transactions: savedData.transactions || [],
                    referrals: savedData.referrals || { count: 0, earnings: 0, list: [] },
                    registrationDate: savedData.registrationDate || new Date().toLocaleDateString('ru-RU'),
                    // Сохраняем ID из базы
                    id: savedData.id || userId
                };
                console.log('✅ Данные загружены из базы. Баланс RUB (из фиксированного ключа):', userData.currencies.RUB);
            } else {
                console.log('🆕 Новый пользователь, создаем запись в базе...');
                // Для нового пользователя устанавливаем начальный баланс
                if (!userData.currencies) {
                    userData.currencies = {
                        RUB: 0,
                        USDT: 0,
                        USD: 0,
                        EUR: 0
                    };
                }
                // Устанавливаем дату регистрации для нового пользователя
                if (!userData.registrationDate) {
                    userData.registrationDate = new Date().toLocaleDateString('ru-RU');
                }
                
                // Инициализируем реферальные данные
                if (!userData.referrals) {
                    userData.referrals = {
                        count: 0,
                        earnings: 0,
                        list: []
                    };
                }
                
                // Инициализируем транзакции
                if (!userData.transactions) {
                    userData.transactions = [];
                }
                
                // Инициализируем использованные промокоды
                if (!userData.usedPromoCodes) {
                    userData.usedPromoCodes = [];
                }
                
                // Инициализируем покупки
                if (!userData.purchases) {
                    userData.purchases = [];
                }
                
                // Сохраняем нового пользователя
                const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
                if (db && typeof db.saveUser === 'function') {
                    db.saveUser(userData);
                    console.log('🆕 Новый пользователь сохранен в базу данных. Начальный баланс:', userData.currencies.RUB);
                } else {
                    // Прямое сохранение в localStorage
                    try {
                        const usersKey = 'jetstore_users';
                        const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
                        users[userId] = JSON.parse(JSON.stringify(userData));
                        localStorage.setItem(usersKey, JSON.stringify(users));
                        console.log('🆕 Новый пользователь сохранен напрямую в localStorage. Начальный баланс:', userData.currencies.RUB);
                    } catch (e) {
                        console.error('❌ Ошибка прямого сохранения нового пользователя:', e);
                    }
                }
            }
        } else {
            console.warn('⚠️ Database не доступна или userId отсутствует');
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки данных пользователя:', error);
        console.error('Stack:', error.stack);
    }
    
    // Синхронизируем с глобальным window.userData
    // КРИТИЧЕСКИ ВАЖНО: window.userData должен полностью соответствовать userData из базы
    window.userData = {
        ...userData,
        // Сохраняем только актуальные данные из Telegram, если они есть
        username: userData.username || window.userData?.username,
        firstName: userData.firstName || window.userData?.firstName,
        lastName: userData.lastName || window.userData?.lastName,
        photoUrl: userData.photoUrl || window.userData?.photoUrl,
        // Баланс ТОЛЬКО из userData (который загружен из базы)
        currencies: userData.currencies || { RUB: 0, USDT: 0, USD: 0, EUR: 0 },
        // Убеждаемся, что ID всегда строка
        id: String(userData.id || userId)
    };
    
    // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Прямая проверка localStorage
    try {
        const usersKey = 'jetstore_users';
        const directCheck = JSON.parse(localStorage.getItem(usersKey) || '{}');
        const directUser = directCheck[userData.id];
        if (directUser) {
            if (directUser.currencies) {
                console.log('🔍 ПРЯМАЯ ПРОВЕРКА localStorage: Баланс RUB =', directUser.currencies.RUB);
                // Если баланс в localStorage отличается, используем его (он более актуальный)
                if (directUser.currencies.RUB !== userData.currencies.RUB) {
                    console.log('⚠️ Обнаружено расхождение! Используем баланс из localStorage');
                    userData.currencies.RUB = directUser.currencies.RUB;
                    if (window.userData && window.userData.currencies) {
                        window.userData.currencies.RUB = directUser.currencies.RUB;
                    }
                }
            }
            // Также подхватываем локально сохранённые транзакции (в т.ч. пополнения)
            if (Array.isArray(directUser.transactions) && directUser.transactions.length) {
                console.log('🔍 Найдены транзакции в localStorage:', directUser.transactions.length);
                if (!Array.isArray(userData.transactions) || !userData.transactions.length) {
                    userData.transactions = directUser.transactions.slice();
                } else {
                    // Мерджим, избегая дублей по полям type+amount+date
                    const seen = new Set(userData.transactions.map(t => (t.type || '') + '|' + (t.amount || 0) + '|' + (t.date || '')));
                    directUser.transactions.forEach(t => {
                        const key = (t.type || '') + '|' + (t.amount || 0) + '|' + (t.date || '');
                        if (!seen.has(key)) {
                            userData.transactions.push(t);
                            seen.add(key);
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error('Ошибка прямой проверки localStorage:', error);
    }
    
    console.log('✅ window.userData синхронизирован. Баланс RUB:', window.userData.currencies?.RUB);
    console.log('✅ Загрузка данных пользователя завершена. Баланс RUB:', userData.currencies?.RUB);
}

// Обновление отображения профиля
function updateProfileDisplay() {
    console.log('Обновление отображения профиля...');
    
    // Обновляем аватар
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        if (userData.photoUrl) {
            profileAvatar.innerHTML = `<img src="${userData.photoUrl}" alt="Avatar">`;
        } else {
            const initials = userData.firstName ? userData.firstName[0].toUpperCase() : 'U';
            profileAvatar.innerHTML = `<span style="font-size: 2.5rem;">${initials}</span>`;
        }
    }
    
    // Обновляем имя пользователя
    const profileName = document.getElementById('profileName');
    if (profileName) {
        const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
        profileName.textContent = fullName || 'Пользователь';
    }
    
    // Обновляем username
    const profileUsername = document.getElementById('profileUsername');
    if (profileUsername) {
        profileUsername.textContent = userData.username ? `@${userData.username}` : 'Без username';
    }
    
    // Обновляем ID
    const profileUserId = document.getElementById('profileUserId');
    if (profileUserId) {
        profileUserId.textContent = userData.id || '000000';
    }
    
    // Обновляем баланс
    updateBalanceDisplay();
}

// Обновление отображения баланса (приоритет: API с проверкой Telegram, затем localStorage)
function updateBalanceDisplay() {
    function shouldHideBalanceInProfileUi() {
        // "Окно профиля" идентифицируем по наличию основного элемента баланса профиля.
        // Данные и расчёты баланса сохраняем как есть — скрываем только отображение.
        return !!document.getElementById('profileBalance');
    }
    function formatBalanceText(rub) {
        return rub.toFixed(2) + ' ₽';
    }
    function applyBalance(rub) {
        rub = (rub != null) ? (typeof rub === 'number' ? rub : parseFloat(rub) || 0) : 0;
        if (!userData.currencies) userData.currencies = {};
        userData.currencies.RUB = rub;
        if (window.userData) {
            if (!window.userData.currencies) window.userData.currencies = {};
            window.userData.currencies.RUB = rub;
        }
        var hideUi = shouldHideBalanceInProfileUi();
        var uiText = hideUi ? '•••• ₽' : formatBalanceText(rub);
        var balanceElement = document.getElementById('profileBalance');
        if (balanceElement) balanceElement.textContent = uiText;
        var headerBalanceEl = document.getElementById('headerBalance');
        if (headerBalanceEl) headerBalanceEl.textContent = uiText;
    }
    loadBalanceFromStorage(applyBalance);
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
    if (apiBase && initData) {
        fetch(apiBase.replace(/\/$/, '') + '/api/balance', {
            method: 'GET',
            headers: { 'X-Telegram-Init-Data': initData }
        }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
            if (d && typeof d.balance_rub === 'number') {
                applyBalance(d.balance_rub);
                try {
                    var balanceKey = 'jetstore_balance_fixed';
                    var cur = JSON.parse(localStorage.getItem(balanceKey) || '{}');
                    cur.RUB = d.balance_rub;
                    cur.lastUpdate = Date.now();
                    localStorage.setItem(balanceKey, JSON.stringify(cur));
                } catch (e) {}
            }
        }).catch(function() {});
    }
}

function loadBalanceFromStorage(applyBalance) {
    var db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    var rub = 0;
    if (db && typeof db.getBalanceFixed === 'function') {
        rub = db.getBalanceFixed('RUB') || 0;
    } else {
        try {
            var balanceKey = 'jetstore_balance_fixed';
            var balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
            rub = balanceData.RUB != null ? parseFloat(balanceData.RUB) || 0 : 0;
        } catch (e) {}
    }
    if (applyBalance) applyBalance(rub);
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

// Смена валюты
function changeCurrency(currency) {
    console.log('Смена валюты на:', currency);
    
    if (userData.currencies.hasOwnProperty(currency)) {
        userData.activeCurrency = currency;
        
        // Сохраняем в базу данных
    const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    if (db && typeof db.saveUser === 'function') {
        db.saveUser(userData);
    } else {
        // Прямое сохранение в localStorage
        try {
            const usersKey = 'jetstore_users';
            const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
            if (userData.id) {
                users[userData.id] = JSON.parse(JSON.stringify(userData));
                localStorage.setItem(usersKey, JSON.stringify(users));
                console.log('✅ Данные сохранены напрямую в localStorage');
            }
        } catch (e) {
            console.error('❌ Ошибка прямого сохранения:', e);
        }
        }
        
        // Обновляем отображение
        updateBalanceDisplay();
        
        // Показываем уведомление
        showNotification(`Валюта изменена на ${currency}`);
    }
}

// Загрузка истории покупок
function loadUserPurchases() {
    console.log('Загрузка истории покупок...');
    
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    
    // Если есть покупки в данных пользователя
    if (userData.purchases && userData.purchases.length > 0) {
        displayPurchases();
    } else {
        // Имитация загрузки
        setTimeout(() => {
            showEmptyOrders();
        }, 1000);
    }
}

// Отображение покупок
function displayPurchases(showAll = false) {
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    
    if (!userData.purchases || userData.purchases.length === 0) {
        showEmptyOrders();
        return;
    }
    
    // Сортируем покупки по дате (новые сначала)
    const sortedPurchases = [...userData.purchases].sort((a, b) => {
        const dateA = a.date ? new Date(a.date) : new Date(0);
        const dateB = b.date ? new Date(b.date) : new Date(0);
        return dateB - dateA;
    });
    
    // Отображаем последние 10 покупок или все, если showAll = true
    const purchasesToShow = showAll ? sortedPurchases : sortedPurchases.slice(0, 10);
    
    ordersList.innerHTML = purchasesToShow.map(purchase => `
        <div class="order-item">
            <div class="order-icon" style="background: ${getCategoryColor(purchase.category || 'default')}">
                <i class="${getCategoryIcon(purchase.category || 'default')}"></i>
            </div>
            <div class="order-details">
                <div class="order-title">${purchase.product || 'Товар'}</div>
                <div class="order-date">${purchase.date || 'Не указано'}</div>
                <div class="order-status completed">Завершено</div>
            </div>
            <div class="order-price">${purchase.price || 0} ₽</div>
        </div>
    `).join('');
    
    // Показываем/скрываем кнопку "Показать все заказы"
    const showMoreBtn = document.querySelector('.btn-show-more');
    if (showMoreBtn) {
        if (showAll || sortedPurchases.length <= 10) {
            showMoreBtn.style.display = 'none';
        } else {
            showMoreBtn.style.display = 'block';
        }
    }
}

// Получение цвета для категории
function getCategoryColor(category) {
    const colors = {
        'telegram': '#0088cc',
        'steam': '#171a21',
        'games': '#ff6b6b',
        'default': '#667eea'
    };
    return colors[category] || colors.default;
}

// Получение иконки для категории
function getCategoryIcon(category) {
    const icons = {
        'telegram': 'fab fa-telegram',
        'steam': 'fab fa-steam',
        'games': 'fas fa-gamepad',
        'default': 'fas fa-shopping-bag'
    };
    return icons[category] || icons.default;
}

// Показать сообщение, если нет покупок
function showEmptyOrders() {
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    
    ordersList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-shopping-cart"></i>
            <h3>Пока нет покупок</h3>
            <p>Совершите первую покупку в магазине</p>
            <a href="index.html" class="go-to-shop-btn">
                <i class="fas fa-store"></i> Перейти в магазин
            </a>
        </div>
    `;
}

// ==================== НАСТРОЙКИ ПОПОЛНЕНИЯ ====================
// CryptoBot: токен на бэкенде (CRYPTO_PAY_TOKEN в Railway). Фронт вызывает /api/cryptobot/create-invoice

// Курс USDT к рублю (по умолчанию)
let USDT_RATE = parseFloat(localStorage.getItem('jetstore_usdt_rate')) || 80;

// Обновляем отображение курса при загрузке
document.addEventListener('DOMContentLoaded', function() {
    updateUsdtRateDisplay();
});

function updateUsdtRateDisplay() {
    const rateDisplay = document.getElementById('usdtRateDisplay');
    if (rateDisplay) {
        rateDisplay.textContent = USDT_RATE;
    }
}

// ==================== ПОПАП ПОПОЛНЕНИЯ БАЛАНСА (в стиле Steam) ====================
// Показать окно пополнения баланса
function showDepositPopup() {
    const popup = document.getElementById('balanceTopupPopup');
    if (popup) {
        document.body.classList.add('steam-popup-open');
        popup.classList.add('active');
        const amountInput = document.getElementById('balanceAmount');
        if (amountInput) {
            amountInput.value = '';
            setTimeout(function() { amountInput.focus(); }, 150);
        }
    }
}

// Закрыть окно пополнения баланса
function closeDepositPopup() {
    closeAllDepositPopups();
}

// Закрываем все попапы пополнения (RUB/USDT/SBP),
// чтобы после успешного пополнения в профиле не оставалось открытых окон.
function closeAllDepositPopups() {
    const ids = ['balanceTopupPopup', 'usdtDepositPopup', 'sbpDepositPopup'];
    ids.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    document.body.classList.remove('steam-popup-open');
}

function closeBalanceTopup() {
    const popup = document.getElementById('balanceTopupPopup');
    if (popup) {
        popup.classList.remove('active');
        document.body.classList.remove('steam-popup-open');
    }
}

function clearBalanceInput() {
    const input = document.getElementById('balanceAmount');
    if (input) {
        input.value = '';
        input.focus();
    }
}

function setBalanceAmount(amount) {
    const el = document.getElementById('balanceAmount');
    if (el) {
        el.value = amount;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function proceedBalanceTopup() {
    const input = document.getElementById('balanceAmount');
    const amount = parseFloat(input?.value) || 0;
    
    if (amount <= 0) {
        showNotification('Введите сумму больше 0', 'error');
        return;
    }
    if (amount < 100) {
        showNotification('Минимальная сумма пополнения: 100 ₽', 'error');
        return;
    }
    if (amount > 1000000) {
        showNotification('Максимальная сумма: 1 000 000 ₽', 'error');
        return;
    }
    
    closeBalanceTopup();
    
    // Сохраняем данные покупки и открываем выбор способа оплаты напрямую
    if (typeof window.currentPurchase === 'undefined') window.currentPurchase = {};
    window.currentPurchase = {
        type: 'balance',
        amount: amount,
        currency: 'RUB',
        productName: 'Пополнение баланса'
    };
    
    if (typeof window.previousView === 'undefined') window.previousView = {};
    window.previousView = { type: 'profile', gameCategory: null, supercellGame: null };
    
    // Открываем окно выбора способа оплаты напрямую (как в звёздах, премиуме, Steam)
    if (typeof showPaymentMethodSelection === 'function') {
        showPaymentMethodSelection('balance');
    } else {
        // Fallback: переход на главную, если функция недоступна
        var path = window.location.pathname || '';
        var indexPath = path.indexOf('html') >= 0 ? path.replace(/\/html\/.*$/, '/index.html') : path.replace(/[^/]*$/, '') + 'index.html';
        window.location.href = window.location.origin + indexPath + '?pay=balance&amount=' + encodeURIComponent(amount);
    }
}

// Показать сообщение о недоступности метода оплаты
function showPaymentUnavailable(method) {
    const names = {
        'card': 'Оплата по карте',
        'sbp': 'Оплата через СБП'
    };
    showNotification(`${names[method]} скоро будет доступна`, 'info');
}

// ==================== USDT ПОПОЛНЕНИЕ ====================
// Показать попап USDT пополнения
function showUsdtDeposit() {
    closeDepositPopup();
    const popup = document.getElementById('usdtDepositPopup');
    if (popup) {
        popup.classList.add('active');
        // Сбрасываем значения
        const input = document.getElementById('usdtAmountRub');
        if (input) {
            input.value = '';
        }
        updateUsdtConversion();
    }
}

// Закрыть попап USDT
function closeUsdtPopup() {
    const popup = document.getElementById('usdtDepositPopup');
    if (popup) {
        popup.classList.remove('active');
    }
}

// Обновить конвертацию USDT
function updateUsdtConversion() {
    const input = document.getElementById('usdtAmountRub');
    const resultEl = document.getElementById('usdtAmountResult');
    const payAmountEl = document.getElementById('usdtPayAmount');
    
    if (input && resultEl && payAmountEl) {
        const rubAmount = parseFloat(input.value) || 0;
        const usdtAmount = (rubAmount / USDT_RATE).toFixed(2);
        
        resultEl.textContent = rubAmount.toLocaleString('ru-RU');
        payAmountEl.textContent = usdtAmount;
    }
}

// Обработка USDT пополнения через Crypto Bot
async function processUsdtDeposit() {
    const input = document.getElementById('usdtAmountRub');
    const rubAmount = parseFloat(input?.value) || 0;
    
    if (rubAmount < 100) {
        showNotification('Минимальная сумма: 100 ₽', 'error');
        return;
    }
    
    if (rubAmount > 100000) {
        showNotification('Максимальная сумма: 100,000 ₽', 'error');
        return;
    }
    
    const usdtAmount = (rubAmount / USDT_RATE).toFixed(2);
    
    showNotification('Создаём счёт для оплаты...', 'info');
    
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        showNotification('API бота не настроен. Укажите JET_BOT_API_URL в js/config.js', 'error');
        return;
    }
    
    try {
        const response = await fetch(apiBase.replace(/\/$/, '') + '/api/cryptobot/create-invoice', {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context: 'deposit',
                amount: rubAmount,
                user_id: window.userData?.id || 'unknown'
            })
        });
        
        const data = await response.json().catch(function() { return {}; });
        
        if (data.success && data.invoice_id && (data.payment_url || data.pay_url)) {
            const payUrl = (data.payment_url || data.pay_url || '').trim();
            if (!payUrl) throw new Error('Ссылка на оплату не получена');
            const pendingPayment = {
                invoiceId: data.invoice_id,
                rubAmount: rubAmount,
                usdtAmount: usdtAmount,
                createdAt: Date.now()
            };
            localStorage.setItem('jetstore_pending_payment', JSON.stringify(pendingPayment));
            
            const tg = window.Telegram?.WebApp;
            try {
                if (tg && tg.openLink) tg.openLink(payUrl);
                else if (tg && tg.openTelegramLink) tg.openTelegramLink(payUrl);
                else window.open(payUrl, '_blank');
            } catch (e) {
                window.open(payUrl, '_blank');
            }
            
            closeUsdtPopup();
            showNotification('Перейдите в CryptoBot для оплаты', 'success');
            startPaymentCheck(data.invoice_id, rubAmount);
        } else {
            const errMsg = data.message || data.error || ('Ошибка ' + response.status + ': ' + (typeof data === 'object' ? JSON.stringify(data).slice(0, 100) : ''));
            throw new Error(errMsg);
        }
    } catch (error) {
        console.error('Ошибка создания инвойса:', error);
        showNotification(error.message || 'Ошибка создания счёта. Попробуйте позже.', 'error');
    }
}

// ==================== СБП ПОПОЛНЕНИЕ ====================
// Показать попап СБП пополнения
function showSbpDeposit() {
    closeDepositPopup();
    const popup = document.getElementById('sbpDepositPopup');
    if (popup) {
        popup.classList.add('active');
        // Очищаем поле
        const input = document.getElementById('sbpAmount');
        if (input) input.value = '';
    }
}

// Закрыть попап СБП
function closeSbpPopup() {
    const popup = document.getElementById('sbpDepositPopup');
    if (popup) {
        popup.classList.remove('active');
    }
    const tooltip = document.getElementById('sbpInfoTooltip');
    if (tooltip) tooltip.classList.remove('visible');
}

// Обновление суммы СБП (для будущих проверок)
function updateSbpAmount() {
    const input = document.getElementById('sbpAmount');
    const amount = parseFloat(input?.value) || 0;
    // Пока ничего не делаем, просто для совместимости
}

// Обработка СБП пополнения: переход к оплате через FreeKassa
function processSbpDeposit() {
    const input = document.getElementById('sbpAmount');
    const amount = parseFloat(input?.value) || 0;
    
    if (amount <= 0) {
        showNotification('Введите сумму больше 0', 'error');
        return;
    }
    if (amount < 100) {
        showNotification('Минимальная сумма пополнения: 100 ₽', 'error');
        return;
    }
    
    closeSbpPopup();
    // Переход на главную с параметрами пополнения баланса — откроется выбор способа оплаты (СБП/карта)
    var path = window.location.pathname || '';
    var indexPath = path.indexOf('html') >= 0 ? path.replace(/\/html\/.*$/, '/index.html') : path.replace(/[^/]*$/, '') + 'index.html';
    window.location.href = window.location.origin + indexPath + '?pay=balance&amount=' + encodeURIComponent(amount);
}

// Проверка статуса платежа через бэкенд
async function startPaymentCheck(invoiceId, rubAmount) {
    const apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) return;
    
    let attempts = 0;
    const maxAttempts = 60; // 5 минут (каждые 5 сек)
    
    const checkInterval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(checkInterval);
            localStorage.removeItem('jetstore_pending_payment');
            return;
        }
        
        try {
            const response = await fetch(apiBase.replace(/\/$/, '') + '/api/cryptobot/check-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_id: invoiceId })
            });
            const data = await response.json();
            
            if (data.paid === true) {
                clearInterval(checkInterval);
                localStorage.removeItem('jetstore_pending_payment');
                processDeposit(rubAmount);
                showNotification(`Оплата получена! +${rubAmount} ₽`, 'success');
            }
        } catch (error) {
            console.error('Ошибка проверки платежа:', error);
        }
    }, 5000);
}

// Проверяем незавершённые платежи при загрузке
function checkPendingPayments() {
    const pending = localStorage.getItem('jetstore_pending_payment');
    if (pending) {
        try {
            const payment = JSON.parse(pending);
            // Если платёж создан менее 10 минут назад, проверяем его статус
            if (Date.now() - payment.createdAt < 600000) {
                startPaymentCheck(payment.invoiceId, payment.rubAmount);
            } else {
                localStorage.removeItem('jetstore_pending_payment');
            }
        } catch (e) {
            localStorage.removeItem('jetstore_pending_payment');
        }
    }
}

// Запускаем проверку при загрузке
setTimeout(checkPendingPayments, 2000);

// Процесс пополнения
function processDeposit(amount = null) {
    // Синхронизируем userData с window.userData перед началом
    if (window.userData && window.userData.id) {
        userData = { ...userData, ...window.userData };
    }
    
    let depositAmount = amount;
    
    // Если сумма не передана, берем из input
    if (!depositAmount || depositAmount === 0) {
        const amountInput = document.getElementById('customAmount');
        if (amountInput && amountInput.value) {
            depositAmount = parseFloat(amountInput.value);
        } else {
            const notifyFn = typeof showNotification === 'function' ? showNotification : (typeof window.showNotification === 'function' ? window.showNotification : alert);
            notifyFn('Введите сумму для пополнения', 'error');
            return;
        }
    }
    
    // Проверка на валидность числа
    if (isNaN(depositAmount) || depositAmount <= 0) {
        const notifyFn = typeof showNotification === 'function' ? showNotification : (typeof window.showNotification === 'function' ? window.showNotification : alert);
        notifyFn('Введите корректную сумму', 'error');
        return;
    }
    
    if (depositAmount < 10) {
        const notifyFn = typeof showNotification === 'function' ? showNotification : (typeof window.showNotification === 'function' ? window.showNotification : alert);
        notifyFn('Минимальная сумма пополнения: 10 ₽', 'error');
        return;
    }
    
    if (depositAmount > 100000) {
        const notifyFn = typeof showNotification === 'function' ? showNotification : (typeof window.showNotification === 'function' ? window.showNotification : alert);
        notifyFn('Максимальная сумма пополнения: 100,000 ₽', 'error');
        return;
    }
    
    // Синхронизируем userData с window.userData перед изменением
    if (window.userData && window.userData.id) {
        userData = { ...userData, ...window.userData };
    }
    
    // Инициализируем валюты, если их нет
    if (!userData.currencies) {
        userData.currencies = {
            RUB: 0,
            USDT: 0,
            USD: 0,
            EUR: 0
        };
        console.log('Инициализированы валюты');
    }
    
    const oldBalance = userData.currencies.RUB || 0;
    console.log('Старый баланс:', oldBalance);
    
    // Пополняем баланс в рублях
    userData.currencies.RUB = oldBalance + depositAmount;
    console.log('Новый баланс:', userData.currencies.RUB);
    
    // Обновляем глобальный объект пользователя СИНХРОННО
    if (!window.userData) {
        window.userData = {};
    }
    if (!window.userData.currencies) {
        window.userData.currencies = {};
    }
        window.userData.currencies.RUB = userData.currencies.RUB;
    window.userData.id = userData.id; // Убеждаемся, что ID есть
    console.log('Обновлен window.userData.currencies.RUB:', window.userData.currencies.RUB);
    
    // КРИТИЧЕСКИ ВАЖНО: Сохранение баланса в ФИКСИРОВАННЫЙ ключ СРАЗУ
    const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    if (db && typeof db.saveBalanceFixed === 'function') {
        const saved = db.saveBalanceFixed('RUB', userData.currencies.RUB);
        if (saved) {
            console.log('✅✅✅ БАЛАНС СОХРАНЕН (фиксированный ключ) при пополнении:', userData.currencies.RUB);
        } else {
            console.error('❌ Ошибка сохранения баланса (фиксированный ключ)');
        }
    }
    
    // Дополнительно: прямое сохранение
    try {
        const balanceKey = 'jetstore_balance_fixed';
        const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
        balanceData.RUB = userData.currencies.RUB;
        balanceData.lastUpdate = new Date().getTime();
        localStorage.setItem(balanceKey, JSON.stringify(balanceData));
        console.log('✅ Дополнительное сохранение баланса при пополнении:', userData.currencies.RUB);
    } catch (error) {
        console.error('❌ Ошибка дополнительного сохранения:', error);
    }
    
    // Убеждаемся, что у пользователя есть ID ПЕРЕД сохранением
    if (!userData.id) {
        // Пытаемся получить ID из Telegram или создать тестовый
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initDataUnsafe;
        if (initData?.user?.id) {
            userData.id = String(initData.user.id);
        } else if (window.userData && window.userData.id) {
            userData.id = String(window.userData.id);
        } else {
            userData.id = 'test_user_default'; // ФИКСИРОВАННЫЙ ID для тестирования
        }
        console.log('✅ Установлен ID пользователя:', userData.id);
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Прямое сохранение в localStorage СРАЗУ
    try {
        const usersKey = 'jetstore_users';
        const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
        
        // Убеждаемся, что пользователь существует
        if (!users[userData.id]) {
            users[userData.id] = { ...userData };
        } else {
            // Обновляем только баланс
            if (!users[userData.id].currencies) {
                users[userData.id].currencies = {};
            }
            users[userData.id].currencies.RUB = userData.currencies.RUB;
            users[userData.id].id = userData.id; // Убеждаемся, что ID сохранен
        }
        
        // Сохраняем в localStorage
        localStorage.setItem(usersKey, JSON.stringify(users));
        
        // СРАЗУ проверяем
        const check = JSON.parse(localStorage.getItem(usersKey) || '{}');
        if (check[userData.id] && check[userData.id].currencies && check[userData.id].currencies.RUB === userData.currencies.RUB) {
            console.log('✅✅✅ ПРЯМОЕ СОХРАНЕНИЕ: Баланс успешно сохранен в localStorage!', userData.currencies.RUB);
        } else {
            console.error('❌ ПРЯМОЕ СОХРАНЕНИЕ: Ошибка проверки!');
        }
    } catch (error) {
        console.error('❌ Ошибка прямого сохранения:', error);
    }
    
    // Также сохраняем через Database (дополнительно)
    // db уже объявлен выше, используем его
    if (db && typeof db.saveBalance === 'function' && userData.id) {
        db.saveBalance(userData.id, 'RUB', userData.currencies.RUB);
        console.log('💾 Баланс сохранен через Database');
    }
    
    // Добавляем в историю транзакций
    if (!userData.transactions) {
        userData.transactions = [];
    }
    
    userData.transactions.push({
        type: 'deposit',
        amount: depositAmount,
        currency: 'RUB',
        date: new Date().toLocaleString('ru-RU'),
        status: 'completed'
    });
    
    // Убеждаемся, что ID есть перед сохранением
    if (!userData.id) {
        console.error('❌ ОШИБКА: userData.id отсутствует!');
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initDataUnsafe;
        if (initData?.user?.id) {
            userData.id = initData.user.id;
            console.log('ID установлен из Telegram:', userData.id);
        } else if (window.userData && window.userData.id) {
            userData.id = window.userData.id;
            console.log('ID установлен из window.userData:', userData.id);
        } else {
            userData.id = 'user_' + Date.now();
            console.log('ID создан автоматически:', userData.id);
        }
    }
    
    // Полностью синхронизируем window.userData с userData
    window.userData = { ...window.userData, ...userData };
    console.log('Синхронизирован window.userData:', window.userData);
    console.log('window.userData.currencies.RUB:', window.userData.currencies?.RUB);
    
    // Сохраняем в базу данных
    console.log('💾 Сохраняем в базу данных...');
    console.log('userData.id:', userData.id);
    console.log('userData.currencies.RUB:', userData.currencies.RUB);
    
    // db уже объявлен выше, используем его
    if (db && typeof db.saveUser === 'function') {
        try {
            // Убеждаемся, что все данные на месте перед сохранением
            if (!userData.id) {
                console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: userData.id отсутствует перед сохранением!');
                return;
            }
            
            const saved = db.saveUser(userData);
            console.log('✅ Результат Database.saveUser:', saved);
            
            // Проверяем, что данные сохранились - КРИТИЧЕСКИ ВАЖНО
            if (saved && typeof db.getUser === 'function') {
                const checkUser = db.getUser(userData.id);
                console.log('🔍 Проверка сохраненных данных...');
                console.log('ID проверяемого пользователя:', userData.id);
                console.log('Баланс в сохраненных данных:', checkUser?.currencies?.RUB);
                
                if (checkUser && checkUser.currencies && checkUser.currencies.RUB === userData.currencies.RUB) {
                    console.log('✅✅✅ ДАННЫЕ УСПЕШНО СОХРАНЕНЫ И ПРОВЕРЕНЫ! Баланс:', checkUser.currencies.RUB);
                } else {
                    console.error('❌❌❌ ОШИБКА: Данные не совпадают после сохранения!');
                    console.error('Ожидалось:', userData.currencies.RUB);
                    console.error('Получено:', checkUser?.currencies?.RUB);
                    // Пытаемся сохранить еще раз
                    console.log('🔄 Пытаемся сохранить еще раз...');
                    db.saveUser(userData);
                }
            } else {
                console.error('❌ Database.saveUser вернул false или getUser не найден!');
            }
        } catch (error) {
            console.error('❌ Ошибка Database.saveUser:', error);
            console.error('Stack:', error.stack);
        }
    } else {
        console.error('❌ Database не доступна или saveUser не найден!');
        console.error('typeof Database:', typeof Database);
        console.error('typeof window.Database:', typeof window.Database);
        // Прямое сохранение в localStorage
        try {
            const usersKey = 'jetstore_users';
            const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
            if (userData.id) {
                users[userData.id] = JSON.parse(JSON.stringify(userData));
                localStorage.setItem(usersKey, JSON.stringify(users));
                console.log('✅ Данные сохранены напрямую в localStorage (fallback)');
            }
        } catch (e) {
            console.error('❌ Критическая ошибка прямого сохранения:', e);
        }
    }
    
    // Дополнительно сохраняем через saveUserData
    if (typeof saveUserData === 'function') {
        saveUserData();
    } else if (typeof window.saveUserData === 'function') {
        window.saveUserData();
    } else {
        console.warn('saveUserData не найдена, но данные уже сохранены через Database.saveUser');
    }
    
    console.log('✅ Баланс после пополнения:', userData.currencies.RUB);
    console.log('✅ window.userData.currencies.RUB:', window.userData.currencies.RUB);
    
    // Обновляем отображение (баланс скрыт — «Скоро»)
    updateBalanceDisplay();
    
    // Показываем уведомление — в том же стиле, как после успешной оплаты звёзд
    try {
        const msg = 'Баланс пополнен на ' + depositAmount.toLocaleString('ru-RU') + ' ₽';
        if (typeof showStoreNotification === 'function') {
            // "Фирменный" баннер, как в магазине звёзд
            showStoreNotification(msg, 'success');
        } else {
            const notifyFn = typeof showNotification === 'function' ? showNotification : 
                            (typeof window.showNotification === 'function' ? window.showNotification : 
                            (typeof showMobileNotification === 'function' ? showMobileNotification : alert));
            notifyFn(msg, 'success');
        }
        console.log('Уведомление о пополнении показано');
    } catch (error) {
        console.error('Ошибка показа уведомления:', error);
        alert('Баланс пополнен на ' + depositAmount.toLocaleString('ru-RU') + ' ₽');
    }
    
    // Очищаем поле ввода
    const amountInput = document.getElementById('customAmount');
    if (amountInput) {
        amountInput.value = '';
    }
    
    // Сбрасываем выделение кнопок
    document.querySelectorAll('.deposit-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Закрываем попап
    closeDepositPopup();
    
    console.log('=== КОНЕЦ processDeposit ===');
}


// Обработчик для активации кнопки при вводе промокода (один раз при загрузке)
document.addEventListener('DOMContentLoaded', function() {
    const promoCodeInput = document.getElementById('promoCode');
    const applyBtn = document.getElementById('promoApplyBtn');
    
    if (promoCodeInput && applyBtn) {
        promoCodeInput.addEventListener('input', function() {
            applyBtn.disabled = !this.value.trim();
        });
    }
});

// Переключение выдвижной панели промокода
function togglePromoPanel() {
    const panel = document.getElementById('promoPanel');
    const promoBtn = document.querySelector('.btn-promo-main');
    const promoCodeInput = document.getElementById('promoCode');
    const applyBtn = document.getElementById('promoApplyBtn');
    
    if (panel && promoBtn) {
        const isActive = panel.classList.contains('active');
        
        if (isActive) {
            // Закрываем панель
            closePromoPanel();
        } else {
            // Открываем панель
            panel.classList.add('active');
            promoBtn.classList.add('active');
            
            // Фокус на поле ввода
            setTimeout(() => {
                if (promoCodeInput) promoCodeInput.focus();
            }, 300);
        }
    }
}

// Закрытие панели промокода
function closePromoPanel() {
    const panel = document.getElementById('promoPanel');
    const promoBtn = document.querySelector('.btn-promo-main');
    const promoCodeInput = document.getElementById('promoCode');
    const applyBtn = document.getElementById('promoApplyBtn');
    
    if (panel) {
        panel.classList.remove('active');
    }
    if (promoBtn) {
        promoBtn.classList.remove('active');
    }
    if (promoCodeInput) {
        promoCodeInput.value = '';
    }
    if (applyBtn) {
        applyBtn.disabled = true;
    }
}

// Активация промокода
function activatePromoCode() {
    const promoCodeInput = document.getElementById('promoCode');
    const applyBtn = document.getElementById('promoApplyBtn');
    const promoCode = promoCodeInput?.value.trim().toUpperCase();
    
    if (!promoCode || applyBtn?.disabled) {
        showNotification('Введите промокод', 'error');
        return;
    }
    
    // Проверка промокода
    const validPromoCodes = {
        'WELCOME2024': 100,
        'JETSTORE': 50,
        'BONUS25': 25,
        'FIRSTORDER': 150,
        'NEWYEAR': 200
    };
    
    // Проверка использованных промокодов
    if (!userData.usedPromoCodes) {
        userData.usedPromoCodes = [];
    }
    
    if (userData.usedPromoCodes.includes(promoCode)) {
        showNotification('Этот промокод уже был использован', 'error');
        return;
    }
    
    if (validPromoCodes[promoCode]) {
        const bonusAmount = validPromoCodes[promoCode];
        userData.currencies[userData.activeCurrency] += bonusAmount;
        userData.usedPromoCodes.push(promoCode);
        saveUserData();
        updateBalanceDisplay();
        
        // Обновляем баланс в попапе
        const balanceAmount = document.getElementById('promoBalanceAmount');
        if (balanceAmount) {
            balanceAmount.textContent = `${userData.currencies[userData.activeCurrency]} ${getCurrencySymbol(userData.activeCurrency)}`;
        }
        
        // Добавляем в историю транзакций
        if (!userData.transactions) {
            userData.transactions = [];
        }
        
        userData.transactions.push({
            type: 'promo',
            code: promoCode,
            amount: bonusAmount,
            currency: userData.activeCurrency,
            date: new Date().toLocaleString('ru-RU'),
            status: 'completed'
        });
        
        saveUserData();
        
        showNotification(`Промокод активирован! Начислено ${bonusAmount} ${getCurrencySymbol(userData.activeCurrency)}`, 'success');
        promoCodeInput.value = '';
        if (applyBtn) applyBtn.disabled = true;
        
        // Закрываем панель через 1.5 секунды
        setTimeout(() => {
            togglePromoPanel();
        }, 1500);
    } else {
        showNotification('Неверный промокод', 'error');
    }
}

// Показать информацию - полноэкранная страница
function showInfo(type) {
    // Создаем полноэкранную страницу информации
    const infoPage = document.createElement('div');
    infoPage.className = 'info-page-fullscreen';
    infoPage.innerHTML = `
        <style>
            .info-page-fullscreen {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(180deg, #0a0a0a 0%, #0f0f1a 50%, #0a0a0a 100%);
                z-index: 10000;
                overflow-y: auto;
                animation: slideInRight 0.3s ease;
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            .info-page-header {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px 20px;
                background: rgba(10, 10, 10, 0.95);
                backdrop-filter: blur(10px);
                position: sticky;
                top: 0;
                z-index: 100;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .info-back-btn {
                width: 40px;
                height: 40px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: #ffffff;
                font-size: 1.2rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
            }
            
            .info-back-btn:hover {
                background: rgba(102, 126, 234, 0.3);
            }
            
            .info-page-title {
                color: #ffffff;
                font-size: 1.3rem;
                font-weight: 700;
                margin: 0;
            }
            
            .info-page-content {
                padding: 20px max(20px, env(safe-area-inset-right)) 20px max(20px, env(safe-area-inset-left));
                overflow-x: hidden;
                box-sizing: border-box;
                max-width: 100vw;
            }
            
            .info-menu-item {
                background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%);
                border-radius: 16px;
                padding: 16px 18px;
                display: flex;
                align-items: center;
                gap: 14px;
                margin-bottom: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                border: 1px solid rgba(255, 255, 255, 0.05);
                text-decoration: none;
                overflow: hidden;
                box-sizing: border-box;
                max-width: 100%;
            }
            
            .info-menu-item:hover {
                background: linear-gradient(135deg, #1f1f3a 0%, #1a1a35 100%);
                transform: translateX(5px);
                border-color: rgba(102, 126, 234, 0.2);
            }
            
            .info-menu-item.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .info-menu-item.disabled:hover {
                transform: none;
            }
            
            .info-menu-icon {
                width: 48px;
                height: 48px;
                border-radius: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.4rem;
                flex-shrink: 0;
            }
            
            .info-menu-icon.telegram {
                background: linear-gradient(135deg, #0088cc 0%, #0077b5 100%);
                color: white;
            }
            
            .info-menu-icon.reviews {
                background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                color: white;
            }
            
            .info-menu-icon.support {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .info-menu-icon.document {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.6);
            }
            
            .info-menu-text {
                flex: 1;
                min-width: 0;
                overflow: hidden;
            }
            
            .info-menu-title {
                color: #ffffff;
                font-size: 1.05rem;
                font-weight: 600;
                margin: 0 0 4px 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .info-menu-subtitle {
                color: rgba(255, 255, 255, 0.5);
                font-size: 0.85rem;
                margin: 0;
            }
            
            .info-menu-arrow {
                color: rgba(255, 255, 255, 0.3);
                font-size: 1rem;
                flex-shrink: 0;
            }
            
            .info-menu-external {
                color: rgba(255, 255, 255, 0.3);
                font-size: 0.9rem;
                flex-shrink: 0;
            }
            
            .info-section-title {
                color: rgba(255, 255, 255, 0.4);
                font-size: 0.85rem;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin: 24px 0 12px 0;
                padding-left: 4px;
            }
            
            .info-menu-badge {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.5);
                font-size: 0.7rem;
                padding: 4px 8px;
                border-radius: 6px;
                font-weight: 500;
            }
        </style>
        
        <div class="info-page-header">
            <button class="info-back-btn" onclick="this.closest('.info-page-fullscreen').remove()">
                <i class="fas fa-chevron-left"></i>
            </button>
            <h1 class="info-page-title">Информация</h1>
            </div>
        
        <div class="info-page-content">
            <!-- Канал -->
            <a href="https://t.me/JetStoreApp" target="_blank" class="info-menu-item" onclick="openTelegramLink('https://t.me/JetStoreApp', event)">
                <div class="info-menu-icon telegram">
                    <i class="fab fa-telegram-plane"></i>
            </div>
                <div class="info-menu-text">
                    <p class="info-menu-title">Канал</p>
                    <p class="info-menu-subtitle">Новости и обновления</p>
                </div>
                <i class="fas fa-chevron-right info-menu-arrow"></i>
            </a>
            
            <!-- Отзывы -->
            <a href="https://t.me/RateJet" target="_blank" class="info-menu-item" onclick="openTelegramLink('https://t.me/RateJet', event)">
                <div class="info-menu-icon reviews">
                    <i class="fas fa-star"></i>
                </div>
                <div class="info-menu-text">
                    <p class="info-menu-title">Отзывы</p>
                    <p class="info-menu-subtitle">Читать отзывы клиентов</p>
                </div>
                <i class="fas fa-chevron-right info-menu-arrow"></i>
            </a>
            
            <!-- Поддержка -->
            <a href="https://t.me/ratejet" target="_blank" class="info-menu-item" onclick="openTelegramLink('https://t.me/ratejet', event)">
                <div class="info-menu-icon support">
                    <i class="fas fa-comment-dots"></i>
                </div>
                <div class="info-menu-text">
                    <p class="info-menu-title">Поддержка</p>
                    <p class="info-menu-subtitle">Связаться с нами</p>
                </div>
                <i class="fas fa-chevron-right info-menu-arrow"></i>
            </a>
            
            <!-- Раздел документов -->
            <p class="info-section-title">Документы</p>
            
            <!-- Оферта -->
            <div class="info-menu-item" onclick="openDocument('offer')">
                <div class="info-menu-icon document">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="info-menu-text">
                    <p class="info-menu-title">Оферта</p>
                </div>
                <i class="fas fa-external-link-alt info-menu-external"></i>
            </div>
            
            <!-- Пользовательское соглашение -->
            <div class="info-menu-item" onclick="openDocument('agreement')">
                <div class="info-menu-icon document">
                    <i class="fas fa-file-contract"></i>
                </div>
                <div class="info-menu-text">
                    <p class="info-menu-title">Пользовательское соглашение</p>
                </div>
                <i class="fas fa-external-link-alt info-menu-external"></i>
            </div>
            
            <!-- Политика конфиденциальности -->
            <div class="info-menu-item" onclick="openDocument('privacy')">
                <div class="info-menu-icon document">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div class="info-menu-text">
                    <p class="info-menu-title">Политика конфиденциальности</p>
                </div>
                <i class="fas fa-external-link-alt info-menu-external"></i>
            </div>
        </div>
    `;
    
    document.body.appendChild(infoPage);
}

// Открыть ссылку Telegram
function openTelegramLink(url, e) {
    if (e) e.preventDefault();
    if (window.event) window.event.preventDefault();
    
    const tg = window.Telegram?.WebApp;
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(url);
    } else {
        window.open(url, '_blank');
    }
}

// Открыть документ
function openDocument(type) {
    const urls = {
        'offer': 'https://telegra.ph/Dogovor-Oferty-02-11-4',
        'agreement': 'https://telegra.ph/Polzovatelskoe-soglashenie-02-11-33',
        'privacy': 'https://telegra.ph/Politika-konfidecialnosti-02-11'
    };
    const url = urls[type] || null;
    if (!url) {
        if (typeof showNotification === 'function') {
            showNotification('Этот документ пока недоступен.', 'info');
        }
        return;
    }
    const tg = window.Telegram?.WebApp;
    if (tg && tg.openLink) {
        tg.openLink(url);
    } else {
        window.open(url, '_blank');
    }
}

// Показать уведомление
function showNotification(message, type = 'info') {
    // Удаляем старое уведомление, если есть
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) {
        oldNotification.remove();
    }
    
    // Определяем цвет фона в зависимости от типа
    const bgColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#ff4757' : '#2196F3';
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    
    // Создаем новое уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        left: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px;
        border-radius: 10px;
        z-index: 9999;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
            <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Автоматическое удаление через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 3000);
}

// Добавляем стили для анимаций уведомлений (если их еще нет)
if (!document.getElementById('notification-animations')) {
const style = document.createElement('style');
    style.id = 'notification-animations';
style.textContent = `
    @keyframes slideIn {
        from {
                transform: translateY(-100%);
            opacity: 0;
        }
        to {
                transform: translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
                transform: translateY(0);
            opacity: 1;
        }
        to {
                transform: translateY(-100%);
            opacity: 0;
        }
    }
        
        /* Анимации для кнопок */
        .balance-btn:hover,
        .btn-primary:hover,
        .btn-secondary:hover,
        .deposit-option:hover,
        .info-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        .back-button:hover {
            transform: translateX(-5px);
        }
        
        .profile-nav-btn.active {
            transform: translateY(-5px);
        }
        
        /* Плавные переходы */
        .popup {
            transition: opacity 0.3s ease;
        }
        
        .popup.active {
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }
        
        .popup-content {
            animation: slideUp 0.3s ease;
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(50px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
        }
    }
`;
document.head.appendChild(style);
}

// Экспорт функций для использования в других файлах
window.saveUserData = saveUserData;
window.autoSaveBalance = autoSaveBalance;
window.loadMoreOrders = loadMoreOrders;
window.initializeProfile = initializeProfile;
window.updateStats = updateStats;
window.changeCurrency = changeCurrency;
window.showDepositPopup = showDepositPopup;
window.closeDepositPopup = closeDepositPopup;
window.closeBalanceTopup = closeBalanceTopup;
window.clearBalanceInput = clearBalanceInput;
window.setBalanceAmount = setBalanceAmount;
window.proceedBalanceTopup = proceedBalanceTopup;
window.showPaymentUnavailable = showPaymentUnavailable;
window.showUsdtDeposit = showUsdtDeposit;
window.closeUsdtPopup = closeUsdtPopup;
window.updateUsdtConversion = updateUsdtConversion;
window.processUsdtDeposit = processUsdtDeposit;
window.showSbpDeposit = showSbpDeposit;
window.closeSbpPopup = closeSbpPopup;
window.updateSbpAmount = updateSbpAmount;
window.processSbpDeposit = processSbpDeposit;
window.processDeposit = processDeposit;
window.togglePromoPanel = togglePromoPanel;
window.closePromoPanel = closePromoPanel;
window.activatePromoCode = activatePromoCode;
window.showInfo = showInfo;
window.openTelegramLink = openTelegramLink;
window.openDocument = openDocument;
window.showNotification = showNotification;
window.updateBalanceDisplay = updateBalanceDisplay;
window.loadUserData = loadUserData;
window.updateProfileDisplay = updateProfileDisplay;

// Убеждаемся, что showNotification доступна глобально (без тестовых логов)
if (typeof window.showNotification === 'undefined') {
    window.showNotification = showNotification;
}

// Инициализация 
window.addEventListener('load', function() {
    // Обновляем статистику
    updateStats();
});

// Сохранение данных пользователя
function saveUserData() {
    // Убеждаемся, что у пользователя есть ID
    if (!userData.id) {
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initDataUnsafe;
        if (initData?.user?.id) {
            userData.id = String(initData.user.id);
        } else if (window.userData && window.userData.id) {
            userData.id = String(window.userData.id);
        } else {
            userData.id = 'unknown_web'; // вне Telegram
        }
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Сохранение в ФИКСИРОВАННЫЙ ключ
    const db = window.Database || (typeof Database !== 'undefined' ? Database : null);
    if (db && typeof db.saveBalanceFixed === 'function' && userData.currencies) {
        const saved = db.saveBalanceFixed('RUB', userData.currencies.RUB);
        // silent
    }
    
    // Дополнительно: прямое сохранение
    try {
        const balanceKey = 'jetstore_balance_fixed';
        const balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
        balanceData.RUB = userData.currencies.RUB;
        balanceData.lastUpdate = new Date().getTime();
        localStorage.setItem(balanceKey, JSON.stringify(balanceData));
        
        // Проверяем
        const check = JSON.parse(localStorage.getItem(balanceKey) || '{}');
        if (check.RUB === userData.currencies.RUB) {
            console.log('✅ Дополнительное сохранение в saveUserData:', userData.currencies.RUB);
        }
    } catch (error) {
        console.error('❌ Ошибка дополнительного сохранения в saveUserData:', error);
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Прямое сохранение в localStorage ПЕРВЫМ ДЕЛОМ
    try {
        const usersKey = 'jetstore_users';
        const users = JSON.parse(localStorage.getItem(usersKey) || '{}');
        
        // Убеждаемся, что ID есть
        if (!userData.id) {
            userData.id = 'test_user_default';
        }
        
        // Создаем или обновляем пользователя
        if (!users[userData.id]) {
            users[userData.id] = JSON.parse(JSON.stringify(userData));
        } else {
            // Обновляем только важные поля
            users[userData.id].currencies = JSON.parse(JSON.stringify(userData.currencies));
            users[userData.id].id = userData.id;
            users[userData.id].purchases = userData.purchases || [];
            users[userData.id].transactions = userData.transactions || [];
        }
        
        localStorage.setItem(usersKey, JSON.stringify(users));
        
        // Проверяем сохранение
        const check = JSON.parse(localStorage.getItem(usersKey) || '{}');
        if (check[userData.id] && check[userData.id].currencies && check[userData.id].currencies.RUB === userData.currencies.RUB) {
            console.log('✅✅✅ ПРЯМОЕ СОХРАНЕНИЕ: Баланс сохранен в localStorage!', userData.currencies.RUB);
        } else {
            console.error('❌ ПРЯМОЕ СОХРАНЕНИЕ: Ошибка проверки!');
            console.error('Ожидалось:', userData.currencies.RUB);
            console.error('Получено:', check[userData.id]?.currencies?.RUB);
        }
    } catch (error) {
        console.error('❌ Ошибка прямого сохранения:', error);
    }
    
    // Также сохраняем через Database (дополнительная проверка)
    // db уже объявлен выше на строке 1327, используем его
    if (db && typeof db.saveBalance === 'function' && userData.id && userData.currencies) {
        const balanceSaved = db.saveBalance(userData.id, 'RUB', userData.currencies.RUB);
        console.log('💾 Быстрое сохранение баланса через Database:', balanceSaved ? '✅ Успешно' : '❌ Ошибка');
    }
    
    // Сохраняем в базу данных (полное сохранение)
    if (db && typeof db.saveUser === 'function') {
        try {
            const result = db.saveUser(userData);
            console.log('Результат Database.saveUser:', result ? '✅ Успешно' : '❌ Ошибка');
            
            // Проверяем сохранение
            if (result && typeof db.getUser === 'function') {
                const checkUser = db.getUser(userData.id);
                if (checkUser && checkUser.currencies && checkUser.currencies.RUB === userData.currencies.RUB) {
                    console.log('✅✅✅ ПРОВЕРКА: Баланс успешно сохранен и проверен!');
                } else {
                    console.error('❌❌❌ ПРОВЕРКА: Баланс не совпадает!');
                    console.error('Ожидалось:', userData.currencies.RUB);
                    console.error('Получено:', checkUser?.currencies?.RUB);
                }
            }
        } catch (error) {
            console.error('Ошибка сохранения в Database:', error);
            console.error('Stack:', error.stack);
        }
    } else {
        console.error('❌ Database не доступна или saveUser не найден!');
        console.error('typeof Database:', typeof Database);
        console.error('typeof window.Database:', typeof window.Database);
        if (db) {
            console.error('Доступные методы Database:', Object.keys(db));
        }
    }
    
    // Обновляем глобальный объект - ПОЛНАЯ синхронизация
    // ВАЖНО: Сохраняем баланс из userData (который только что сохранен в базу)
    window.userData = {
        ...window.userData,
        ...userData,
        // Приоритет у сохраненных данных (из userData)
        currencies: userData.currencies || window.userData.currencies
    };
    console.log('window.userData после сохранения:', window.userData);
    console.log('window.userData.currencies.RUB:', window.userData.currencies?.RUB);
    
    console.log('✅ Данные пользователя сохранены. Баланс RUB:', userData.currencies?.RUB);
}

// Загрузка дополнительных заказов
function loadMoreOrders() {
    console.log('Загрузка всех заказов...');
    displayPurchases(true);
    showNotification('Все заказы загружены', 'success');
}

// Инициализация профиля
function initializeProfile() {
    console.log('Инициализация профиля...');
    
    // Загружаем данные пользователя
    loadUserData();
    
    // Обновляем отображение профиля
    updateProfileDisplay();
    
    // Загружаем историю покупок
    loadUserPurchases();
    
    // Обновляем статистику
    updateStats();
    
    // Инициализируем реферальную программу
    if (typeof initializeReferralProgram === 'function') {
        initializeReferralProgram();
    }
    
    console.log('Профиль инициализирован');
}

// Обновление статистики
function updateStats() {
    try {
    // Количество покупок
        const purchasesCount = userData.purchases ? userData.purchases.length : 0;
        const purchasesElement = document.querySelector('#purchasesCount');
        if (purchasesElement) {
            purchasesElement.textContent = purchasesCount;
        }
    
    // Количество дней с регистрации
    if (userData.registrationDate) {
        const regDate = new Date(userData.registrationDate);
        const today = new Date();
        const diffTime = Math.abs(today - regDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const daysElement = document.querySelector('#daysCount');
            if (daysElement) {
                daysElement.textContent = diffDays;
            }
        } else {
            // Если дата регистрации не установлена, устанавливаем текущую дату
            userData.registrationDate = new Date().toLocaleDateString('ru-RU');
            const daysElement = document.querySelector('#daysCount');
            if (daysElement) {
                daysElement.textContent = '0';
            }
    }
    
    // Количество бонусов (транзакции типа promo)
    let bonusCount = 0;
    if (userData.transactions) {
        bonusCount = userData.transactions.filter(t => t.type === 'promo').length;
    }
        const bonusesElement = document.querySelector('#bonusesCount');
        if (bonusesElement) {
            bonusesElement.textContent = bonusCount;
        }
    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
    }
}

// Функции навигации из профиля
function showStoreViewFromProfile() {
    window.location.href = 'index.html';
    // После загрузки страницы переключимся на магазин
    setTimeout(() => {
        if (typeof window.showStoreView === 'function') {
            window.showStoreView('stars');
        }
    }, 100);
}

function showSteamFromProfile() {
    window.location.href = 'index.html';
    setTimeout(() => {
        if (typeof window.showSteam === 'function') window.showSteam();
    }, 100);
}

function showMarketFromProfile() {
    sessionStorage.setItem('openMarket', '1');
    window.location.href = 'index.html';
}

function showAssetsFromProfile() {
    window.location.href = 'index.html';
    // После загрузки страницы откроем окно "Активы"
    setTimeout(() => {
        if (typeof window.showAssetsView === 'function') {
            window.showAssetsView();
        }
    }, 100);
}

window.showStoreViewFromProfile = showStoreViewFromProfile;
window.showSteamFromProfile = showSteamFromProfile;
window.showMarketFromProfile = showMarketFromProfile;
window.showAssetsFromProfile = showAssetsFromProfile;

function goToReferralFromProfile() {
    sessionStorage.setItem('activeNav', 'referral');
    window.location.href = 'referral.html';
}

window.goToReferralFromProfile = goToReferralFromProfile;