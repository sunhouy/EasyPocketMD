(function(global) {
    'use strict';

    function t(key) { return window.i18n ? window.i18n.t(key) : key; }
    function g(name) { return global[name]; }

    let dialogQueue = [];
    let isDialogShowing = false;

    function createDialogContainer() {
        let container = document.getElementById('customDialogContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'customDialogContainer';
            container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;display:none;';
            document.body.appendChild(container);
        }
        return container;
    }

    function showDialog(type, options) {
        return new Promise((resolve) => {
            dialogQueue.push({ type, options, resolve });
            processDialogQueue();
        });
    }

    function processDialogQueue() {
        if (isDialogShowing || dialogQueue.length === 0) return;
        isDialogShowing = true;
        
        const { type, options, resolve } = dialogQueue.shift();
        renderDialog(type, options, (result) => {
            resolve(result);
            isDialogShowing = false;
            processDialogQueue();
        });
    }

    function renderDialog(type, options, callback) {
        const container = createDialogContainer();
        const nightMode = global['nightMode'] === true;
        const isEn = window.i18n && window.i18n.getLanguage() === 'en';

        const bgColor = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const inputBgColor = nightMode ? '#3d3d3d' : '#f5f5f5';

        let title = options.title || '';
        let message = options.message || '';
        let defaultValue = options.defaultValue || '';
        let confirmText = options.confirmText || (isEn ? 'OK' : '确定');
        let cancelText = options.cancelText || (isEn ? 'Cancel' : '取消');
        let placeholder = options.placeholder || '';

        let content = '';

        if (type === 'alert') {
            content = `
                <div class="custom-dialog-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;">
                    <div class="custom-dialog-content" style="background:${bgColor};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                        <h2 style="text-align:center;margin:0 0 15px 0;font-size:18px;">${title}</h2>
                        <p style="text-align:center;margin:0 0 20px 0;font-size:14px;line-height:1.5;">${message}</p>
                        <div style="display:flex;gap:10px;">
                            <button class="custom-dialog-btn confirm" style="flex:1;padding:12px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">${confirmText}</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'confirm') {
            content = `
                <div class="custom-dialog-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;">
                    <div class="custom-dialog-content" style="background:${bgColor};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                        <h2 style="text-align:center;margin:0 0 15px 0;font-size:18px;">${title}</h2>
                        <p style="text-align:center;margin:0 0 20px 0;font-size:14px;line-height:1.5;">${message}</p>
                        <div style="display:flex;gap:10px;">
                            <button class="custom-dialog-btn cancel" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">${cancelText}</button>
                            <button class="custom-dialog-btn confirm" style="flex:1;padding:12px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">${confirmText}</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'prompt') {
            content = `
                <div class="custom-dialog-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;">
                    <div class="custom-dialog-content" style="background:${bgColor};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                        <h2 style="text-align:center;margin:0 0 15px 0;font-size:18px;">${title}</h2>
                        <p style="text-align:center;margin:0 0 15px 0;font-size:14px;line-height:1.5;">${message}</p>
                        <input type="text" class="custom-dialog-input" style="width:100%;padding:10px;margin-bottom:20px;border:1px solid ${nightMode ? '#555' : '#ddd'};border-radius:6px;background:${inputBgColor};color:${textColor};font-size:14px;box-sizing:border-box;" placeholder="${placeholder}" value="${defaultValue}">
                        <div style="display:flex;gap:10px;">
                            <button class="custom-dialog-btn cancel" style="flex:1;padding:12px;background:${nightMode ? '#555' : '#6c757d'};color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">${cancelText}</button>
                            <button class="custom-dialog-btn confirm" style="flex:1;padding:12px;background:#4a90e2;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">${confirmText}</button>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = content;
        container.style.display = 'block';

        const confirmBtn = container.querySelector('.custom-dialog-btn.confirm');
        const cancelBtn = container.querySelector('.custom-dialog-btn.cancel');
        const input = container.querySelector('.custom-dialog-input');

        const closeDialog = (result) => {
            container.style.display = 'none';
            container.innerHTML = '';
            callback(result);
        };

        confirmBtn.addEventListener('click', () => {
            if (type === 'prompt') {
                closeDialog(input.value);
            } else if (type === 'confirm') {
                closeDialog(true);
            } else {
                closeDialog();
            }
        });

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeDialog(type === 'prompt' ? null : false);
            });
        }

        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    closeDialog(input.value);
                }
            });
            setTimeout(() => input.focus(), 100);
        }

        container.addEventListener('click', (e) => {
            if (e.target === container.querySelector('.custom-dialog-overlay')) {
                closeDialog(type === 'prompt' ? null : false);
            }
        });
    }

    function customAlert(message, options = {}) {
        return showDialog('alert', { ...options, message });
    }

    function customConfirm(message, options = {}) {
        return showDialog('confirm', { ...options, message });
    }

    function customPrompt(message, options = {}) {
        return showDialog('prompt', { ...options, message });
    }

    global.customAlert = customAlert;
    global.customConfirm = customConfirm;
    global.customPrompt = customPrompt;

})(typeof window !== 'undefined' ? window : this);
