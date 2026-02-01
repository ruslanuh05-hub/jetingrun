// Конфиг: сайт на GitHub Pages / jetstoreapp.ru, бот на Railway.
// URL бота — для API (CryptoBot, курс TON, Fragment и т.д.)
window.JET_BOT_API_URL = 'https://jet-store-bot-production.up.railway.app';
window.JET_API_BASE = '';
window.JET_BOT_API_FALLBACK = 'https://jet-store-bot-production.up.railway.app';
window.getJetApiBase = function() {
    var url = (window.JET_BOT_API_URL || window.JET_API_BASE || localStorage.getItem('jet_bot_api_url') || localStorage.getItem('jet_api_base') || '').trim();
    if (!url) {
        var host = (window.location && window.location.hostname || '').toLowerCase();
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
            url = window.JET_BOT_API_FALLBACK || '';
        }
    }
    if (!url) return '';
    url = url.replace(/\/$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
};

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
 * Загружает курс 1 TON в рублях. Сначала пробует бэкенд (обход CORS в Telegram),
 * затем CoinPaprika напрямую.
 * @returns {Promise<number|null>} курс TON→RUB или null при ошибке
 */
window.fetchTonToRubRateFromApi = function() {
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var urls = [];
    if (apiBase) urls.push({ url: apiBase.replace(/\/$/, '') + '/api/ton-rate', direct: false });
    urls.push({ url: window.TON_RATE_API_URL || 'https://api.coinpaprika.com/v1/tickers/ton-toncoin?quotes=RUB', direct: true });

    function saveAndReturn(rate) {
        if (!rate || rate <= 0) return null;
        try {
            var db = window.Database;
            var existing = (db && typeof db.getCurrencyRates === 'function') ? db.getCurrencyRates() : {};
            var saved = {};
            try { saved = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}'); } catch (e) {}
            var rubToTon = 1 / rate;
            var merged = Object.assign({}, existing, saved, { TON: rate, RUB_TON: rubToTon });
            localStorage.setItem('jetstore_currency_rates', JSON.stringify(merged));
            if (db && typeof db.updateCurrencyRates === 'function') db.updateCurrencyRates(merged);
        } catch (e) { console.warn('TON rate save:', e); }
        return rate;
    }

    function tryNext(i) {
        if (i >= urls.length) return Promise.resolve(null);
        var item = urls[i];
        return fetch(item.url)
            .then(function(res) { return res.ok ? res.json() : Promise.reject(new Error('API error')); })
            .then(function(data) {
                var rate = null;
                if (item.direct) {
                    var rubPrice = data && data.quotes && data.quotes.RUB && data.quotes.RUB.price;
                    rate = rubPrice != null ? parseFloat(rubPrice) : null;
                } else {
                    rate = data && data.TON != null ? parseFloat(data.TON) : null;
                }
                if (rate && rate > 0) return saveAndReturn(rate);
                return tryNext(i + 1);
            })
            .catch(function(err) {
                console.warn('TON rate fetch attempt', i + 1, err);
                return tryNext(i + 1);
            });
    }
    return tryNext(0);
};
