/**
 * TonConnect для profile.html и assets.html.
 * Адрес: conn.account или последний из wallet.accounts (Wallet V5 — основной в Tonkeeper).
 */
(function() {
    if (window.tonConnectSharedLoaded) return;
    window.tonConnectSharedLoaded = true;

    function getTgUserId() {
        try {
            var tg = window.Telegram && window.Telegram.WebApp;
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) return String(tg.initDataUnsafe.user.id);
            var saved = sessionStorage.getItem('jet_tg_user');
            if (saved) { var u = JSON.parse(saved); if (u && u.id) return String(u.id); }
            if (window.userData && window.userData.id && window.userData.id !== 'test_user_default') return String(window.userData.id);
        } catch (e) {}
        return '';
    }
    var tgId = getTgUserId();
    window.getTonkeeperStorageKey = function(base) { return tgId ? (base + '_' + tgId) : base; };

    var TonConnectClass = (typeof TonConnectSDK !== 'undefined' && TonConnectSDK.TonConnect) ? TonConnectSDK.TonConnect : (typeof TonConnect !== 'undefined' ? TonConnect : null);
    if (!TonConnectClass) { console.error('[TonConnect] SDK не загружен!'); return; }

    var origin = window.location.origin || 'https://jetstoreapp.ru';
    var pathname = window.location.pathname || '';
    var repoPath = (origin.indexOf('github.io') !== -1 && pathname.indexOf('/') !== -1) ? ('/' + (pathname.split('/').filter(Boolean)[0] || '')) : '';
    var manifestUrl = origin + repoPath + '/tonconnect-manifest.json';

    try {
        window.tonConnectConnector = new TonConnectClass({ manifestUrl: manifestUrl });
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
            var acc = conn.account || (conn.wallet && conn.wallet.account);
            if (acc && typeof acc.address === 'string' && acc.address.trim()) addr = acc.address.trim();
            if (!addr && conn.wallet && conn.wallet.accounts && conn.wallet.accounts.length) {
                var list = conn.wallet.accounts.filter(function(a) { return a && a.address; });
                if (list.length) {
                    var chosen = list[list.length - 1];
                    if (chosen && chosen.address) addr = chosen.address.trim();
                }
            }
        }
        if (!addr) { var s = localStorage.getItem(addrKey) || ''; if (s && s.trim()) addr = s.trim(); }
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
            if (wallet && wallet.accounts && wallet.accounts.length) {
                var list = wallet.accounts.filter(function(a) { return a && a.address; });
                if (list.length) {
                    var last = list[list.length - 1];
                    if (last && last.address) return last.address.trim();
                }
            }
            if (conn.wallet && conn.wallet.accounts && conn.wallet.accounts.length) {
                var list2 = conn.wallet.accounts.filter(function(a) { return a && a.address; });
                if (list2.length) {
                    var last2 = list2[list2.length - 1];
                    if (last2 && last2.address) return last2.address.trim();
                }
            }
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
