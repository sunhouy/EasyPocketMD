import { queueWorkspaceCache, readWorkspaceCache, resetWorkspaceCache } from './files/workspace-cache';
import { requirePrivacyConsent } from './build-variant';
/**
 * 用户认证 - 登录、注册、登出、登录模态
 * 添加了登录/注册按钮的防抖处理，防止重复提交
 * 添加了 Token 验证和刷新功能
 */
(function(global) {
    'use strict';

    // 防抖标志
    let _loginSubmitting = false;
    let _registerSubmitting = false;
    let authenticatedInModal = false;
    function syncAuthSubmitVisibility() {
        for (const id of ['loginSubmitBtn','registerSubmitBtn','loginTabBtn','registerTabBtn']) {
            const button=document.getElementById(id) as HTMLButtonElement;
            if(button){button.hidden=authenticatedInModal;button.disabled=authenticatedInModal;}
        }
    }
    let _accountSwitching = false;

    // 辅助函数：获取翻译
    function g<K extends keyof Window>(name: K): Window[K] {return global[name];}
    function t(key) {
        return global.i18n ? global.i18n.t(key) : key;
    }

    // 辅助函数：判断是否为英文
    function isEn() {
        return global.i18n && global.i18n.getLanguage && global.i18n.getLanguage() === 'en';
    }

    const ACCOUNT_SWITCH_STEP_TIMEOUT_MS = 15000;
    const ACCOUNT_SWITCH_LOAD_TIMEOUT_MS = 20000;

    function runWithTimeout(task, timeoutMs, label) {
        let timeoutId = null;
        const work = typeof task === 'function' ? Promise.resolve().then(task) : Promise.resolve(task);
        const timeout = new Promise(function(_, reject) {
            timeoutId = setTimeout(function() {
                reject(new Error(label + ' timeout'));
            }, timeoutMs);
        });

        return Promise.race([work, timeout]).finally(function() {
            if (timeoutId) clearTimeout(timeoutId);
        });
    }

    async function runAccountSwitchStep(label, task, timeoutMs?: number) {
        try {
            return await runWithTimeout(task, timeoutMs || ACCOUNT_SWITCH_STEP_TIMEOUT_MS, label);
        } catch (error) {
            console.warn('[AccountSwitch] ' + label + ' failed or timed out:', error);
            return null;
        }
    }

    async function clearAccountLocalFileState() {
        if (global.clearAutoSave) global.clearAutoSave();
        await resetWorkspaceCache();
        if (global.draftRecovery && typeof global.draftRecovery.clearDraft === 'function') {
            global.draftRecovery.clearDraft();
        }

        [
            'vditor_files',
            'vditor_last_synced_files',
            'vditor_folders_expanded',
            'vditor_last_opened_file',
            'vditor_pending_server_sync',
            'vditor_draft_backup',
            'vditor_draft_meta'
        ].forEach(function(key) {
            localStorage.removeItem(key);
        });

        if (global.IndexedDBManager && typeof global.IndexedDBManager.clearAll === 'function') {
            await runAccountSwitchStep('clear account IndexedDB file cache', function() {
                return global.IndexedDBManager.clearAll();
            }, 3000);
        }
        if (global.IndexedDBManager && typeof global.IndexedDBManager.clearDrafts === 'function') {
            await runAccountSwitchStep('clear account IndexedDB drafts', function() {
                return global.IndexedDBManager.clearDrafts();
            }, 3000);
        }

        global.files = [];
        global.unsavedChanges = {};
        global.lastSyncedContent = {};
        global.pendingServerSync = {};
        global.currentFileId = null;
    }

    // 辅助函数：设置按钮加载状态
    function setButtonLoading(buttonId: string, loading: boolean, loadingTextKey?: string) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        
        const btnTextSpan = btn.querySelector('.btn-text');
        const btnSpinner = btn.querySelector('.btn-spinner');
        const btnLabel = btnTextSpan ? btnTextSpan.querySelector('[data-i18n]') : null;
        
        if (loading) {
            // 保存原始文本
            if (btnLabel) {
                btn.dataset.originalText = btnLabel.getAttribute('data-i18n');
            }
            btn.classList.add('is-loading');
            (btn as HTMLButtonElement).disabled = true;
            btn.setAttribute('aria-busy', 'true');
            if (btnSpinner) {
                (btnSpinner as HTMLElement).style.display = 'inline-block';
            }
            if (btnLabel && loadingTextKey) {
                btnLabel.textContent = t(loadingTextKey);
            }
        } else {
            // 恢复原始状态
            btn.classList.remove('is-loading');
            (btn as HTMLButtonElement).disabled = authenticatedInModal;
            btn.hidden = authenticatedInModal;
            btn.removeAttribute('aria-busy');
            if (btnSpinner) {
                (btnSpinner as HTMLElement).style.display = 'none';
            }
            if (btnLabel && btn.dataset.originalText) {
                btnLabel.textContent = t(btn.dataset.originalText);
            }
        }
    }

    // zxcvbn 懒加载
    let zxcvbnLoaded = false;
    let zxcvbn = null;

    async function loadZxcvbn() {
        if (zxcvbnLoaded && zxcvbn) {
            return zxcvbn;
        }
        try {
            // 动态加载 zxcvbn
            const module = await import('zxcvbn');
            zxcvbn = module.default;
            zxcvbnLoaded = true;
            return zxcvbn;
        } catch (error) {
            console.error('加载 zxcvbn 失败:', error);
            return null;
        }
    }

    // 验证用户名
    function validateUsername(username) {
        const regex = /^[a-zA-Z0-9]{3,20}$/;
        return regex.test(username);
    }

    // 验证密码
    function validatePassword(password) {
        return password.length >= 6 && password.length <= 30;
    }

    // 更新密码强度指示器
    function updatePasswordStrengthIndicator(password) {
        const container = document.getElementById('passwordStrengthContainer');
        const fill = document.getElementById('passwordStrengthFill');
        const text = document.getElementById('passwordStrengthText');

        if (!container || !fill || !text) return;

        if (!password || password.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        // 先移除所有 strength 类
        fill.className = 'password-strength-fill';
        text.className = 'password-strength-text';

        if (!zxcvbnLoaded) {
            // zxcvbn 还未加载，使用简单规则
            let score = 0;
            if (password.length >= 8) score++;
            if (password.length >= 12) score++;
            if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
            if (/\d/.test(password)) score++;
            if (/[^a-zA-Z0-9]/.test(password)) score++;

            updateStrengthUI(score, fill, text);
            return;
        }

        // 使用 zxcvbn 计算密码强度
        try {
            const result = zxcvbn(password);
            updateStrengthUI(result.score, fill, text);
        } catch (error) {
            console.error('计算密码强度失败:', error);
        }
    }

    // 更新强度 UI
    function updateStrengthUI(score, fill, text) {
        const strengthLabels = [
            t('passwordStrengthVeryWeak'),
            t('passwordStrengthWeak'),
            t('passwordStrengthFair'),
            t('passwordStrengthStrong'),
            t('passwordStrengthVeryStrong')
        ];

        fill.classList.add('strength-' + score);
        text.classList.add('strength-' + score);
        text.textContent = strengthLabels[score];
    }

    /**
     * 验证 Token 是否有效
     * @returns {Promise<boolean>} 是否有效
     */
    async function verifyToken() {
        if (!global.currentUser || !global.currentUser.token) {
            return false;
        }
        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/verify';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    token: global.currentUser.token
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result.code === 200;
        } catch (error) {
            console.error('Token 验证错误:', error);
            return false;
        }
    }

    /**
     * 刷新 Token（使用密码重新登录）
     * @returns {Promise<boolean>} 是否成功
     */
    async function refreshToken() {
        if (!global.currentUser || !global.currentUser.password) {
            return false;
        }
        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    password: global.currentUser.password
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code === 200 && result.data.token) {
                global.currentUser.token = result.data.token;
                addAccountToList(global.currentUser.username, global.currentUser.password, result.data.token);
                localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token 刷新错误:', error);
            return false;
        }
    }

    /**
     * 处理 Token 过期或无效的情况
     * 尝试刷新 Token，如果失败则提示用户重新登录
     * @returns {Promise<boolean>} 是否成功处理
     */
    async function handleTokenExpired() {
        // 尝试刷新 Token
        const refreshed = await refreshToken();
        if (refreshed) {
            global.showMessage(t('tokenRefreshed'), 'success');
            return true;
        }

        // 刷新失败，清除登录状态并提示重新登录
        window.dispatchEvent(new Event('e2e-account-reset'));
        window.E2EAttachments?.clear();
        global.currentUser = null;
        localStorage.removeItem('vditor_user');
        showUserInfo();
        global.showMessage(t('sessionExpiredPleaseLogin'), 'warning');
        showLoginModal();
        return false;
    }

    /**
     * 检查 API 响应是否为 Token 错误
     * @param {Object} result - API 响应结果
     * @returns {boolean} 是否为 Token 错误
     */
    function isTokenError(result) {
        if (!result) return false;
        if (result.code === 401) return true;
        if (result.message && (
            result.message.includes('Token验证失败') ||
            result.message.includes('token') ||
            result.message.includes('Token') ||
            result.message.includes('过期') ||
            result.message.includes('expired')
        )) return true;
        return false;
    }

    /**
     * 执行需要认证的 API 请求，自动处理 Token 过期
     * @param {string} url - API URL
     * @param {Object} options - fetch 选项
     * @returns {Promise<Object>} API 响应
     */
    async function authenticatedFetch(url: string, options: RequestInit = {}) {
        // 确保 headers 存在
        if (!options.headers) options.headers = {};

        // 添加认证头
        if (global.currentUser && global.currentUser.token) {
            options.headers['Authorization'] = 'Bearer ' + global.currentUser.token;
        }

        let response = await fetch(url, options);
        let result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

        // 如果是 Token 错误，尝试刷新并重试
        if (isTokenError(result)) {
            const handled = await handleTokenExpired();
            if (handled) {
                // 使用新 Token 重试
                if (global.currentUser && global.currentUser.token) {
                    options.headers['Authorization'] = 'Bearer ' + global.currentUser.token;
                }
                response = await fetch(url, options);
                result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            } else {
                // 刷新失败，返回错误
                throw new Error(t('sessionExpired'));
            }
        }

        return result;
    }

    function showUserInfo() {
        const mobileLoginBtn = (document.getElementById('mobileLoginBtn') as HTMLButtonElement);
        if (mobileLoginBtn) {
            if (global.currentUser) {
                mobileLoginBtn.classList.add('logged-in');
                mobileLoginBtn.title = t('userMenu');
            } else {
                mobileLoginBtn.classList.remove('logged-in');
                mobileLoginBtn.title = t('login');
            }
        }
    }

    function showUserSettingsModal() {
        const modal = document.getElementById('userSettingsModalOverlay');
        if (!modal) return;
        modal.classList.add('show');
        const defaultE2E = (document.getElementById('settingsEnableE2E') as HTMLInputElement);
        if (defaultE2E) defaultE2E.checked = [true, 1, '1', 'true'].includes(global.currentUser?.e2e_enabled);
        bindUserSettingsModalEvents();
        document.addEventListener('keydown', handleUserSettingsModalKeydown);
    }

    function hideUserSettingsModal() {
        const modal = document.getElementById('userSettingsModalOverlay');
        if (!modal) return;
        modal.classList.remove('show');
        document.removeEventListener('keydown', handleUserSettingsModalKeydown);
    }

    function handleUserSettingsModalKeydown(e) {
        if (e.key === 'Escape') hideUserSettingsModal();
    }

    function bindUserSettingsModalEvents() {
        const closeBtn = (document.getElementById('closeUserSettingsBtn') as HTMLButtonElement);
        if (closeBtn) closeBtn.onclick = hideUserSettingsModal;

        const openChangePasswordBtn = (document.getElementById('openChangePasswordBtn') as HTMLButtonElement);
        if (openChangePasswordBtn) openChangePasswordBtn.onclick = function() {
            hideUserSettingsModal();
            showChangePasswordModal();
        };

        const openDeleteAccountBtn = (document.getElementById('openDeleteAccountBtn') as HTMLButtonElement);
        if (openDeleteAccountBtn) openDeleteAccountBtn.onclick = function() {
            hideUserSettingsModal();
            showDeleteAccountModal();
        };
    }

    function showChangePasswordModal() {
        const modal = document.getElementById('changePasswordModalOverlay');
        if (!modal) return;
        modal.classList.add('show');
        bindChangePasswordModalEvents();
        document.addEventListener('keydown', handleChangePasswordModalKeydown);
    }

    function hideChangePasswordModal() {
        const modal = document.getElementById('changePasswordModalOverlay');
        if (!modal) return;
        modal.classList.remove('show');
        document.removeEventListener('keydown', handleChangePasswordModalKeydown);
    }

    function handleChangePasswordModalKeydown(e) {
        if (e.key === 'Escape') hideChangePasswordModal();
    }

    function bindChangePasswordModalEvents() {
        const closeBtn = (document.getElementById('closeChangePasswordBtn') as HTMLButtonElement);
        if (closeBtn) closeBtn.onclick = hideChangePasswordModal;

        const cancelBtn = (document.getElementById('cancelChangePasswordBtn') as HTMLButtonElement);
        if (cancelBtn) cancelBtn.onclick = hideChangePasswordModal;

        const changePasswordBtn = (document.getElementById('changePasswordBtn') as HTMLButtonElement);
        if (changePasswordBtn) changePasswordBtn.onclick = changePassword;
    }

    async function changePassword() {
        const currentPassword = (document.getElementById('currentPassword') as HTMLInputElement)?.value.trim();
        const newPassword = (document.getElementById('newPassword') as HTMLInputElement)?.value.trim();
        const confirmNewPassword = (document.getElementById('confirmNewPassword') as HTMLInputElement)?.value.trim();
        const message = document.getElementById('changePasswordMessage');

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            if (message) {
                message.textContent = t('enterUsernameAndPassword');
                message.className = 'modal-message error';
            }
            return;
        }

        if (newPassword !== confirmNewPassword) {
            if (message) {
                message.textContent = t('passwordNotMatch');
                message.className = 'modal-message error';
            }
            return;
        }

        try {
            const e2ePatch = window.E2EVault ? await window.E2EVault.preparePasswordChange(currentPassword, newPassword) : null;
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/change_password';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    current_password: currentPassword,
                    new_password: newPassword,
                    e2e_patch: e2ePatch
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    window.E2EVault?.finishPasswordChange(e2ePatch);
                    message.textContent = t('passwordChangedSuccess');
                    message.className = 'modal-message success';
                    
                    // Update current user's password in localStorage
                    global.currentUser.password = newPassword;
                    addAccountToList(global.currentUser.username, newPassword, global.currentUser.token);
                    localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));
                    
                    // Clear password fields
                    (document.getElementById('currentPassword') as HTMLInputElement).value = '';
                    (document.getElementById('newPassword') as HTMLInputElement).value = '';
                    (document.getElementById('confirmNewPassword') as HTMLInputElement).value = '';
                } else {
                    message.textContent = result.message_key ? t(result.message_key) : result.message || t('passwordChangedFailed');
                    message.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('修改密码错误:', error);
            if (message) {
                message.textContent = t('networkErrorPleaseRetry');
                message.className = 'modal-message error';
            }
        }
    }

    function showDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModalOverlay');
        if (!modal) return;
        modal.classList.add('show');
        bindDeleteAccountModalEvents();
        document.addEventListener('keydown', handleDeleteAccountModalKeydown);
    }

    function hideDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModalOverlay');
        if (!modal) return;
        modal.classList.remove('show');
        document.removeEventListener('keydown', handleDeleteAccountModalKeydown);
    }

    function handleDeleteAccountModalKeydown(e) {
        if (e.key === 'Escape') hideDeleteAccountModal();
    }

    function bindDeleteAccountModalEvents() {
        const closeBtn = (document.getElementById('closeDeleteAccountBtn') as HTMLButtonElement);
        if (closeBtn) closeBtn.onclick = hideDeleteAccountModal;

        const cancelBtn = (document.getElementById('cancelDeleteAccountBtn') as HTMLButtonElement);
        if (cancelBtn) cancelBtn.onclick = hideDeleteAccountModal;

        const deleteAccountBtn = (document.getElementById('deleteAccountBtn') as HTMLButtonElement);
        if (deleteAccountBtn) deleteAccountBtn.onclick = deleteAccount;
    }

    async function deleteAccount() {
        const confirmUsername = (document.getElementById('deleteAccountConfirmUsername') as HTMLInputElement)?.value.trim();
        const message = document.getElementById('deleteAccountMessage');

        if (!confirmUsername) {
            if (message) {
                message.textContent = t('deleteAccountConfirm');
                message.className = 'modal-message error';
            }
            return;
        }

        if (confirmUsername !== global.currentUser.username) {
            if (message) {
                message.textContent = t('deleteAccountConfirmMismatch');
                message.className = 'modal-message error';
            }
            return;
        }

        // Show confirmation
        const confirmed = window.confirm(t('deleteAccountConfirmMessage'));
        if (!confirmed) return;

        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/delete_account';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    password: global.currentUser.password,
                    token: global.currentUser.token
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (result.code === 200) {
                // Clear user data
                if (global.stopAutoSync) global.stopAutoSync();
                window.dispatchEvent(new Event('e2e-account-reset'));
                window.E2EAttachments?.clear();
                global.currentUser = null;
                localStorage.removeItem('vditor_user');
                localStorage.removeItem('vditor_files');
                localStorage.removeItem('guestNoticeDismissed');
                
                hideDeleteAccountModal();
                showUserInfo();
                global.showMessage(t('deleteAccountSuccess'));
                showLoginModal();
            } else {
                if (message) {
                    message.textContent = result.message_key ? t(result.message_key) : result.message || t('deleteAccountFailed');
                    message.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('注销账户错误:', error);
            if (message) {
                message.textContent = t('networkErrorPleaseRetry');
                message.className = 'modal-message error';
            }
        }
    }

    function showLoginModal() {
        authenticatedInModal=false;syncAuthSubmitVisibility();
        for (const id of ['loginPrivacyConsent','registerPrivacyConsent']) {
            const checkbox=document.getElementById(id) as HTMLInputElement; if(checkbox)checkbox.checked=false;
        }
        const modal = document.getElementById('loginModalOverlay');
        if (!modal) return;
        modal.classList.add('show');
        switchToRegisterTab();
        bindModalEvents();
        document.addEventListener('keydown', handleModalKeydown);
    }

    function hideLoginModal() {
        const modal = document.getElementById('loginModalOverlay');
        if (!modal) return;
        modal.classList.remove('show');
        document.removeEventListener('keydown', handleModalKeydown);
    }

    function bindModalEvents() {
        const loginModalCloseBtn = (document.getElementById('loginModalCloseBtn') as HTMLButtonElement);
        if (loginModalCloseBtn) loginModalCloseBtn.onclick = hideLoginModal;

        const loginSubmitBtn = (document.getElementById('loginSubmitBtn') as HTMLButtonElement);
        if (loginSubmitBtn) loginSubmitBtn.onclick = login;

        const registerSubmitBtn = (document.getElementById('registerSubmitBtn') as HTMLButtonElement);
        if (registerSubmitBtn) registerSubmitBtn.onclick = register;

        const loginTabBtn = (document.getElementById('loginTabBtn') as HTMLButtonElement);
        const registerTabBtn = (document.getElementById('registerTabBtn') as HTMLButtonElement);
        if (loginTabBtn) loginTabBtn.onclick = switchToLoginTab;
        if (registerTabBtn) registerTabBtn.onclick = switchToRegisterTab;

        // 绑定用户名输入事件
        const registerUsernameInput = (document.getElementById('registerUsername') as HTMLInputElement);
        if (registerUsernameInput) {
            registerUsernameInput.addEventListener('input', function() {
                validateUsernameInput(this.value);
            });
        }

        // 绑定密码输入事件
        const registerPasswordInput = (document.getElementById('registerPassword') as HTMLInputElement);
        if (registerPasswordInput) {
            registerPasswordInput.addEventListener('input', function() {
                validatePasswordInput(this.value);
                updatePasswordStrengthIndicator(this.value);
                // 懒加载 zxcvbn
                if (!zxcvbnLoaded) {
                    loadZxcvbn();
                }
            });
        }
    }

    // 验证用户名输入
    function validateUsernameInput(username) {
        const hint = document.getElementById('registerUsernameHint');
        if (!hint) return;

        if (!username || username.length === 0) {
            hint.textContent = t('usernameRequirements');
            hint.className = 'validation-hint';
            return;
        }

        if (validateUsername(username)) {
            hint.textContent = t('usernameRequirements');
            hint.className = 'validation-hint success';
        } else {
            hint.textContent = t('usernameInvalid');
            hint.className = 'validation-hint error';
        }
    }

    // 验证密码输入
    function validatePasswordInput(password) {
        const hint = document.getElementById('registerPasswordHint');
        if (!hint) return;

        if (!password || password.length === 0) {
            hint.textContent = t('passwordRequirements');
            hint.className = 'validation-hint';
            return;
        }

        if (validatePassword(password)) {
            hint.textContent = t('passwordRequirements');
            hint.className = 'validation-hint success';
        } else {
            hint.textContent = t('passwordInvalid');
            hint.className = 'validation-hint error';
        }
    }

    function handleModalKeydown(e) {
        if (e.key === 'Enter') {
            if (document.getElementById('loginForm').style.display !== 'none') {
                login();
            } else {
                register();
            }
        }
        if (e.key === 'Escape') hideLoginModal();
    }

    function switchToLoginTab() {
        const loginTabBtn = (document.getElementById('loginTabBtn') as HTMLButtonElement);
        const registerTabBtn = (document.getElementById('registerTabBtn') as HTMLButtonElement);
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const modalTitle = document.getElementById('modalTitle');
        const modalSubtitle = document.getElementById('modalSubtitle');
        if (loginTabBtn) loginTabBtn.classList.add('active');
        if (registerTabBtn) registerTabBtn.classList.remove('active');
        if (loginForm) loginForm.style.display = 'flex';
        if (registerForm) registerForm.style.display = 'none';
        if (modalTitle) modalTitle.textContent = t('loginRegister');
        if (modalSubtitle) modalSubtitle.textContent = t('pleaseLoginToSave');
        // 清空消息
        const loginMessage = document.getElementById('loginMessage');
        if (loginMessage) {
            loginMessage.textContent = '';
            loginMessage.className = 'modal-message';
        }
    }

    function switchToRegisterTab() {
        const loginTabBtn = (document.getElementById('loginTabBtn') as HTMLButtonElement);
        const registerTabBtn = (document.getElementById('registerTabBtn') as HTMLButtonElement);
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const modalTitle = document.getElementById('modalTitle');
        const modalSubtitle = document.getElementById('modalSubtitle');
        if (registerTabBtn) registerTabBtn.classList.add('active');
        if (loginTabBtn) loginTabBtn.classList.remove('active');
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'flex';
        if (modalTitle) modalTitle.textContent = t('loginRegister');
        if (modalSubtitle) modalSubtitle.textContent = t('registerNewAccount');
        // 清空消息
        const registerMessage = document.getElementById('registerMessage');
        if (registerMessage) {
            registerMessage.textContent = '';
            registerMessage.className = 'modal-message';
        }
    }

    async function login() {
        if(authenticatedInModal)return;
        if (!requirePrivacyConsent('login')) return;
        // 防抖：如果正在提交则直接返回
        if (_loginSubmitting) return;
        _loginSubmitting = true;

        const username = (document.getElementById('loginUsername') as HTMLInputElement)?.value.trim();
        const password = (document.getElementById('loginPassword') as HTMLInputElement)?.value.trim();
        const message = document.getElementById('loginMessage');

        if (!username || !password) {
            if (message) {
                message.textContent = t('enterUsernameAndPassword');
                message.className = 'modal-message error';
            }
            _loginSubmitting = false;
            return;
        }

        // 显示加载状态
        setButtonLoading('loginSubmitBtn', true, 'loginLoading');

        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    // 使用后端返回的 JWT token，如果没有则使用密码进行后续验证
                    window.dispatchEvent(new Event('e2e-account-reset'));
                    window.E2EAttachments?.clear();
                    global.currentUser = {
                        username: username,
                        token: result.data.token,
                        password: password
                    };
                    authenticatedInModal=true;syncAuthSubmitVisibility();
                    await window.E2EVault?.initialize?.().catch(error => console.warn('Encryption configuration unavailable; login remains valid:', error));
                    localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));

                    // 自动添加到账户列表
                    addAccountToList(username, password);

                    message.textContent = t('loginSuccessSyncing');
                    message.className = 'modal-message success';

                    // 移除加载状态
                        setButtonLoading('loginSubmitBtn', false);
                        
                        setTimeout(async () => {
                        hideLoginModal();
                        showUserInfo();
                        global.showMessage(t('loginSuccessStartSync'));

                        // 登录前保存当前编辑的内容到本地存储
                        const currentFileId = global.currentFileId;
                        const vditor = global.vditor;
                        let currentFileName = null;
                        let currentFileContent = null;

                        if (currentFileId && vditor) {
                            const files = global.files?.length ? global.files.map(file=>({...file})) : await readWorkspaceCache();
                            const currentFile = files.find(f => f.id === currentFileId);
                            if (currentFile) {
                                currentFileName = currentFile.name;
                                currentFileContent = vditor.getValue();
                                // 更新本地存储中的内容
                                currentFile.content = currentFileContent;
                                currentFile.lastModified = Date.now();
                                queueWorkspaceCache(files);
                            }
                        }

                        if (global.startAutoSync) global.startAutoSync();

                        // 加载服务器文件，传入当前文件名以便处理冲突
                        if (global.loadFilesFromServer) {
                            await global.loadFilesFromServer(currentFileName);
                        }

                        // 隐藏顶部提示横幅
                        if (global.hideTopNoticeBanner) global.hideTopNoticeBanner();
                    }, 1500);
                } else {
                    message.textContent = result.message || t('loginFailed');
                    message.className = 'modal-message error';
                    // 失败时移除加载状态
                    setButtonLoading('loginSubmitBtn', false);
                }
            }
        } catch (error) {
            console.error('登录错误:', error);
            if (message) {
                message.textContent = t('networkErrorPleaseRetry');
                message.className = 'modal-message error';
            }
            // 错误时移除加载状态
            setButtonLoading('loginSubmitBtn', false);
        } finally {
            // 无论成功或失败，都释放锁，允许再次提交
            setButtonLoading('loginSubmitBtn', false);
            _loginSubmitting = false;
        }
    }

    async function register() {
        if(authenticatedInModal)return;
        if (!requirePrivacyConsent('register')) return;
        // 防抖：如果正在提交则直接返回
        if (_registerSubmitting) return;
        _registerSubmitting = true;

        const username = (document.getElementById('registerUsername') as HTMLInputElement)?.value.trim();
        const password = (document.getElementById('registerPassword') as HTMLInputElement)?.value.trim();
        const e2eEnabled = (document.getElementById('registerEnableE2E') as HTMLInputElement)?.checked || false;
        const message = document.getElementById('registerMessage');

        if (!username || !password) {
            if (message) {
                message.textContent = t('enterUsernameAndPassword');
                message.className = 'modal-message error';
            }
            _registerSubmitting = false;
            return;
        }

        // 前端验证
        if (!validateUsername(username)) {
            if (message) {
                message.textContent = t('usernameInvalid');
                message.className = 'modal-message error';
            }
            _registerSubmitting = false;
            return;
        }

        if (!validatePassword(password)) {
            if (message) {
                message.textContent = t('passwordInvalid');
                message.className = 'modal-message error';
            }
            _registerSubmitting = false;
            return;
        }

        // 显示加载状态
        setButtonLoading('registerSubmitBtn', true, 'registerLoading');

        try {
            const requestBody: {username: string; password: string; e2e_enabled: boolean; invite_code?: string} = { username: username, password: password, e2e_enabled: e2eEnabled };

            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/register';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    // 注册成功后，调用登录接口获取 JWT token
                    const loginResponse = await fetch((global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username, password: password })
                    });
                    const loginResult = global.parseJsonResponse ? await global.parseJsonResponse(loginResponse) : await loginResponse.json();

                    if (loginResult.code === 200) {
                        window.dispatchEvent(new Event('e2e-account-reset'));
                        window.E2EAttachments?.clear();
                        global.currentUser = {
                            username: username,
                            token: loginResult.data.token,
                            password: password
                        };
                        authenticatedInModal=true;syncAuthSubmitVisibility();
                        await window.E2EVault?.initialize?.().catch(error => console.warn('Encryption configuration unavailable; login remains valid:', error));
                        localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));
                        addAccountToList(username, password, loginResult.data.token);
                        message.textContent = t('registerSuccessAutoLogin');
                        message.className = 'modal-message success';

                        // 移除加载状态
                        setButtonLoading('registerSubmitBtn', false);
                        
                        setTimeout(async () => {
                            hideLoginModal();
                            showUserInfo();
                            global.showMessage(t('registerSuccessStartSync'));

                            // 登录前保存当前编辑的内容到本地存储
                            const currentFileId = global.currentFileId;
                            const vditor = global.vditor;
                            let currentFileName = null;
                            let currentFileContent = null;

                            if (currentFileId && vditor) {
                                const files = global.files?.length ? global.files.map(file=>({...file})) : await readWorkspaceCache();
                                const currentFile = files.find(f => f.id === currentFileId);
                                if (currentFile) {
                                    currentFileName = currentFile.name;
                                    currentFileContent = vditor.getValue();
                                    // 更新本地存储中的内容
                                    currentFile.content = currentFileContent;
                                    currentFile.lastModified = Date.now();
                                    queueWorkspaceCache(files);
                                }
                            }

                            if (global.startAutoSync) global.startAutoSync();

                            // 加载服务器文件，传入当前文件名以便处理冲突
                            if (global.loadFilesFromServer) {
                                await global.loadFilesFromServer(currentFileName);
                            }
                        }, 1500);
                    } else {
                        // 登录失败，但仍显示注册成功，让用户手动登录
                        addAccountToList(username, password, loginResult.data.token);
                        message.textContent = t('registerSuccessAutoLogin');
                        message.className = 'modal-message success';
                        // 移除加载状态
                        setButtonLoading('registerSubmitBtn', false);
                        setTimeout(() => {
                            switchToLoginTab();
                        }, 1500);
                    }
                } else if (result.code === 409) {
                    // 用户已存在，尝试自动登录
                    message.textContent = t('userExistsTryingLogin');
                    message.className = 'modal-message';

                    const loginResponse = await fetch((global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username, password: password })
                    });
                    const loginResult = global.parseJsonResponse ? await global.parseJsonResponse(loginResponse) : await loginResponse.json();

                    if (loginResult.code === 200) {
                        // 密码正确，自动登录成功
                        window.dispatchEvent(new Event('e2e-account-reset'));
                        window.E2EAttachments?.clear();
                        global.currentUser = {
                            username: username,
                            token: loginResult.data.token,
                            password: password
                        };
                        authenticatedInModal=true;syncAuthSubmitVisibility();
                        await window.E2EVault?.initialize?.().catch(error => console.warn('Encryption configuration unavailable; login remains valid:', error));
                        localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));
                        message.textContent = t('autoLoginSuccess');
                        message.className = 'modal-message success';

                        // 移除加载状态
                        setButtonLoading('registerSubmitBtn', false);
                        
                        setTimeout(async () => {
                            hideLoginModal();
                            showUserInfo();
                            global.showMessage(t('loginSuccessStartSync'));

                            // 登录前保存当前编辑的内容到本地存储
                            const currentFileId = global.currentFileId;
                            const vditor = global.vditor;
                            let currentFileName = null;
                            let currentFileContent = null;

                            if (currentFileId && vditor) {
                                const files = global.files?.length ? global.files.map(file=>({...file})) : await readWorkspaceCache();
                                const currentFile = files.find(f => f.id === currentFileId);
                                if (currentFile) {
                                    currentFileName = currentFile.name;
                                    currentFileContent = vditor.getValue();
                                    // 更新本地存储中的内容
                                    currentFile.content = currentFileContent;
                                    currentFile.lastModified = Date.now();
                                    queueWorkspaceCache(files);
                                }
                            }

                            if (global.startAutoSync) global.startAutoSync();

                            // 加载服务器文件，传入当前文件名以便处理冲突
                            if (global.loadFilesFromServer) {
                                await global.loadFilesFromServer(currentFileName);
                            }

                            // 隐藏顶部提示横幅
                            if (global.hideTopNoticeBanner) global.hideTopNoticeBanner();
                        }, 1500);
                    } else {
                        // 密码错误
                        message.textContent = t('userExistsPasswordIncorrect');
                        message.className = 'modal-message error';
                        // 移除加载状态
                        setButtonLoading('registerSubmitBtn', false);
                        setTimeout(() => {
                            switchToLoginTab();
                        }, 1500);
                    }
                } else {
                    message.textContent = result.message || t('registerFailed');
                    message.className = 'modal-message error';
                    // 失败时移除加载状态
                    setButtonLoading('registerSubmitBtn', false);
                }
            }
        } catch (error) {
            console.error('注册错误:', error);
            if (message) {
                message.textContent = t('networkErrorPleaseRetry');
                message.className = 'modal-message error';
            }
            // 错误时移除加载状态
            setButtonLoading('registerSubmitBtn', false);
        } finally {
            // 释放锁
            setButtonLoading('registerSubmitBtn', false);
            _registerSubmitting = false;
        }
    }

    async function logout() {
        const user = global.currentUser;
        if (!user) return;
        document.getElementById('userMenuDropdown')?.classList.remove('show');
        if (!await g('customConfirm')(window.i18n?.getLanguage() === 'en' ? 'Sign out of this account?' : '确定退出当前账号登录吗？')) return;
        if (global.currentUser !== user) return;
        const files = global.files || [];
        const unsavedChanges = global.unsavedChanges || {};
        let hasUnsaved = false;
        files.forEach(function(file) {
            if (unsavedChanges[file.id]) hasUnsaved = true;
        });

        if (hasUnsaved) {
            const confirmed = await g('customConfirm')(t('unsavedFilesSave'));
            if (confirmed) {
                if (global.syncAllFiles) await global.syncAllFiles();
            }
        }

        if (global.currentUser !== user) return;
        if (global.stopAutoSync) global.stopAutoSync();
        window.dispatchEvent(new Event('e2e-account-reset'));
        window.E2EAttachments?.clear();
        global.currentUser = null;
        localStorage.removeItem('vditor_user');
        // 清除未登录提示横幅的关闭状态，让下次打开时重新显示
        localStorage.removeItem('guestNoticeDismissed');
        showUserInfo();
        if (global.clearAutoSave) global.clearAutoSave();
        showLoginModal();
        global.showMessage(t('loggedOut'));
        // 显示未登录用户提示横幅
        if (global.showGuestNoticeBanner) global.showGuestNoticeBanner();
    }

    // ========== 多账户管理功能 ==========

    // 获取已保存的账户列表
    function getSavedAccounts() {
        try {
            const accounts = localStorage.getItem('vditor_accounts');
            return accounts ? JSON.parse(accounts) : [];
        } catch (e) {
            return [];
        }
    }

    // 保存账户列表
    function saveAccounts(accounts) {
        localStorage.setItem('vditor_accounts', window.e2eSerializeUser ? window.e2eSerializeUser(accounts) : JSON.stringify(accounts));
    }

    // 添加账户到列表
    function addAccountToList(username, password, token?) {
        token = token || (global.currentUser?.username === username ? global.currentUser.token : undefined);
        const accounts = getSavedAccounts();
        // 检查是否已存在
        const existingIndex = accounts.findIndex(acc => acc.username === username);
        if (existingIndex >= 0) {
            // 更新密码
            if (password) accounts[existingIndex].password = password;
            if (token) accounts[existingIndex].token = token;
        } else {
            // 添加新账户
            accounts.push({ username, password, token });
        }
        saveAccounts(accounts);
    }

    // 从列表中移除账户
    function removeAccountFromList(username) {
        const accounts = getSavedAccounts();
        const filtered = accounts.filter(acc => acc.username !== username);
        saveAccounts(filtered);
    }

    // 渲染账户列表到下拉菜单
    function renderAccountList() {
        const container = document.getElementById('accountListContainer');
        if (!container) return;

        // 确保当前登录用户始终出现在列表里（修复部分情况下当前账户不显示的问题）
        const currentUsername = global.currentUser ? global.currentUser.username : null;
        let accounts = getSavedAccounts();
        if (currentUsername && !accounts.some(acc => acc.username === currentUsername && acc.token === global.currentUser.token)) {
            addAccountToList(currentUsername, global.currentUser.password || '');
            accounts = getSavedAccounts();
        }
        const isSingleAccount = accounts.length === 1;

        let html = '';
        accounts.forEach(function(account) {
            const isCurrent = account.username === currentUsername;
            html += '<div class="dropdown-item account-item' + (isCurrent ? ' account-item-current' : '') + '" data-username="' + account.username + '" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;">';
            html += '<span style="display:flex;align-items:center;gap:8px;flex:1;">';
            html += '<i class="fas fa-user-circle account-item-avatar"></i> ';
            html += '<span>' + account.username + '</span>';
            if (isCurrent) {
                html += '<span class="account-item-current-tag">(' + (isEn() ? 'Current' : '当前') + ')</span>';
            }
            html += '</span>';
            // 右侧按钮组
            html += '<span style="display:flex;align-items:center;gap:4px;">';
            // 设置按钮（所有账户都显示）
            html += '<button class="account-settings-btn" data-username="' + account.username + '" title="' + t('userSettings') + '">';
            html += '<i class="fas fa-cog"></i>';
            html += '</button>';
            // 移除按钮（只有一个账户时不显示）
            if (!isSingleAccount) {
                html += '<button class="remove-account-btn" data-username="' + account.username + '" title="' + t('removeAccount') + '">';
                html += '<i class="fas fa-times"></i>';
                html += '</button>';
            }
            html += '</span>';
            html += '</div>';
        });

        container.innerHTML = html;

        // 绑定点击事件（点击账户名切换账户）
        container.querySelectorAll('.account-item').forEach(function(item) {
            (item as HTMLElement).onclick = function(e) {
                // 如果点击的是按钮，不触发切换
                if ((e.target as Element).closest('.remove-account-btn') || (e.target as Element).closest('.account-settings-btn')) return;

                const username = (this as HTMLElement).getAttribute('data-username');
                if (username && username !== currentUsername) {
                    showSwitchAccountConfirm(username);
                }
            };
        });

        // 绑定设置按钮事件
        container.querySelectorAll('.account-settings-btn').forEach(function(btn) {
            (btn as HTMLElement).onclick = function(e) {
                e.stopPropagation();
                const username = (this as HTMLElement).getAttribute('data-username');
                // 如果点击的是当前账户，直接打开设置
                if (username === currentUsername) {
                    showUserSettingsModal();
                } else {
                    // 切换到该账户后再打开设置
                    showSwitchAccountConfirm(username);
                    // 标记需要打开设置
                    global._openSettingsAfterSwitch = true;
                }
            };
        });

        // 绑定移除按钮事件
        container.querySelectorAll('.remove-account-btn').forEach(function(btn) {
            (btn as HTMLElement).onclick = function(e) {
                e.stopPropagation();
                const username = (this as HTMLElement).getAttribute('data-username');
                confirmRemoveAccount(username);
            };
        });
    }

    // 显示切换账户确认对话框
    let pendingSwitchUsername = null;
    let reauthSwitchUsername = null;

    function setSwitchAccountControlsLoading(loading) {
        const confirmBtn = (document.getElementById('confirmSwitchAccountBtn') as HTMLButtonElement);
        const cancelBtn = (document.getElementById('cancelSwitchAccountBtn') as HTMLButtonElement);
        const closeBtn = (document.getElementById('closeSwitchAccountConfirmBtn') as HTMLButtonElement);

        if (confirmBtn) {
            if (loading) {
                if (!confirmBtn.dataset.originalText) {
                    confirmBtn.dataset.originalText = confirmBtn.textContent;
                }
                confirmBtn.textContent = t('accountSwitching');
            } else if (confirmBtn.dataset.originalText) {
                confirmBtn.textContent = confirmBtn.dataset.originalText;
            }
            confirmBtn.disabled = loading;
            confirmBtn.classList.toggle('loading', loading);
        }

        [cancelBtn, closeBtn].forEach(function(btn) {
            if (!btn) return;
            btn.disabled = loading;
            btn.style.pointerEvents = loading ? 'none' : '';
            btn.style.opacity = loading ? '0.6' : '';
        });
    }

    function showAccountSwitchingIndicator() {
        let overlay = document.getElementById('accountSwitchingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'accountSwitchingOverlay';
            overlay.style.cssText = [
                'position:fixed',
                'inset:0',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'background:rgba(0,0,0,0.28)',
                'z-index:1000000'
            ].join(';');
            overlay.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:8px;background:#fff;color:#333;box-shadow:0 8px 30px rgba(0,0,0,0.2);font-size:15px;"><i class="fas fa-spinner fa-spin"></i><span></span></div>';
            document.body.appendChild(overlay);
        }

        const textEl = overlay.querySelector('span');
        if (textEl) textEl.textContent = t('accountSwitching');
        overlay.style.display = 'flex';
    }

    function hideAccountSwitchingIndicator() {
        const overlay = document.getElementById('accountSwitchingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function renderSwitchAccountDescription(username) {
        const descEl = document.getElementById('switchAccountDescText');
        if (!descEl) return;

        descEl.textContent = '';
        const template = t('switchAccountDesc');
        const parts = String(template).split('{username}');
        descEl.appendChild(document.createTextNode(parts[0] || ''));

        const nameEl = document.createElement('strong');
        nameEl.id = 'targetAccountName';
        nameEl.textContent = username;
        descEl.appendChild(nameEl);

        descEl.appendChild(document.createTextNode(parts.slice(1).join('{username}') || ''));
    }

    function showSwitchAccountConfirm(username) {
        if (_accountSwitching) return;
        pendingSwitchUsername = username;
        setSwitchAccountControlsLoading(false);
        renderSwitchAccountDescription(username);

        const modal = document.getElementById('switchAccountConfirmModalOverlay');
        if (modal) {
            modal.classList.add('show');
        }
    }

    // 隐藏切换账户确认对话框
    function hideSwitchAccountConfirm() {
        if (_accountSwitching) return;
        const modal = document.getElementById('switchAccountConfirmModalOverlay');
        if (modal) {
            modal.classList.remove('show');
        }
        pendingSwitchUsername = null;
    }

    // 确认切换账户
    async function confirmSwitchAccount() {
        if (_accountSwitching || !pendingSwitchUsername) return;

        const switchUsername = pendingSwitchUsername;
        const accounts = getSavedAccounts();
        const targetAccount = accounts.find(acc => acc.username === switchUsername);
        if (!targetAccount) {
            global.showMessage(t('accountNotFound'), 'error');
            hideSwitchAccountConfirm();
            return;
        }

        _accountSwitching = true;
        setSwitchAccountControlsLoading(true);
        showAccountSwitchingIndicator();

        const modal = document.getElementById('switchAccountConfirmModalOverlay');
        if (modal) {
            modal.classList.remove('show');
        }

        try {
            // 1. 先保存当前正在编辑的文件
            if (global.saveCurrentFile) {
                await runAccountSwitchStep('save current file before account switch', function() {
                    return global.saveCurrentFile(false);
                });
            }

            // 2. 同步当前账户的所有未保存更改
            const files = global.files || [];
            const unsavedChanges = global.unsavedChanges || {};
            let hasUnsaved = false;
            files.forEach(function(file) {
                if (unsavedChanges[file.id]) hasUnsaved = true;
            });

            if (hasUnsaved && global.syncAllFiles) {
                await runAccountSwitchStep('sync current account files before switch', function() {
                    return global.syncAllFiles();
                });
            }

            // 3. 切换前先验证目标账户，避免凭据失效时清空当前本地状态
            const result = await verifyAccountCredentials(targetAccount.username, targetAccount.password, targetAccount.token);
            if (result.code !== 200) {
                if (result.code === 401 && !targetAccount.password) {
                    showAddAccountModal(); reauthSwitchUsername = targetAccount.username;
                    const input = (document.getElementById('addAccountUsername') as HTMLInputElement); if (input) { input.value = targetAccount.username; input.readOnly = true; }
                    const message = document.getElementById('addAccountMessage'); if (message) message.textContent = t('accountLoginRequired');
                    return;
                }
                global.showMessage(t('accountSwitchFailed') + ': ' + result.message, 'error');
                return;
            }

            // 4. 停止自动同步
            if (global.stopAutoSync) global.stopAutoSync();

            // 5. 只清理文件/草稿相关的本地状态，避免清 Cookie/Cache/整个 IndexedDB 影响后续切换
            await clearAccountLocalFileState();

            // 6. 使用新账户登录
            window.dispatchEvent(new Event('e2e-account-reset'));
            window.E2EAttachments?.clear();
            global.currentUser = {
                username: targetAccount.username,
                token: result.data.token,
                password: targetAccount.password
            };
            localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));

            addAccountToList(targetAccount.username, targetAccount.password, result.data.token);
            global.showMessage(t('accountSwitched').replace('{username}', targetAccount.username), 'success');

            // 7. 重新加载文件列表，加载异常或超时不应把界面永久卡在“切换中”
            if (global.loadFilesFromServer) {
                await runAccountSwitchStep('load files after account switch', function() {
                    return global.loadFilesFromServer();
                }, ACCOUNT_SWITCH_LOAD_TIMEOUT_MS);
            }

            // 8. 启动自动同步
            if (global.startAutoSync) {
                global.startAutoSync();
            }

            // 9. 更新UI
            showUserInfo();
            renderAccountList();
            if (global.loadFiles) global.loadFiles();

            // 10. 关闭下拉菜单
            const dropdown = document.getElementById('userMenuDropdown');
            if (dropdown) dropdown.classList.remove('show');

            // 11. 如果需要，打开设置窗口
            if (global._openSettingsAfterSwitch) {
                global._openSettingsAfterSwitch = false;
                setTimeout(function() {
                    showUserSettingsModal();
                }, 300);
            }
        } catch (error) {
            console.error('切换账户失败:', error);
            global.showMessage(t('accountSwitchFailed'), 'error');
        } finally {
            pendingSwitchUsername = null;
            _accountSwitching = false;
            setSwitchAccountControlsLoading(false);
            hideAccountSwitchingIndicator();
        }
    }

    // 确认移除账户
    async function confirmRemoveAccount(username) {
        const confirmed = await g('customConfirm')(t('removeAccountConfirm').replace('{username}', username));
        if (confirmed) {
            removeAccountFromList(username);
            renderAccountList();
            global.showMessage(t('accountRemoved'), 'success');
        }
    }

    // 显示添加账户模态窗口
    function showAddAccountModal() {
        const modal = document.getElementById('addAccountModalOverlay');
        if (modal) {
            modal.classList.add('show');
            // 清空输入
            const usernameInput = (document.getElementById('addAccountUsername') as HTMLInputElement);
            const passwordInput = (document.getElementById('addAccountPassword') as HTMLInputElement);
            const messageEl = document.getElementById('addAccountMessage');
            if (usernameInput) { usernameInput.value = ''; usernameInput.readOnly = false; }
            if (passwordInput) passwordInput.value = '';
            if (messageEl) {
                messageEl.textContent = '';
                messageEl.className = 'modal-message';
            }
        }
        reauthSwitchUsername = null;
        // 关闭下拉菜单
        const dropdown = document.getElementById('userMenuDropdown');
        if (dropdown) dropdown.classList.remove('show');
    }

    // 隐藏添加账户模态窗口
    function hideAddAccountModal() {
        const modal = document.getElementById('addAccountModalOverlay');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // 验证账户凭据（用于添加账户）
    async function verifyAccountCredentials(username, password, token?) {
        if (token) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), ACCOUNT_SWITCH_STEP_TIMEOUT_MS) : null;
            try {
                const response = await fetch((global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, token }), signal: controller?.signal });
                const verified = await response.json();
                if (verified.code === 200) return { code: 200, data: { token } };
                if (verified.code !== 401 && verified.code !== 403) return verified;
            } catch (error) { return { code: 503, message: t('networkErrorPleaseRetry') }; }
            finally { if (timeoutId) clearTimeout(timeoutId); }
        }
        if (!password) return { code: 401, message: t('accountLoginRequired') };
        let timeoutId = null;
        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login';
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const options: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            };
            if (controller) {
                options.signal = controller.signal;
                timeoutId = setTimeout(function() {
                    controller.abort();
                }, ACCOUNT_SWITCH_STEP_TIMEOUT_MS);
            }
            const response = await fetch(apiUrl, {
                method: options.method,
                headers: options.headers,
                body: options.body,
                signal: options.signal
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result;
        } catch (error) {
            console.error('验证账户失败:', error);
            return { code: 500, message: t('networkErrorPleaseRetry') };
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    // 处理添加账户
    async function handleAddAccount() {
        const usernameInput = (document.getElementById('addAccountUsername') as HTMLInputElement);
        const passwordInput = (document.getElementById('addAccountPassword') as HTMLInputElement);
        const messageEl = document.getElementById('addAccountMessage');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value.trim() : '';

        if (!username || !password) {
            if (messageEl) {
                messageEl.textContent = t('enterUsernameAndPassword');
                messageEl.className = 'modal-message error';
            }
            return;
        }

        // 检查是否已存在
        const accounts = getSavedAccounts();
        if (accounts.find(acc => acc.username === username) && reauthSwitchUsername !== username) {
            if (messageEl) {
                messageEl.textContent = t('accountAlreadyExists');
                messageEl.className = 'modal-message error';
            }
            return;
        }

        // 前端基础校验（注册需要满足）
        if (!validateUsername(username)) {
            if (messageEl) {
                messageEl.textContent = t('usernameInvalid');
                messageEl.className = 'modal-message error';
            }
            return;
        }
        if (!validatePassword(password)) {
            if (messageEl) {
                messageEl.textContent = t('passwordInvalid');
                messageEl.className = 'modal-message error';
            }
            return;
        }

        // 先尝试登录（账户已存在）；若用户不存在则尝试注册
        try {
            let result = await verifyAccountCredentials(username, password);

            if (result.code !== 200) {
                // 重新认证已有账号不应尝试注册。
                if (reauthSwitchUsername === username) {
                    if (messageEl) { messageEl.textContent = result.message || t('accountSwitchFailed'); messageEl.className = 'modal-message error'; }
                    return;
                }
                // 尝试注册新账户
                try {
                    const registerUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/register';
                    const regResponse = await fetch(registerUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username, password: password, e2e_enabled: false })
                    });
                    const regResult = global.parseJsonResponse ? await global.parseJsonResponse(regResponse) : await regResponse.json();
                    if (regResult.code === 200) {
                        // 注册成功后重新登录拿 token
                        result = await verifyAccountCredentials(username, password);
                    } else if (regResult.code === 409) {
                        // 账户已存在，说明前一次失败是密码错误
                        if (messageEl) {
                            messageEl.textContent = t('userExistsPasswordIncorrect');
                            messageEl.className = 'modal-message error';
                        }
                        return;
                    } else {
                        if (messageEl) {
                            messageEl.textContent = t('accountAddFailed') + ': ' + (regResult.message || '');
                            messageEl.className = 'modal-message error';
                        }
                        return;
                    }
                } catch (regError) {
                    console.error('注册账户失败:', regError);
                    if (messageEl) {
                        messageEl.textContent = t('accountAddFailed');
                        messageEl.className = 'modal-message error';
                    }
                    return;
                }
            }

            if (result.code === 200) {
                addAccountToList(username, password, result.data.token);

                if (!global.currentUser) {
                    window.dispatchEvent(new Event('e2e-account-reset'));
                    window.E2EAttachments?.clear();
                    global.currentUser = {
                        username: username,
                        token: result.data.token,
                        password: password
                    };
                    await window.E2EVault?.initialize?.().catch(error => console.warn('Encryption configuration unavailable; login remains valid:', error));
                    localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));

                    global.showMessage(t('accountAddedSuccess'), 'success');
                    hideAddAccountModal();
                    showUserInfo();
                    if (global.startAutoSync) global.startAutoSync();
                    if (global.loadFilesFromServer) {
                        await global.loadFilesFromServer();
                    } else if (global.loadFiles) {
                        global.loadFiles();
                    }
                    if (global.hideTopNoticeBanner) global.hideTopNoticeBanner();
                } else {
                    global.showMessage(t('accountAddedSuccess'), 'success');
                    hideAddAccountModal();
                }

                renderAccountList();
                if (reauthSwitchUsername === username) { reauthSwitchUsername = null; pendingSwitchUsername = username; await confirmSwitchAccount(); }
            } else {
                if (messageEl) {
                    messageEl.textContent = t('accountAddFailed') + ': ' + (result.message || '');
                    messageEl.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('添加账户失败:', error);
            if (messageEl) {
                messageEl.textContent = t('accountAddFailed');
                messageEl.className = 'modal-message error';
            }
        }
    }

    // 绑定添加账户模态窗口事件
    function bindAddAccountModalEvents() {
        const closeBtn = (document.getElementById('closeAddAccountBtn') as HTMLButtonElement);
        const cancelBtn = (document.getElementById('cancelAddAccountBtn') as HTMLButtonElement);
        const confirmBtn = (document.getElementById('confirmAddAccountBtn') as HTMLButtonElement);

        if (closeBtn) closeBtn.onclick = hideAddAccountModal;
        if (cancelBtn) cancelBtn.onclick = hideAddAccountModal;
        if (confirmBtn) confirmBtn.onclick = handleAddAccount;

        // 回车键提交
        const passwordInput = (document.getElementById('addAccountPassword') as HTMLInputElement);
        if (passwordInput) {
            passwordInput.onkeydown = function(e) {
                if (e.key === 'Enter') {
                    handleAddAccount();
                }
            };
        }
    }

    // 绑定切换账户确认模态窗口事件
    function bindSwitchAccountConfirmModalEvents() {
        const closeBtn = (document.getElementById('closeSwitchAccountConfirmBtn') as HTMLButtonElement);
        const cancelBtn = (document.getElementById('cancelSwitchAccountBtn') as HTMLButtonElement);
        const confirmBtn = (document.getElementById('confirmSwitchAccountBtn') as HTMLButtonElement);

        if (closeBtn) closeBtn.onclick = hideSwitchAccountConfirm;
        if (cancelBtn) cancelBtn.onclick = hideSwitchAccountConfirm;
        if (confirmBtn) confirmBtn.onclick = confirmSwitchAccount;
    }

    function handleLoginButtonClick(e?: Event) {
        if (global.currentUser) {
            const dropdown = document.getElementById('userMenuDropdown');
            if (dropdown) {
                const userInfoItem = document.getElementById('userInfoItem');
                if (userInfoItem) {
                    // Set the username in the first span
                    const usernameSpan = userInfoItem.querySelector('span');
                    if (usernameSpan) {
                        usernameSpan.innerHTML = '<i class="fas fa-user"></i> ' + global.currentUser.username;
                    }
                }
                const settingsBtn = document.getElementById('userSettingsBtn');
                if (settingsBtn) {
                    settingsBtn.onclick = function(e) {
                        e.stopPropagation();
                        dropdown.classList.remove('show');
                        showUserSettingsModal();
                    };
                }
                const logoutItem = (document.getElementById('logoutItem') as HTMLButtonElement);
                if (logoutItem) {
                    logoutItem.onclick = logout;
                }

                // 绑定添加账户按钮
                const addAccountItem = (document.getElementById('addAccountItem') as HTMLButtonElement);
                if (addAccountItem) {
                    addAccountItem.onclick = function(e) {
                        e.stopPropagation();
                        showAddAccountModal();
                    };
                }

                // 渲染账户列表
                renderAccountList();

                dropdown.classList.toggle('show');
                if (dropdown.classList.contains('show')) {
                    const anchor = e?.currentTarget instanceof HTMLElement ? e.currentTarget : document.querySelector<HTMLElement>('#notesHome .notes-home-tools button, #mobileLoginBtn, #loginBtn');
                    if (anchor) {
                        const rect = anchor.getBoundingClientRect();
                        dropdown.style.position = 'fixed';
                        dropdown.style.right = 'auto';
                        const width = dropdown.getBoundingClientRect().width;
                        dropdown.style.left = Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8)) + 'px';
                        dropdown.style.top = Math.max(8,Math.min(rect.bottom+6,window.innerHeight-dropdown.getBoundingClientRect().height-8)) + 'px';
                    }
                }
            }
        } else {
            showLoginModal();
        }
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
    }

    global.showUserInfo = showUserInfo;
    global.showLoginModal = showLoginModal;
    global.hideLoginModal = hideLoginModal;
    global.handleLoginButtonClick = handleLoginButtonClick;
    global.logout = logout;
    global.verifyToken = verifyToken;
    global.refreshToken = refreshToken;
    global.handleTokenExpired = handleTokenExpired;
    global.isTokenError = isTokenError;
    global.authenticatedFetch = authenticatedFetch;
    global.showUserSettingsModal = showUserSettingsModal;
    global.hideUserSettingsModal = hideUserSettingsModal;

    // 导出多账户管理功能
    global.getSavedAccounts = getSavedAccounts;
    global.saveAccounts = saveAccounts;
    global.addAccountToList = addAccountToList;
    global.removeAccountFromList = removeAccountFromList;
    global.renderAccountList = renderAccountList;
    global.showAddAccountModal = showAddAccountModal;
    global.hideAddAccountModal = hideAddAccountModal;
    global.handleAddAccount = handleAddAccount;
    global.bindAddAccountModalEvents = bindAddAccountModalEvents;
    global.bindSwitchAccountConfirmModalEvents = bindSwitchAccountConfirmModalEvents;
    global.showSwitchAccountConfirm = showSwitchAccountConfirm;
    global.hideSwitchAccountConfirm = hideSwitchAccountConfirm;
    global.confirmSwitchAccount = confirmSwitchAccount;

    // 初始化时监听端到端加密设置更改
    function initializeE2ESettings() {
        const e2eCheckbox = (document.getElementById('settingsEnableE2E') as HTMLInputElement);
        if (e2eCheckbox && !e2eCheckbox.dataset.e2eBound) {
            e2eCheckbox.dataset.e2eBound = 'true';
            e2eCheckbox.addEventListener('change', async function() {
                if (!global.currentUser || !global.currentUser.token) {
                    this.checked = false;
                    global.showMessage(t('e2eLoginRequired'), 'error');
                    return;
                }
                
                const isEnabled = this.checked;
                const user = global.currentUser;
                this.disabled = true;
                
                try {
                    const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/update_e2e';
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: global.currentUser.username,
                            token: global.currentUser.token,
                            e2e_enabled: isEnabled
                        })
                    });
                    
                    const result = await response.json();
                    if (global.currentUser !== user) return;
                    if (result.code === 200) {
                        global.currentUser.e2e_enabled = isEnabled ? 1 : 0;
                        localStorage.setItem('vditor_user', window.e2eSerializeUser ? window.e2eSerializeUser(global.currentUser) : JSON.stringify(global.currentUser));
                        global.showMessage(t(isEnabled ? 'e2eDefaultEnabled' : 'e2eDefaultDisabled'), 'success');
                    } else {
                        throw new Error(result.message);
                    }
                } catch(e) {
                    if (global.currentUser !== user) return;
                    this.checked = !isEnabled;
                    global.showMessage(t('e2eDefaultFailed'), 'error');
                } finally {
                    this.disabled = false;
                }
            });
        }
        
        // 每次打开设置弹窗时同步状态
        const settingsBtn = (document.getElementById('desktopSettingsBtn') as HTMLButtonElement);
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                if (e2eCheckbox && global.currentUser) {
                    e2eCheckbox.checked = [true, 1, '1', 'true'].includes(global.currentUser.e2e_enabled);
                }
            });
        }
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initializeE2ESettings, { once: true });
    } else {
        initializeE2ESettings();
    }
})(typeof window !== 'undefined' ? window : this);
