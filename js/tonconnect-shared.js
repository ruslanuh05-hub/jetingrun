/**
 * TonConnect для profile.html и assets.html.
 * Показываем адрес кошелька, на котором лежат TON (выбираем по балансу при нескольких аккаунтах).
 */
(function() {
    if (window.tonConnectSharedLoaded) return;
    window.tonConnectSharedLoaded = true;

    function fetchBalance(address) {
        if (!address) return Promise.resolve(0);
        return fetch('https://toncenter.com/api/v2/getAddressBalance?address=' + encodeURIComponent(address))
            .then(function(r) { return r.json(); })
            .then(function(d) { return parseInt((d && d.result) ? d.result : '0', 10); })
            .catch(function() { return 0; });
    }

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
                    if (!localStorage.getItem(balanceKey)) localStorage.setItem(balanceKey, '0');
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

        function getAllAddrs() {
            var addrs = [];
            var acc = (wallet && wallet.account) || (conn && conn.account) || (conn && conn.wallet && conn.wallet.account);
            if (acc && typeof acc.address === 'string') addrs.push(acc.address.trim());
            var list = (wallet && wallet.accounts) || (conn && conn.wallet && conn.wallet.accounts);
            if (list && list.length) {
                list.forEach(function(a) { if (a && a.address) addrs.push(a.address.trim()); });
            }
            return addrs.filter(function(a, i, arr) { return a && arr.indexOf(a) === i; });
        }

        function applyAddr() {
            if (!conn || !conn.connected) { saveAddr(''); return; }
            var addrs = getAllAddrs();
            if (!addrs.length) {
                setTimeout(function() {
                    addrs = getAllAddrs();
                    if (addrs.length) {
                        if (addrs.length === 1) saveAddr(addrs[0]); else pickByBalance(addrs, saveAddr);
                    } else {
                        var acc = conn.account || (conn.wallet && conn.wallet.account);
                        if (acc && acc.address) saveAddr(acc.address.trim());
                    }
                }, 150);
                return;
            }
            if (addrs.length === 1) saveAddr(addrs[0]); else pickByBalance(addrs, saveAddr);
        }

        setTimeout(applyAddr, 0);
    });

    function pickByBalance(addrs, onDone) {
        Promise.all(addrs.map(function(addr) { return fetchBalance(addr).then(function(nano) { return { addr: addr, nano: nano }; }); }))
            .then(function(results) {
                results.sort(function(a, b) { return (b.nano || 0) - (a.nano || 0); });
                var best = results[0];
                onDone(best && best.addr ? best.addr : (addrs[0] || ''));
            })
            .catch(function() { onDone(addrs[0] || ''); });
    }
})();
