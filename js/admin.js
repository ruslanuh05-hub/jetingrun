// admin.js - Скрипт для админ-панели
// Текущее состояние
let currentAdminSection = 'stats';
let currentCategory = 'telegram';
let currentEditingProduct = null;
let currentEditingUser = null;

// Сессия админки: токен хранится 1 час (бэкенд выдаёт при входе)
var ADMIN_SESSION_KEY = 'jetStoreAdminToken';
var ADMIN_EXPIRES_KEY = 'jetStoreAdminExpiresAt';

/** Возвращает Bearer-значение для заголовка Authorization (токен сессии), если сессия ещё действительна. Иначе очищает сохранённую сессию и возвращает null. */
function getAdminAuth() {
    try {
        var token = localStorage.getItem(ADMIN_SESSION_KEY) || '';
        var expiresStr = localStorage.getItem(ADMIN_EXPIRES_KEY) || '0';
        var expiresAt = parseInt(expiresStr, 10) || 0;
        var nowSec = Math.floor(Date.now() / 1000);
        if (token && expiresAt > nowSec) {
            return token;
        }
    } catch (e) {}
    clearAdminSession();
    return null;
}

function clearAdminSession() {
    localStorage.removeItem('jetStoreAdminLoggedIn');
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_EXPIRES_KEY);
    try { sessionStorage.removeItem('jetStoreAdminPassword'); } catch (e) {}
}

/** Если ответ 401 — сбрасываем сессию и показываем форму входа */
function checkAdminAuthResponse(response) {
    if (response && response.status === 401) {
        clearAdminSession();
        showLoginPanel();
        showNotification('Сессия истекла. Войдите снова.', 'error');
        return true;
    }
    return false;
}

// Инициализация админки
function initAdmin() {
    console.log('Админка инициализируется...');
    
    if (getAdminAuth()) {
        showAdminPanel();
    } else {
        showLoginPanel();
    }
    
    setupEventListeners();
    loadInitialData();
    console.log('Админка готова');
}

// Настройка обработчиков событий
function setupEventListeners() {
    console.log('Настройка обработчиков событий...');
    
    // Форма входа
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const password = document.getElementById('adminPassword').value;
            console.log('Попытка входа с паролем:', password);
            login(password);
        });
    }
    
    // Форма товара
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveProduct();
        });
    }
    
    // Форма пользователя
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveUser();
        });
    }
    
    // Форма пароля
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            changePassword();
        });
    }
    
    // Обработчик для импорта файлов
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', function(e) {
            importDataFile(e.target.files[0]);
        });
    }
    
    console.log('Обработчики настроены');
}

// Показать панель входа
function showLoginPanel() {
    const loginContainer = document.getElementById('loginContainer');
    const adminPanel = document.getElementById('adminPanel');
    if (loginContainer) { loginContainer.style.display = 'flex'; loginContainer.classList.add('visible'); }
    if (adminPanel) { adminPanel.style.display = 'none'; adminPanel.classList.remove('visible'); }
}

// Показать админ-панель
function showAdminPanel() {
    const loginContainer = document.getElementById('loginContainer');
    const adminPanel = document.getElementById('adminPanel');
    if (loginContainer) { loginContainer.style.display = 'none'; loginContainer.classList.remove('visible'); }
    if (adminPanel) { adminPanel.style.display = 'block'; adminPanel.classList.add('visible'); }
    loadSettings();
    // Сразу обновляем сводную статистику, чтобы убрать "Загрузка..."
    if (typeof window.refreshStatistics === 'function') {
        window.refreshStatistics();
    } else {
        // На случай, если функция ещё не присвоена в window
        try { refreshStatistics(); } catch (e) {}
    }
}

// Вход в админку — проверка пароля на бэкенде (ADMIN_PASSWORD в env)
function login(password) {
    console.log('Попытка входа...');
    if (!password || typeof password !== 'string') {
        showNotification('Введите пароль', 'error');
        return;
    }
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        showNotification('API бота не настроен. Укажите JET_BOT_API_URL в config.js', 'error');
        return;
    }
    fetch(apiBase.replace(/\/$/, '') + '/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
    })
        .then(function(r) { return r.json().catch(function() { return { ok: false }; }); })
        .then(function(res) {
            if (res.ok === true && res.token && res.expires_at) {
                localStorage.setItem('jetStoreAdminLoggedIn', 'true');
                localStorage.setItem(ADMIN_SESSION_KEY, res.token);
                localStorage.setItem(ADMIN_EXPIRES_KEY, String(res.expires_at));
                showAdminPanel();
                showNotification('Вход выполнен. Сессия на 1 час.', 'success');
            } else {
                showNotification(res.message || 'Неверный пароль', 'error');
            }
        })
        .catch(function() {
            showNotification('Ошибка связи с сервером', 'error');
        });
}

// Выход из админки
function logout() {
    clearAdminSession();
    showLoginPanel();
    const adminPasswordInput = document.getElementById('adminPassword');
    if (adminPasswordInput) adminPasswordInput.value = '';
}

// Показать раздел админки
function showAdminSection(section) {
    console.log('Переключаемся на раздел:', section);
    
    // Скрыть все разделы
    document.querySelectorAll('.admin-content').forEach(el => {
        el.classList.remove('active');
    });
    
    // Убрать активный класс у всех кнопок
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показать выбранный раздел
    const sectionElement = document.getElementById(section + 'Section');
    if (sectionElement) {
        sectionElement.classList.add('active');
    }
    
    // Активировать соответствующую кнопку
    const activeBtn = document.querySelector(`.admin-nav-btn[onclick*="${section}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Загрузить данные раздела
    currentAdminSection = section;
    
    if (section === 'products') {
        loadProducts(currentCategory);
    } else if (section === 'users') {
        loadUsers();
    } else if (section === 'settings') {
        loadSettings();
    }
}

// Показать категорию товаров
function showCategory(category) {
    console.log('Показываем категорию:', category);
    currentCategory = category;
    
    // Убрать активный класс у всех вкладок
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Активировать выбранную вкладку
    const activeTab = document.querySelector(`.category-tab[onclick*="${category}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Загрузить товары категории
    loadProducts(category);
}

// Загрузка начальных данных
function loadInitialData() {
    console.log('Загружаем начальные данные...');
    
    // Загружаем курсы валют
    const db = window.Database;
    if (db && typeof db.getCurrencyRates === 'function') {
        const rates = db.getCurrencyRates();
        
        const usdtRateEl = document.getElementById('usdtRate');
        const usdRateEl = document.getElementById('usdRate');
        const eurRateEl = document.getElementById('eurRate');
        const tonRateEl = document.getElementById('tonRate');
        const usdtInput = document.getElementById('usdtInput');
        const usdInput = document.getElementById('usdInput');
        const eurInput = document.getElementById('eurInput');
        const tonInput = document.getElementById('tonInput');
        
        if (usdtRateEl) usdtRateEl.textContent = rates.USDT || 80;
        if (usdRateEl) usdRateEl.textContent = rates.USD || 90;
        if (eurRateEl) eurRateEl.textContent = rates.EUR || 100;
        if (tonRateEl) tonRateEl.textContent = rates.TON || 600;
        if (usdtInput) usdtInput.value = rates.USDT || 80;
        if (usdInput) usdInput.value = rates.USD || 90;
        if (eurInput) eurInput.value = rates.EUR || 100;
        if (tonInput) tonInput.value = rates.TON || 600;
    }
    
    loadSettings();
}

// Ручная корректировка баланса пользователя по username
function adminAdjustBalance() {
    console.log('[adminAdjustBalance] start');
    const usernameInput = document.getElementById('adjustUsername');
    const amountInput = document.getElementById('adjustAmount');
    if (!usernameInput || !amountInput) {
        showNotification('Элементы формы не найдены', 'error');
        return;
    }
    const username = (usernameInput.value || '').trim();
    let amount = parseFloat((amountInput.value || '').replace(',', '.'));
    if (!username) {
        showNotification('Введите username без @', 'error');
        return;
    }
    if (!amount || isNaN(amount)) {
        showNotification('Введите ненулевую сумму (можно отрицательную)', 'error');
        return;
    }

    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var auth = getAdminAuth();
    if (!apiBase || !auth) {
        showNotification('Сессия истекла. Войдите снова.', 'error');
        showLoginPanel();
        return;
    }

    fetch(apiBase.replace(/\/$/, '') + '/api/admin/balance-adjust', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + auth
        },
        body: JSON.stringify({ username: username, amount: amount })
    })
        .then(function(r) {
            if (r.status === 401) { checkAdminAuthResponse(r); return null; }
            return r.json().catch(function() { return {}; });
        })
        .then(function(res) {
            if (!res) return;
            if (res.success) {
                const newBal = typeof res.balance_rub === 'number' ? res.balance_rub.toFixed(2) : '—';
                showNotification('Баланс обновлён. Новый баланс: ' + newBal + ' ₽', 'success');
                try { refreshStatistics(); } catch (e) {}
            } else {
                showNotification(res.message || res.error || 'Ошибка изменения баланса', 'error');
            }
        })
        .catch(function(err) {
            console.error('[adminAdjustBalance] network error', err);
            showNotification('Ошибка связи с сервером', 'error');
        });
}

