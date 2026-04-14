#include "text_engine.h"

#include <algorithm>
#include <cctype>
#include <initializer_list>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace {

struct CommandItem {
    std::string id;
    std::string groupId;
    std::string titleZh;
    std::string titleEn;
    std::string descriptionZh;
    std::string descriptionEn;
    std::string action;
    std::string icon;
    std::string insertText;
    std::vector<std::string> aliases;
    std::vector<std::string> keywords;
    bool hidden;
    int priority;
};

struct RankedItem {
    const CommandItem* item;
    int score;
    std::string matchedField;
};

std::string jsonEscape(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 8);
    for (char ch : value) {
        switch (ch) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(ch) < 0x20) {
                    const char* hex = "0123456789abcdef";
                    out += "\\u00";
                    out += hex[(static_cast<unsigned char>(ch) >> 4) & 0x0f];
                    out += hex[static_cast<unsigned char>(ch) & 0x0f];
                } else {
                    out += ch;
                }
        }
    }
    return out;
}

std::string trimAscii(const std::string& input) {
    size_t start = 0;
    while (start < input.size() && std::isspace(static_cast<unsigned char>(input[start]))) {
        ++start;
    }

    if (start >= input.size()) return "";

    size_t end = input.size();
    while (end > start && std::isspace(static_cast<unsigned char>(input[end - 1]))) {
        --end;
    }

    return input.substr(start, end - start);
}

std::string toAsciiLower(const std::string& input) {
    std::string out = input;
    for (size_t i = 0; i < out.size(); ++i) {
        unsigned char ch = static_cast<unsigned char>(out[i]);
        if (ch >= 'A' && ch <= 'Z') {
            out[i] = static_cast<char>(ch - 'A' + 'a');
        }
    }
    return out;
}

std::string normalizeSearchText(const std::string& input) {
    return trimAscii(toAsciiLower(input));
}

bool containsText(const std::string& haystack, const std::string& needle) {
    if (needle.empty()) return true;
    return haystack.find(needle) != std::string::npos;
}

std::vector<std::string> splitTerms(const std::string& query) {
    std::vector<std::string> terms;
    std::string current;
    int lastClass = 0;

    auto flush = [&]() {
        std::string cleaned = normalizeSearchText(current);
        if (!cleaned.empty()) {
            terms.push_back(cleaned);
        }
        current.clear();
        lastClass = 0;
    };

    for (size_t i = 0; i < query.size(); ++i) {
        unsigned char ch = static_cast<unsigned char>(query[i]);
        int currentClass = 0;
        if (std::isalnum(ch) || ch == '_') {
            currentClass = 1;
        } else if (ch >= 0x80) {
            currentClass = 2;
        }

        if (currentClass == 0) {
            flush();
            continue;
        }

        if (lastClass != 0 && currentClass != lastClass) {
            flush();
        }

        lastClass = currentClass;
        if (std::isalnum(ch) || ch == '_' || ch >= 0x80) {
            current.push_back(static_cast<char>(ch));
        } else {
            flush();
        }
    }

    flush();
    if (terms.empty()) {
        std::string cleaned = normalizeSearchText(query);
        if (!cleaned.empty()) terms.push_back(cleaned);
    }
    return terms;
}

std::string compactSearchText(const std::string& input) {
    const std::string normalized = normalizeSearchText(input);
    std::string compact;
    compact.reserve(normalized.size());

    for (size_t i = 0; i < normalized.size(); ++i) {
        unsigned char ch = static_cast<unsigned char>(normalized[i]);
        if (std::isalnum(ch) || ch == '_' || ch >= 0x80) {
            compact.push_back(static_cast<char>(ch));
        }
    }

    return compact;
}

bool containsCompactText(const std::string& haystack, const std::string& needle) {
    if (needle.empty()) return true;
    if (containsText(haystack, needle)) return true;

    const std::string compactNeedle = compactSearchText(needle);
    if (compactNeedle.empty()) return false;

    const std::string compactHaystack = compactSearchText(haystack);
    return compactHaystack.find(compactNeedle) != std::string::npos;
}

std::string groupLabel(const std::string& groupId, const std::string& language) {
    const bool isEn = normalizeSearchText(language) == "en";
    if (groupId == "file") return isEn ? "Files" : "文件";
    if (groupId == "auth") return isEn ? "Account" : "登录";
    if (groupId == "insert") return isEn ? "Insert" : "插入";
    if (groupId == "math") return isEn ? "Formula" : "公式";
    if (groupId == "chart") return isEn ? "Chart" : "图表";
    if (groupId == "edit") return isEn ? "Edit" : "编辑";
    if (groupId == "settings") return isEn ? "Settings" : "设置";
    if (groupId == "export") return isEn ? "Export" : "导出";
    if (groupId == "more") return isEn ? "More" : "更多";
    return isEn ? "General" : "常用";
}

int groupPriority(const std::string& groupId) {
    if (groupId == "file") return 900;
    if (groupId == "insert") return 880;
    if (groupId == "math") return 860;
    if (groupId == "chart") return 840;
    if (groupId == "edit") return 820;
    if (groupId == "auth") return 800;
    if (groupId == "settings") return 780;
    if (groupId == "export") return 760;
    if (groupId == "more") return 740;
    return 700;
}

CommandItem makeCommand(
    const char* id,
    const char* groupId,
    int priority,
    const char* titleZh,
    const char* titleEn,
    const char* descriptionZh,
    const char* descriptionEn,
    const char* action,
    const char* icon,
    const char* insertText,
    bool hidden,
    std::initializer_list<const char*> aliases,
    std::initializer_list<const char*> keywords
) {
    CommandItem item;
    item.id = id;
    item.groupId = groupId;
    item.titleZh = titleZh;
    item.titleEn = titleEn;
    item.descriptionZh = descriptionZh;
    item.descriptionEn = descriptionEn;
    item.action = action;
    item.icon = icon;
    item.insertText = insertText;
    item.hidden = hidden;
    item.priority = priority;
    for (std::initializer_list<const char*>::const_iterator it = aliases.begin(); it != aliases.end(); ++it) {
        item.aliases.push_back(*it);
    }
    for (std::initializer_list<const char*>::const_iterator it = keywords.begin(); it != keywords.end(); ++it) {
        item.keywords.push_back(*it);
    }
    return item;
}

