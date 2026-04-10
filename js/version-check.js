(function(global) {
    'use strict';

    var VERSION_CHECK_URL = 'https://static.yhsun.cn/version.txt';
    var VERSION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
    var LAST_CHECK_AT_KEY = 'vditor_native_version_check_at';
    var LAST_DISMISSED_VERSION_KEY = 'vditor_native_version_dismissed';

    function isCapacitorNative() {
        return !!(global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform());
    }

    function isElectronRuntime() {
        return !!(global.electron || (global.process && global.process.type));
    }

    function isNativeRuntime() {
        return isCapacitorNative() || isElectronRuntime();
    }

    function normalizeVersion(raw) {
        if (raw === null || raw === undefined) return '';
        var text = String(raw).trim();
        if (!text) return '';
        text = text.split(/\r?\n/)[0].trim();
        return text.replace(/^v/i, '');
    }

    function parseVersion(version) {
        var normalized = normalizeVersion(version);
        if (!normalized) return null;
        if (!/^\d+(?:\.\d+){0,3}$/.test(normalized)) return null;
        return normalized.split('.').map(function(part) {
            return parseInt(part, 10);
        });
    }

    function compareVersions(left, right) {
        var leftParts = parseVersion(left);
        var rightParts = parseVersion(right);
        if (!leftParts || !rightParts) {
            var leftText = normalizeVersion(left);
            var rightText = normalizeVersion(right);
            if (leftText === rightText) return 0;
            return leftText > rightText ? 1 : -1;
        }

        var maxLength = Math.max(leftParts.length, rightParts.length);
        for (var i = 0; i < maxLength; i++) {
            var leftValue = i < leftParts.length ? leftParts[i] : 0;
            var rightValue = i < rightParts.length ? rightParts[i] : 0;
            if (leftValue > rightValue) return 1;
            if (leftValue < rightValue) return -1;
        }
        return 0;
    }

    function getCurrentVersion() {
        if (typeof __APP_PACKAGE_VERSION__ === 'string' && __APP_PACKAGE_VERSION__) {
            return normalizeVersion(__APP_PACKAGE_VERSION__);
        }
        return '0.0.0';
    }

    function getPreferredDownloadUrl() {
        if (isCapacitorNative()) {
            return 'https://static.yhsun.cn/android/app-release.apk';
        }

        if (isElectronRuntime()) {
            var ua = (navigator.userAgent || '').toLowerCase();
            if (ua.indexOf('win') !== -1) {
                return 'https://static.yhsun.cn/electron/win/easypocketmd_windows.exe';
            }
            if (ua.indexOf('mac') !== -1) {
                return 'https://static.yhsun.cn/electron/macos/easypocketmd_macos.dmg';
            }
            return 'https://static.yhsun.cn/electron/linux/easypocketmd_linux.appimage';
        }

        return 'https://md.yhsun.cn/intro.html';
    }

    function getLanguage() {
        if (global.i18n && typeof global.i18n.getLanguage === 'function') {
            return global.i18n.getLanguage();
        }
        return 'zh';
    }

    function setStorageItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // Ignore storage failures.
        }
    }

    function getStorageItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function removeStorageItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            // Ignore storage failures.
        }
    }

    function shouldCheckNow(force) {
        if (force) return true;
        var lastCheck = parseInt(getStorageItem(LAST_CHECK_AT_KEY) || '0', 10);
        if (!Number.isFinite(lastCheck) || lastCheck <= 0) return true;
        return (Date.now() - lastCheck) >= VERSION_CHECK_INTERVAL_MS;
    }

    function markChecked() {
        setStorageItem(LAST_CHECK_AT_KEY, String(Date.now()));
    }

    async function fetchRemoteVersion() {
        var response = await fetch(VERSION_CHECK_URL, {
            method: 'GET',
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error('Version fetch failed: ' + response.status);
        }
        var text = await response.text();
        return normalizeVersion(text);
    }

    function buildPromptTexts(currentVersion, latestVersion) {
        var isEn = getLanguage() === 'en';
        if (isEn) {
            return {
                title: 'Update Available',
                message: 'A new version is available.\n\nCurrent version: ' + currentVersion + '\nLatest version: ' + latestVersion + '\n\nUpdate now?',
                confirmText: 'Update',
                cancelText: 'Later'
            };
        }
        return {
            title: '发现新版本',
            message: '检测到新版本。\n\n当前版本：' + currentVersion + '\n最新版本：' + latestVersion + '\n\n是否立即更新？',
            confirmText: '立即更新',
            cancelText: '稍后'
        };
    }

    function openDownloadPage() {
        var url = getPreferredDownloadUrl();
        global.open(url, '_blank', 'noopener');
    }

    async function promptUserForUpdate(currentVersion, latestVersion) {
        var texts = buildPromptTexts(currentVersion, latestVersion);
        if (typeof global.customConfirm === 'function') {
            return global.customConfirm(texts.message, {
                title: texts.title,
                confirmText: texts.confirmText,
                cancelText: texts.cancelText,
                showCloseButton: true
            });
        }
        return Promise.resolve(global.confirm(texts.message));
    }

    async function checkNativeAppVersionUpdate(options) {
        var settings = options || {};
        var allowWebCheck = !!settings.force;
        if (!isNativeRuntime() && !allowWebCheck) {
            return {
                code: 200,
                message: 'skip non-native runtime',
                data: { status: 'skipped', runtime: 'web' }
            };
        }

        if (!shouldCheckNow(!!settings.force)) {
            return {
                code: 200,
                message: 'skip by interval',
                data: { status: 'skipped-interval' }
            };
        }

        markChecked();

        var currentVersion = getCurrentVersion();
        if (!currentVersion) {
            return {
                code: 500,
                message: 'current version unavailable',
                data: { status: 'error' }
            };
        }

        var latestVersion = '';
        try {
            latestVersion = await fetchRemoteVersion();
        } catch (error) {
            console.warn('[version-check] Failed to fetch remote version:', error);
            return {
                code: 500,
                message: 'fetch remote version failed',
                data: {
                    status: 'error',
                    currentVersion: currentVersion
                }
            };
        }

        if (!latestVersion) {
            return {
                code: 500,
                message: 'remote version is empty',
                data: {
                    status: 'error',
                    currentVersion: currentVersion
                }
            };
        }

        if (compareVersions(latestVersion, currentVersion) <= 0) {
            removeStorageItem(LAST_DISMISSED_VERSION_KEY);
            return {
                code: 200,
                message: 'already latest',
                data: {
                    status: 'already-latest',
                    currentVersion: currentVersion,
                    latestVersion: latestVersion
                }
            };
        }

        var dismissedVersion = normalizeVersion(getStorageItem(LAST_DISMISSED_VERSION_KEY));
        if (!settings.force && dismissedVersion === latestVersion) {
            return {
                code: 200,
                message: 'dismissed already',
                data: {
                    status: 'dismissed',
                    currentVersion: currentVersion,
                    latestVersion: latestVersion
                }
            };
        }

        var confirmed = await promptUserForUpdate(currentVersion, latestVersion);
        if (confirmed) {
            removeStorageItem(LAST_DISMISSED_VERSION_KEY);
            openDownloadPage();
            return {
                code: 200,
                message: 'update accepted',
                data: {
                    status: 'update-accepted',
                    currentVersion: currentVersion,
                    latestVersion: latestVersion
                }
            };
        }

        setStorageItem(LAST_DISMISSED_VERSION_KEY, latestVersion);
        return {
            code: 200,
            message: 'update deferred',
            data: {
                status: 'update-deferred',
                currentVersion: currentVersion,
                latestVersion: latestVersion
            }
        };
    }

    global.getCurrentAppVersion = getCurrentVersion;
    global.checkNativeAppVersionUpdate = checkNativeAppVersionUpdate;
})(typeof window !== 'undefined' ? window : this);