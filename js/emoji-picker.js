function showEmojiPicker() {
    function isEn() { return window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'en'; }

    // 表情分类
    const emojiCategories = {
        '常用': ['😀', '😁', '😂', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '😗', '😙', '😚', '🙂', '🤗', '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩', '🤯', '😬', '😰', '😱', '😳', '🤪', '😵', '😡', '😠', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🤠', '🤡', '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👹', '👺', '💀', '👻', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
        '手势': ['👏', '🙌', '👐', '🤲', '🤝', '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🖕', '✍️', '🙏'],
        '物品': ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🎮', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎'],
        '符号': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭']
    };

    // 常用表情中英文描述与别名，未配置项会自动使用分类描述兜底
    const emojiDescriptions = {
        '😀': { zh: '咧嘴笑', en: 'grinning face', aliases: ['smile', 'happy'] },
        '😁': { zh: '露齿笑', en: 'beaming smile', aliases: ['grin'] },
        '😂': { zh: '笑哭', en: 'face with tears of joy', aliases: ['lol', 'laugh'] },
        '🤣': { zh: '笑到打滚', en: 'rolling on the floor laughing', aliases: ['rofl'] },
        '😃': { zh: '开心笑', en: 'smiling face', aliases: ['happy'] },
        '😄': { zh: '眯眼笑', en: 'smiling eyes', aliases: ['smile'] },
        '😅': { zh: '苦笑', en: 'grinning with sweat', aliases: ['awkward'] },
        '😉': { zh: '眨眼', en: 'winking face', aliases: ['wink'] },
        '😊': { zh: '微笑', en: 'smiling face with blush', aliases: ['blush'] },
        '😋': { zh: '馋嘴', en: 'face savoring food', aliases: ['yummy'] },
        '😎': { zh: '墨镜笑', en: 'cool face', aliases: ['cool'] },
        '😍': { zh: '爱心眼', en: 'smiling with heart eyes', aliases: ['love'] },
        '😘': { zh: '飞吻', en: 'face blowing a kiss', aliases: ['kiss'] },
        '🙂': { zh: '轻微微笑', en: 'slightly smiling face', aliases: ['smile'] },
        '🤗': { zh: '拥抱', en: 'hugging face', aliases: ['hug'] },
        '🤔': { zh: '思考', en: 'thinking face', aliases: ['think'] },
        '😐': { zh: '无语', en: 'neutral face', aliases: ['neutral'] },
        '🙄': { zh: '白眼', en: 'face with rolling eyes', aliases: ['eyeroll'] },
        '😏': { zh: '得意', en: 'smirking face', aliases: ['smirk'] },
        '😔': { zh: '失落', en: 'pensive face', aliases: ['sad'] },
        '😢': { zh: '哭泣', en: 'crying face', aliases: ['cry'] },
        '😭': { zh: '大哭', en: 'loudly crying face', aliases: ['sob'] },
        '😤': { zh: '气呼呼', en: 'face with steam from nose', aliases: ['angry'] },
        '😡': { zh: '生气', en: 'pouting face', aliases: ['angry', 'mad'] },
        '🤬': { zh: '爆粗口', en: 'face with symbols on mouth', aliases: ['swear'] },
        '😱': { zh: '惊恐', en: 'screaming in fear', aliases: ['shock', 'scared'] },
        '😴': { zh: '睡觉', en: 'sleeping face', aliases: ['sleep'] },
        '😷': { zh: '戴口罩', en: 'face with medical mask', aliases: ['mask', 'sick'] },
        '🤒': { zh: '发烧', en: 'face with thermometer', aliases: ['fever'] },
        '🤮': { zh: '呕吐', en: 'face vomiting', aliases: ['vomit'] },
        '🤧': { zh: '打喷嚏', en: 'sneezing face', aliases: ['sneeze'] },
        '😇': { zh: '天使笑', en: 'smiling face with halo', aliases: ['angel'] },
        '🤡': { zh: '小丑', en: 'clown face', aliases: ['clown'] },
        '👻': { zh: '幽灵', en: 'ghost', aliases: ['ghost'] },
        '🤖': { zh: '机器人', en: 'robot', aliases: ['robot', 'ai'] },
        '💩': { zh: '便便', en: 'pile of poo', aliases: ['poo'] },
        '😺': { zh: '笑脸猫', en: 'grinning cat', aliases: ['cat'] },
        '😿': { zh: '哭泣猫', en: 'crying cat', aliases: ['cat', 'sad'] },
        '👏': { zh: '鼓掌', en: 'clapping hands', aliases: ['clap'] },
        '🙌': { zh: '举手欢呼', en: 'raising hands', aliases: ['hooray'] },
        '🤝': { zh: '握手', en: 'handshake', aliases: ['deal'] },
        '👍': { zh: '点赞', en: 'thumbs up', aliases: ['like', 'ok'] },
        '👎': { zh: '点踩', en: 'thumbs down', aliases: ['dislike'] },
        '👊': { zh: '拳头', en: 'oncoming fist', aliases: ['fist'] },
        '✌️': { zh: '剪刀手', en: 'victory hand', aliases: ['victory'] },
        '👌': { zh: 'OK 手势', en: 'ok hand', aliases: ['ok'] },
        '👈': { zh: '左指', en: 'backhand index pointing left', aliases: ['left'] },
        '👉': { zh: '右指', en: 'backhand index pointing right', aliases: ['right'] },
        '👆': { zh: '上指', en: 'backhand index pointing up', aliases: ['up'] },
        '👇': { zh: '下指', en: 'backhand index pointing down', aliases: ['down'] },
        '👋': { zh: '挥手', en: 'waving hand', aliases: ['wave', 'hello'] },
        '💪': { zh: '肌肉', en: 'flexed biceps', aliases: ['strong'] },
        '✍️': { zh: '写字', en: 'writing hand', aliases: ['write'] },
        '🙏': { zh: '祈祷', en: 'folded hands', aliases: ['pray', 'thanks'] },
        '📱': { zh: '手机', en: 'mobile phone', aliases: ['phone'] },
        '💻': { zh: '笔记本电脑', en: 'laptop', aliases: ['computer'] },
        '⌨️': { zh: '键盘', en: 'keyboard', aliases: ['typing'] },
        '🖱️': { zh: '鼠标', en: 'computer mouse', aliases: ['mouse'] },
        '🎮': { zh: '游戏手柄', en: 'video game', aliases: ['game'] },
        '📷': { zh: '相机', en: 'camera', aliases: ['photo'] },
        '📸': { zh: '拍照', en: 'camera with flash', aliases: ['snapshot'] },
        '📹': { zh: '摄像机', en: 'video camera', aliases: ['video'] },
        '📞': { zh: '电话', en: 'telephone receiver', aliases: ['call'] },
        '📺': { zh: '电视', en: 'television', aliases: ['tv'] },
        '📻': { zh: '收音机', en: 'radio', aliases: ['radio'] },
        '⏰': { zh: '闹钟', en: 'alarm clock', aliases: ['clock'] },
        '🔋': { zh: '电池', en: 'battery', aliases: ['power'] },
        '💡': { zh: '灯泡', en: 'light bulb', aliases: ['idea'] },
        '💰': { zh: '钱袋', en: 'money bag', aliases: ['money'] },
        '💳': { zh: '银行卡', en: 'credit card', aliases: ['card', 'pay'] },
        '💎': { zh: '钻石', en: 'gem stone', aliases: ['diamond'] },
        '❤️': { zh: '红心', en: 'red heart', aliases: ['love', 'heart'] },
        '💔': { zh: '心碎', en: 'broken heart', aliases: ['heartbreak'] },
        '💕': { zh: '双心', en: 'two hearts', aliases: ['love'] },
        '💯': { zh: '一百分', en: 'hundred points', aliases: ['100'] },
        '❌': { zh: '叉号', en: 'cross mark', aliases: ['x', 'no'] },
        '⭕': { zh: '圆圈', en: 'hollow red circle', aliases: ['circle', 'yes'] },
        '🛑': { zh: '停止', en: 'stop sign', aliases: ['stop'] },
        '🚫': { zh: '禁止', en: 'prohibited', aliases: ['forbidden'] }
    };

    function normalizeEmojiItems(category, list) {
        return list.map((emojiChar) => {
            const meta = emojiDescriptions[emojiChar] || {};
            const fallbackZh = `${category}表情`;
            const fallbackEn = `${category} emoji`;
            const aliases = Array.isArray(meta.aliases) ? meta.aliases : [];
            return {
                emoji: emojiChar,
                category,
                zh: meta.zh || fallbackZh,
                en: meta.en || fallbackEn,
                keywords: aliases
            };
        });
    }

    // 创建表情选择器界面
    const emojiSheet = document.createElement('div');
    emojiSheet.className = 'emoji-picker-modal';
    emojiSheet.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 2000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;

    const emojiContainer = document.createElement('div');
    emojiContainer.style.cssText = `
        background: ${(window.nightMode === true) ? '#2d2d2d' : 'white'};
        border-radius: 12px;
        padding: 20px;
        width: 90%;
        max-width: 620px;
        max-height: 82vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
    `;

    const title = document.createElement('div');
    title.textContent = isEn() ? 'Pick Emoji' : '选择表情';
    title.style.cssText = `
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 10px;
        text-align: center;
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
    `;
    emojiContainer.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = `
        position: absolute;
        top: 14px;
        right: 14px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: ${(window.nightMode === true) ? '#444' : '#f5f5f5'};
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
    `;
    emojiContainer.appendChild(closeBtn);

    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = isEn() ? 'Search emoji by name/keyword...' : '搜索表情（支持中英文关键词）...';
    searchBox.autofocus = false;
    searchBox.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 10px;
        border: 1px solid ${(window.nightMode === true) ? '#444' : '#ccc'};
        border-radius: 6px;
        font-size: 14px;
        background: ${(window.nightMode === true) ? '#222' : '#fafafa'};
        color: ${(window.nightMode === true) ? '#eee' : '#333'};
        outline: none;
        box-sizing: border-box;
    `;
    emojiContainer.appendChild(searchBox);

    const categoryTabs = document.createElement('div');
    categoryTabs.style.cssText = `
        display: flex;
        overflow-x: auto;
        padding: 8px 0;
        margin-bottom: 10px;
        border-bottom: 1px solid ${(window.nightMode === true) ? '#444' : '#eee'};
    `;
    emojiContainer.appendChild(categoryTabs);

    const emojiGrid = document.createElement('div');
    emojiGrid.id = 'emojiGrid';
    emojiGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 8px;
        padding: 10px 0;
        overflow-y: auto;
        max-height: 360px;
        flex: 1;
    `;
    emojiContainer.appendChild(emojiGrid);

    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
        display: flex;
        justify-content: flex-end;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid ${(window.nightMode === true) ? '#444' : '#eee'};
    `;

    const insertBtn = document.createElement('button');
    insertBtn.textContent = isEn() ? 'Insert Emoji' : '插入选中的表情';
    insertBtn.style.cssText = `
        padding: 10px 20px;
        background: #4a90e2;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
    `;

    bottomBar.appendChild(insertBtn);
    emojiContainer.appendChild(bottomBar);
    emojiSheet.appendChild(emojiContainer);
    document.body.appendChild(emojiSheet);

    let selectedEmojiItem = null;
    let searchActive = false;

    function setTabActiveStyles(tab) {
        document.querySelectorAll('.emoji-tab').forEach((t) => {
            t.style.background = (window.nightMode === true) ? '#444' : '#f5f5f5';
            t.style.color = (window.nightMode === true) ? '#eee' : '#333';
            t.style.fontWeight = 'normal';
        });
        tab.style.background = '#4a90e2';
        tab.style.color = 'white';
        tab.style.fontWeight = '600';
    }

    function renderCategoryTabs() {
        categoryTabs.innerHTML = '';
        if (searchActive) {
            const tab = document.createElement('button');
            tab.textContent = isEn() ? 'Search Results' : '搜索结果';
            tab.className = 'emoji-tab';
            tab.style.cssText = `
                padding: 8px 12px;
                margin-right: 10px;
                border: none;
                background: #4a90e2;
                color: white;
                border-radius: 20px;
                white-space: nowrap;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
            `;
            categoryTabs.appendChild(tab);
            return;
        }

        Object.keys(emojiCategories).forEach((category) => {
            const tab = document.createElement('button');
            tab.textContent = category;
            tab.className = 'emoji-tab';
            tab.style.cssText = `
                padding: 8px 12px;
                margin-right: 10px;
                border: none;
                background: ${(window.nightMode === true) ? '#444' : '#f5f5f5'};
                border-radius: 20px;
                white-space: nowrap;
                cursor: pointer;
                color: ${(window.nightMode === true) ? '#eee' : '#333'};
                font-size: 12px;
            `;
            tab.addEventListener('click', () => {
                setTabActiveStyles(tab);
                showEmojiCategory(category);
            });
            categoryTabs.appendChild(tab);
        });
    }

    function renderEmojiGrid(items) {
        emojiGrid.innerHTML = '';
        selectedEmojiItem = null;
        window.selectedEmojiItem = null;

        if (!items || items.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'text-align:center;color:#888;padding:30px 0;grid-column: 1/-1;';

            const titleText = document.createElement('div');
            titleText.textContent = isEn() ? 'No matching emoji found.' : '没有找到匹配的表情';
            titleText.style.cssText = 'margin-bottom: 8px;';
            emptyMsg.appendChild(titleText);

            const keyword = searchBox.value.trim();
            if (keyword) {
                const aiLink = document.createElement('a');
                aiLink.href = 'javascript:void(0)';
                aiLink.textContent = isEn() ? 'Try AI Search' : '试试AI搜索';
                aiLink.style.cssText = 'color:#4a90e2;text-decoration:underline;cursor:pointer;font-size:14px;';
                aiLink.addEventListener('click', () => {
                    performEmojiAISearch(keyword);
                });
                emptyMsg.appendChild(aiLink);
            }

            emojiGrid.appendChild(emptyMsg);
            return;
        }

        items.forEach((item) => {
            const emojiBtn = document.createElement('button');
            emojiBtn.style.cssText = `
                padding: 10px 6px;
                border: 2px solid transparent;
                background: none;
                cursor: pointer;
                border-radius: 8px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                min-height: 78px;
            `;
            emojiBtn.innerHTML = `
                <div style="font-size:24px;line-height:1.2;">${item.emoji}</div>
                <div style="font-size:10px;color:${(window.nightMode === true) ? '#cfcfcf' : '#555'};margin-top:4px;line-height:1.1;">${item.zh}</div>
                <div style="font-size:10px;color:${(window.nightMode === true) ? '#aaa' : '#777'};line-height:1.1;">${item.en}</div>
            `;
            emojiBtn.title = `${item.zh} / ${item.en}`;

            emojiBtn.addEventListener('click', () => {
                document.querySelectorAll('#emojiGrid button').forEach((btn) => {
                    btn.style.borderColor = 'transparent';
                    btn.style.background = 'none';
                });
                emojiBtn.style.borderColor = '#4a90e2';
                emojiBtn.style.background = (window.nightMode === true) ? 'rgba(74, 144, 226, 0.2)' : 'rgba(74, 144, 226, 0.1)';
                selectedEmojiItem = item;
                window.selectedEmojiItem = item;
            });

            emojiBtn.addEventListener('mouseenter', function() {
                if (selectedEmojiItem !== item) {
                    this.style.background = (window.nightMode === true) ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                }
            });

            emojiBtn.addEventListener('mouseleave', function() {
                if (selectedEmojiItem !== item) {
                    this.style.background = 'none';
                }
            });

            emojiGrid.appendChild(emojiBtn);
        });
    }

    function showEmojiCategory(category) {
        const items = normalizeEmojiItems(category, emojiCategories[category]);
        renderEmojiGrid(items);
    }

    function findEmojiMatches(query) {
        const q = query.trim().toLowerCase();
        if (!q) {
            return [];
        }

        const results = [];
        Object.entries(emojiCategories).forEach(([category, list]) => {
            const items = normalizeEmojiItems(category, list);
            items.forEach((item) => {
                const joined = [
                    item.emoji,
                    item.category,
                    item.zh,
                    item.en,
                    ...item.keywords
                ].join(' ').toLowerCase();
                if (joined.includes(q)) {
                    results.push(item);
                }
            });
        });
        return results;
    }

    searchBox.addEventListener('input', function() {
        const query = this.value.trim();
        if (!query) {
            searchActive = false;
            renderCategoryTabs();
            const firstTab = categoryTabs.querySelector('.emoji-tab');
            if (firstTab) {
                firstTab.click();
            }
            return;
        }

        searchActive = true;
        renderCategoryTabs();
        renderEmojiGrid(findEmojiMatches(query));
    });

    function getSelectedEmojiItem() {
        if (selectedEmojiItem) {
            return selectedEmojiItem;
        }
        if (window.selectedEmojiItem) {
            return window.selectedEmojiItem;
        }
        return null;
    }

    insertBtn.addEventListener('click', () => {
        const picked = getSelectedEmojiItem();
        if (picked && window.vditor) {
            window.vditor.insertValue(picked.emoji);
            closeEmojiPicker();
            showMessage(isEn() ? 'Emoji inserted' : '表情已插入');
        } else {
            showMessage(isEn() ? 'Please select an emoji first' : '请先选择一个表情', 'error');
        }
    });

    closeBtn.addEventListener('click', closeEmojiPicker);

    emojiSheet.addEventListener('click', (e) => {
        if (e.target === emojiSheet) {
            closeEmojiPicker();
        }
    });

    function closeEmojiPicker() {
        document.removeEventListener('keydown', handleKeydown);
        if (emojiSheet.parentNode) {
            emojiSheet.parentNode.removeChild(emojiSheet);
        }
        window.selectedEmojiItem = null;
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            closeEmojiPicker();
        }
    }
    document.addEventListener('keydown', handleKeydown);

    renderCategoryTabs();
    const firstTab = categoryTabs.querySelector('.emoji-tab');
    if (firstTab) {
        firstTab.click();
    }
}

// AI搜索表情
async function performEmojiAISearch(keyword) {
    function isEn() { return window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'en'; }

    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) {
        return;
    }

    emojiGrid.innerHTML = '';

    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'text-align:center;padding:40px 0;grid-column: 1/-1;';
    loadingDiv.innerHTML = `
        <div style="margin-bottom:15px;"><i class="fas fa-magic" style="font-size:32px;color:#4a90e2;"></i></div>
        <div style="color:#4a90e2;font-size:14px;">${isEn() ? 'AI is searching emoji...' : 'AI搜索表情中...'}</div>
    `;
    emojiGrid.appendChild(loadingDiv);

    try {
        const apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/ai/emoji';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (window.currentUser ? (window.currentUser.token || window.currentUser.username) : '')
            },
            body: JSON.stringify({
                keyword,
                language: isEn() ? 'en' : 'zh'
            })
        });

        const result = await response.json();
        if (result.code === 200 && result.data) {
            const items = parseAIEmojiResponse(result.data);
            if (items.length > 0) {
                renderAIEmojiResults(items);
            } else {
                showAINoEmojiResult();
            }
        } else {
            showAIEmojiError(result.message || (isEn() ? 'AI search failed' : 'AI搜索失败'));
        }
    } catch (error) {
        console.error('AI emoji search error:', error);
        showAIEmojiError(isEn() ? 'Network error, please try again' : '网络错误，请重试');
    }
}

function parseAIEmojiResponse(aiResponse) {
    const rows = [];

    try {
        const parsed = JSON.parse(aiResponse);
        if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
                const emoji = item.emoji || item.char || item.symbol || '';
                if (!emoji) {
                    return;
                }
                rows.push({
                    emoji,
                    zh: item.zh || item.chinese || item.nameZh || 'AI推荐表情',
                    en: item.en || item.english || item.nameEn || 'AI emoji',
                    keywords: Array.isArray(item.keywords) ? item.keywords : []
                });
            });
            return rows;
        }
    } catch (e) {
        // 非JSON格式，继续按文本解析
    }

    const lines = aiResponse.split('\n').map((line) => line.trim()).filter(Boolean);
    lines.forEach((line) => {
        if (line.startsWith('[') || line.startsWith('{')) {
            return;
        }
        const parts = line.split('|').map((part) => part.trim());
        if (parts.length >= 3) {
            rows.push({
                emoji: parts[0],
                en: parts[1],
                zh: parts[2],
                keywords: []
            });
        } else if (parts.length === 2) {
            rows.push({
                emoji: parts[0],
                en: parts[1],
                zh: 'AI推荐表情',
                keywords: []
            });
        }
    });
    return rows.filter((row) => row.emoji);
}

function renderAIEmojiResults(items) {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) {
        return;
    }

    emojiGrid.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'grid-column:1/-1;padding:10px 0;border-bottom:1px solid #eee;margin-bottom:10px;';
    header.innerHTML = '<span style="color:#4a90e2;font-weight:bold;">AI搜索结果</span>';
    emojiGrid.appendChild(header);

    items.forEach((item) => {
        const btn = document.createElement('button');
        btn.style.cssText = `
            padding: 10px 6px;
            border: 2px solid transparent;
            background: none;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            min-height: 78px;
        `;
        btn.innerHTML = `
            <div style="font-size:24px;line-height:1.2;">${item.emoji}</div>
            <div style="font-size:10px;color:${(window.nightMode === true) ? '#cfcfcf' : '#555'};margin-top:4px;line-height:1.1;">${item.zh || 'AI推荐表情'}</div>
            <div style="font-size:10px;color:${(window.nightMode === true) ? '#aaa' : '#777'};line-height:1.1;">${item.en || 'AI emoji'}</div>
        `;

        btn.addEventListener('click', () => {
            document.querySelectorAll('#emojiGrid button').forEach((node) => {
                node.style.borderColor = 'transparent';
                node.style.background = 'none';
            });
            btn.style.borderColor = '#4a90e2';
            btn.style.background = (window.nightMode === true) ? 'rgba(74, 144, 226, 0.2)' : 'rgba(74, 144, 226, 0.1)';
            window.selectedEmojiItem = item;
        });
        emojiGrid.appendChild(btn);
    });
}

function showAINoEmojiResult() {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) {
        return;
    }
    emojiGrid.innerHTML = '';
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'text-align:center;color:#888;padding:30px 0;grid-column: 1/-1;';
    emptyMsg.innerHTML = '<div style="margin-bottom:10px;">AI未找到匹配的表情</div><div style="font-size:12px;color:#aaa;">请尝试其他关键词</div>';
    emojiGrid.appendChild(emptyMsg);
}

function showAIEmojiError(message) {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) {
        return;
    }
    emojiGrid.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align:center;color:#dc3545;padding:30px 0;grid-column: 1/-1;';
    errorDiv.innerHTML = `
        <div style="margin-bottom:10px;"><i class="fas fa-exclamation-circle"></i></div>
        <div>${message}</div>
    `;
    emojiGrid.appendChild(errorDiv);
}

// 导出函数到全局对象
if (typeof window !== 'undefined') {
    window.showEmojiPicker = showEmojiPicker;
}