const std::vector<CommandItem>& commandCatalog() {
    static const std::vector<CommandItem> catalog = []() {
        std::vector<CommandItem> items;
        items.reserve(120);

        items.push_back(makeCommand("fileList", "file", 1000, "文件列表", "File List", "打开文件列表面板", "Open the file list panel", "openFileList", "fas fa-folder-open", "", false, {"文件列表", "我的文件", "文件", "文档", "file list", "files", "open files", "documents"}, {"file", "list", "folder", "document", "文件", "文档"}));
        items.push_back(makeCommand("fileListHelp", "file", 997, "文件列表帮助", "File List Help", "查看文件列表功能说明", "Show file list usage help", "showFileListHelp", "fas fa-circle-question", "", false, {"文件列表帮助", "文件帮助", "file list help"}, {"file", "help", "list"}));
        items.push_back(makeCommand("fileManager", "file", 995, "文件管理", "File Manager", "打开文件管理器", "Open file manager", "showFileManager", "fas fa-folder-tree", "", false, {"文件管理", "管理文件", "file manager", "manage files"}, {"file", "manager", "管理"}));
        items.push_back(makeCommand("newFile", "file", 990, "新建文件", "New File", "创建一个新的 Markdown 文件", "Create a new Markdown file", "newFile", "fas fa-file-circle-plus", "", false, {"新建文件", "new file", "create file", "add file"}, {"file", "new", "create"}));
        items.push_back(makeCommand("newFolder", "file", 980, "新建文件夹", "New Folder", "创建一个新的文件夹", "Create a new folder", "newFolder", "fas fa-folder-plus", "", false, {"新建文件夹", "new folder", "add folder"}, {"folder", "new"}));
        items.push_back(makeCommand("fileHistory", "file", 970, "历史版本", "History", "查看当前文件的历史版本", "View the current file history", "openHistory", "fas fa-clock-rotate-left", "", false, {"历史版本", "history", "versions"}, {"history", "version", "backup"}));
        items.push_back(makeCommand("renameFile", "file", 965, "重命名", "Rename", "重命名当前文件", "Rename the current file", "renameFile", "fas fa-i-cursor", "", false, {"重命名", "rename"}, {"name", "title"}));
        items.push_back(makeCommand("moveFile", "file", 960, "移动文件", "Move File", "将当前文件移动到其他位置", "Move the current file to another location", "moveFile", "fas fa-arrows-up-down-left-right", "", false, {"移动文件", "move file", "move"}, {"move", "folder", "path"}));
        items.push_back(makeCommand("deleteFile", "file", 955, "删除文件", "Delete File", "删除当前文件", "Delete the current file", "deleteFile", "fas fa-trash-can", "", false, {"删除文件", "delete file", "remove file"}, {"delete", "remove"}));
        items.push_back(makeCommand("openLocalFile", "file", 950, "打开本地文件", "Open Local File", "从本地磁盘打开 Markdown 文件", "Open a Markdown file from disk", "openLocalFile", "fas fa-folder-open", "", false, {"打开本地文件", "本地文件", "open local file", "local file"}, {"open", "local", "file", "本地"}));
        items.push_back(makeCommand("fileDiff", "file", 945, "文件对比", "File Diff", "对比两个文件的差异", "Compare two files", "openDiff", "fas fa-code-compare", "", false, {"文件对比", "compare", "diff"}, {"diff", "compare"}));

        items.push_back(makeCommand("login", "auth", 940, "登录", "Login", "登录后同步到服务器", "Log in to sync with the server", "login", "fas fa-right-to-bracket", "", false, {"登录", "login", "sign in"}, {"login", "account", "user"}));
        items.push_back(makeCommand("register", "auth", 935, "注册", "Register", "创建新账号", "Create a new account", "register", "fas fa-user-plus", "", false, {"注册", "register", "sign up"}, {"register", "account", "user"}));
        items.push_back(makeCommand("logout", "auth", 930, "退出登录", "Logout", "退出当前账号", "Log out of the current account", "logout", "fas fa-right-from-bracket", "", false, {"退出登录", "logout", "sign out"}, {"logout", "account", "user"}));

        items.push_back(makeCommand("heading1", "insert", 920, "标题1", "Heading 1", "插入一级标题", "Insert a level 1 heading", "insertHeading1", "fas fa-heading", "# ", false, {"标题1", "h1", "heading 1", "heading"}, {"heading", "title", "format"}));
        items.push_back(makeCommand("insertPanel", "insert", 918, "插入面板", "Insert Panel", "打开插入菜单", "Open insert panel", "showInsertPicker", "fas fa-plus", "", false, {"插入", "插入面板", "insert", "insert panel"}, {"insert", "panel", "menu"}));
        items.push_back(makeCommand("heading2", "insert", 915, "标题2", "Heading 2", "插入二级标题", "Insert a level 2 heading", "insertHeading2", "fas fa-heading", "## ", false, {"标题2", "h2", "heading 2", "heading"}, {"heading", "title", "format"}));
        items.push_back(makeCommand("heading3", "insert", 910, "标题3", "Heading 3", "插入三级标题", "Insert a level 3 heading", "insertHeading3", "fas fa-heading", "### ", false, {"标题3", "h3", "heading 3", "heading"}, {"heading", "title", "format"}));
        items.push_back(makeCommand("bold", "insert", 905, "粗体", "Bold", "插入粗体文本", "Insert bold text", "insertBold", "fas fa-bold", "**粗体文字**", false, {"粗体", "bold"}, {"bold", "format"}));
        items.push_back(makeCommand("italic", "insert", 900, "斜体", "Italic", "插入斜体文本", "Insert italic text", "insertItalic", "fas fa-italic", "*斜体文字*", false, {"斜体", "italic"}, {"italic", "format"}));
        items.push_back(makeCommand("strikethrough", "insert", 895, "删除线", "Strikethrough", "插入删除线文本", "Insert strikethrough text", "insertStrikethrough", "fas fa-strikethrough", "~~删除线文字~~", false, {"删除线", "strikethrough", "strike"}, {"strike", "format"}));
        items.push_back(makeCommand("codeBlock", "insert", 890, "代码块", "Code Block", "插入代码块", "Insert a code block", "insertCodeBlock", "fas fa-code", "```\n代码块\n```", false, {"代码块", "code block", "code"}, {"code", "format"}));
        items.push_back(makeCommand("inlineCode", "insert", 885, "行内代码", "Inline Code", "插入行内代码", "Insert inline code", "insertInlineCode", "fas fa-terminal", "`行内代码`", false, {"行内代码", "inline code", "code"}, {"inline", "code"}));
        items.push_back(makeCommand("quote", "insert", 880, "引用", "Quote", "插入引用块", "Insert a quote block", "insertQuote", "fas fa-quote-right", "> 引用文字", false, {"引用", "quote"}, {"quote", "block"}));
        items.push_back(makeCommand("link", "insert", 875, "链接", "Link", "插入链接", "Insert a link", "insertLink", "fas fa-link", "[链接文字](https://)", false, {"链接", "link"}, {"link", "url"}));
        items.push_back(makeCommand("image", "insert", 870, "图片", "Image", "上传并插入图片", "Upload and insert an image", "uploadImage", "fas fa-image", "", false, {"图片", "image", "picture"}, {"image", "upload", "media"}));
        items.push_back(makeCommand("file", "insert", 865, "文件", "File", "上传并插入文件", "Upload and insert a file", "uploadFile", "fas fa-file-upload", "", false, {"文件", "file", "attachment"}, {"file", "upload"}));
        items.push_back(makeCommand("webImage", "insert", 860, "网络图片", "Web Image", "插入网络图片", "Insert an image by URL", "insertWebImage", "fas fa-globe", "![图片描述](图片地址)", false, {"网络图片", "web image", "image url"}, {"web", "image", "url"}));
        items.push_back(makeCommand("table", "insert", 855, "表格", "Table", "插入表格", "Insert a table", "insertTable", "fas fa-table", "", false, {"表格", "table"}, {"table", "grid"}));
        items.push_back(makeCommand("unorderedList", "insert", 850, "无序列表", "Unordered List", "插入无序列表", "Insert an unordered list", "insertUnorderedList", "fas fa-list-ul", "- 列表项", false, {"无序列表", "unordered list", "bullet list"}, {"list", "bullet"}));
        items.push_back(makeCommand("orderedList", "insert", 845, "有序列表", "Ordered List", "插入有序列表", "Insert an ordered list", "insertOrderedList", "fas fa-list-ol", "1. 列表项", false, {"有序列表", "ordered list", "numbered list"}, {"list", "number"}));
        items.push_back(makeCommand("taskList", "insert", 840, "任务列表", "Task List", "插入任务列表", "Insert a task list", "insertTaskList", "fas fa-tasks", "- [ ] 任务项", false, {"任务列表", "task list", "todo"}, {"task", "todo"}));
        items.push_back(makeCommand("divider", "insert", 835, "分隔线", "Divider", "插入分隔线", "Insert a divider", "insertDivider", "fas fa-minus", "\n---\n", false, {"分隔线", "divider", "separator"}, {"divider", "separator"}));
        items.push_back(makeCommand("emoji", "insert", 830, "表情", "Emoji", "插入表情", "Insert an emoji", "showEmojiPicker", "fas fa-smile", "", false, {"表情", "emoji"}, {"emoji", "smile"}));
        items.push_back(makeCommand("footnote", "insert", 825, "脚注", "Footnote", "插入脚注", "Insert a footnote", "showFootnotePicker", "fas fa-sticky-note", "", false, {"脚注", "footnote", "note"}, {"footnote", "note"}));
        items.push_back(makeCommand("mindMap", "insert", 820, "脑图", "Mind Map", "插入思维导图", "Insert a mind map", "showMindmapPicker", "fas fa-brain", "", false, {"脑图", "mind map", "mindmap", "思维导图"}, {"mind", "map"}));

        // 公式分类和常用公式
        items.push_back(makeCommand("formula", "math", 815, "公式", "Formula", "打开公式面板", "Open the formula panel", "showFormulaPicker", "fas fa-superscript", "", false, {"公式", "数学公式", "formula", "latex"}, {"formula", "latex", "math"}));
        items.push_back(makeCommand("inlineFormula", "math", 810, "行内公式", "Inline Formula", "插入行内公式", "Insert an inline formula", "insertInlineFormula", "fas fa-superscript", "$x^2$", false, {"行内公式", "inline formula", "formula inline"}, {"inline", "formula"}));
        items.push_back(makeCommand("blockFormula", "math", 805, "块级公式", "Block Formula", "插入块级公式", "Insert a block formula", "insertBlockFormula", "fas fa-square-root-variable", "$$\nE=mc^2\n$$", false, {"块级公式", "block formula", "display formula"}, {"block", "formula"}));
        
        // 常用数学符号
        items.push_back(makeCommand("formulaPlus", "math", 800, "加号", "Plus", "插入加号", "Insert plus sign", "insertInlineFormula", "fas fa-plus", "$+$", false, {"加号", "plus", "add", "jia"}, {"formula", "math", "symbol"}));
        items.push_back(makeCommand("formulaMinus", "math", 799, "减号", "Minus", "插入减号", "Insert minus sign", "insertInlineFormula", "fas fa-minus", "$-$", false, {"减号", "minus", "subtract", "jian"}, {"formula", "math", "symbol"}));
        items.push_back(makeCommand("formulaTimes", "math", 798, "乘号", "Times", "插入乘号", "Insert times sign", "insertInlineFormula", "fas fa-times", "$\\times$", false, {"乘号", "times", "multiply", "cheng"}, {"formula", "math", "symbol"}));
        items.push_back(makeCommand("formulaDivide", "math", 797, "除号", "Divide", "插入除号", "Insert divide sign", "insertInlineFormula", "fas fa-divide", "$\\div$", false, {"除号", "divide", "chu"}, {"formula", "math", "symbol"}));
        items.push_back(makeCommand("formulaEqual", "math", 796, "等号", "Equal", "插入等号", "Insert equal sign", "insertInlineFormula", "fas fa-equals", "$= $", false, {"等号", "equal", "dengyu"}, {"formula", "math", "symbol"}));
        items.push_back(makeCommand("formulaPi", "math", 795, "圆周率", "Pi", "插入圆周率符号", "Insert pi symbol", "insertInlineFormula", "fas fa-circle-dot", "$\\pi$", false, {"圆周率", "pi", "pai"}, {"formula", "math", "constant"}));
        items.push_back(makeCommand("formulaInfinity", "math", 794, "无穷大", "Infinity", "插入无穷大符号", "Insert infinity symbol", "insertInlineFormula", "fas fa-infinity", "$\\infty$", false, {"无穷大", "infinity", "wuqiong"}, {"formula", "math", "symbol"}));
        items.push_back(makeCommand("formulaSum", "math", 793, "求和", "Sum", "插入求和符号", "Insert sum symbol", "insertInlineFormula", "fas fa-sigma", "$\\sum$", false, {"求和", "sum", "qiuhe"}, {"formula", "math", "operator"}));
        items.push_back(makeCommand("formulaIntegral", "math", 792, "积分", "Integral", "插入积分符号", "Insert integral symbol", "insertInlineFormula", "fas fa-integral", "$\\int$", false, {"积分", "integral", "jifen"}, {"formula", "math", "operator"}));
        
        // 图表类型
        items.push_back(makeCommand("chart", "chart", 790, "图表", "Chart", "打开图表面板", "Open the chart panel", "showChartPicker", "fas fa-chart-bar", "", false, {"图表", "图形", "chart"}, {"chart", "mermaid", "echarts", "diagram"}));
        items.push_back(makeCommand("mermaid", "chart", 785, "Mermaid 图表", "Mermaid Chart", "插入 Mermaid 图表", "Insert a Mermaid chart", "insertMermaid", "fas fa-diagram-project", "", false, {"mermaid", "流程图", "graph"}, {"mermaid", "diagram"}));
        items.push_back(makeCommand("eCharts", "chart", 780, "ECharts 图表", "ECharts Chart", "打开 ECharts 图表面板", "Open the ECharts chart panel", "showEChartsPicker", "fas fa-chart-line", "", false, {"echarts", "ECharts", "图表"}, {"echarts", "chart"}));
        
        // Mermaid 图表类型
        items.push_back(makeCommand("chartFlowchart", "chart", 775, "流程图", "Flowchart", "插入流程图", "Insert a flowchart", "insertMermaid", "fas fa-sitemap", "", false, {"流程图", "flowchart", "flow"}, {"mermaid", "diagram", "flow"}));
        items.push_back(makeCommand("chartSequence", "chart", 774, "序列图", "Sequence Diagram", "插入序列图", "Insert a sequence diagram", "insertMermaid", "fas fa-exchange-alt", "", false, {"序列图", "sequence", "时序图"}, {"mermaid", "diagram", "sequence"}));
        items.push_back(makeCommand("chartClass", "chart", 773, "类图", "Class Diagram", "插入类图", "Insert a class diagram", "insertMermaid", "fas fa-code", "", false, {"类图", "class", "classDiagram"}, {"mermaid", "diagram", "class"}));
        items.push_back(makeCommand("chartState", "chart", 772, "状态图", "State Diagram", "插入状态图", "Insert a state diagram", "insertMermaid", "fas fa-sync-alt", "", false, {"状态图", "state", "stateDiagram"}, {"mermaid", "diagram", "state"}));
        items.push_back(makeCommand("chartGantt", "chart", 771, "甘特图", "Gantt Chart", "插入甘特图", "Insert a gantt chart", "insertMermaid", "fas fa-chart-gantt", "", false, {"甘特图", "gantt", "project"}, {"mermaid", "diagram", "gantt"}));
        items.push_back(makeCommand("chartPie", "chart", 770, "饼图", "Pie Chart", "插入饼图", "Insert a pie chart", "insertMermaid", "fas fa-chart-pie", "", false, {"饼图", "pie", "比例"}, {"mermaid", "diagram", "pie"}));
        items.push_back(makeCommand("chartLine", "chart", 769, "折线图", "Line Chart", "插入折线图", "Insert a line chart", "insertMermaid", "fas fa-chart-line", "", false, {"折线图", "line", "趋势"}, {"mermaid", "diagram", "line"}));
        items.push_back(makeCommand("chartBar", "chart", 768, "柱状图", "Bar Chart", "插入柱状图", "Insert a bar chart", "insertMermaid", "fas fa-chart-bar", "", false, {"柱状图", "bar", "条形图"}, {"mermaid", "diagram", "bar"}));
        items.push_back(makeCommand("chartER", "chart", 767, "ER图", "ER Diagram", "插入ER图", "Insert an ER diagram", "insertMermaid", "fas fa-database", "", false, {"ER图", "er", "entity"}, {"mermaid", "diagram", "er"}));
        items.push_back(makeCommand("chartMindmap", "chart", 766, "思维导图", "Mind Map", "插入思维导图", "Insert a mind map", "insertMermaid", "fas fa-brain", "", false, {"思维导图", "mindmap", "脑图"}, {"mermaid", "diagram", "mindmap"}));
        
        // 表情分类
        items.push_back(makeCommand("emoji", "insert", 830, "表情", "Emoji", "插入表情", "Insert an emoji", "showEmojiPicker", "fas fa-smile", "", false, {"表情", "emoji"}, {"emoji", "smile"}));
        
        // 常用表情
        items.push_back(makeCommand("emojiSmile", "insert", 829, "微笑", "Smile", "插入微笑表情", "Insert a smile emoji", "insertEmoji", "fas fa-smile", "😀", false, {"微笑", "smile", "happy"}, {"emoji", "face"}));
        items.push_back(makeCommand("emojiLaugh", "insert", 828, "大笑", "Laugh", "插入大笑表情", "Insert a laugh emoji", "insertEmoji", "fas fa-laugh-beam", "😂", false, {"大笑", "laugh", "lol"}, {"emoji", "face"}));
        items.push_back(makeCommand("emojiLove", "insert", 827, "爱心", "Love", "插入爱心表情", "Insert a love emoji", "insertEmoji", "fas fa-heart", "❤️", false, {"爱心", "love", "heart"}, {"emoji", "symbol"}));
        items.push_back(makeCommand("emojiThumbsUp", "insert", 826, "点赞", "Thumbs Up", "插入点赞表情", "Insert a thumbs up emoji", "insertEmoji", "fas fa-thumbs-up", "👍", false, {"点赞", "thumbs up", "like"}, {"emoji", "hand"}));
        items.push_back(makeCommand("emojiClap", "insert", 825, "鼓掌", "Clap", "插入鼓掌表情", "Insert a clap emoji", "insertEmoji", "fas fa-hands-clapping", "👏", false, {"鼓掌", "clap", "applause"}, {"emoji", "hand"}));
        items.push_back(makeCommand("emojiThinking", "insert", 824, "思考", "Thinking", "插入思考表情", "Insert a thinking emoji", "insertEmoji", "fas fa-face-thinking", "🤔", false, {"思考", "thinking", "think"}, {"emoji", "face"}));
        items.push_back(makeCommand("emojiSad", "insert", 823, "悲伤", "Sad", "插入悲伤表情", "Insert a sad emoji", "insertEmoji", "fas fa-face-sad-tear", "😢", false, {"悲伤", "sad", "cry"}, {"emoji", "face"}));
        items.push_back(makeCommand("emojiAngry", "insert", 822, "生气", "Angry", "插入生气表情", "Insert an angry emoji", "insertEmoji", "fas fa-face-angry", "😠", false, {"生气", "angry", "mad"}, {"emoji", "face"}));
        items.push_back(makeCommand("emojiSurprised", "insert", 821, "惊讶", "Surprised", "插入惊讶表情", "Insert a surprised emoji", "insertEmoji", "fas fa-face-surprise", "😮", false, {"惊讶", "surprised", "shock"}, {"emoji", "face"}));
        items.push_back(makeCommand("emojiCool", "insert", 820, "酷", "Cool", "插入酷表情", "Insert a cool emoji", "insertEmoji", "fas fa-face-cool", "😎", false, {"酷", "cool", "sunglasses"}, {"emoji", "face"}));

        items.push_back(makeCommand("save", "edit", 780, "保存", "Save", "保存当前文档", "Save the current document", "saveCurrentFile", "fas fa-save", "", false, {"保存", "save"}, {"save", "write"}));
        items.push_back(makeCommand("undo", "edit", 775, "撤销", "Undo", "撤销上一步操作", "Undo the last action", "undo", "fas fa-undo", "", false, {"撤销", "undo"}, {"undo", "history"}));
        items.push_back(makeCommand("redo", "edit", 770, "重做", "Redo", "重做上一步操作", "Redo the last action", "redo", "fas fa-redo", "", false, {"重做", "redo"}, {"redo", "history"}));
        items.push_back(makeCommand("findReplace", "edit", 765, "查找和替换", "Find and Replace", "在当前文档中查找和替换", "Search and replace in the current document", "openFindReplace", "fas fa-magnifying-glass", "", false, {"查找", "查找替换", "find", "replace"}, {"search", "replace"}));
        items.push_back(makeCommand("clearContent", "edit", 760, "清空内容", "Clear Content", "清空当前文档内容", "Clear the current document content", "clearContent", "fas fa-broom", "", false, {"清空", "clear", "clear content"}, {"clear", "erase"}));

        items.push_back(makeCommand("settings", "settings", 750, "设置", "Settings", "打开设置面板", "Open the settings panel", "openSettings", "fas fa-cog", "", false, {"设置", "系统设置", "settings", "preferences"}, {"settings", "config", "配置"}));
        items.push_back(makeCommand("themeMode", "settings", 745, "主题模式", "Theme Mode", "切换日间、夜间或跟随系统主题", "Switch light, dark, or system theme", "themeMode", "fas fa-moon", "", false, {"主题模式", "theme", "theme mode"}, {"theme", "mode"}));
        items.push_back(makeCommand("modeWysiwyg", "settings", 744, "所见即所得", "WYSIWYG", "切换到所见即所得模式", "Switch to WYSIWYG mode", "setModeWysiwyg", "fas fa-eye", "", false, {"所见即所得", "wysiwyg", "可视化编辑"}, {"mode", "editor", "wysiwyg"}));
        items.push_back(makeCommand("modeIr", "settings", 743, "即时渲染", "Instant Render", "切换到即时渲染模式", "Switch to instant render mode", "setModeIr", "fas fa-bolt", "", false, {"即时渲染", "ir", "instant render"}, {"mode", "editor", "render"}));
        items.push_back(makeCommand("modeSv", "settings", 742, "分屏预览", "Split View", "切换到分屏预览模式", "Switch to split view mode", "setModeSv", "fas fa-columns", "", false, {"分屏预览", "split", "split view"}, {"mode", "editor", "split"}));
        items.push_back(makeCommand("lightMode", "settings", 744, "日间模式", "Light Mode", "切换到日间模式", "Switch to light mode", "setLightMode", "fas fa-sun", "", false, {"日间模式", "light mode", "day mode"}, {"light", "theme"}));
        items.push_back(makeCommand("darkMode", "settings", 743, "夜间模式", "Dark Mode", "切换到夜间模式", "Switch to dark mode", "setDarkMode", "fas fa-moon", "", false, {"夜间模式", "dark mode", "night mode"}, {"dark", "theme"}));
        items.push_back(makeCommand("systemMode", "settings", 742, "跟随系统", "Follow System", "跟随系统主题模式", "Follow the system theme", "setSystemMode", "fas fa-desktop", "", false, {"跟随系统", "system", "system mode"}, {"system", "theme"}));
        items.push_back(makeCommand("editorMode", "settings", 741, "编辑器模式", "Editor Mode", "切换所见即所得、即时渲染或分屏预览", "Switch editor mode", "changeEditorMode", "fas fa-pen-nib", "", false, {"编辑器模式", "editor mode", "mode"}, {"mode", "editor"}));
        items.push_back(makeCommand("uiMode", "settings", 740, "界面样式", "UI Style", "切换自动、手机或电脑样式", "Switch auto, mobile, or desktop style", "changeUiMode", "fas fa-tablet-screen-button", "", false, {"界面样式", "ui mode", "interface style"}, {"ui", "layout"}));
        items.push_back(makeCommand("fontSize", "settings", 739, "字体大小", "Font Size", "调整编辑器字体大小", "Adjust the editor font size", "changeFontSize", "fas fa-text-height", "", false, {"字体大小", "font size"}, {"font", "text"}));
        items.push_back(makeCommand("showOutline", "settings", 738, "大纲视图", "Outline View", "显示或隐藏大纲视图", "Show or hide the outline view", "toggleOutline", "fas fa-list", "", false, {"大纲", "outline", "show outline"}, {"outline", "sidebar"}));
        items.push_back(makeCommand("modeSelection", "settings", 737, "模式选择", "Mode Selection", "打开编辑器模式选择菜单", "Open editor mode selection menu", "showModeSelection", "fas fa-list-check", "", false, {"模式选择", "切换模式", "mode menu", "mode selection"}, {"mode", "editor", "menu"}));
        items.push_back(makeCommand("storageLocation", "settings", 737, "默认存储位置", "Default Storage Location", "切换默认存储位置", "Switch the default storage location", "changeStorageLocation", "fas fa-database", "", false, {"默认存储位置", "storage location", "storage"}, {"storage", "cloud", "local"}));
        items.push_back(makeCommand("mdAssociation", "settings", 736, ".md 文件关联", ".md File Association", "管理系统打开 .md 文件时的关联", "Manage system .md file association", "toggleMdAssociation", "fas fa-file-lines", "", false, {"md 关联", ".md", "md association"}, {"file", "association"}));
        items.push_back(makeCommand("toolbarButtons", "settings", 735, "底部工具栏按钮", "Bottom Toolbar Buttons", "配置底部工具栏按钮", "Configure bottom toolbar buttons", "configureToolbarButtons", "fas fa-sliders", "", false, {"工具栏", "toolbar", "bottom toolbar"}, {"toolbar", "button"}));
        items.push_back(makeCommand("wasmTextEngine", "settings", 734, "WASM 文本引擎", "WASM Text Engine", "启用或关闭 WASM 文本引擎", "Enable or disable the WASM text engine", "toggleWasmTextEngine", "fas fa-cubes", "", false, {"wasm", "文本引擎", "text engine"}, {"wasm", "engine"}));

        items.push_back(makeCommand("exportMenu", "export", 732, "导出", "Export", "打开导出菜单", "Open export menu", "openExportMenu", "fas fa-file-export", "", false, {"导出", "export", "导出文件"}, {"export", "download", "保存为"}));
        items.push_back(makeCommand("exportMarkdown", "export", 730, "导出 Markdown", "Export Markdown", "导出为 Markdown 文件", "Export as a Markdown file", "exportMd", "fas fa-file-code", "", false, {"导出 markdown", "导出md", "md", "markdown", "export markdown", "exportmd"}, {"export", "markdown", "md", "导出"}));
        items.push_back(makeCommand("exportTxt", "export", 725, "导出纯文本", "Export Text", "导出为纯文本文件", "Export as a plain text file", "exportTxt", "fas fa-file-alt", "", false, {"导出 txt", "导出text", "text", "plain text", "export txt", "exporttext"}, {"export", "text", "txt", "导出"}));
        items.push_back(makeCommand("exportHtml", "export", 720, "导出 HTML", "Export HTML", "导出为 HTML 文件", "Export as an HTML file", "exportHtml", "fab fa-html5", "", false, {"导出 html", "导出网页", "html", "export html", "exporthtml"}, {"export", "html", "导出"}));
        items.push_back(makeCommand("exportDocx", "export", 715, "导出 Word", "Export Word", "导出为 DOCX 文档", "Export as a DOCX document", "exportDocx", "fas fa-file-word", "", false, {"导出 docx", "导出word", "word导出", "docx", "word", "doc", "export word", "export docx", "exportword"}, {"export", "docx", "doc", "word", "导出"}));
        items.push_back(makeCommand("exportPdf", "export", 710, "导出 PDF", "Export PDF", "导出为 PDF 文件", "Export as a PDF file", "exportPdf", "fas fa-file-pdf", "", false, {"导出 pdf", "导出pdf文件", "pdf导出", "pdf", "export pdf", "exportpdf"}, {"export", "pdf", "导出"}));
        items.push_back(makeCommand("exportPpt", "export", 705, "导出 PPT", "Export PPT", "导出为 PPT / PPTX 文件", "Export as a PPT / PPTX file", "exportPpt", "fas fa-person-chalkboard", "", false, {"导出 ppt", "导出pptx", "导出幻灯片", "pptx", "ppt", "export ppt", "export pptx", "exportppt"}, {"export", "ppt", "pptx", "slide", "导出"}));
        items.push_back(makeCommand("share", "more", 700, "分享", "Share", "分享当前文档或生成分享链接", "Share the current document or create a share link", "shareDocument", "fas fa-share-alt", "", false, {"分享", "共享", "share", "share link"}, {"share", "link", "publish"}));
        items.push_back(makeCommand("import", "more", 695, "导入", "Import", "导入本地文件或其他内容", "Import local files or other content", "importFiles", "fas fa-file-import", "", false, {"导入", "导入文件", "import"}, {"import", "file", "upload"}));
        items.push_back(makeCommand("print", "more", 690, "打印", "Print", "打开打印或云打印", "Open print or cloud print", "showPrintDialog", "fas fa-print", "", false, {"打印", "云打印", "print", "cloud print"}, {"print", "pdf", "cloud"}));
        items.push_back(makeCommand("videoCall", "more", 689, "视频通话", "Video Call", "打开视频通话面板", "Open video call panel", "videoCall", "fas fa-video", "", false, {"视频通话", "语音通话", "video call", "webrtc"}, {"video", "call", "meeting"}));
        items.push_back(makeCommand("presentation", "more", 685, "演示模式", "Presentation Mode", "进入演示模式", "Enter presentation mode", "presentationMode", "fas fa-person-chalkboard", "", false, {"演示模式", "presentation", "presentation mode"}, {"present", "slide"}));
        items.push_back(makeCommand("aiAssistant", "more", 680, "AI 助手", "AI Assistant", "打开 AI 助手", "Open the AI assistant", "openAIAssistant", "fas fa-robot", "", false, {"AI", "ai 助手", "assistant"}, {"ai", "assistant"}));
        items.push_back(makeCommand("serviceStatus", "more", 675, "服务状态", "Service Status", "查看服务运行状态", "View service health and status", "serviceStatus", "fas fa-signal", "", false, {"服务状态", "status", "health"}, {"status", "service"}));
        items.push_back(makeCommand("help", "more", 670, "帮助", "Help", "查看使用帮助", "Open the help panel", "help", "fas fa-circle-question", "", false, {"帮助", "关于", "help", "about"}, {"help", "docs", "about"}));
        items.push_back(makeCommand("searchFiles", "more", 665, "全文搜索", "Full-text Search", "在文件中进行全文搜索", "Search across files", "searchFiles", "fas fa-magnifying-glass", "", false, {"搜索文件", "全文搜索", "search files", "cross search"}, {"search", "files"}));
        items.push_back(makeCommand("uncertainty", "more", 660, "不确定度计算器", "Uncertainty Calculator", "打开不确定度计算器", "Open the uncertainty calculator", "openUncertaintyCalculator", "fas fa-calculator", "", false, {"不确定度", "uncertainty", "calculator"}, {"calculator", "math"}));

        return items;
    }();

    return catalog;
}