// Начислить реферальный баланс пользователю
function adminAddReferralBalance() {
    var usernameEl = document.getElementById('refBalanceUsername');
    var amountEl = document.getElementById('refBalanceAmount');
    if (!usernameEl || !amountEl) return;
    var username = (usernameEl.value || '').trim().replace(/^@/, '');
    var amount = parseFloat((amountEl.value || '').replace(',', '.'));
    if (!username) {
        showNotification('Введите username (без @)', 'error');
        return;
    }
    if (!amount || isNaN(amount) || amount <= 0) {
        showNotification('Введите положительную сумму (₽)', 'error');
        return;
    }
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var auth = getAdminAuth();
    if (!apiBase || !auth) {
        showNotification('Сессия истекла. Войдите снова.', 'error');
        showLoginPanel();
        return;
    }
    fetch(apiBase.replace(/\/$/, '') + '/api/admin/referral-balance-adjust', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + auth
        },
        body: JSON.stringify({ username: username, amount: amount })
    })
    .then(function(r) {
        if (r.status === 401) { checkAdminAuthResponse(r); return null; }
        return r.json().catch(function() { return {}; });
    })
    .then(function(res) {
        if (!res) return;
        if (res.success) {
            showNotification('Начислено ' + amount + ' ₽. Реферальный баланс: ' + (res.earned_rub != null ? res.earned_rub.toFixed(2) : '—') + ' ₽', 'success');
            amountEl.value = '';
        } else {
            showNotification(res.message || res.error || 'Ошибка начисления', 'error');
        }
    })
    .catch(function(err) {
        console.error('[adminAddReferralBalance] error', err);
        showNotification('Ошибка связи с сервером', 'error');
    });
}

// Обновление статистики: с сервера (GET /api/admin/stats) или из локальной Database
function refreshStatistics() {
    const block = document.getElementById('statBlock');
    if (!block) {
        console.error('[refreshStatistics] statBlock не найден');
        return;
    }
    block.textContent = 'Загрузка...';
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var auth = getAdminAuth();
    
    if (apiBase && auth) {
        var url = apiBase.replace(/\/$/, '') + '/api/admin/stats';
        fetch(url, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + auth }
        })
            .then(function(r) {
                console.log('[refreshStatistics] Ответ сервера: status=', r.status, 'ok=', r.ok);
                if (r.ok) {
                    return r.json().then(function(data) {
                        console.log('[refreshStatistics] Данные получены:', data);
                        return data;
                    });
                }
                if (r.status === 401) {
                    checkAdminAuthResponse(r);
                    return null;
                }
                return r.text().then(function(text) {
                    console.error('[refreshStatistics] Ошибка сервера:', r.status, text);
                    return null;
                });
            })
            .then(function(data) {
                if (data && typeof data.totalSales !== 'undefined') {
                    console.log('[refreshStatistics] Отображаем данные с сервера');
                    renderStatsBlock(block, data);
                    return;
                }
                console.warn('[refreshStatistics] Данные с сервера некорректны, пробуем локальную Database');
                try { 
                    if (typeof window.Database !== 'undefined' && typeof (window.Database || {}).getStatistics === 'function') {
                        var localStats = (window.Database || {}).getStatistics();
                        console.log('[refreshStatistics] Используем локальную статистику:', localStats);
                        renderStatsBlock(block, localStats);
                        return;
                    } 
                } catch (e) {
                    console.error('[refreshStatistics] Ошибка получения локальной статистики:', e);
                }
                block.textContent = 'Данные недоступны. Проверьте ответ сервера в консоли.';
            })
            .catch(function(err) {
                console.error('[refreshStatistics] Ошибка сети:', err);
                try { 
                    if (typeof window.Database !== 'undefined' && typeof (window.Database || {}).getStatistics === 'function') {
                        var localStats = (window.Database || {}).getStatistics();
                        console.log('[refreshStatistics] Используем локальную статистику (fallback):', localStats);
                        renderStatsBlock(block, localStats);
                        return;
                    } 
                } catch (e) {
                    console.error('[refreshStatistics] Ошибка получения локальной статистики:', e);
                }
                block.textContent = 'Ошибка загрузки: ' + (err.message || 'Проверьте API и пароль. Откройте консоль (F12) для деталей.');
            });
        return;
    }
    
    console.warn('[refreshStatistics] API или сессия не настроены. apiBase:', apiBase, 'auth:', auth ? 'есть' : 'нет');
    try {
        if (typeof window.Database !== 'undefined' && typeof (window.Database || {}).getStatistics === 'function') {
            var s = (window.Database || {}).getStatistics();
            console.log('[refreshStatistics] Используем локальную статистику (без API):', s);
            renderStatsBlock(block, s);
            return;
        }
    } catch (e) {
        console.error('[refreshStatistics] Ошибка получения локальной статистики:', e);
    }
    block.textContent = 'Данные недоступны. Настройте API (js/config.js) и войдите в админку.';
}

