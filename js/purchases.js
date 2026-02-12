// purchases.js - Модуль для записи покупок
// ВАЖНО: запись покупок на бэкенд (включая рейтинг и рефералов) теперь выполняется ТОЛЬКО через вебхуки
// после успешной выдачи товара на сервере. Клиент больше НЕ вызывает /api/purchases/record.

// Записать намерение оплаты (только локально, без изменения рейтинга на бэке)
function recordPurchaseIntent(data) {
    if (!data || !data.purchase) return;
    // Раньше здесь отправлялся запрос на /api/purchases/record с rating_only=true,
    // из‑за чего пользователь попадал в рейтинг ещё до успешной выдачи товара.
    // Теперь намерение можно логировать только локально (если нужно),
    // а рейтинг и история формируются ТОЛЬКО после успешной выдачи (recordPurchaseSuccess).
}

// Сохранение покупки: только локальная история (для UI)
// deliveryOptions (необязательный второй аргумент) может содержать:
// { status: 'delivered' | 'pending_delivery' } — для расширенных статусов, например для звёзд.
function recordPurchaseSuccess(data, deliveryOptions) {
    if (!data || !data.purchase) return;
    var p = data.purchase;
    var amountRub = parseFloat(data.totalAmount || data.baseAmount || p.amount || 0);
    if (!amountRub || amountRub <= 0) return;
    var type = (p.type || 'stars').toLowerCase();
    var productName = p.productName || p.name || '';
    var starsAmount = parseInt(p.stars_amount || (type === 'stars' ? amountRub / 0.65 : 0), 10) || 0;
    if (type === 'premium') {
        var months = p.months || 3;
        productName = productName || ('Premium ' + months + ' мес.');
    } else if (type === 'stars') {
        productName = productName || (starsAmount ? starsAmount + ' звёзд' : 'Звёзды Telegram');
    } else if (type === 'steam') {
        productName = productName || ('Steam ' + amountRub + ' ₽');
    }
    // Определяем текущего пользователя (для разделения истории по аккаунтам на одном устройстве)
    var uid = null;
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
            uid = tg.initDataUnsafe.user.id;
        }
    } catch (e) {}
    if (!uid && window.userData && window.userData.id) {
        uid = window.userData.id;
    }
    if (uid != null && uid !== undefined) {
        uid = String(uid);
    } else {
        uid = null;
    }

    // Статус по умолчанию
    var statusText = 'успешно';
    // Для звёзд учитываем дополнительные статусы, приходящие из delivery.js
    if (type === 'stars' && deliveryOptions && typeof deliveryOptions === 'object') {
        if (deliveryOptions.status === 'delivered') {
            statusText = 'Звёзды выданы';
        } else if (deliveryOptions.status === 'pending_delivery') {
            statusText = 'Звёзды отправляются';
        }
    }

    var recipientUsername = (p.login || p.username || '').toString().trim();

    var purchaseObj = {
        id: 'purchase_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: type,
        productName: productName,
        price: amountRub,
        status: statusText,
        date: new Date().toISOString(),
        userId: uid,
        recipient: recipientUsername
    };
    // Сохраняем только локально для истории в UI
    try {
        var list = JSON.parse(localStorage.getItem('jetstore_purchases') || '[]');
        list.unshift(purchaseObj);
        localStorage.setItem('jetstore_purchases', JSON.stringify(list));
    } catch (e) { console.warn('recordPurchaseSuccess jetstore_purchases:', e); }
    if (window.userData && Array.isArray(window.userData.purchases)) {
        window.userData.purchases.unshift(purchaseObj);
        if (typeof saveUserToDatabase === 'function') saveUserToDatabase();
    }
    // ВАЖНО: запись на бэкенд теперь выполняется ТОЛЬКО через вебхуки платёжных сервисов
    // после успешной выдачи товара на сервере. Клиент больше НЕ вызывает /api/purchases/record.
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.recordPurchaseIntent = recordPurchaseIntent;
    window.recordPurchaseSuccess = recordPurchaseSuccess;
}