std::pair<int, std::string> scoreCommand(const CommandItem& item, const std::string& query) {
    if (query.empty()) {
        return std::make_pair(item.priority * 10 + groupPriority(item.groupId), "default");
    }

    const std::vector<std::string> tokens = splitTerms(query);
    const std::string compactQuery = compactSearchText(query);
    const std::string titleZh = normalizeSearchText(item.titleZh);
    const std::string titleEn = normalizeSearchText(item.titleEn);
    const std::string descZh = normalizeSearchText(item.descriptionZh);
    const std::string descEn = normalizeSearchText(item.descriptionEn);
    const std::string action = normalizeSearchText(item.action);
    const std::string group = normalizeSearchText(item.groupId);

    int score = item.priority * 10 + groupPriority(item.groupId);
    std::string matchedField = "fallback";
    bool matched = false;

    auto applyField = [&](const std::string& field, const std::string& name, int exactScore, int prefixScore, int containsScore) {
        if (field.empty()) return;
        const std::string compactField = compactSearchText(field);

        if (field == query || (!compactQuery.empty() && compactField == compactQuery)) {
            score += exactScore;
            matchedField = name;
            matched = true;
            return;
        }
        if (field.find(query) == 0 || (!compactQuery.empty() && compactField.find(compactQuery) == 0)) {
            score += prefixScore;
            matchedField = name;
            matched = true;
            return;
        }
        if (field.find(query) != std::string::npos || (!compactQuery.empty() && compactField.find(compactQuery) != std::string::npos)) {
            score += containsScore;
            matchedField = name;
            matched = true;
        }
    };

    applyField(titleZh, "titleZh", 400, 260, 160);
    applyField(titleEn, "titleEn", 380, 250, 150);
    applyField(action, "action", 240, 180, 120);
    applyField(group, "group", 160, 120, 90);
    applyField(descZh, "descriptionZh", 100, 70, 40);
    applyField(descEn, "descriptionEn", 100, 70, 40);

    for (size_t i = 0; i < item.aliases.size(); ++i) {
        const std::string alias = normalizeSearchText(item.aliases[i]);
        const std::string compactAlias = compactSearchText(alias);
        if (alias.empty()) continue;
        if (alias == query || (!compactQuery.empty() && compactAlias == compactQuery)) {
            score += 320;
            matchedField = "alias";
            matched = true;
            continue;
        }
        if (alias.find(query) == 0 || (!compactQuery.empty() && compactAlias.find(compactQuery) == 0)) {
            score += 220;
            matchedField = "alias";
            matched = true;
            continue;
        }
        if (alias.find(query) != std::string::npos || (!compactQuery.empty() && compactAlias.find(compactQuery) != std::string::npos)) {
            score += 140;
            matchedField = "alias";
            matched = true;
        }
    }

    for (size_t i = 0; i < item.keywords.size(); ++i) {
        const std::string keyword = normalizeSearchText(item.keywords[i]);
        const std::string compactKeyword = compactSearchText(keyword);
        if (keyword.empty()) continue;

        if (keyword == query || (!compactQuery.empty() && compactKeyword == compactQuery)) {
            score += 180;
            matchedField = "keyword";
            matched = true;
            continue;
        }
        if (keyword.find(query) == 0 || (!compactQuery.empty() && compactKeyword.find(compactQuery) == 0)) {
            score += 120;
            matchedField = "keyword";
            matched = true;
            continue;
        }
        if (keyword.find(query) != std::string::npos || (!compactQuery.empty() && compactKeyword.find(compactQuery) != std::string::npos)) {
            score += 80;
            matchedField = "keyword";
            matched = true;
        }
    }

    size_t matchedTokenCount = 0;
    for (size_t i = 0; i < tokens.size(); ++i) {
        const std::string& token = tokens[i];
        bool tokenMatched = false;
        if (containsCompactText(titleZh, token) || containsCompactText(titleEn, token) || containsCompactText(descZh, token) || containsCompactText(descEn, token) || containsCompactText(action, token) || containsCompactText(group, token)) {
            tokenMatched = true;
        }
        for (size_t j = 0; !tokenMatched && j < item.aliases.size(); ++j) {
            if (containsCompactText(normalizeSearchText(item.aliases[j]), token)) {
                tokenMatched = true;
            }
        }
        for (size_t j = 0; !tokenMatched && j < item.keywords.size(); ++j) {
            if (containsCompactText(normalizeSearchText(item.keywords[j]), token)) {
                tokenMatched = true;
            }
        }
        if (tokenMatched) {
            score += 35;
            matchedField = "keyword";
            matched = true;
            ++matchedTokenCount;
        }
    }

    if (!tokens.empty() && matchedTokenCount < tokens.size()) {
        return std::make_pair(-1, "none");
    }

    if (!matched) {
        return std::make_pair(-1, "none");
    }

    return std::make_pair(score, matchedField);
}