function renderStatsBlock(block, s) {
    var fmt = function(n) { return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
    var fmtRub = function(n) { return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'; };
    block.textContent = [
        '🛍️ Продажи',
        '▸ Всего продаж: ' + (s.totalSales ?? 0),
        '▸ Общий оборот: ' + fmtRub(s.totalTurnoverRub),
        '',
        '💰 Пополнения баланса',
        '▸ Кол-во пополнений: ' + (s.balanceTopupsCount ?? 0),
        '▸ Сумма пополнений: ' + fmtRub(s.balanceTopupsRub),
        '',
        '⏳ Динамика продаж:',
        '├ Сегодня: ' + (s.salesToday ?? 0) + ' на ' + fmtRub(s.turnoverToday),
        '├ Неделя: ' + (s.salesWeek ?? 0) + ' на ' + fmtRub(s.turnoverWeek),
        '└ Месяц: ' + (s.salesMonth ?? 0) + ' на ' + fmtRub(s.turnoverMonth),
        '',
        '👥 Пользователи',
        '▸ Всего аккаунтов: ' + (s.totalUsers ?? 0),
        '',
        '📊 Регистрации:',
        '├ За день: ' + (s.regsDay ?? 0),
        '├ За неделю: ' + (s.regsWeek ?? 0),
        '└ За месяц: ' + (s.regsMonth ?? 0),
        '',
        '🔥 Активность:',
        '├ Дневная: ' + (s.activityDay ?? 0),
        '├ Недельная: ' + (s.activityWeek ?? 0),
        '└ Месячная: ' + (s.activityMonth ?? 0)
    ].join('\n');
}

// Загрузка товаров
function loadProducts(category) {
    console.log('Загружаем товары категории:', category);
    
    if (typeof window.Database !== 'undefined') {
        const products = (window.Database || {}).getProductsByCategory(category);
        const productsList = document.getElementById('productsList');
        
        if (!productsList) {
            console.error('Не найден элемент productsList');
            return;
        }
        
        if (products.length === 0) {
            productsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-box-open" style="font-size: 3rem; margin-bottom: 15px; color: #667eea;"></i>
                    <p>В этой категории пока нет товаров</p>
                </div>
            `;
            return;
        }
        
        productsList.innerHTML = products.map(product => `
            <div class="product-item">
                <div class="product-info">
                    <div class="product-title">${product.name || 'Без названия'}</div>
                    <div>${product.description || 'Без описания'}</div>
                    <div class="product-price">${product.price || 0} звёзд</div>
                </div>
                <div class="product-actions">
                    <button class="action-btn edit" onclick="editProduct('${category}', '${product.id}')">
                        <i class="fas fa-edit"></i> Изменить
                    </button>
                    <button class="action-btn delete" onclick="deleteProduct('${category}', '${product.id}')">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// Сброс формы товара
function resetProductForm() {
    const form = document.getElementById('productForm');
    if (form) form.reset();
    
    const productId = document.getElementById('productId');
    if (productId) productId.value = '';
    
    const productCategory = document.getElementById('productCategory');
    if (productCategory) productCategory.value = currentCategory;
    
    currentEditingProduct = null;
    
    // Устанавливаем категорию по умолчанию
    const badgeField = document.getElementById('productBadge');
    if (badgeField) {
        const badgeMap = {
            'telegram': 'Telegram',
            'steam': 'Steam',
            'games': 'Игры',
            'brawlstars': 'Brawl Stars',
            'clashroyale': 'Clash Royale',
            'clashofclans': 'Clash of Clans',
            'standoff2': 'Standoff 2',
            'pubgmobile': 'PUBG Mobile'
        };
        badgeField.value = badgeMap[currentCategory] || 'Товар';
    }
    
    const iconField = document.getElementById('productIcon');
    if (iconField) {
        const iconMap = {
            'telegram': 'fab fa-telegram',
            'steam': 'fab fa-steam',
            'games': 'fas fa-gamepad',
            'brawlstars': 'fas fa-star',
            'clashroyale': 'fas fa-crown',
            'clashofclans': 'fas fa-shield-alt',
            'standoff2': 'fas fa-crosshairs',
            'pubgmobile': 'fas fa-crosshairs'
        };
        iconField.value = iconMap[currentCategory] || 'fas fa-box';
    }
}

// Редактировать товар
function editProduct(category, productId) {
    console.log('Редактируем товар:', productId, 'в категории:', category);
    
    if (typeof window.Database !== 'undefined') {
        const products = (window.Database || {}).getProductsByCategory(category);
        const product = products.find(p => p.id === productId);
        
        if (product) {
            currentEditingProduct = product;
            currentCategory = category;
            
            // Заполняем форму
            const productIdField = document.getElementById('productId');
            const productCategoryField = document.getElementById('productCategory');
            const productNameField = document.getElementById('productName');
            const productPriceField = document.getElementById('productPrice');
            const productIconField = document.getElementById('productIcon');
            const productBadgeField = document.getElementById('productBadge');
            const productDescriptionField = document.getElementById('productDescription');
            const productDetailsField = document.getElementById('productDetails');
            
            if (productIdField) productIdField.value = product.id;
            if (productCategoryField) productCategoryField.value = category;
            if (productNameField) productNameField.value = product.name || '';
            if (productPriceField) productPriceField.value = product.price || '';
            if (productIconField) productIconField.value = product.icon || '';
            if (productBadgeField) productBadgeField.value = product.badge || '';
            if (productDescriptionField) productDescriptionField.value = product.description || '';
            if (productDetailsField) productDetailsField.value = product.details || '';
            
            // Показываем раздел товаров
            showAdminSection('products');
            
            showNotification('Товар загружен для редактирования', 'success');
        }
    }
}

// Сохранить товар
function saveProduct() {
    console.log('Сохраняем товар...');
    
    if (typeof window.Database !== 'undefined') {
        const productId = document.getElementById('productId')?.value;
        const category = document.getElementById('productCategory')?.value || currentCategory;
        
        const productData = {
            name: document.getElementById('productName')?.value || 'Новый товар',
            price: parseFloat(document.getElementById('productPrice')?.value) || 0,
            icon: document.getElementById('productIcon')?.value || 'fas fa-box',
            badge: document.getElementById('productBadge')?.value || 'Товар',
            description: document.getElementById('productDescription')?.value || 'Описание товара',
            details: document.getElementById('productDetails')?.value || ''
        };
        
        console.log('Данные товара:', productData);
        console.log('ID товара:', productId);
        console.log('Категория:', category);
        
        let success = false;
        let message = '';
        
        if (productId) {
            // Обновление существующего товара
            success = (window.Database || {}).updateProduct(category, productId, productData);
            message = success ? 'Товар успешно обновлен' : 'Ошибка обновления товара';
        } else {
            // Добавление нового товара
            const newProduct = (window.Database || {}).addProduct(category, productData);
            success = !!newProduct;
            message = success ? 'Товар успешно добавлен' : 'Ошибка добавления товара';
        }
        
        if (success) {
            showNotification(message, 'success');
            resetProductForm();
            loadProducts(category);
            
            // Обновляем статистику
            refreshStatistics();
        } else {
            showNotification(message, 'error');
        }
    }
}

// Удалить товар
function deleteProduct(category, productId) {
    console.log('Удаляем товар:', productId, 'из категории:', category);
    
    if (confirm('Вы уверены, что хотите удалить этот товар?')) {
        if (typeof window.Database !== 'undefined') {
            const success = (window.Database || {}).deleteProduct(category, productId);
            
            if (success) {
                showNotification('Товар успешно удален', 'success');
                loadProducts(category);
                refreshStatistics();
            } else {
                showNotification('Ошибка удаления товара', 'error');
            }
        }
    }
}

// Загрузка пользователей
function loadUsers() {
    console.log('Загружаем пользователей...');
    
    if (typeof window.Database !== 'undefined') {
        const users = (window.Database || {}).getUsers();
        const usersTableBody = document.getElementById('usersTableBody');
        
        if (!usersTableBody) {
            console.error('Не найден элемент usersTableBody');
            return;
        }
        
        if (Object.keys(users).length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 10px; color: #667eea;"></i>
                        <p>Пользователи не найдены</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        usersTableBody.innerHTML = Object.values(users).map(user => `
            <tr>
                <td>${user.id || '-'}</td>
                <td>${user.firstName || 'Не указано'}</td>
                <td>${user.username ? '@' + user.username : '-'}</td>
                <td>${user.language || 'ru'}</td>
                <td>${user.currencies?.RUB || 0} ₽</td>
                <td>
                    <button class="action-btn edit" onclick="editUser('${user.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// Редактировать пользователя
function editUser(userId) {
    console.log('Редактируем пользователя:', userId);
    
    if (typeof window.Database !== 'undefined') {
        const user = (window.Database || {}).getUser(userId);
        
        if (user) {
            currentEditingUser = user;
            
            // Заполняем форму
            const userIdField = document.getElementById('userId');
            const userNameField = document.getElementById('userName');
            const userLanguageField = document.getElementById('userLanguage');
            const userBalanceField = document.getElementById('userBalance');
            const userBalanceUSDField = document.getElementById('userBalanceUSD');
            
            if (userIdField) userIdField.value = user.id;
            if (userNameField) userNameField.value = user.firstName || user.username || 'Пользователь';
            if (userLanguageField) userLanguageField.value = user.language || 'ru';
            if (userBalanceField) userBalanceField.value = user.currencies?.RUB || 0;
            if (userBalanceUSDField) userBalanceUSDField.value = user.currencies?.USDT || 0;
            
            // Показываем раздел пользователей
            showAdminSection('users');
            
            showNotification('Данные пользователя загружены', 'success');
        }
    }
}

// Сохранить пользователя
function saveUser() {
    console.log('Сохраняем пользователя...');
    
    if (typeof window.Database !== 'undefined') {
        const userId = document.getElementById('userId')?.value;
        const user = (window.Database || {}).getUser(userId);
        
        if (user) {
            const updates = {
                language: document.getElementById('userLanguage')?.value || 'ru',
                currencies: {
                    RUB: parseFloat(document.getElementById('userBalance')?.value) || 0,
                    USDT: parseFloat(document.getElementById('userBalanceUSD')?.value) || 0,
                    USD: 0,
                    EUR: 0
                }
            };
            
            console.log('Обновления пользователя:', updates);
            
            // Обновляем пользователя
            const updatedUser = { ...user, ...updates };
            (window.Database || {}).saveUser(updatedUser);
            
            showNotification('Данные пользователя обновлены', 'success');
            loadUsers();
            refreshStatistics();
        }
    }
}

// Сброс формы пользователя
function resetUserForm() {
    const form = document.getElementById('userForm');
    if (form) form.reset();
    
    const userIdField = document.getElementById('userId');
    if (userIdField) userIdField.value = '';
    
    currentEditingUser = null;
}

// Изменение пароля
function changePassword() {
    console.log('Изменяем пароль...');
    
    if (typeof window.Database !== 'undefined') {
        const currentPassword = document.getElementById('currentPassword')?.value;
        const newPassword = document.getElementById('newPassword')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;
        
        // Проверка текущего пароля
        if (!(window.Database || {}).checkAdminPassword(currentPassword)) {
            showNotification('Текущий пароль неверен', 'error');
            return;
        }
        
        // Проверка совпадения новых паролей
        if (newPassword !== confirmPassword) {
            showNotification('Новые пароли не совпадают', 'error');
            return;
        }
        
        // Проверка длины пароля
        if (newPassword.length < 4) {
            showNotification('Пароль должен быть не менее 4 символов', 'error');
            return;
        }
        
        // Изменение пароля
        (window.Database || {}).changeAdminPassword(newPassword);
        
        showNotification('Пароль успешно изменен', 'success');
        
        const form = document.getElementById('passwordForm');
        if (form) form.reset();
    }
}

// Сохранение курсов валют
function saveCurrencyRates() {
    console.log('Сохраняем курсы валют...');
    
    const db = window.Database;
    if (db && typeof db.updateCurrencyRates === 'function') {
        const rates = {
            RUB: 1,
            USDT: parseFloat(document.getElementById('usdtInput')?.value) || 80,
            USD: parseFloat(document.getElementById('usdInput')?.value) || 90,
            EUR: parseFloat(document.getElementById('eurInput')?.value) || 100,
            TON: parseFloat(document.getElementById('tonInput')?.value) || 600
        };
        
        console.log('Новые курсы валют:', rates);
        
        db.updateCurrencyRates(rates);
        var steamRate = parseFloat(document.getElementById('steamRateInput')?.value) || 1.06;
        if (steamRate < 0.01) steamRate = 1.06;
        try { localStorage.setItem('jetstore_steam_rate', steamRate.toString()); } catch (e) {}
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            console.log('Sending steam_rate_rub=' + steamRate + ' to ' + apiBase + '/api/steam-rate');
            fetch(apiBase.replace(/\/$/, '') + '/api/steam-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ steam_rate_rub: steamRate })
            })
            .then(function(r) {
                if (r.ok) {
                    console.log('✓ Steam rate saved on server');
                    return r.json();
                } else {
                    console.error('✗ Steam rate save failed:', r.status, r.statusText);
                    return r.text().then(function(text) { console.error('Response:', text); });
                }
            })
            .catch(function(err) {
                console.error('✗ Steam rate save network error:', err);
                showNotification('Ошибка отправки курса на сервер: ' + err.message, 'error');
            });
        } else {
            console.error('✗ API base not configured! Cannot save steam rate to server.');
            showNotification('API бота не настроен. Курс сохранён только локально.', 'warning');
        }
        var cryptobotUsdt = parseFloat(document.getElementById('cryptobotUsdtAmount')?.value) || 1;
        if (cryptobotUsdt < 0.1) cryptobotUsdt = 1;
        try { localStorage.setItem('jetstore_cryptobot_usdt_amount', cryptobotUsdt.toString()); } catch (e) {}
        var plategaSbp = parseFloat(document.getElementById('plategaSbpCommissionInput')?.value);
        var plategaCards = parseFloat(document.getElementById('plategaCardsCommissionInput')?.value);
        if (typeof plategaSbp !== 'number' || isNaN(plategaSbp)) plategaSbp = 10;
        if (typeof plategaCards !== 'number' || isNaN(plategaCards)) plategaCards = 14;
        plategaSbp = Math.max(0, Math.min(100, plategaSbp));
        plategaCards = Math.max(0, Math.min(100, plategaCards));
        try { localStorage.setItem('jetstore_platega_sbp_commission', plategaSbp.toString()); localStorage.setItem('jetstore_platega_cards_commission', plategaCards.toString()); } catch (e) {}
        if (apiBase) {
            fetch(apiBase.replace(/\/$/, '') + '/api/platega-commission', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sbp_percent: plategaSbp, cards_percent: plategaCards })
            }).then(function(r) { if (r.ok) console.log('Platega commission saved on server'); }).catch(function() {});
        }
        
        const usdtRateEl = document.getElementById('usdtRate');
        const usdRateEl = document.getElementById('usdRate');
        const eurRateEl = document.getElementById('eurRate');
        const tonRateEl = document.getElementById('tonRate');
        
        if (usdtRateEl) usdtRateEl.textContent = rates.USDT;
        if (usdRateEl) usdRateEl.textContent = rates.USD;
        if (eurRateEl) eurRateEl.textContent = rates.EUR;
        if (tonRateEl) tonRateEl.textContent = rates.TON;
        
        showNotification('Курсы валют обновлены', 'success');
    } else {
        showNotification('Ошибка: Database недоступна', 'error');
    }
}

// Сохранение курса 1 звезды (покупка: 1 звезда = X ₽)
function saveStarRate() {
    console.log('Сохраняем курс 1 звезды...');
    
    const starRate = parseFloat(document.getElementById('starRateInput')?.value) || 1.37;
    
    try {
        localStorage.setItem('jetstore_star_rate', starRate.toString());
        showNotification('Курс 1 звезды сохранён', 'success');
        console.log('Курс 1 звезды сохранён:', starRate);
        
        const starRateEl = document.getElementById('starRate');
        if (starRateEl) starRateEl.textContent = starRate;
        
        // Отправляем на бэкенд, чтобы расчёт сумм (CryptoBot, FreeKassa и т.д.) использовал новый курс
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            console.log('Sending star_price_rub=' + starRate + ' to ' + apiBase + '/api/star-rate');
            fetch(apiBase.replace(/\/$/, '') + '/api/star-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ star_price_rub: starRate })
            })
            .then(function(r) {
                if (r.ok) {
                    console.log('✓ Star rate saved on server');
                    return r.json();
                } else {
                    console.error('✗ Star rate save failed:', r.status, r.statusText);
                    return r.text().then(function(text) { console.error('Response:', text); });
                }
            })
            .catch(function(err) {
                console.error('✗ Star rate save network error:', err);
                showNotification('Ошибка отправки курса на сервер: ' + err.message, 'error');
            });
        } else {
            console.error('✗ API base not configured! Cannot save star rate to server.');
            showNotification('API бота не настроен. Курс сохранён только локально.', 'warning');
        }
    } catch (error) {
        console.error('Ошибка сохранения курса 1 звезды:', error);
        showNotification('Ошибка сохранения курса', 'error');
    }
}

// Сохранение курса скупки 1 звезды (продажа: 1 звезда = X ₽)
function saveStarBuyRate() {
    console.log('Сохраняем курс скупки 1 звезды...');
    
    const buyRate = parseFloat(document.getElementById('starBuyRateInput')?.value) || 0.65;
    
    try {
        localStorage.setItem('jetstore_star_buy_rate', buyRate.toString());
        showNotification('Курс скупки 1 звезды сохранён', 'success');
        console.log('Курс скупки 1 звезды сохранён:', buyRate);
        
        const starBuyRateEl = document.getElementById('starBuyRate');
        if (starBuyRateEl) starBuyRateEl.textContent = buyRate;
        
        // Отправляем на бэкенд
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            console.log('Sending star_buy_rate_rub=' + buyRate + ' to ' + apiBase + '/api/star-rate');
            fetch(apiBase.replace(/\/$/, '') + '/api/star-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ star_buy_rate_rub: buyRate })
            })
            .then(function(r) {
                if (r.ok) {
                    console.log('✓ Star buy rate saved on server');
                    return r.json();
                } else {
                    console.error('✗ Star buy rate save failed:', r.status, r.statusText);
                    return r.text().then(function(text) { console.error('Response:', text); });
                }
            })
            .catch(function(err) {
                console.error('✗ Star buy rate save network error:', err);
                showNotification('Ошибка отправки курса на сервер: ' + err.message, 'error');
            });
        } else {
            console.error('✗ API base not configured! Cannot save star buy rate to server.');
            showNotification('API бота не настроен. Курс сохранён только локально.', 'warning');
        }
    } catch (error) {
        console.error('Ошибка сохранения курса скупки 1 звезды:', error);
        showNotification('Ошибка сохранения курса скупки', 'error');
    }
}

// Сохранение курса Steam (1 рубль на стим = ? ₽)
function saveSteamRate() {
    var el = document.getElementById('steamRateInput');
    if (!el) return;
    var steamRate = parseFloat(el.value) || 1.06;
    if (steamRate < 0.01) steamRate = 1.06;
    try { localStorage.setItem('jetstore_steam_rate', steamRate.toString()); } catch (e) {}
    var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (apiBase) {
        fetch(apiBase.replace(/\/$/, '') + '/api/steam-rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steam_rate_rub: steamRate })
        })
        .then(function(r) {
            if (r.ok) { console.log('✓ Steam rate saved on server'); return r.json(); }
            return r.text().then(function(t) { console.error('Steam rate save failed:', t); });
        })
        .catch(function(err) {
            console.error('Steam rate save error:', err);
            showNotification('Ошибка отправки курса Steam на сервер', 'error');
        });
    }
}

// Сохранить курсы (звёзды + Steam) — одна кнопка в админке
function saveAdminRates() {
    saveStarRate();
    saveStarBuyRate();
    saveSteamRate();
    showNotification('Курсы звёзд и Steam сохранены (и в базу данных)', 'success');
}

// Сохранение цен на звёзды
function saveStarsPrices() {
    console.log('Сохраняем цены на звёзды...');
    
    saveStarRate();
    saveStarBuyRate();
    
    // Одним запросом отправляем оба курса на бэкенд (чтобы расчёты использовали актуальные значения)
    var starPrice = parseFloat(document.getElementById('starRateInput')?.value) || 1.37;
    var starBuyRate = parseFloat(document.getElementById('starBuyRateInput')?.value) || 0.65;
    var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (apiBase) {
        fetch(apiBase.replace(/\/$/, '') + '/api/star-rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ star_price_rub: starPrice, star_buy_rate_rub: starBuyRate })
        }).then(function(r) { if (r.ok) console.log('Star rates saved on server'); }).catch(function() {});
    }
    
    const prices = {
        50: parseFloat(document.getElementById('starsPrice50')?.value) || 69,
        100: parseFloat(document.getElementById('starsPrice100')?.value) || 137,
        250: parseFloat(document.getElementById('starsPrice250')?.value) || 343,
        500: parseFloat(document.getElementById('starsPrice500')?.value) || 685,
        1000: parseFloat(document.getElementById('starsPrice1000')?.value) || 1370
    };
    
    try {
        localStorage.setItem('jetstore_stars_prices', JSON.stringify(prices));
        showNotification('Цены на звёзды сохранены', 'success');
        console.log('Цены на звёзды сохранены:', prices);
    } catch (error) {
        console.error('Ошибка сохранения цен на звёзды:', error);
        showNotification('Ошибка сохранения цен', 'error');
    }
}

// Сохранение цен на Premium
function savePremiumPrices() {
    console.log('Сохраняем цены на Premium...');
    
    const prices = {
        3: parseFloat(document.getElementById('premiumPrice3')?.value) || 983,
        6: parseFloat(document.getElementById('premiumPrice6')?.value) || 1311,
        12: parseFloat(document.getElementById('premiumPrice12')?.value) || 2377
    };
    
    try {
        localStorage.setItem('jetstore_premium_prices', JSON.stringify(prices));
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            fetch(apiBase.replace(/\/$/, '') + '/api/premium-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ premium_3: prices[3], premium_6: prices[6], premium_12: prices[12] })
            }).then(function(r) { if (r.ok) console.log('Premium prices saved on server'); }).catch(function() {});
        }
        showNotification('Цены на Premium сохранены', 'success');
        console.log('Цены на Premium сохранены:', prices);
    } catch (error) {
        console.error('Ошибка сохранения цен на Premium:', error);
        showNotification('Ошибка сохранения цен', 'error');
    }
}

// Загрузка настроек
function loadSettings() {
    console.log('Загружаем настройки...');
    
    const db = window.Database;
    if (db && typeof db.getCurrencyRates === 'function') {
        const rates = db.getCurrencyRates();
        
        const usdtInput = document.getElementById('usdtInput');
        const usdInput = document.getElementById('usdInput');
        const eurInput = document.getElementById('eurInput');
        const tonInput = document.getElementById('tonInput');
        
        const usdtRateEl = document.getElementById('usdtRate');
        const usdRateEl = document.getElementById('usdRate');
        const eurRateEl = document.getElementById('eurRate');
        const tonRateEl = document.getElementById('tonRate');
        
        if (usdtInput) usdtInput.value = rates.USDT || 80;
        if (usdInput) usdInput.value = rates.USD || 90;
        if (eurInput) eurInput.value = rates.EUR || 100;
        if (tonInput) tonInput.value = rates.TON || 600;
        
        if (usdtRateEl) usdtRateEl.textContent = rates.USDT || 80;
        if (usdRateEl) usdRateEl.textContent = rates.USD || 90;
        if (eurRateEl) eurRateEl.textContent = rates.EUR || 100;
        if (tonRateEl) tonRateEl.textContent = rates.TON || 600;
    }
    var steamRateEl = document.getElementById('steamRateInput');
    if (steamRateEl) {
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            fetch(apiBase.replace(/\/$/, '') + '/api/steam-rate', { method: 'GET', mode: 'cors' })
                .then(function(r) { return r.ok ? r.json() : {}; })
                .then(function(data) {
                    if (data.steam_rate_rub != null && !isNaN(data.steam_rate_rub))
                        steamRateEl.value = data.steam_rate_rub;
                    else
                        steamRateEl.value = parseFloat(localStorage.getItem('jetstore_steam_rate') || '1.06') || 1.06;
                })
                .catch(function() {
                    steamRateEl.value = parseFloat(localStorage.getItem('jetstore_steam_rate') || '1.06') || 1.06;
                });
        } else {
            steamRateEl.value = parseFloat(localStorage.getItem('jetstore_steam_rate') || '1.06') || 1.06;
        }
    }
    var cryptobotEl = document.getElementById('cryptobotUsdtAmount');
    if (cryptobotEl) {
        var saved = localStorage.getItem('jetstore_cryptobot_usdt_amount');
        cryptobotEl.value = saved ? parseFloat(saved) || 1 : 1;
    }
    var plategaSbpEl = document.getElementById('plategaSbpCommissionInput');
    var plategaCardsEl = document.getElementById('plategaCardsCommissionInput');
    if (plategaSbpEl || plategaCardsEl) {
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            fetch(apiBase.replace(/\/$/, '') + '/api/platega-commission', { method: 'GET', mode: 'cors' })
                .then(function(r) { return r.ok ? r.json() : {}; })
                .then(function(data) {
                    if (plategaSbpEl) plategaSbpEl.value = (data.sbp_percent != null ? data.sbp_percent : parseFloat(localStorage.getItem('jetstore_platega_sbp_commission') || '10'));
                    if (plategaCardsEl) plategaCardsEl.value = (data.cards_percent != null ? data.cards_percent : parseFloat(localStorage.getItem('jetstore_platega_cards_commission') || '14'));
                })
                .catch(function() {
                    if (plategaSbpEl) plategaSbpEl.value = parseFloat(localStorage.getItem('jetstore_platega_sbp_commission') || '10') || 10;
                    if (plategaCardsEl) plategaCardsEl.value = parseFloat(localStorage.getItem('jetstore_platega_cards_commission') || '14') || 14;
                });
        } else {
            if (plategaSbpEl) plategaSbpEl.value = parseFloat(localStorage.getItem('jetstore_platega_sbp_commission') || '10') || 10;
            if (plategaCardsEl) plategaCardsEl.value = parseFloat(localStorage.getItem('jetstore_platega_cards_commission') || '14') || 14;
        }
    }
    
    // Загружаем курсы звёзд с бэкенда (как на сервере) или из localStorage
    var starRateInputEl = document.getElementById('starRateInput');
    var starBuyRateInputEl = document.getElementById('starBuyRateInput');
    if (starRateInputEl || starBuyRateInputEl) {
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            fetch(apiBase.replace(/\/$/, '') + '/api/star-rate', { method: 'GET', mode: 'cors' })
                .then(function(r) { return r.ok ? r.json() : {}; })
                .then(function(data) {
                    if (starRateInputEl && data.star_price_rub != null && !isNaN(data.star_price_rub)) {
                        starRateInputEl.value = data.star_price_rub;
                        try { localStorage.setItem('jetstore_star_rate', String(data.star_price_rub)); } catch (e) {}
                    }
                    if (starBuyRateInputEl && data.star_buy_rate_rub != null && !isNaN(data.star_buy_rate_rub)) {
                        starBuyRateInputEl.value = data.star_buy_rate_rub;
                        try { localStorage.setItem('jetstore_star_buy_rate', String(data.star_buy_rate_rub)); } catch (e) {}
                    }
                })
                .catch(function() {
                    if (starRateInputEl) starRateInputEl.value = parseFloat(localStorage.getItem('jetstore_star_rate') || '1.37') || 1.37;
                    if (starBuyRateInputEl) starBuyRateInputEl.value = parseFloat(localStorage.getItem('jetstore_star_buy_rate') || '0.65') || 0.65;
                });
        } else {
            if (starRateInputEl) starRateInputEl.value = parseFloat(localStorage.getItem('jetstore_star_rate') || '1.37') || 1.37;
            if (starBuyRateInputEl) starBuyRateInputEl.value = parseFloat(localStorage.getItem('jetstore_star_buy_rate') || '0.65') || 0.65;
        }
    }
    try {
        const buyRate = parseFloat(localStorage.getItem('jetstore_star_buy_rate') || '0.65');
        const buyRateDisplay = document.getElementById('starBuyRate');
        const buyRateInput = document.getElementById('starBuyRateInput');
        if (buyRateDisplay) buyRateDisplay.textContent = buyRate;
        if (buyRateInput) buyRateInput.value = buyRate;
    } catch (error) {
        console.error('Ошибка загрузки курса скупки звезды:', error);
    }
    
    // Загружаем цены на звёзды
    try {
        const starsPrices = JSON.parse(localStorage.getItem('jetstore_stars_prices') || '{}');
        const defaultStarsPrices = { 50: 69, 100: 137, 250: 343, 500: 685, 1000: 1370 };
        const finalStarsPrices = { ...defaultStarsPrices, ...starsPrices };
        
        if (document.getElementById('starsPrice50')) document.getElementById('starsPrice50').value = finalStarsPrices[50];
        if (document.getElementById('starsPrice100')) document.getElementById('starsPrice100').value = finalStarsPrices[100];
        if (document.getElementById('starsPrice250')) document.getElementById('starsPrice250').value = finalStarsPrices[250];
        if (document.getElementById('starsPrice500')) document.getElementById('starsPrice500').value = finalStarsPrices[500];
        if (document.getElementById('starsPrice1000')) document.getElementById('starsPrice1000').value = finalStarsPrices[1000];
    } catch (error) {
        console.error('Ошибка загрузки цен на звёзды:', error);
    }
    
    // Загружаем цены на Premium (с сервера или из localStorage)
    (function loadPremiumPrices() {
        var defaultPremiumPrices = { 3: 983, 6: 1311, 12: 2377 };
        var apply = function(prices) {
            var finalPrices = { ...defaultPremiumPrices, ...prices };
            if (document.getElementById('premiumPrice3')) document.getElementById('premiumPrice3').value = finalPrices[3];
            if (document.getElementById('premiumPrice6')) document.getElementById('premiumPrice6').value = finalPrices[6];
            if (document.getElementById('premiumPrice12')) document.getElementById('premiumPrice12').value = finalPrices[12];
        };
        try {
            var localPrices = JSON.parse(localStorage.getItem('jetstore_premium_prices') || '{}');
            apply(localPrices);
        } catch (e) {}
        var apiBase = (typeof getJetApiBase === 'function' && getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (apiBase) {
            fetch(apiBase.replace(/\/$/, '') + '/api/premium-prices', { method: 'GET', mode: 'cors' })
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                    if (data && (data.premium_3 != null || data.premium_6 != null || data.premium_12 != null)) {
                        apply({ 3: data.premium_3, 6: data.premium_6, 12: data.premium_12 });
                    }
                })
                .catch(function() {});
        }
    })();
}

// Экспорт данных
function exportData() {
    console.log('Экспортируем данные...');
    
    if (typeof window.Database !== 'undefined') {
        const data = {
            products: (window.Database || {}).getProducts(),
            users: (window.Database || {}).getAllUsers ? (window.Database || {}).getAllUsers() : ((window.Database || {}).getProducts ? {} : {}),
            settings: (window.Database || {}).getAdminSettings(),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `jetstore_backup_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
        
        showNotification('Данные успешно экспортированы', 'success');
    }
}

// Импорт данных
function importData() {
    console.log('Инициируем импорт данных...');
    document.getElementById('importFile').click();
}

// Импорт данных из файла
function importDataFile(file) {
    console.log('Импортируем данные из файла:', file?.name);
    
    if (!file) return;
    
    if (confirm('ВНИМАНИЕ: Импорт данных перезапишет текущие данные. Продолжить?')) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // Проверяем структуру данных
                if (data.products || data.users || data.settings) {
                    if (data.products) localStorage.setItem('jetstore_products', JSON.stringify(data.products));
                    if (data.users) localStorage.setItem('jetstore_users', JSON.stringify(data.users));
                    if (data.settings) localStorage.setItem('jetstore_admin_settings', JSON.stringify(data.settings));
                    
                    showNotification('Данные успешно импортированы', 'success');
                    
                    // Обновляем отображение
                    loadSettings();
                } else {
                    showNotification('Неверный формат файла данных', 'error');
                }
            } catch (error) {
                console.error('Ошибка импорта:', error);
                showNotification('Ошибка при чтении файла: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
    }
}

// Сброс всех данных
function resetData() {
    if (confirm('ВНИМАНИЕ: Это удалит ВСЕ данные (товары, пользователей, настройки). Действие необратимо. Продолжить?')) {
        // Сбрасываем базу данных
        localStorage.removeItem('jetstore_products');
        localStorage.removeItem('jetstore_users');
        localStorage.removeItem('jetstore_admin_settings');
        localStorage.removeItem('jetStoreAdminLoggedIn');
        
        // Инициализируем заново
        if (typeof window.Database !== 'undefined') {
            (window.Database || {}).init();
        }
        
        // Сбрасываем формы
        resetProductForm();
        resetUserForm();
        
        // Обновляем отображение
        loadProducts(currentCategory);
        loadUsers();
        loadSettings();
        refreshStatistics();
        
        showNotification('Все данные сброшены', 'success');
    }
}

// Показать уведомление
function showNotification(message, type = 'info') {
    console.log('Уведомление:', message, type);
    
    // Удаляем старое уведомление
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) {
        oldNotification.remove();
    }
    
    // Создаем новое уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Автоматическое удаление через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 3000);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализируем админку...');
    
    // Даем немного времени на загрузку всех скриптов
    setTimeout(initAdmin, 100);
    
    // Обработчик кнопки "Обновить" статистику (на случай, если onclick не сработает)
    setTimeout(function() {
        const refreshBtn = document.querySelector('button[onclick*="refreshStatistics"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function(e) {
                console.log('[Кнопка Обновить] Клик зарегистрирован');
                if (typeof refreshStatistics === 'function') {
                    refreshStatistics();
                } else if (typeof window.refreshStatistics === 'function') {
                    window.refreshStatistics();
                } else {
                    console.error('[Кнопка Обновить] Функция refreshStatistics не найдена');
                }
            });
        }
    }, 200);
});

// Управление товарами Supercell
let currentSupercellCategory = 'clashroyale';

function switchSupercellCategory(game) {
    currentSupercellCategory = game;
    document.querySelectorAll('.category-tab').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(game === 'clashroyale' ? 'Clash Royale' : game === 'clashofclans' ? 'Clash of Clans' : 'Brawl Stars')) {
            btn.classList.add('active');
        }
    });
    loadSupercellProducts(game);
}

