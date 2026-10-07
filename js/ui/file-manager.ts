import { collectQueryDocuments } from './ai-query-files';
import { findFileReferences, uploadDate } from './file-references';
(function(global) {
    'use strict';

    function g<K extends keyof Window>(name: K): Window[K] { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async function showFileManager() {
        var t = function(key) { return window.i18n ? window.i18n.t(key) : key; };
        
        if (!g('currentUser')) {
            global.showMessage(t('pleaseLoginFirst'), 'info');
            if (g('showLoginModal')) g('showLoginModal')();
            return;
        }

        const requestUser = g('currentUser');
        const referenceAbort = new AbortController();
        const en = () => isEn();
        const escape = (value: any) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        const nightMode = g('nightMode') === true;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10005;';

        const bg = nightMode ? '#2d2d2d' : 'white';
        const textColor = nightMode ? '#eee' : '#333';
        const borderColor = nightMode ? '#444' : '#ddd';

        const content = document.createElement('div');
        content.style.cssText = `background:${bg};color:${textColor};border-radius:12px;padding:25px;width:90%;max-width:800px;max-height:85vh;display:flex;flex-direction:column;position:relative;`;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.classList.add('epmd-dialog-close');
        closeBtn.setAttribute('aria-label', en() ? 'Close' : '关闭');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = `position:absolute;top:15px;right:15px;background:none;border:none;color:${textColor};font-size:20px;cursor:pointer;`;
        closeBtn.onclick = () => {referenceAbort.abort();modal.remove();};
        content.appendChild(closeBtn);

        // Header
        const header = document.createElement('h2');
        header.textContent = t('myFiles');
        header.style.cssText = 'margin-top:0;margin-bottom:20px;text-align:center;';
        content.appendChild(header);

        // Usage Info
        const usageInfo = document.createElement('div');
        usageInfo.style.cssText = `margin-bottom:20px;padding:15px;background:${nightMode ? '#3d3d3d' : '#f8f9fa'};border-radius:8px;text-align:center;`;
        usageInfo.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t('loading');
        content.appendChild(usageInfo);

        // File List
        const fileListContainer = document.createElement('div');
        fileListContainer.style.cssText = 'flex:1;overflow-y:auto;min-height:200px;border:1px solid ' + borderColor + ';border-radius:8px;padding:10px;';
        content.appendChild(fileListContainer);

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Fetch Data
        try {
            var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/user_files/list';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(g('currentUser').token ? { Authorization: 'Bearer ' + g('currentUser').token } : {}) },
                body: JSON.stringify({
                    username: g('currentUser').username,
                    token: g('currentUser').token,
                    password: g('currentUser').token ? undefined : g('currentUser').password
                })
            });
            const result = await response.json();

            if (result.code === 200) {
                // Combine with local files from localStorage and IndexedDB
                const localStorageFiles = JSON.parse(localStorage.getItem('vditor_local_files') || '[]').map(f => ({...f, isLocal: true, source: 'localStorage'}));
                
                // Get files from IndexedDB
                let indexedDBFiles = [];
                try {
                    if (global.IndexedDBManager) {
                        const idbFiles = await global.IndexedDBManager.getAllFiles();
                        indexedDBFiles = idbFiles.filter(f => !f.url.startsWith('epm-file:')).map(f => {
                            const fileName = f.url.startsWith('local://') 
                                ? f.url.replace('local://', '')
                                : f.url.split('/').pop() || 'file';
                            return {
                                name: fileName,
                                originalName: fileName,
                                url: f.url,
                                type: f.contentType,
                                size: f.data ? f.data.byteLength : 0,
                                date: new Date(f.lastModified || f.createdAt).toISOString(),
                                isLocal: true,
                                source: 'indexedDB',
                                idbData: f
                            };
                        });
                    }
                } catch (err) {
                    console.error('Failed to load IndexedDB files:', err);
                }
                
                if (g('currentUser') !== requestUser || !modal.isConnected) return;
                const allFiles = [...localStorageFiles, ...indexedDBFiles, ...result.data];
                const renderUsage = () => {
                    usageInfo.innerHTML = `<div style="font-size:16px;margin-bottom:5px;">${t('usedSpace')}: <strong>${formatSize(result.totalSize)}</strong></div>
                        <div style="font-size:12px;color:${nightMode ? '#aaa' : '#666'};">${t('totalFiles').replace('{count}',String(allFiles.length))}</div>`;
                };
                const selected = new Set<any>();
                const rows = new Map<any, HTMLElement>();
                const referenceLabels = new Map<any, HTMLElement>();
                const toolbar = document.createElement('div');
                toolbar.className = 'file-manager-selection';
                toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;';
                const selectionCount = document.createElement('span');
                const updateSelection = () => {
                    selectionCount.textContent = en() ? `${selected.size} selected` : `已选择 ${selected.size} 个`;
                    for (const [file,item] of rows) {
                        (item.querySelector('.file-manager-checkbox') as HTMLInputElement).checked = selected.has(file);
                        item.style.outline = selected.has(file) ? '2px solid var(--theme-accent, #2196F3)' : '';
                    }
                    toolbar.querySelectorAll<HTMLButtonElement>('[data-selection-action]').forEach(button => button.disabled = !selected.size);
                };
                const action = (label: string, fn: () => void, needsSelection = false) => {
                    const button = document.createElement('button'); button.type = 'button';
                    button.className = 'modal-btn secondary'; button.textContent = label;
                    if(needsSelection) button.dataset.selectionAction = '';
                    button.onclick = fn; toolbar.append(button); return button;
                };
                const linkFor = file => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name) ? `![${file.originalName || file.name}](${file.url})` : `[${file.originalName || file.name}](${file.url})`;
                const removeFile = async file => {
                    if (g('currentUser') !== requestUser) throw Error(en() ? 'Account changed' : '账号已切换');
                    if (file.isLocal) {
                        if(file.source === 'indexedDB') await global.IndexedDBManager?.deleteFile(file.url);
                        else {
                            const locals = JSON.parse(localStorage.getItem('vditor_local_files') || '[]');
                            localStorage.setItem('vditor_local_files',JSON.stringify(locals.filter(f => f.name !== file.name)));
                        }
                    } else {
                        const response = await fetch((window.getApiBaseUrl?.() || 'api') + '/user_files/delete', {
                            method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer ' + requestUser.token},
                            body:JSON.stringify({username:requestUser.username,token:requestUser.token,password:requestUser.token ? undefined : requestUser.password,filename:file.name})
                        });
                        const result = await response.json();
                        if(result.code !== 200) throw Error(result.message || t('deleteFailed'));
                    }
                    rows.get(file)?.remove(); rows.delete(file);selected.delete(file);
                    const index=allFiles.indexOf(file);if(index>=0) allFiles.splice(index,1);
                    if(!file.isLocal) result.totalSize=Math.max(0,result.totalSize-(Number(file.size)||0));
                    updateSelection();renderUsage();
                };
                action(en() ? 'Select all' : '全选',() => {for(const file of rows.keys()) selected.add(file);updateSelection();});
                action(en() ? 'Clear selection' : '取消选择',() => {selected.clear();updateSelection();});
                action(en() ? 'Copy selected links' : '复制所选链接',() => {
                    void navigator.clipboard.writeText([...selected].map(linkFor).join('\n')).then(() => global.showMessage(t('linkCopied'),'success')).catch(() => global.showMessage(en() ? 'Copy failed' : '复制失败','error'));
                },true);
                action(en() ? 'Delete selected' : '删除所选',() => {void (async () => {
                    const files = [...selected];
                    const confirmed = await g('customConfirm')(en() ? `Delete ${files.length} selected files? Referencing documents may lose these resources.` : `确定删除所选的 ${files.length} 个文件？引用这些资源的文档将无法再加载它们。`);
                    if(!confirmed) return;
                    let failed = 0;
                    for(const file of files) try {await removeFile(file);} catch {failed++;}
                    global.showMessage(failed ? (en() ? `${failed} files could not be deleted` : `${failed} 个文件删除失败`) : t('deleteSuccess'),failed ? 'error':'success');
                })();},true);
                toolbar.append(selectionCount);content.insertBefore(toolbar,fileListContainer);updateSelection();

                renderUsage();

                // Render Files
                if (allFiles.length === 0) {
                    fileListContainer.innerHTML = `<div style="text-align:center;padding:40px;color:${nightMode ? '#aaa' : '#666'};">${t('noFiles')}</div>`;
                } else {
                    const list = document.createElement('div');
                    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(190px, 1fr));gap:10px;';
                    
                    allFiles.forEach(file => {
                        const item = document.createElement('div');
                        item.style.cssText = `border:1px solid ${borderColor};border-radius:6px;padding:8px;position:relative;display:flex;flex-direction:column;align-items:center;transition:all 0.2s;`;
                        item.onmouseover = () => item.style.borderColor = '#2196F3';
                        item.onmouseout = () => item.style.borderColor = borderColor;

                        // Display name logic: remove timestamp prefix (digits + underscore)
                        const displayName = (file.originalName || file.name).replace(/^\d+_/, '');

                        // Local indicator
                        const locIndicator = file.isLocal 
                            ? `<i class="fas fa-hdd" style="position:absolute;top:5px;left:5px;font-size:10px;color:#2196F3;" title="${t('localFile')}"></i>`
                            : `<i class="fas fa-cloud" style="position:absolute;top:5px;left:5px;font-size:10px;color:#4CAF50;" title="${t('cloudFile')}"></i>`;

                        // Preview
                        let preview = '';
                        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name) || 
                                        (file.type && file.type.startsWith('image/'));
                        
                        if (isImage) {
                            let imageUrl = file.thumbUrl || file.url;
                            
                            // If it's from IndexedDB, create a blob URL
                            if (file.source === 'indexedDB' && file.idbData && global.IndexedDBManager) {
                                try {
                                    imageUrl = global.IndexedDBManager.createBlobURL(file.idbData.data, file.idbData.contentType);
                                } catch (err) {
                                    console.error('Failed to create blob URL for preview:', err);
                                }
                            }
                            
                            preview = `<div style="width:100%;height:80px;background-image:url('${escape(imageUrl)}');background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:4px;margin-bottom:5px;"></div>`;
                        } else {
                            preview = `<div style="width:100%;height:80px;display:flex;align-items:center;justify-content:center;background:${nightMode ? '#444' : '#eee'};border-radius:4px;margin-bottom:5px;"><i class="fas fa-file" style="font-size:32px;color:#999;"></i></div>`;
                        }

                        item.innerHTML = `
                            ${locIndicator}
                            ${preview}
                            <div style="font-size:12px;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;margin-bottom:2px;" title="${escape(displayName)}">${escape(displayName)}</div>
                            <div style="font-size:10px;color:${nightMode ? '#aaa' : '#666'};">${formatSize(file.size)}</div>
                            <div style="display:flex;flex-direction:column;gap:5px;margin-top:5px;width:100%;">
                                <div style="display:flex;gap:5px;width:100%;">
                                    <button class="copy-btn" style="flex:1;background:#2196F3;color:white;border:none;border-radius:3px;padding:2px;font-size:10px;cursor:pointer;">${t('copy')}</button>
                                    <button class="del-btn" style="flex:1;background:#dc3545;color:white;border:none;border-radius:3px;padding:2px;font-size:10px;cursor:pointer;">${t('delete')}</button>
                                </div>
                                ${file.isLocal ? `<button class="convert-btn" style="width:100%;background:#4CAF50;color:white;border:none;border-radius:3px;padding:2px;font-size:10px;cursor:pointer;">${t('convertToCloud')}</button>` : ''}
                            </div>
                        `;

                        const checkbox = document.createElement('input');checkbox.type='checkbox';checkbox.className='file-manager-checkbox';
                        checkbox.setAttribute('aria-label',(en() ? 'Select ' : '选择 ') + displayName);
                        checkbox.style.cssText='align-self:flex-end;margin:0 0 6px;';
                        checkbox.onchange=() => {if(checkbox.checked) selected.add(file);else selected.delete(file);updateSelection();};
                        item.prepend(checkbox);rows.set(file,item);
                        const uploaded = document.createElement('div');
                        uploaded.className='file-manager-upload-date';uploaded.style.cssText=`font-size:11px;color:${nightMode ? '#aaa' : '#666'};margin-top:6px;`;
                        const date=uploadDate(file);
                        uploaded.textContent=(en() ? 'Uploaded: ' : '上传日期：') + (date ? new Date(date).toLocaleString(en() ? 'en' : 'zh-CN') : (en() ? 'Unknown' : '未知'));
                        const reference = document.createElement('div');reference.className='file-manager-references';
                        reference.style.cssText=`font-size:12px;overflow-wrap:anywhere;margin-top:6px;color:${nightMode ? '#ccc' : '#555'};`;
                        reference.textContent=en() ? 'Checking references…' : '正在检查引用…';
                        referenceLabels.set(file,reference);item.append(uploaded,reference);

                        // Events
                        const copyBtn = item.querySelector('.copy-btn');
                        (copyBtn as HTMLElement).onclick = () => {
                            let link = file.url;
                            if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)) {
                                link = `![${displayName}](${file.url})`;
                            } else {
                                link = `[${displayName}](${file.url})`;
                            }
                            navigator.clipboard.writeText(link).then(() => {
                                global.showMessage(t('linkCopied'), 'success');
                            });
                        };

                        const delBtn = item.querySelector('.del-btn');
                        (delBtn as HTMLElement).onclick = async () => {
                            if(!await g('customConfirm')(t('confirmDeleteFile').replace('{name}',displayName))) return;
                            try {await removeFile(file);global.showMessage(t('deleteSuccess'),'success');}
                            catch(error) {global.showMessage(error.message || t('deleteFailed'),'error');}
                        };

                        if (file.isLocal) {
                            const convertBtn = item.querySelector('.convert-btn');
                            (convertBtn as HTMLElement).onclick = async () => {
                                try {
                                    global.showMessage(isEn() ? 'Uploading...' : '正在上传...', 'info');
                                    
                                    let fileToUpload;
                                    
                                    if (file.source === 'indexedDB' && file.idbData) {
                                        const blob = new Blob([file.idbData.data], { type: file.idbData.contentType });
                                        const originalName = file.originalName || file.name;
                                        fileToUpload = new File([blob], originalName, { type: file.idbData.contentType });
                                    } else {
                                        const fetchUrl = file.url.includes(' ') ? encodeURI(file.url) : file.url;
                                        const response = await fetch(fetchUrl);
                                        const blob = await response.blob();
                                        fileToUpload = new File([blob], file.originalName || file.name, { type: file.type });
                                    }
                                    
                                    
                                    const cloudLink = await global.uploadFiles([fileToUpload], false);
                                    
                                    
                                    if (cloudLink) {
                                        const cloudUrl = cloudLink.match(/\((.*?)\)/)[1];
                                        if (g('vditor')) {
                                            const editorValue = g('vditor').getValue();
                                            const rawUrl = file.url;
                                            const encodedUrl = encodeURI(rawUrl);
                                            
                                            let newEditorValue = editorValue;
                                            const escapedRaw = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                            const escapedEncoded = encodedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                            
                                            newEditorValue = newEditorValue.replace(new RegExp(escapedRaw, 'g'), cloudUrl);
                                            if (escapedEncoded !== escapedRaw) {
                                                newEditorValue = newEditorValue.replace(new RegExp(escapedEncoded, 'g'), cloudUrl);
                                            }

                                            if (newEditorValue !== editorValue) {
                                                g('vditor').setValue(newEditorValue);
                                            }
                                        }

                                        if (file.source === 'indexedDB') {
                                            if (global.IndexedDBManager) {
                                                await global.IndexedDBManager.deleteFile(file.url);
                                            }
                                        } else {
                                            const locals = JSON.parse(localStorage.getItem('vditor_local_files') || '[]');
                                            const filtered = locals.filter(f => f.name !== file.name);
                                            localStorage.setItem('vditor_local_files', JSON.stringify(filtered));
                                        }
                                        
                                        global.showMessage(t('uploadSuccess') || '上传成功', 'success');
                                        modal.remove();
                                        showFileManager();
                                    }
                                } catch (err) {
                                    console.error('Conversion failed', err);
                                    global.showMessage(t('uploadFailed') || '上传失败', 'error');
                                }
                            };
                        }

                        list.appendChild(item);
                    });
                    fileListContainer.appendChild(list);
                }
                void collectQueryDocuments({includeEncrypted:true,signal:referenceAbort.signal},global).then(corpus => {
                    if(!modal.isConnected || g('currentUser') !== requestUser) return;
                    const references=findFileReferences(allFiles,corpus.documents);
                    for(const file of allFiles) {
                        const label=referenceLabels.get(file);if(!label) continue;
                        const names=references.get(file.url) || [];
                        label.textContent=names.length ? (en() ? 'Referenced in: ' : '引用文档：') + names.join('、') :
                            corpus.skipped.length ? (en() ? 'References unknown: some documents were unreadable' : '引用情况未确认：部分文档未能读取') : (en() ? 'Not referenced' : '未引用');
                    }
                }).catch(() => {
                    if(!modal.isConnected) return;
                    for(const label of referenceLabels.values()) label.textContent=en() ? 'Could not check references' : '引用情况未确认：文档读取失败';
                });
            } else {
                usageInfo.innerHTML = `<span style="color:#dc3545;">${t('loadFailed')}: ${result.message}</span>`;
            }
        } catch (err) {
            console.error(err);
            usageInfo.innerHTML = `<span style="color:#dc3545;">${t('loadError')}</span>`;
        }
    }

    global.showFileManager = showFileManager;

})(typeof window !== 'undefined' ? window : this);