std::string languageCode(const std::string& language) {
    const std::string normalized = normalizeSearchText(language);
    if (normalized == "en" || normalized == "eng" || normalized == "english") return "en";
    return "zh";
}

std::string activationKeyLabel(const std::string& key, const std::string& language) {
    const bool isEn = language == "en";
    if (key == "Tab") return isEn ? "Tab" : "Tab";
    if (key == "Enter") return isEn ? "Enter" : "Enter";
    if (key == "Space") return isEn ? "Space" : "空格";
    if (key == "Ctrl+K") return isEn ? "Ctrl+K" : "Ctrl+K";
    if (key == "Ctrl+J") return isEn ? "Ctrl+J" : "Ctrl+J";
    if (key == "Alt+Space") return isEn ? "Alt+Space" : "Alt+空格";
    return key;
}

std::string buildSettingsJson(const std::string& language) {
    const std::string lang = languageCode(language);

    std::ostringstream out;
    out << "{";
    out << "\"enabled\":true,";
    out << "\"trigger\":\"/\",";
    out << "\"defaultActivationKey\":\"Tab\",";
    out << "\"allowDisable\":true,";
    out << "\"languageAware\":true,";
    out << "\"supportedLanguages\":[\"zh\",\"en\"],";
    out << "\"availableActivationKeys\":[";
    const char* keys[] = {"Tab", "Enter", "Space", "Ctrl+K", "Ctrl+J", "Alt+Space", "Custom", "Off"};
    for (size_t i = 0; i < sizeof(keys) / sizeof(keys[0]); ++i) {
        if (i > 0) out << ",";
        out << "{"
            << "\"value\":\"" << keys[i] << "\"," 
            << "\"label\":\"" << jsonEscape(activationKeyLabel(keys[i], lang)) << "\""
            << "}";
    }
    out << "],";
    out << "\"defaults\":{";
    out << "\"enabled\":true,";
    out << "\"activationKey\":\"Tab\",";
    out << "\"language\":\"" << lang << "\"";
    out << "}}";
    return out.str();
}