function loadSupercellProducts(game) {
    const container = document.getElementById('supercellProductsAdmin');
    if (!container) return;
    
    try {
        const productsKey = `jetstore_supercell_${game}`;
        let products = JSON.parse(localStorage.getItem(productsKey) || '[]');
        
        // Инициализация товаров по умолчанию, если их нет
        if (products.length === 0) {
            const defaultProducts = {
                'clashroyale': [{ name: 'Royal Pass', price: 299 }],
                'clashofclans': [{ name: 'Pass', price: 299 }],
                'brawlstars': [{ name: 'Brawl Pass', price: 299 }]
            };
            if (defaultProducts[game]) {
                products = defaultProducts[game];
                localStorage.setItem(productsKey, JSON.stringify(products));
            }
        }
        
        container.innerHTML = '';
        
        if (products.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Товары пока не добавлены</p>';
            return;
        }
        
        products.forEach((product, index) => {
            const item = document.createElement('div');
            item.className = 'product-item';
            item.innerHTML = `
                <div class="product-info">
                    <div class="product-title">${product.name || 'Товар'}</div>
                    <div class="product-price">${product.price || 0} ₽</div>
                </div>
                <div class="product-actions">
                    <button class="action-btn edit" onclick="editSupercellProduct('${game}', ${index})">
                        <i class="fas fa-edit"></i> Изменить
                    </button>
                    <button class="action-btn delete" onclick="deleteSupercellProduct('${game}', ${index})">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Ошибка загрузки товаров Supercell:', error);
        container.innerHTML = '<p style="color: #f44336; text-align: center; padding: 20px;">Ошибка загрузки товаров</p>';
    }
}

function addSupercellProduct() {
    const name = document.getElementById('newSupercellProductName')?.value.trim();
    const price = parseFloat(document.getElementById('newSupercellProductPrice')?.value) || 0;
    
    if (!name) {
        showNotification('Введите название товара', 'error');
        return;
    }
    
    if (price <= 0) {
        showNotification('Введите корректную цену', 'error');
        return;
    }
    
    try {
        const productsKey = `jetstore_supercell_${currentSupercellCategory}`;
        const products = JSON.parse(localStorage.getItem(productsKey) || '[]');
        
        products.push({ name, price });
        localStorage.setItem(productsKey, JSON.stringify(products));
        
        document.getElementById('newSupercellProductName').value = '';
        document.getElementById('newSupercellProductPrice').value = '';
        
        loadSupercellProducts(currentSupercellCategory);
        showNotification('Товар добавлен', 'success');
    } catch (error) {
        console.error('Ошибка добавления товара:', error);
        showNotification('Ошибка при добавлении товара', 'error');
    }
}

function editSupercellProduct(game, index) {
    try {
        const productsKey = `jetstore_supercell_${game}`;
        const products = JSON.parse(localStorage.getItem(productsKey) || '[]');
        const product = products[index];
        
        if (!product) {
            showNotification('Товар не найден', 'error');
            return;
        }
        
        const newName = prompt('Введите новое название:', product.name);
        if (newName === null) return;
        
        const newPrice = parseFloat(prompt('Введите новую цену (₽):', product.price));
        if (isNaN(newPrice) || newPrice <= 0) {
            showNotification('Неверная цена', 'error');
            return;
        }
        
        products[index] = { name: newName.trim(), price: newPrice };
        localStorage.setItem(productsKey, JSON.stringify(products));
        
        loadSupercellProducts(game);
        showNotification('Товар изменён', 'success');
    } catch (error) {
        console.error('Ошибка редактирования товара:', error);
        showNotification('Ошибка при изменении товара', 'error');
    }
}

function deleteSupercellProduct(game, index) {
    if (!confirm('Удалить этот товар?')) return;
    
    try {
        const productsKey = `jetstore_supercell_${game}`;
        const products = JSON.parse(localStorage.getItem(productsKey) || '[]');
        
        products.splice(index, 1);
        localStorage.setItem(productsKey, JSON.stringify(products));
        
        loadSupercellProducts(game);
        showNotification('Товар удалён', 'success');
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        showNotification('Ошибка при удалении товара', 'error');
    }
}


// =============================================
// Управление Usernames (аренда / продажа, ₽ и TON)
// =============================================
function toggleUsernameRentFields() {
    const chk = document.getElementById('newUsernameRent');
    const block = document.getElementById('usernameRentFields');
    if (block) block.style.display = chk && chk.checked ? 'block' : 'none';
}

function toggleUsernameSaleFields() {
    const chk = document.getElementById('newUsernameSale');
    const block = document.getElementById('usernameSaleFields');
    if (block) block.style.display = chk && chk.checked ? 'block' : 'none';
}

function loadUsernamesAdmin() {
    const container = document.getElementById('usernamesAdminList');
    if (!container) return;
    
    try {
        let usernames = JSON.parse(localStorage.getItem('jetstore_usernames') || '[]');
        // Поддержка старого формата: { username, price, status } -> новый формат
        let changed = false;
        usernames = usernames.map(u => {
            if (u.rent !== undefined || u.sale !== undefined) return u;
            changed = true;
            const priceTon = typeof u.price === 'number' ? u.price : parseFloat(u.price) || 0;
            const priceRub = Math.round(priceTon * 80);
            return {
                username: u.username,
                rent: u.status === 'on_auction' ? { rub: priceRub, ton: priceTon } : null,
                sale: u.status === 'for_sale' ? { rub: priceRub, ton: priceTon } : (u.status === 'on_auction' ? null : { rub: priceRub, ton: priceTon }),
                rentMonths: u.rentMonths || 1
            };
        });
        if (changed) localStorage.setItem('jetstore_usernames', JSON.stringify(usernames));
        
        if (usernames.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center; padding: 30px;">Usernames пока не добавлены</p>';
            return;
        }
        
        container.innerHTML = usernames.map((u, index) => {
            const rentStr = u.rent ? `Аренда (за 1 день): ${u.rent.rub || 0} ₽ / ${u.rent.ton || 0} TON` : '';
            const saleStr = u.sale ? `Продажа: ${u.sale.rub || 0} ₽ / ${u.sale.ton || 0} TON` : '';
            const parts = [rentStr, saleStr].filter(Boolean).join(' · ');
            return `
            <div class="product-item">
                <div class="product-info">
                    <div class="product-title">@${u.username}</div>
                    <div style="color: #00d4ff; font-weight: 600; font-size: 0.9rem;">${parts || '—'}</div>
                </div>
                <div class="product-actions">
                    <button class="action-btn edit" onclick="editUsername(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteUsername(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки usernames:', error);
        container.innerHTML = '<p style="color: #f44336; text-align: center; padding: 20px;">Ошибка загрузки</p>';
    }
}

function addUsername() {
    const username = (document.getElementById('newUsernameInput')?.value || '').trim().replace('@', '');
    const rentChk = document.getElementById('newUsernameRent')?.checked;
    const saleChk = document.getElementById('newUsernameSale')?.checked;
    
    if (!username) {
        showNotification('Введите username', 'error');
        return;
    }
    
    if (!rentChk && !saleChk) {
        showNotification('Отметьте «В аренду» и/или «В продажу»', 'error');
        return;
    }
    
    let rent = null;
    if (rentChk) {
        const rentRub = parseFloat(document.getElementById('newUsernameRentRub')?.value) || 0;
        const rentTon = parseFloat(document.getElementById('newUsernameRentTon')?.value) || 0;
        if (rentRub <= 0 && rentTon <= 0) {
            showNotification('Укажите цену за 1 день (₽ или TON)', 'error');
            return;
        }
        rent = { rub: rentRub, ton: rentTon };
    }
    
    let sale = null;
    if (saleChk) {
        const saleRub = parseFloat(document.getElementById('newUsernameSaleRub')?.value) || 0;
        const saleTon = parseFloat(document.getElementById('newUsernameSaleTon')?.value) || 0;
        if (saleRub <= 0 && saleTon <= 0) {
            showNotification('Укажите цену продажи (₽ или TON)', 'error');
            return;
        }
        sale = { rub: saleRub, ton: saleTon };
    }
    
    try {
        let usernames = JSON.parse(localStorage.getItem('jetstore_usernames') || '[]');
        const existingIndex = usernames.findIndex(u => (u.username || '').toLowerCase() === username.toLowerCase());
        
        if (existingIndex >= 0) {
            const existing = usernames[existingIndex];
            usernames[existingIndex] = {
                username: existing.username,
                rent: rent || existing.rent || null,
                sale: sale || existing.sale || null,
                rentMonths: existing.rentMonths
            };
            showNotification('Username обновлён (добавлены аренда/продажа)', 'success');
        } else {
            usernames.push({
                username,
                rent,
                sale
            });
            showNotification('Username добавлен в список', 'success');
        }
        
        localStorage.setItem('jetstore_usernames', JSON.stringify(usernames));
        
        document.getElementById('newUsernameInput').value = '';
        document.getElementById('newUsernameRent').checked = false;
        document.getElementById('newUsernameSale').checked = false;
        document.getElementById('newUsernameRentRub').value = '';
        document.getElementById('newUsernameRentTon').value = '';
        document.getElementById('newUsernameSaleRub').value = '';
        document.getElementById('newUsernameSaleTon').value = '';
        toggleUsernameRentFields();
        toggleUsernameSaleFields();
        
        loadUsernamesAdmin();
    } catch (error) {
        console.error('Ошибка добавления username:', error);
        showNotification('Ошибка при добавлении', 'error');
    }
}

function editUsername(index) {
    try {
        const usernames = JSON.parse(localStorage.getItem('jetstore_usernames') || '[]');
        const u = usernames[index];
        
        if (!u) {
            showNotification('Username не найден', 'error');
            return;
        }
        
        const newUsername = prompt('Username:', u.username);
        if (newUsername === null) return;
        
        const rent = u.rent ? { ...u.rent } : null;
        const sale = u.sale ? { ...u.sale } : null;
        
        if (u.rent) {
            const rub = prompt('Цена за 1 день (₽):', (u.rent.rub || 0).toString());
            if (rub !== null) rent.rub = parseFloat(rub) || 0;
            const ton = prompt('Цена за 1 день (TON):', (u.rent.ton || 0).toString());
            if (ton !== null) rent.ton = parseFloat(ton) || 0;
        }
        if (u.sale) {
            const rub = prompt('Цена продажи (₽):', (u.sale.rub || 0).toString());
            if (rub !== null) sale.rub = parseFloat(rub) || 0;
            const ton = prompt('Цена продажи (TON):', (u.sale.ton || 0).toString());
            if (ton !== null) sale.ton = parseFloat(ton) || 0;
        }
        
        usernames[index] = {
            username: newUsername.replace('@', '').trim() || u.username,
            rent: rent && (rent.rub > 0 || rent.ton > 0) ? rent : null,
            sale: sale && (sale.rub > 0 || sale.ton > 0) ? sale : null,
            rentMonths: u.rentMonths
        };
        
        localStorage.setItem('jetstore_usernames', JSON.stringify(usernames));
        loadUsernamesAdmin();
        showNotification('Username изменён', 'success');
    } catch (error) {
        console.error('Ошибка редактирования username:', error);
        showNotification('Ошибка при изменении', 'error');
    }
}

function deleteUsername(index) {
    if (!confirm('Удалить этот username?')) return;
    
    try {
        const usernames = JSON.parse(localStorage.getItem('jetstore_usernames') || '[]');
        usernames.splice(index, 1);
        localStorage.setItem('jetstore_usernames', JSON.stringify(usernames));
        
        loadUsernamesAdmin();
        showNotification('Username удалён', 'success');
    } catch (error) {
        console.error('Ошибка удаления username:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

// =============================================
// Управление Номерами +888
// =============================================
function loadNumbersAdmin() {
    const container = document.getElementById('numbersAdminList');
    if (!container) return;
    
    try {
        const numbers = JSON.parse(localStorage.getItem('jetstore_numbers') || '[]');
        
        if (numbers.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center; padding: 30px;">Номера пока не добавлены</p>';
            return;
        }
        
        container.innerHTML = numbers.map((n, index) => `
            <div class="product-item">
                <div class="product-info">
                    <div class="product-title">${n.number}</div>
                    <div style="color: #00d4ff; font-weight: 600;">${n.minBid.toLocaleString('ru-RU')} TON</div>
                    <div style="color: #888; font-size: 0.9rem;">${n.status === 'on_auction' ? 'На аукционе' : 'На продаже'} | ${n.type || 'Resale'} | ${n.auctionEnds || 'Без ограничений'}</div>
                </div>
                <div class="product-actions">
                    <button class="action-btn edit" onclick="editNumber(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteNumber(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки номеров:', error);
        container.innerHTML = '<p style="color: #f44336; text-align: center; padding: 20px;">Ошибка загрузки</p>';
    }
}

function addNumber() {
    const number = document.getElementById('newNumberInput')?.value.trim();
    const minBid = parseInt(document.getElementById('newNumberBid')?.value) || 0;
    const status = document.getElementById('newNumberStatus')?.value || 'on_auction';
    const type = document.getElementById('newNumberType')?.value.trim() || 'Resale';
    const auctionEnds = document.getElementById('newNumberEnds')?.value.trim() || '';
    
    if (!number) {
        showNotification('Введите номер телефона', 'error');
        return;
    }
    
    if (minBid <= 0) {
        showNotification('Введите корректную ставку', 'error');
        return;
    }
    
    try {
        const numbers = JSON.parse(localStorage.getItem('jetstore_numbers') || '[]');
        
        numbers.push({
            number: number,
            minBid: minBid,
            status: status,
            type: type,
            auctionEnds: auctionEnds
        });
        
        localStorage.setItem('jetstore_numbers', JSON.stringify(numbers));
        
        // Очищаем поля
        document.getElementById('newNumberInput').value = '';
        document.getElementById('newNumberBid').value = '';
        document.getElementById('newNumberType').value = '';
        document.getElementById('newNumberEnds').value = '';
        
        loadNumbersAdmin();
        showNotification('Номер добавлен', 'success');
    } catch (error) {
        console.error('Ошибка добавления номера:', error);
        showNotification('Ошибка при добавлении', 'error');
    }
}

function editNumber(index) {
    try {
        const numbers = JSON.parse(localStorage.getItem('jetstore_numbers') || '[]');
        const n = numbers[index];
        
        if (!n) {
            showNotification('Номер не найден', 'error');
            return;
        }
        
        const newNumber = prompt('Введите новый номер:', n.number);
        if (newNumber === null) return;
        
        const newBid = parseInt(prompt('Введите минимальную ставку (TON):', n.minBid));
        if (isNaN(newBid) || newBid <= 0) {
            showNotification('Неверная ставка', 'error');
            return;
        }
        
        const newStatus = prompt('Статус (on_auction или for_sale):', n.status);
        const newType = prompt('Тип:', n.type || 'Resale');
        const newEnds = prompt('Окончание аукциона:', n.auctionEnds || '');
        
        numbers[index] = {
            number: newNumber.trim(),
            minBid: newBid,
            status: newStatus === 'for_sale' ? 'for_sale' : 'on_auction',
            type: newType || 'Resale',
            auctionEnds: newEnds || ''
        };
        
        localStorage.setItem('jetstore_numbers', JSON.stringify(numbers));
        loadNumbersAdmin();
        showNotification('Номер изменён', 'success');
    } catch (error) {
        console.error('Ошибка редактирования номера:', error);
        showNotification('Ошибка при изменении', 'error');
    }
}

function deleteNumber(index) {
    if (!confirm('Удалить этот номер?')) return;
    
    try {
        const numbers = JSON.parse(localStorage.getItem('jetstore_numbers') || '[]');
        numbers.splice(index, 1);
        localStorage.setItem('jetstore_numbers', JSON.stringify(numbers));
        
        loadNumbersAdmin();
        showNotification('Номер удалён', 'success');
    } catch (error) {
        console.error('Ошибка удаления номера:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

// Загружаем при переходе в настройки
const originalLoadSettings = loadSettings;
loadSettings = function() {
    originalLoadSettings();
    loadUsernamesAdmin();
    loadNumbersAdmin();
};

// Экспортируем функции в глобальную область видимости
window.showAdminSection = showAdminSection;
window.showCategory = showCategory;
window.refreshStatistics = refreshStatistics;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.saveProduct = saveProduct;
window.resetProductForm = resetProductForm;
window.editUser = editUser;
window.saveUser = saveUser;
window.resetUserForm = resetUserForm;
window.changePassword = changePassword;
window.saveCurrencyRates = saveCurrencyRates;
window.saveStarRate = saveStarRate;
window.saveStarsPrices = saveStarsPrices;
window.savePremiumPrices = savePremiumPrices;
window.switchSupercellCategory = switchSupercellCategory;
window.addSupercellProduct = addSupercellProduct;
window.editSupercellProduct = editSupercellProduct;
window.deleteSupercellProduct = deleteSupercellProduct;
window.exportData = exportData;
window.importData = importData;
window.resetData = resetData;
window.logout = logout;
window.addUsername = addUsername;
window.editUsername = editUsername;
window.deleteUsername = deleteUsername;
window.addNumber = addNumber;
window.editNumber = editNumber;
window.deleteNumber = deleteNumber;
window.loadUsernamesAdmin = loadUsernamesAdmin;
window.loadNumbersAdmin = loadNumbersAdmin;