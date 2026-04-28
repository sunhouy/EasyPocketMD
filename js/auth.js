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

    // 辅助函数：获取翻译
    function t(key) {
        return global.i18n ? global.i18n.t(key) : key;
    }

    // 辅助函数：判断是否为英文
    function isEn() {
        return global.i18n && global.i18n.getLanguage && global.i18n.getLanguage() === 'en';
    }

    // 辅助函数：设置按钮加载状态
    function setButtonLoading(buttonId, loading, loadingTextKey) {
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
            btn.classList.add('loading');
            if (btnSpinner) {
                btnSpinner.style.display = 'inline-block';
            }
            if (btnLabel && loadingTextKey) {
                btnLabel.textContent = t(loadingTextKey);
            }
        } else {
            // 恢复原始状态
            btn.classList.remove('loading');
            if (btnSpinner) {
                btnSpinner.style.display = 'none';
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
                localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
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
    async function authenticatedFetch(url, options = {}) {
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
        const mobileLoginBtn = document.getElementById('mobileLoginBtn');
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
        const closeBtn = document.getElementById('closeUserSettingsBtn');
        if (closeBtn) closeBtn.onclick = hideUserSettingsModal;

        const openChangePasswordBtn = document.getElementById('openChangePasswordBtn');
        if (openChangePasswordBtn) openChangePasswordBtn.onclick = function() {
            hideUserSettingsModal();
            showChangePasswordModal();
        };

        const openDeleteAccountBtn = document.getElementById('openDeleteAccountBtn');
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
        const closeBtn = document.getElementById('closeChangePasswordBtn');
        if (closeBtn) closeBtn.onclick = hideChangePasswordModal;

        const cancelBtn = document.getElementById('cancelChangePasswordBtn');
        if (cancelBtn) cancelBtn.onclick = hideChangePasswordModal;

        const changePasswordBtn = document.getElementById('changePasswordBtn');
        if (changePasswordBtn) changePasswordBtn.onclick = changePassword;
    }

    async function changePassword() {
        const currentPassword = document.getElementById('currentPassword')?.value.trim();
        const newPassword = document.getElementById('newPassword')?.value.trim();
        const confirmNewPassword = document.getElementById('confirmNewPassword')?.value.trim();
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
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/change_password';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    current_password: currentPassword,
                    new_password: newPassword
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    message.textContent = t('passwordChangedSuccess');
                    message.className = 'modal-message success';
                    
                    // Update current user's password in localStorage
                    global.currentUser.password = newPassword;
                    localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                    
                    // Clear password fields
                    document.getElementById('currentPassword').value = '';
                    document.getElementById('newPassword').value = '';
                    document.getElementById('confirmNewPassword').value = '';
                } else {
                    message.textContent = result.message || t('passwordChangedFailed');
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
        const closeBtn = document.getElementById('closeDeleteAccountBtn');
        if (closeBtn) closeBtn.onclick = hideDeleteAccountModal;

        const cancelBtn = document.getElementById('cancelDeleteAccountBtn');
        if (cancelBtn) cancelBtn.onclick = hideDeleteAccountModal;

        const deleteAccountBtn = document.getElementById('deleteAccountBtn');
        if (deleteAccountBtn) deleteAccountBtn.onclick = deleteAccount;
    }

    async function deleteAccount() {
        const confirmUsername = document.getElementById('deleteAccountConfirmUsername')?.value.trim();
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
                    password: global.currentUser.password
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (result.code === 200) {
                // Clear user data
                if (global.stopAutoSync) global.stopAutoSync();
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
                    message.textContent = result.message || t('deleteAccountFailed');
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
        const loginModalCloseBtn = document.getElementById('loginModalCloseBtn');
        if (loginModalCloseBtn) loginModalCloseBtn.onclick = hideLoginModal;

        const loginSubmitBtn = document.getElementById('loginSubmitBtn');
        if (loginSubmitBtn) loginSubmitBtn.onclick = login;

        const registerSubmitBtn = document.getElementById('registerSubmitBtn');
        if (registerSubmitBtn) registerSubmitBtn.onclick = register;

        const loginTabBtn = document.getElementById('loginTabBtn');
        const registerTabBtn = document.getElementById('registerTabBtn');
        if (loginTabBtn) loginTabBtn.onclick = switchToLoginTab;
        if (registerTabBtn) registerTabBtn.onclick = switchToRegisterTab;

        // 绑定用户名输入事件
        const registerUsernameInput = document.getElementById('registerUsername');
        if (registerUsernameInput) {
            registerUsernameInput.addEventListener('input', function() {
                validateUsernameInput(this.value);
            });
        }

        // 绑定密码输入事件
        const registerPasswordInput = document.getElementById('registerPassword');
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
        const loginTabBtn = document.getElementById('loginTabBtn');
        const registerTabBtn = document.getElementById('registerTabBtn');
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
        const loginTabBtn = document.getElementById('loginTabBtn');
        const registerTabBtn = document.getElementById('registerTabBtn');
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
        // 防抖：如果正在提交则直接返回
        if (_loginSubmitting) return;
        _loginSubmitting = true;

        const username = document.getElementById('loginUsername')?.value.trim();
        const password = document.getElementById('loginPassword')?.value.trim();
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
                    global.currentUser = {
                        username: username,
                        token: result.data.token,
                        password: password
                    };
                    localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));

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
                            const files = JSON.parse(localStorage.getItem('vditor_files') || '[]');
                            const currentFile = files.find(f => f.id === currentFileId);
                            if (currentFile) {
                                currentFileName = currentFile.name;
                                currentFileContent = vditor.getValue();
                                // 更新本地存储中的内容
                                currentFile.content = currentFileContent;
                                currentFile.lastModified = Date.now();
                                localStorage.setItem('vditor_files', JSON.stringify(files));
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
            _loginSubmitting = false;
        }
    }

    async function register() {
        // 防抖：如果正在提交则直接返回
        if (_registerSubmitting) return;
        _registerSubmitting = true;

        const username = document.getElementById('registerUsername')?.value.trim();
        const password = document.getElementById('registerPassword')?.value.trim();
        const inviteCode = document.getElementById('registerInviteCode')?.value.trim();
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
            const requestBody = { username: username, password: password };
            if (inviteCode) requestBody.invite_code = inviteCode;

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
                        global.currentUser = {
                            username: username,
                            token: loginResult.data.token,
                            password: password
                        };
                        localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
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
                                const files = JSON.parse(localStorage.getItem('vditor_files') || '[]');
                                const currentFile = files.find(f => f.id === currentFileId);
                                if (currentFile) {
                                    currentFileName = currentFile.name;
                                    currentFileContent = vditor.getValue();
                                    // 更新本地存储中的内容
                                    currentFile.content = currentFileContent;
                                    currentFile.lastModified = Date.now();
                                    localStorage.setItem('vditor_files', JSON.stringify(files));
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
                        global.currentUser = {
                            username: username,
                            token: loginResult.data.token,
                            password: password
                        };
                        localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
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
                                const files = JSON.parse(localStorage.getItem('vditor_files') || '[]');
                                const currentFile = files.find(f => f.id === currentFileId);
                                if (currentFile) {
                                    currentFileName = currentFile.name;
                                    currentFileContent = vditor.getValue();
                                    // 更新本地存储中的内容
                                    currentFile.content = currentFileContent;
                                    currentFile.lastModified = Date.now();
                                    localStorage.setItem('vditor_files', JSON.stringify(files));
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
            _registerSubmitting = false;
        }
    }

    async function logout() {
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

        if (global.stopAutoSync) global.stopAutoSync();
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
        localStorage.setItem('vditor_accounts', JSON.stringify(accounts));
    }

    // 添加账户到列表
    function addAccountToList(username, password) {
        const accounts = getSavedAccounts();
        // 检查是否已存在
        const existingIndex = accounts.findIndex(acc => acc.username === username);
        if (existingIndex >= 0) {
            // 更新密码
            accounts[existingIndex].password = password;
        } else {
            // 添加新账户
            accounts.push({ username, password });
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

        const accounts = getSavedAccounts();
        const currentUsername = global.currentUser ? global.currentUser.username : null;
        const isSingleAccount = accounts.length === 1;

        let html = '';
        accounts.forEach(function(account) {
            const isCurrent = account.username === currentUsername;
            html += '<div class="dropdown-item account-item" data-username="' + account.username + '" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;' + (isCurrent ? 'background:#f0f7ff;' : '') + '">';
            html += '<span style="display:flex;align-items:center;gap:8px;flex:1;">';
            html += '<i class="fas fa-user-circle" style="color:#4a90e2;"></i> ';
            html += '<span>' + account.username + '</span>';
            if (isCurrent) {
                html += '<span style="font-size:11px;color:#4a90e2;margin-left:4px;">(' + (isEn() ? 'Current' : '当前') + ')</span>';
            }
            html += '</span>';
            // 右侧按钮组
            html += '<span style="display:flex;align-items:center;gap:4px;">';
            // 设置按钮（所有账户都显示）
            html += '<button class="account-settings-btn" data-username="' + account.username + '" style="background:none;border:none;cursor:pointer;padding:4px;color:#666;" title="' + t('userSettings') + '">';
            html += '<i class="fas fa-cog"></i>';
            html += '</button>';
            // 移除按钮（只有一个账户时不显示）
            if (!isSingleAccount) {
                html += '<button class="remove-account-btn" data-username="' + account.username + '" style="background:none;border:none;cursor:pointer;padding:4px;color:#999;" title="' + t('removeAccount') + '">';
                html += '<i class="fas fa-times"></i>';
                html += '</button>';
            }
            html += '</span>';
            html += '</div>';
        });

        container.innerHTML = html;

        // 绑定点击事件（点击账户名切换账户）
        container.querySelectorAll('.account-item').forEach(function(item) {
            item.onclick = function(e) {
                // 如果点击的是按钮，不触发切换
                if (e.target.closest('.remove-account-btn') || e.target.closest('.account-settings-btn')) return;

                const username = this.getAttribute('data-username');
                if (username && username !== currentUsername) {
                    showSwitchAccountConfirm(username);
                }
            };
        });

        // 绑定设置按钮事件
        container.querySelectorAll('.account-settings-btn').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                const username = this.getAttribute('data-username');
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
            btn.onclick = function(e) {
                e.stopPropagation();
                const username = this.getAttribute('data-username');
                confirmRemoveAccount(username);
            };
        });
    }

    // 显示切换账户确认对话框
    let pendingSwitchUsername = null;
    function showSwitchAccountConfirm(username) {
        pendingSwitchUsername = username;
        const targetNameEl = document.getElementById('targetAccountName');
        if (targetNameEl) {
            targetNameEl.textContent = username;
        }

        const modal = document.getElementById('switchAccountConfirmModalOverlay');
        if (modal) {
            modal.classList.add('show');
        }
    }

    // 隐藏切换账户确认对话框
    function hideSwitchAccountConfirm() {
        const modal = document.getElementById('switchAccountConfirmModalOverlay');
        if (modal) {
            modal.classList.remove('show');
        }
        pendingSwitchUsername = null;
    }

    // 确认切换账户
    async function confirmSwitchAccount() {
        if (!pendingSwitchUsername) return;

        const accounts = getSavedAccounts();
        const targetAccount = accounts.find(acc => acc.username === pendingSwitchUsername);
        if (!targetAccount) {
            global.showMessage(t('accountNotFound'), 'error');
            hideSwitchAccountConfirm();
            return;
        }

        hideSwitchAccountConfirm();

        // 1. 先保存当前正在编辑的文件
        if (global.saveCurrentFile) {
            try {
                await global.saveCurrentFile(true);
            } catch (e) {
                console.warn('保存当前文件失败:', e);
            }
        }

        // 2. 同步当前账户的所有未保存更改
        const files = global.files || [];
        const unsavedChanges = global.unsavedChanges || {};
        let hasUnsaved = false;
        files.forEach(function(file) {
            if (unsavedChanges[file.id]) hasUnsaved = true;
        });

        if (hasUnsaved && global.syncAllFiles) {
            try {
                await global.syncAllFiles();
            } catch (e) {
                console.warn('同步当前账户文件失败:', e);
            }
        }

        // 3. 停止自动同步
        if (global.stopAutoSync) global.stopAutoSync();

        // 4. 使用设置-存储空间的方式清空数据（保留 service worker）
        // 清空 Cache Storage
        if (global.clearAllCacheStorage) {
            try {
                await global.clearAllCacheStorage();
            } catch (e) {
                console.warn('清空 Cache Storage 失败:', e);
            }
        }

        // 清空 IndexedDB
        if (global.clearAllIndexedDB) {
            try {
                await global.clearAllIndexedDB();
            } catch (e) {
                console.warn('清空 IndexedDB 失败:', e);
            }
        }

        // 清空 Cookies
        if (global.clearAllCookies) {
            try {
                await global.clearAllCookies();
            } catch (e) {
                console.warn('清空 Cookies 失败:', e);
            }
        }

        // 5. 清除 localStorage 中的文件相关数据
        localStorage.removeItem('vditor_files');
        localStorage.removeItem('vditor_last_synced_files');
        localStorage.removeItem('vditor_folders_expanded');

        // 6. 清除全局状态
        global.files = [];
        global.unsavedChanges = {};
        global.lastSyncedContent = {};
        global.pendingServerSync = {};
        global.currentFileId = null;

        // 7. 使用新账户登录
        try {
            const result = await verifyAccountCredentials(targetAccount.username, targetAccount.password);
            if (result.code === 200) {
                // 设置当前用户
                global.currentUser = {
                    username: targetAccount.username,
                    token: result.data.token,
                    password: targetAccount.password
                };
                localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));

                global.showMessage(t('accountSwitched').replace('{username}', targetAccount.username), 'success');

                // 8. 重新加载文件列表
                if (global.loadFilesFromServer) {
                    await global.loadFilesFromServer();
                }

                // 9. 启动自动同步
                if (global.startAutoSync) {
                    global.startAutoSync();
                }

                // 10. 更新UI
                showUserInfo();
                if (global.loadFiles) global.loadFiles();

                // 11. 关闭下拉菜单
                const dropdown = document.getElementById('userMenuDropdown');
                if (dropdown) dropdown.classList.remove('show');

                // 12. 如果需要，打开设置窗口
                if (global._openSettingsAfterSwitch) {
                    global._openSettingsAfterSwitch = false;
                    setTimeout(function() {
                        showUserSettingsModal();
                    }, 300);
                }
            } else {
                global.showMessage(t('accountAddFailed') + ': ' + result.message, 'error');
            }
        } catch (error) {
            console.error('切换账户失败:', error);
            global.showMessage(t('accountAddFailed'), 'error');
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
            const usernameInput = document.getElementById('addAccountUsername');
            const passwordInput = document.getElementById('addAccountPassword');
            const messageEl = document.getElementById('addAccountMessage');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (messageEl) {
                messageEl.textContent = '';
                messageEl.className = 'modal-message';
            }
        }
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
    async function verifyAccountCredentials(username, password) {
        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result;
        } catch (error) {
            console.error('验证账户失败:', error);
            return { code: 500, message: t('networkErrorPleaseRetry') };
        }
    }

    // 处理添加账户
    async function handleAddAccount() {
        const usernameInput = document.getElementById('addAccountUsername');
        const passwordInput = document.getElementById('addAccountPassword');
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
        if (accounts.find(acc => acc.username === username)) {
            if (messageEl) {
                messageEl.textContent = t('accountAlreadyExists');
                messageEl.className = 'modal-message error';
            }
            return;
        }

        // 验证账户
        try {
            const result = await verifyAccountCredentials(username, password);
            if (result.code === 200) {
                // 添加账户到列表
                addAccountToList(username, password);

                // 如果当前没有登录用户，切换到新账户
                if (!global.currentUser) {
                    // 设置当前用户
                    global.currentUser = {
                        username: username,
                        token: result.data.token,
                        password: password
                    };
                    localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));

                    global.showMessage(t('accountAddedSuccess'), 'success');
                    hideAddAccountModal();
                    showUserInfo();
                    if (global.loadFiles) global.loadFiles();
                } else {
                    // 如果已有登录用户，保持当前用户，只添加账户到列表
                    global.showMessage(t('accountAddedSuccess'), 'success');
                    hideAddAccountModal();
                }

                // 刷新账户列表
                renderAccountList();
            } else {
                if (messageEl) {
                    messageEl.textContent = t('accountAddFailed') + ': ' + result.message;
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
        const closeBtn = document.getElementById('closeAddAccountBtn');
        const cancelBtn = document.getElementById('cancelAddAccountBtn');
        const confirmBtn = document.getElementById('confirmAddAccountBtn');

        if (closeBtn) closeBtn.onclick = hideAddAccountModal;
        if (cancelBtn) cancelBtn.onclick = hideAddAccountModal;
        if (confirmBtn) confirmBtn.onclick = handleAddAccount;

        // 回车键提交
        const passwordInput = document.getElementById('addAccountPassword');
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
        const closeBtn = document.getElementById('closeSwitchAccountConfirmBtn');
        const cancelBtn = document.getElementById('cancelSwitchAccountBtn');
        const confirmBtn = document.getElementById('confirmSwitchAccountBtn');

        if (closeBtn) closeBtn.onclick = hideSwitchAccountConfirm;
        if (cancelBtn) cancelBtn.onclick = hideSwitchAccountConfirm;
        if (confirmBtn) confirmBtn.onclick = confirmSwitchAccount;
    }

    function handleLoginButtonClick(e) {
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
                const logoutItem = document.getElementById('logoutItem');
                if (logoutItem) {
                    logoutItem.onclick = logout;
                }

                // 绑定添加账户按钮
                const addAccountItem = document.getElementById('addAccountItem');
                if (addAccountItem) {
                    addAccountItem.onclick = function(e) {
                        e.stopPropagation();
                        showAddAccountModal();
                    };
                }

                // 渲染账户列表
                renderAccountList();

                dropdown.classList.toggle('show');
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

})(typeof window !== 'undefined' ? window : this);