std::string serializeCommand(const CommandItem& item, const std::string& language, int score, const std::string& matchedField) {
    const bool isEn = languageCode(language) == "en";
    std::ostringstream out;
    out << "{";
    out << "\"id\":\"" << jsonEscape(item.id) << "\",";
    out << "\"group\":\"" << jsonEscape(item.groupId) << "\",";
    out << "\"groupLabel\":\"" << jsonEscape(groupLabel(item.groupId, language)) << "\",";
    out << "\"titleZh\":\"" << jsonEscape(item.titleZh) << "\",";
    out << "\"titleEn\":\"" << jsonEscape(item.titleEn) << "\",";
    out << "\"descriptionZh\":\"" << jsonEscape(item.descriptionZh) << "\",";
    out << "\"descriptionEn\":\"" << jsonEscape(item.descriptionEn) << "\",";
    out << "\"title\":\"" << jsonEscape(isEn ? item.titleEn : item.titleZh) << "\",";
    out << "\"description\":\"" << jsonEscape(isEn ? item.descriptionEn : item.descriptionZh) << "\",";
    out << "\"action\":\"" << jsonEscape(item.action) << "\",";
    out << "\"icon\":\"" << jsonEscape(item.icon) << "\",";
    out << "\"insertText\":\"" << jsonEscape(item.insertText) << "\",";
    out << "\"hidden\":" << (item.hidden ? "true" : "false") << ",";
    out << "\"score\":" << score << ",";
    out << "\"matchedField\":\"" << jsonEscape(matchedField) << "\",";
    out << "\"aliases\":[";
    for (size_t i = 0; i < item.aliases.size(); ++i) {
        if (i > 0) out << ",";
        out << "\"" << jsonEscape(item.aliases[i]) << "\"";
    }
    out << "],";
    out << "\"keywords\":[";
    for (size_t i = 0; i < item.keywords.size(); ++i) {
        if (i > 0) out << ",";
        out << "\"" << jsonEscape(item.keywords[i]) << "\"";
    }
    out << "]";
    out << "}";
    return out.str();
}

} // namespace

