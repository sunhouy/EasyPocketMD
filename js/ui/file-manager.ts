import { showResourcePreview } from './resource-preview';
import { bindFileTreeLongPress } from '../files/tree/details';
import { collectQueryDocuments } from './ai-query-files';
import { findFileReferences, uploadDate } from './file-references';
(function(global) {
    'use strict';

    function g<K extends keyof Window>(name: K): Window[K] { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }
    function t(key) { return window.i18n ? window.i18n.t(key) : key; }

    function formatSize(bytes) {
        if (!Number.isFinite(bytes) || bytes<=0) return '0 B';
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
        const blobUrls:string[]=[];
        const modal = document.createElement('div');modal.className='modal-overlay file-manager-overlay';
        const content=document.createElement('section');content.className='file-manager-page';content.setAttribute('role','dialog');content.setAttribute('aria-modal','true');
        const closeBtn=document.createElement('button');closeBtn.className='epmd-dialog-close';closeBtn.type='button';closeBtn.textContent='×';closeBtn.setAttribute('aria-label',en()?'Close':'关闭');
        const dismiss=()=>{referenceAbort.abort();modal.remove();blobUrls.forEach(url=>URL.revokeObjectURL(url));document.removeEventListener('keydown',escapePage);};
        const escapePage=(event:KeyboardEvent)=>{if(event.key==='Escape' && !document.querySelector('.resource-preview-overlay')) dismiss();};
        (modal as any).epmdCloseByBackPress=dismiss;closeBtn.onclick=dismiss;document.addEventListener('keydown',escapePage);
        const header=document.createElement('header');header.className='file-manager-heading';
        const title=document.createElement('h2');title.textContent=t('myFiles');header.append(title,closeBtn);content.append(header);
        const usageInfo=document.createElement('div');usageInfo.className='file-manager-usage';usageInfo.textContent=t('loading');content.append(usageInfo);
        const fileListContainer=document.createElement('div');fileListContainer.className='file-manager-scroll';content.append(fileListContainer);
        modal.append(content);document.body.append(modal);

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
                    usageInfo.textContent=(en()?'Used space: ':'已用空间：')+formatSize(result.totalSize)+' · '+(en()?allFiles.length+' files':'共 '+allFiles.length+' 个文件');
                };
                const selected = new Set<any>();
                const rows = new Map<any, HTMLElement>();
                const referenceLabels = new Map<any, HTMLElement>();
                const toolbar = document.createElement('div');
                toolbar.className = 'file-manager-selection';

                const selectionCount = document.createElement('span');
                const updateSelection = () => {
                    selectionCount.textContent = en() ? `${selected.size} selected` : `已选择 ${selected.size} 个`;
                    for (const [file,item] of rows) {
                        (item.querySelector('.file-manager-checkbox') as HTMLInputElement).checked = selected.has(file);
                        item.classList.toggle('selected',selected.has(file));
                    }
                    const all=rows.size>0 && selected.size===rows.size;const toggle=toolbar.querySelector<HTMLButtonElement>('[data-select-all]');if(toggle)toggle.textContent=en()?(all?'Deselect all':'Select all'):(all?'取消全选':'全选');
                    toolbar.querySelectorAll<HTMLButtonElement>('[data-selection-action]').forEach(button => button.disabled = !selected.size);
                };
                const action = (label: string, fn: () => void, needsSelection = false) => {
                    const button = document.createElement('button'); button.type = 'button';
                    button.className = 'file-manager-control'; button.textContent = label;
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
                const toggleAll=action(en() ? 'Select all' : '全选',() => {if(rows.size && selected.size===rows.size)selected.clear();else for(const file of rows.keys()) selected.add(file);updateSelection();});toggleAll.dataset.selectAll='';
                action(en() ? 'Copy selected links' : '复制所选链接',() => {
                    void navigator.clipboard.writeText([...selected].map(linkFor).join('\n')).then(() => global.showMessage(t('linkCopied'),'success')).catch(() => global.showMessage(en() ? 'Copy failed' : '复制失败','error'));
                },true);
                const deleteSelected=action(en() ? 'Delete selected' : '删除所选',() => {void (async () => {
                    const files = [...selected];
                    const confirmed = await g('customConfirm')(en() ? `Delete ${files.length} selected files? Referencing documents may lose these resources.` : `确定删除所选的 ${files.length} 个文件？引用这些资源的文档将无法再加载它们。`, {danger:true,confirmText:en()?'Delete':'删除'});
                    if(!confirmed) return;
                    let failed = 0;
                    for(const file of files) try {await removeFile(file);} catch {failed++;}
                    global.showMessage(failed ? (en() ? `${failed} files could not be deleted` : `${failed} 个文件删除失败`) : t('deleteSuccess'),failed ? 'error':'success');
                })();},true);
                deleteSelected.classList.add('danger');
                toolbar.append(selectionCount);content.insertBefore(toolbar,fileListContainer);updateSelection();

                renderUsage();

                // Render Files
                if (allFiles.length === 0) {
                    fileListContainer.textContent=t('noFiles');
                } else {
                    const list = document.createElement('div');
                    list.className='file-manager-grid';
                    
                    allFiles.forEach(file => {
                        const item = document.createElement('div');
                        item.className='file-manager-card';
                        const displayName=(file.originalName || file.name).replace(/^\d+_/,'');
                        const preview=document.createElement('div');preview.className='file-manager-preview';
                        const isImage=/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i.test(file.name) || file.type?.startsWith('image/');
                        if(isImage){
                            let imageUrl=file.thumbUrl || file.url;
                            if(file.source==='indexedDB' && file.idbData && global.IndexedDBManager){
                                imageUrl=global.IndexedDBManager.createBlobURL(file.idbData.data,file.idbData.contentType);blobUrls.push(imageUrl);
                            }
                            const image=document.createElement('img');image.src=imageUrl;image.alt=displayName;image.loading='lazy';preview.append(image);
                            const expand=async()=>{try{const source=file.source==='indexedDB'?imageUrl:file.url;const resolved=global.E2EAttachments?.encryptedUrl?.(source)?await global.E2EAttachments.load(source):source;if(modal.isConnected && g('currentUser')===requestUser)showResourcePreview(resolved,displayName);}catch(error){global.showMessage(en()?'Preview unavailable':'无法预览图片','error');}};
                            preview.ondblclick=()=>void expand();preview.tabIndex=0;preview.setAttribute('role','button');preview.setAttribute('aria-label',(en()?'View image: ':'查看图片：')+displayName);
                            preview.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void expand();}};
                            bindFileTreeLongPress(preview,()=>void expand(),'.file-manager-preview');
                        }else preview.innerHTML='<i class="fas fa-file-lines" aria-hidden="true"></i>';
                        const name=document.createElement('h3');name.textContent=displayName;name.title=displayName;
                        const size=document.createElement('span');size.className='file-manager-size';size.textContent=(file.isLocal?(en()?'Local · ':'本地 · '):(en()?'Cloud · ':'云端 · '))+formatSize(file.size);
                        const actions=document.createElement('div');actions.className='file-manager-card-actions';
                        actions.innerHTML='<button class="copy-btn" type="button">'+t('copy')+'</button><button class="del-btn" type="button">'+t('delete')+'</button>'+(file.isLocal?'<button class="convert-btn" type="button">'+t('convertToCloud')+'</button>':'');
                        item.append(preview,name,size,actions);

                        const checkbox = document.createElement('input');checkbox.type='checkbox';checkbox.className='file-manager-checkbox';
                        checkbox.setAttribute('aria-label',(en() ? 'Select ' : '选择 ') + displayName);

                        checkbox.onchange=() => {if(checkbox.checked) selected.add(file);else selected.delete(file);updateSelection();};
                        item.prepend(checkbox);rows.set(file,item);
                        const uploaded = document.createElement('div');
                        uploaded.className='file-manager-upload-date';
                        const date=uploadDate(file);
                        uploaded.textContent=(en() ? 'Uploaded: ' : '上传日期：') + (date ? new Date(date).toLocaleString(en() ? 'en' : 'zh-CN') : (en() ? 'Unknown' : '未知'));
                        const reference = document.createElement('div');reference.className='file-manager-references';

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
                            if(!await g('customConfirm')(t('confirmDeleteFile').replace('{name}',displayName), {danger:true,confirmText:en()?'Delete':'删除'})) return;
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
                                        dismiss();
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
                updateSelection();
                void collectQueryDocuments({includeEncrypted:true,signal:referenceAbort.signal},global).then(corpus => {
                    if(!modal.isConnected || g('currentUser') !== requestUser) return;
                    const references=findFileReferences(allFiles,corpus.documents);
                    for(const file of allFiles) {
                        const label=referenceLabels.get(file);if(!label) continue;
                        const names=references.get(file.url) || [];
                        label.replaceChildren();
                        if(names.length){
                            const caption=document.createElement('span');caption.textContent=en()?'Referenced in:':'引用文档：';label.append(caption);
                            for(const name of names){const link=document.createElement('button');link.type='button';link.className='file-reference-link';link.textContent=name;
                                link.onclick=async()=>{link.disabled=true;try{
                                    if(g('currentUser')!==requestUser)return;
                                    let document=(global.files || []).find(file=>file.name===name && file.type==='file');
                                    if(!document){await global.loadFilesFromServer?.();document=(global.files || []).find(file=>file.name===name && file.type==='file');}
                                    if(g('currentUser')!==requestUser || !modal.isConnected)return;
                                    if(!document)throw Error(en()?'Document is unavailable':'文档暂不可用');
                                    const openFile=global.openFile as ((id:string)=>Promise<unknown>);
                                    if(typeof openFile!=='function')throw Error(en()?'Document cannot be opened':'暂时无法打开文档');
                                    dismiss();await openFile(document.id);
                                }catch(error){global.showMessage((error as Error).message,'error');}finally{link.disabled=false;}};label.append(link);}
                        }else label.textContent=corpus.skipped.length?(en()?'References unknown: some documents were unreadable':'引用情况未确认：部分文档未能读取'):(en()?'Not referenced':'未引用');
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
