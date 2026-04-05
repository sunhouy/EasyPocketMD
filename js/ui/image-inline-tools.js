(function(global) {
    'use strict';

    var OCR_API = 'https://ocr.yhsun.cn/';
    var MODAL_ID = 'epmd-image-tools-modal';
    var updateTimer = null;
    var suspendObserver = false;
    var currentEditingImage = null;

    function escapeRegExp(str) {
        return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function normalizeUrl(url) {
        if (!url) return '';
        try {
            return decodeURIComponent(String(url)).replace(/&amp;/g, '&').trim();
        } catch (e) {
            return String(url).replace(/&amp;/g, '&').trim();
        }
    }

    function htmlEscape(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isEditorImage(img) {
        if (!img) return false;
        if (img.closest('.vditor-wysiwyg, .vditor-ir__preview, .vditor-sv')) return true;
        return false;
    }

    function getTargetImages() {
        var root = document.getElementById('vditor');
        if (!root) return [];
        return Array.from(root.querySelectorAll('.vditor-wysiwyg img, .vditor-ir__preview img, .vditor-sv img')).filter(isEditorImage);
    }

    function getImageMeta(img) {
        var width = Math.round(img.getBoundingClientRect().width || img.clientWidth || 0);
        if (!width) {
            width = parseInt(img.getAttribute('width') || '0', 10) || 0;
        }
        var rotate = parseInt(img.dataset.epmdRotate || '0', 10);
        if (isNaN(rotate)) rotate = 0;
        return {
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
            width: width,
            rotate: rotate
        };
    }

    function applyImageStyle(img, width, rotate) {
        if (!img) return;
        if (width && width > 0) {
            img.style.width = width + 'px';
            img.style.maxWidth = '100%';
            img.setAttribute('width', String(width));
        }
        img.dataset.epmdRotate = String(rotate || 0);
        if (rotate) {
            img.style.transform = 'rotate(' + rotate + 'deg)';
            img.style.transformOrigin = 'center center';
        } else {
            img.style.removeProperty('transform');
            img.style.removeProperty('transform-origin');
        }
    }

    function buildImageHtml(src, alt, width, rotate) {
        var safeSrc = htmlEscape(src || '');
        var safeAlt = htmlEscape(alt || '');
        var style = 'max-width: 100%;';
        if (width && width > 0) {
            style += ' width: ' + width + 'px;';
        }
        if (rotate) {
            style += ' transform: rotate(' + rotate + 'deg); transform-origin: center center;';
        }
        return '<img src="' + safeSrc + '" alt="' + safeAlt + '" style="' + style + '">';
    }

    function replaceFirstMatch(content, regex, mapper) {
        var match;
        while ((match = regex.exec(content)) !== null) {
            var replacement = mapper(match);
            if (replacement) {
                return content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
            }
        }
        return null;
    }

    function persistImageChange(img, width, rotate) {
        if (!global.vditor || typeof global.vditor.getValue !== 'function' || typeof global.vditor.setValue !== 'function') {
            return false;
        }

        var src = img.getAttribute('src') || '';
        if (!src) return false;

        var raw = global.vditor.getValue() || '';
        var srcNorm = normalizeUrl(src);
        var updated = null;

        // Markdown image syntax: ![alt](url)
        var mdRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
        updated = replaceFirstMatch(raw, mdRegex, function(match) {
            var matchUrl = normalizeUrl(match[2]);
            if (matchUrl !== srcNorm) return null;
            return buildImageHtml(match[2], match[1], width, rotate);
        });

        // HTML image syntax: <img ... src="...">
        if (!updated) {
            var htmlRegex = /<img\b[^>]*src=(['"])(.*?)\1[^>]*>/gi;
            updated = replaceFirstMatch(raw, htmlRegex, function(match) {
                var matchUrl = normalizeUrl(match[2]);
                if (matchUrl !== srcNorm) return null;
                var altMatch = match[0].match(/\balt=(['"])(.*?)\1/i);
                var alt = altMatch ? altMatch[2] : (img.getAttribute('alt') || '');
                return buildImageHtml(match[2], alt, width, rotate);
            });
        }

        if (!updated || updated === raw) {
            return false;
        }

        suspendObserver = true;
        try {
            global.vditor.setValue(updated);
            if (global.currentFileId) {
                global.unsavedChanges = global.unsavedChanges || {};
                global.unsavedChanges[global.currentFileId] = true;
                if (typeof global.startAutoSave === 'function') {
                    global.startAutoSave();
                }
            }
            return true;
        } finally {
            setTimeout(function() {
                suspendObserver = false;
                scheduleEnhance();
            }, 80);
        }
    }

    function createToolButton(label, title, action) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'epmd-image-tool-btn';
        btn.textContent = label;
        btn.title = title;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            action();
        });
        return btn;
    }

    function setPanelBusy(panel, busy, text) {
        if (!panel) return;
        panel.dataset.loading = busy ? '1' : '0';
        var status = panel.querySelector('.epmd-image-tool-status');
        if (status) {
            status.textContent = text || '';
        }
        var buttons = panel.querySelectorAll('.epmd-image-tool-btn, .epmd-image-tool-lang');
        buttons.forEach(function(btn) {
            btn.disabled = !!busy;
        });
    }

    function getLang(panel) {
        var select = panel.querySelector('.epmd-image-tool-lang');
        return select ? select.value : 'chi_tra+chi_sim+eng';
    }

    function fileFromBlob(blob, name) {
        try {
            return new File([blob], name, { type: blob.type || 'image/png' });
        } catch (e) {
            return blob;
        }
    }

    function createModal() {
        if (document.getElementById(MODAL_ID)) {
            return document.getElementById(MODAL_ID);
        }

        var nightMode = global.nightMode;
        var modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.setAttribute('contenteditable', 'false');
        
        var bg = nightMode ? '#2d2d2d' : '#fff';
        var textColor = nightMode ? '#eee' : '#333';
        var btnBg = nightMode ? '#3d3d3d' : '#f0f0f0';
        var borderColor = nightMode ? '#555' : '#ddd';

        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        `;

        var content = document.createElement('div');
        content.style.cssText = `
            background: ${bg};
            border-radius: 12px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            color: ${textColor};
        `;

        var html = `
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 16px;">图片工具</h3>
                    <button class="epmd-modal-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${textColor};">×</button>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 14px;">尺寸调整</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="epmd-modal-btn epmd-size-minus" style="padding: 8px 12px; background: ${btnBg}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer;">− 缩小</button>
                        <button class="epmd-modal-btn epmd-size-plus" style="padding: 8px 12px; background: ${btnBg}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer;">+ 放大</button>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 14px;">旋转</label>
                    <div style="display: flex; gap: 8px;">
                        <button class="epmd-modal-btn epmd-rotate-left" style="padding: 8px 12px; background: ${btnBg}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer;">↺ 左转 90°</button>
                        <button class="epmd-modal-btn epmd-rotate-right" style="padding: 8px 12px; background: ${btnBg}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer;">↻ 右转 90°</button>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 14px;">裁剪</label>
                    <button class="epmd-modal-btn epmd-crop-open" style="padding: 8px 12px; background: ${btnBg}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer; width: 100%;">打开裁剪工具</button>
                    <div class="epmd-crop-canvas-container" style="display: none; margin-top: 12px; background: ${nightMode ? '#1a1a1a' : '#fafafa'}; padding: 10px; border-radius: 6px;">
                        <canvas class="epmd-crop-canvas" style="max-width: 100%; border: 2px solid ${borderColor}; border-radius: 4px; display: block; margin: 0 auto;"></canvas>
                        <div style="margin-top: 10px; display: flex; gap: 8px;">
                            <button class="epmd-crop-confirm" style="flex: 1; padding: 6px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">确认裁剪</button>
                            <button class="epmd-crop-cancel" style="flex: 1; padding: 6px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 14px;">OCR 文字识别</label>
                    <select class="epmd-ocr-lang" style="width: 100%; padding: 8px; margin-bottom: 10px; background: ${btnBg}; color: ${textColor}; border: 1px solid ${borderColor}; border-radius: 6px;">
                        <option value="chi_tra+chi_sim+eng">繁+简+英</option>
                        <option value="chi_sim+eng">简+英</option>
                        <option value="chi_tra+eng">繁+英</option>
                        <option value="chi_sim">简体</option>
                        <option value="chi_tra">繁体</option>
                    </select>
                    <button class="epmd-modal-btn epmd-ocr-run" style="padding: 8px 12px; background: ${btnBg}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer; width: 100%;">运行 OCR</button>
                    <div class="epmd-ocr-status" style="margin-top: 10px; font-size: 12px; color: ${nightMode ? '#aaa' : '#666'};"></div>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        modal.appendChild(content);
        document.body.appendChild(modal);

        var closeBtn = content.querySelector('.epmd-modal-close');
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });

        return modal;
    }

    function closeModal() {
        var modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.style.display = 'none';
            var container = modal.querySelector('.epmd-crop-canvas-container');
            if (container) {
                container.style.display = 'none';
            }
            currentEditingImage = null;
        }
    }

    function showImageToolsModal(img) {
        currentEditingImage = img;
        var modal = createModal();
        modal.style.display = 'flex';

        var container = modal.querySelector('.epmd-crop-canvas-container');
        if (container) {
            container.style.display = 'none';
        }

        // 绑定按钮事件
        modal.querySelector('.epmd-size-minus').onclick = function() {
            if (!currentEditingImage) return;
            var meta = getImageMeta(currentEditingImage);
            var width = Math.max(80, Math.round(meta.width * 0.9));
            applyImageStyle(currentEditingImage, width, meta.rotate);
            persistImageChange(currentEditingImage, width, meta.rotate);
        };

        modal.querySelector('.epmd-size-plus').onclick = function() {
            if (!currentEditingImage) return;
            var meta = getImageMeta(currentEditingImage);
            var width = Math.min(2400, Math.round(meta.width * 1.1));
            if (!width) width = 320;
            applyImageStyle(currentEditingImage, width, meta.rotate);
            persistImageChange(currentEditingImage, width, meta.rotate);
        };

        modal.querySelector('.epmd-rotate-left').onclick = function() {
            if (!currentEditingImage) return;
            var meta = getImageMeta(currentEditingImage);
            var rotate = (meta.rotate - 90) % 360;
            applyImageStyle(currentEditingImage, meta.width || 320, rotate);
            persistImageChange(currentEditingImage, meta.width || 320, rotate);
        };

        modal.querySelector('.epmd-rotate-right').onclick = function() {
            if (!currentEditingImage) return;
            var meta = getImageMeta(currentEditingImage);
            var rotate = (meta.rotate + 90) % 360;
            applyImageStyle(currentEditingImage, meta.width || 320, rotate);
            persistImageChange(currentEditingImage, meta.width || 320, rotate);
        };

        modal.querySelector('.epmd-crop-open').onclick = function() {
            if (!currentEditingImage) return;
            openCropTool(currentEditingImage, modal);
        };

        modal.querySelector('.epmd-ocr-run').onclick = function() {
            if (!currentEditingImage) return;
            runOCR(currentEditingImage, modal);
        };
    }

    function openCropTool(img, modal) {
        var container = modal.querySelector('.epmd-crop-canvas-container');
        var canvas = modal.querySelector('.epmd-crop-canvas');
        
        if (!canvas || !img.src) {
            global.showMessage ? global.showMessage('无效的图片', 'error') : alert('无效的图片');
            return;
        }

        var image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = function() {
            canvas.width = Math.min(image.width, 500);
            canvas.height = (canvas.width / image.width) * image.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            container.style.display = 'block';
            setupCropHandlers(canvas, image, img, modal);
        };
        image.onerror = function() {
            global.showMessage ? global.showMessage('图片加载失败', 'error') : alert('图片加载失败');
        };
        image.src = img.src;
    }

    function setupCropHandlers(canvas, origImage, imgElement, modal) {
        var cropState = {
            startX: 0,
            startY: 0,
            isDrawing: false,
            rect: { x: 20, y: 20, w: canvas.width - 40, h: canvas.height - 40 }
        };

        function drawCropBox() {
            var ctx = canvas.getContext('2d');
            ctx.drawImage(origImage, 0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#FF6B6B';
            ctx.lineWidth = 2;
            ctx.strokeRect(cropState.rect.x, cropState.rect.y, cropState.rect.w, cropState.rect.h);
            ctx.fillStyle = 'rgba(255, 107, 107, 0.1)';
            ctx.fillRect(cropState.rect.x, cropState.rect.y, cropState.rect.w, cropState.rect.h);
        }

        drawCropBox();

        canvas.onmousedown = function(e) {
            cropState.isDrawing = true;
            cropState.startX = e.offsetX;
            cropState.startY = e.offsetY;
        };

        canvas.onmousemove = function(e) {
            if (!cropState.isDrawing) return;
            var x = e.offsetX;
            var y = e.offsetY;
            cropState.rect.x = Math.max(0, Math.min(x, cropState.startX));
            cropState.rect.y = Math.max(0, Math.min(y, cropState.startY));
            cropState.rect.w = Math.abs(x - cropState.startX);
            cropState.rect.h = Math.abs(y - cropState.startY);
            drawCropBox();
        };

        canvas.onmouseup = function() {
            cropState.isDrawing = false;
        };

        canvas.onmouseleave = function() {
            cropState.isDrawing = false;
        };

        var confirmBtn = modal.querySelector('.epmd-crop-confirm');
        var cancelBtn = modal.querySelector('.epmd-crop-cancel');

        confirmBtn.onclick = function() {
            var ratio = origImage.width / canvas.width;
            var cropCanvas = document.createElement('canvas');
            cropCanvas.width = Math.round(cropState.rect.w * ratio);
            cropCanvas.height = Math.round(cropState.rect.h * ratio);
            var ctx = cropCanvas.getContext('2d');
            ctx.drawImage(origImage, 
                Math.round(cropState.rect.x * ratio), 
                Math.round(cropState.rect.y * ratio),
                cropCanvas.width, 
                cropCanvas.height,
                0, 0, cropCanvas.width, cropCanvas.height);
            
            cropCanvas.toBlob(function(blob) {
                var url = URL.createObjectURL(blob);
                imgElement.src = url;
                imgElement.dataset.epmdCropped = '1';
                persistImageChange(imgElement, cropCanvas.width, 0);
                modal.querySelector('.epmd-crop-canvas-container').style.display = 'none';
                global.showMessage ? global.showMessage('裁剪完成', 'success') : alert('裁剪完成');
            }, 'image/png');
        };

        cancelBtn.onclick = function() {
            modal.querySelector('.epmd-crop-canvas-container').style.display = 'none';
            drawCropBox();
        };
    }

    async function runOCR(img, modal) {
        var src = img.getAttribute('src');
        if (!src) {
            global.showMessage ? global.showMessage('未找到图片地址', 'error') : alert('未找到图片地址');
            return;
        }

        var statusDiv = modal.querySelector('.epmd-ocr-status');
        var btn = modal.querySelector('.epmd-ocr-run');
        statusDiv.textContent = 'OCR 识别中...';
        btn.disabled = true;

        try {
            var response = await fetch(src, { mode: 'cors' });
            if (!response.ok) {
                throw new Error('图片读取失败: ' + response.status);
            }
            var blob = await response.blob();

            var formData = new FormData();
            formData.append('file', fileFromBlob(blob, 'ocr-image.png'));
            var langSelect = modal.querySelector('.epmd-ocr-lang');
            formData.append('lang', langSelect.value);

            var ocrRes = await fetch(OCR_API, {
                method: 'POST',
                body: formData
            });
            if (!ocrRes.ok) {
                throw new Error('OCR 请求失败: ' + ocrRes.status);
            }

            var data = await ocrRes.json();
            var text = (data && data.text ? String(data.text) : '').trim();
            if (!text) {
                text = '无识别结果';
            }

            if (navigator.clipboard && text !== '无识别结果') {
                try {
                    await navigator.clipboard.writeText(text);
                } catch (e) {
                    // Clipboard can fail on non-secure context.
                }
            }

            var shouldInsert = false;
            if (text !== '无识别结果') {
                if (typeof global.customConfirm === 'function') {
                    shouldInsert = await global.customConfirm('OCR 完成。是否插入识别文本到当前光标位置？\n\n' + text.slice(0, 120));
                } else {
                    shouldInsert = global.confirm('OCR 完成。是否插入识别文本到当前光标位置？');
                }
            }

            if (shouldInsert && global.vditor && typeof global.vditor.insertValue === 'function') {
                global.vditor.insertValue('\n\n' + text + '\n\n');
            }

            statusDiv.textContent = text === '无识别结果' ? '无识别结果' : ('识别完成，共 ' + text.length + ' 字');
        } catch (error) {
            console.error('OCR 失败', error);
            statusDiv.textContent = 'OCR 失败: ' + error.message;
        } finally {
            btn.disabled = false;
        }
    }

    function bindImageClickEvents() {
        if (document.body.dataset.epmdImageToolsBound === '1') return;
        document.body.dataset.epmdImageToolsBound = '1';

        var root = document.getElementById('vditor');
        if (!root) return;

        var observer = new MutationObserver(function() {
            scheduleImageBindings();
        });
        observer.observe(root, {
            childList: true,
            subtree: true
        });

        scheduleImageBindings();
    }

    function scheduleImageBindings() {
        if (updateTimer) {
            clearTimeout(updateTimer);
        }
        updateTimer = setTimeout(function() {
            updateTimer = null;
            bindAllImageEvents();
        }, 120);
    }

    function bindAllImageEvents() {
        if (suspendObserver) return;
        var images = getTargetImages();
        images.forEach(function(img) {
            if (img.dataset.epmdToolsBound === '1') return;
            img.dataset.epmdToolsBound = '1';
            img.style.cursor = 'pointer';
            img.addEventListener('click', function(e) {
                e.stopPropagation();
                showImageToolsModal(img);
            });
        });
    }

    function initInlineImageTools() {
        bindImageClickEvents();
    }

    global.initInlineImageTools = initInlineImageTools;

})(typeof window !== 'undefined' ? window : this);
