// Конфиг для хостинга. API бота — тот же домен, что и сайт.
// Подробная инструкция: SETUP_API.md
window.JET_API_BASE = 'https://jetstoreapp.ru';

// Ключ localStorage для Tonkeeper, изолированный по Telegram user ID
window.getTonkeeperStorageKey = window.getTonkeeperStorageKey || function(base) {
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        var tgId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? String(tg.initDataUnsafe.user.id) : null;
        if (!tgId) {
            var saved = sessionStorage.getItem('jet_tg_user');
            if (saved) { var u = JSON.parse(saved); if (u && u.id) tgId = String(u.id); }
        }
        if (!tgId && window.userData && window.userData.id && window.userData.id !== 'test_user_default') tgId = String(window.userData.id);
        return tgId ? (base + '_' + tgId) : base;
    } catch (e) { return base; }
};

// Курс TON ↔ RUB: источник CoinPaprika (агрегация с бирж, бесплатный API).
// Документация: https://api.coinpaprika.com/
window.TON_RATE_API_URL = 'https://api.coinpaprika.com/v1/tickers/ton-toncoin?quotes=RUB';

/**
 * Загружает курс 1 TON в рублях и 1 RUB в TON из CoinPaprika и сохраняет в localStorage.
 * TON = рублей за 1 TON, RUB_TON = TON за 1 рубль (обратный курс).
 * @returns {Promise<number|null>} курс TON→RUB или null при ошибке
 */
window.fetchTonToRubRateFromApi = function() {
    var url = window.TON_RATE_API_URL || 'https://api.coinpaprika.com/v1/tickers/ton-toncoin?quotes=RUB';
    return fetch(url)
        .then(function(res) { return res.ok ? res.json() : Promise.reject(new Error('API error')); })
        .then(function(data) {
            var rubPrice = data && data.quotes && data.quotes.RUB && data.quotes.RUB.price;
            var rate = rubPrice != null ? parseFloat(rubPrice) : null;
            if (rate && rate > 0) {
                try {
                    var db = window.Database;
                    var existing = (db && typeof db.getCurrencyRates === 'function') ? db.getCurrencyRates() : {};
                    var saved = {};
                    try {
                        saved = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}');
                    } catch (e) {}
                    var rubToTon = 1 / rate;
                    var merged = Object.assign({}, existing, saved, { TON: rate, RUB_TON: rubToTon });
                    localStorage.setItem('jetstore_currency_rates', JSON.stringify(merged));
                    if (db && typeof db.updateCurrencyRates === 'function') {
                        db.updateCurrencyRates(merged);
                    }
                } catch (e) {
                    console.warn('TON rate save:', e);
                }
                return rate;
            }
            return null;
        })
        .catch(function(err) {
            console.warn('TON rate fetch:', err);
            return null;
        });
};