std::string WasmTextEngine::slashPalette(
    const std::string& query,
    const std::string& language,
    int limit,
    int offset,
    bool includeHidden
) const {
    const std::string normalizedQuery = normalizeSearchText(query);
    const std::string lang = languageCode(language);
    const int maxItems = limit > 0 ? limit : (normalizedQuery.empty() ? 20 : 80);

    std::vector<RankedItem> ranked;
    const std::vector<CommandItem>& catalog = commandCatalog();
    ranked.reserve(catalog.size());

    for (size_t i = 0; i < catalog.size(); ++i) {
        const CommandItem& item = catalog[i];
        if (item.hidden && !includeHidden) {
            continue;
        }
        const std::pair<int, std::string> score = scoreCommand(item, normalizedQuery);
        if (score.first < 0) {
            continue;
        }
        ranked.push_back(RankedItem{&item, score.first, score.second});
    }

    std::sort(ranked.begin(), ranked.end(), [](const RankedItem& left, const RankedItem& right) {
        if (left.score != right.score) return left.score > right.score;
        if (groupPriority(left.item->groupId) != groupPriority(right.item->groupId)) {
            return groupPriority(left.item->groupId) > groupPriority(right.item->groupId);
        }
        if (left.item->priority != right.item->priority) return left.item->priority > right.item->priority;
        return left.item->titleZh < right.item->titleZh;
    });

    std::ostringstream groups;
    groups << "[";
    const char* groupIds[] = {"file", "auth", "insert", "math", "chart", "edit", "settings", "export", "more"};
    for (size_t i = 0; i < sizeof(groupIds) / sizeof(groupIds[0]); ++i) {
        if (i > 0) groups << ",";
        groups << "{"
               << "\"id\":\"" << groupIds[i] << "\"," 
               << "\"label\":\"" << jsonEscape(groupLabel(groupIds[i], lang)) << "\""
               << "}";
    }
    groups << "]";

    std::ostringstream items;
    items << "[";
    size_t startIndex = static_cast<size_t>(offset);
    size_t endIndex = startIndex + static_cast<size_t>(maxItems);
    for (size_t i = startIndex; i < ranked.size() && i < endIndex; ++i) {
        if (i > startIndex) items << ",";
        items << serializeCommand(*ranked[i].item, lang, ranked[i].score, ranked[i].matchedField);
    }
    items << "]";

    std::ostringstream out;
    out << "{";
    out << "\"query\":\"" << jsonEscape(normalizedQuery) << "\",";
    out << "\"language\":\"" << lang << "\",";
    out << "\"groups\":" << groups.str() << ",";
    out << "\"settings\":" << buildSettingsJson(lang) << ",";
    out << "\"items\":" << items.str() << ",";
    out << "\"total\":" << ranked.size() << ",";
    out << "\"lazyLoad\":" << (normalizedQuery.empty() && ranked.size() > maxItems) << ",";
    out << "\"hasMore\":" << (endIndex < ranked.size());
    out << "}";
    return out.str();
}

std::string WasmTextEngine::slashPaletteSettings(const std::string& language) const {
    return buildSettingsJson(language);
}