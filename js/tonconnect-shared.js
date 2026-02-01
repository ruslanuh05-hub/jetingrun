/**
 * Общая инициализация TonConnect для profile.html и assets.html.
 * Хранилище изолировано по Telegram user ID — чтобы не показывать чужой адрес.
 */
(function() {
    if (window.tonConnectSharedLoaded) return;
    window.tonConnectSharedLoaded = true;

    function getTgUserId() {
        try {
            var tg = window.Telegram && window.Telegram.WebApp;
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
                return String(tg.initDataUnsafe.user.id);
            }
            var saved = sessionStorage.getItem('jet_tg_user');
            if (saved) {
                var u = JSON.parse(saved);
                if (u && u.id) return String(u.id);
            }
            if (window.userData && window.userData.id && window.userData.id !== 'test_user_default') {
                return String(window.userData.id);
            }
        } catch (e) {}
        return '';
    }

    var tgId = getTgUserId();
    var storagePrefix = tgId ? ('tonconnect_tg_' + tgId + '_') : 'tonconnect_';

    window.getTonkeeperStorageKey = function(base) {
        return tgId ? (base + '_' + tgId) : base;
    };

    var TonConnectClass = (typeof TonConnectSDK !== 'undefined' && TonConnectSDK.TonConnect) ? TonConnectSDK.TonConnect : (typeof TonConnect !== 'undefined' ? TonConnect : null);
    if (!TonConnectClass) {
        console.error('[TonConnect] SDK не загружен!');
        return;
    }

    var origin = window.location.origin || 'https://jetstoreapp.ru';
    var pathname = window.location.pathname || '';
    var repoPath = '';
    if (origin.indexOf('github.io') !== -1 && pathname.indexOf('/') !== -1) {
        var parts = pathname.split('/').filter(Boolean);
        if (parts.length > 0 && parts[0] !== 'html') {
            repoPath = '/' + parts[0];
        }
    }
    var manifestUrl = origin + repoPath + '/tonconnect-manifest.json';

    var customStorage = {
        setItem: function(k, v) { try { localStorage.setItem(storagePrefix + k, v); } catch (e) {} return Promise.resolve(); },
        getItem: function(k) { try { return Promise.resolve(localStorage.getItem(storagePrefix + k)); } catch (e) { return Promise.resolve(null); } },
        removeItem: function(k) { try { localStorage.removeItem(storagePrefix + k); } catch (e) {} return Promise.resolve(); }
    };

    try {
        window.tonConnectConnector = new TonConnectClass({ manifestUrl: manifestUrl, storage: customStorage });
    } catch (e) {
        console.error('[TonConnect] Ошибка создания connector:', e);
        return;
    }

    var addrKey = window.getTonkeeperStorageKey('jetstore_tonkeeper_address');
    var connectedKey = window.getTonkeeperStorageKey('jetstore_tonkeeper_connected');
    var balanceKey = window.getTonkeeperStorageKey('jetstore_tonkeeper_balance');

    window.getTonkeeperAddress = function() {
        var conn = window.tonConnectConnector;
        var addr = '';
        if (conn && conn.connected) {
            var acc = conn.account;
            if (!acc && conn.wallet) acc = conn.wallet.account;
            if (acc && typeof acc.address === 'string' && acc.address.trim()) {
                addr = acc.address.trim();
            }
        }
        if (!addr) {
            var saved = localStorage.getItem(addrKey) || '';
            if (saved && saved.trim()) addr = saved.trim();
        }
        return addr;
    };

    window.tonConnectConnector.restoreConnection().then(function() {
        if (typeof window.updateTonkeeperButton === 'function') window.updateTonkeeperButton();
    }).catch(function() {});

    window.tonConnectConnector.onStatusChange(function(wallet) {
        var conn = window.tonConnectConnector;

        function saveAddr(addr) {
            if (addr) {
                try {
                    localStorage.setItem(connectedKey, 'true');
                    localStorage.setItem(addrKey, addr);
                    if (!localStorage.getItem(balanceKey)) {
                        localStorage.setItem(balanceKey, '0');
                    }
                } catch (e) {}
            } else {
                try {
                    localStorage.removeItem(connectedKey);
                    localStorage.removeItem(addrKey);
                    localStorage.removeItem(balanceKey);
                } catch (e) {}
            }
            if (typeof window.updateTonkeeperButton === 'function') window.updateTonkeeperButton();
            try { window.dispatchEvent(new CustomEvent('tonkeeperAddressUpdated')); } catch (e) {}
        }

        function getAddr() {
            if (!conn || !conn.connected) return '';
            var acc = (wallet && wallet.account) || conn.account || (conn.wallet && conn.wallet.account);
            if (acc && typeof acc.address === 'string') return acc.address.trim();
            return '';
        }

        setTimeout(function() {
            var addr = getAddr();
            saveAddr(addr);
            if (!addr && conn && conn.connected) {
                setTimeout(function() { saveAddr(getAddr()); }, 100);
                setTimeout(function() { saveAddr(getAddr()); }, 300);
            }
        }, 0);
    });
})();
