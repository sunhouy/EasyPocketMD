#include "text_engine.h"

#include <algorithm>
#include <cctype>
#include <initializer_list>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace {

// 汉字转拼音映射表（常用汉字）
static std::map<std::string, std::string> chinesePinyinMap = {
    {"图", "tu"}, {"片", "pian"}, {"插", "cha"}, {"入", "ru"}, {"文", "wen"}, {"件", "jian"},
    {"上", "shang"}, {"传", "chuan"}, {"链", "lian"}, {"接", "jie"}, {"表", "biao"}, {"格", "ge"},
    {"无", "wu"}, {"序", "xu"}, {"列", "lie"}, {"有", "you"}, {"任", "ren"}, {"务", "wu"},
    {"分", "fen"}, {"隔", "ge"}, {"线", "xian"}, {"情", "qing"}, {"公", "gong"},
    {"式", "shi"}, {"脚", "jiao"}, {"注", "zhu"}, {"脑", "nao"},
    {"思", "si"}, {"维", "wei"}, {"导", "dao"}, {"新", "xin"}, {"建", "jian"},
    {"夹", "jia"}, {"打", "da"}, {"开", "kai"}, {"历", "li"},
    {"史", "shi"}, {"重", "zhong"}, {"命", "ming"}, {"名", "ming"}, {"移", "yi"}, {"动", "dong"},
    {"删", "shan"}, {"除", "chu"}, {"登", "deng"}, {"录", "lu"}, {"册", "ce"},
    {"退", "tui"}, {"出", "chu"}, {"设", "she"}, {"置", "zhi"}, {"模", "mo"},
    {"轻", "qing"}, {"暗", "an"}, {"主", "zhu"}, {"题", "ti"}, {"编", "bian"}, {"辑", "ji"},
    {"撤", "che"}, {"销", "xiao"}, {"做", "zuo"}, {"清", "qing"}, {"空", "kong"},
    {"内", "nei"}, {"容", "rong"}, {"享", "xiang"},
    {"印", "yin"}, {"帮", "bang"}, {"助", "zhu"}, {"关", "guan"}, {"于", "yu"},
    {"服", "fu"}, {"状", "zhuang"}, {"态", "tai"}, {"计", "ji"}, {"算", "suan"},
    {"器", "qi"}, {"演", "yan"}, {"示", "shi"},
    {"语", "yu"}, {"音", "yin"}, {"频", "pin"}, {"通", "tong"}, {"话", "hua"}, {"搜", "sou"},
    {"索", "suo"}, {"查", "cha"}, {"找", "zhao"}, {"替", "ti"}, {"换", "huan"}, {"保", "bao"},
    {"存", "cun"}, {"另", "ling"}, {"页", "ye"}, {"全", "quan"}, {"屏", "ping"}, {"预", "yu"},
    {"览", "lan"}, {"网", "wang"}, {"络", "luo"}, {"地", "di"},
    {"址", "zhi"}, {"描", "miao"}, {"述", "shu"}, {"代", "dai"}, {"码", "ma"},
    {"块", "kuai"}, {"行", "xing"}, {"引", "yin"}, {"用", "yong"}, {"粗", "cu"},
    {"体", "ti"}, {"斜", "xie"}, {"级", "ji"}, {"签", "qian"}, {"像", "xiang"},
    {"视", "shi"}, {"附", "fu"},
    {"加", "jia"}, {"载", "zai"}, {"卸", "xie"},
    {"点", "dian"}, {"赞", "zan"}, {"踩", "cai"}, {"好", "hao"}, {"评", "ping"},
    {"差", "cha"}, {"论", "lun"}, {"回", "hui"}, {"复", "fu"},
    {"留", "liu"}, {"言", "yan"}, {"价", "jia"},
    {"投", "tou"}, {"票", "piao"}, {"选", "xuan"},
    {"举", "ju"}, {"调", "diao"}, {"问", "wen"},
    {"卷", "juan"}, {"统", "tong"}, {"数", "shu"},
    {"据", "ju"}, {"析", "xi"}, {"报", "bao"}, {"告", "gao"},
    {"管", "guan"}, {"理", "li"}, {"相", "xiang"},
    {"集", "ji"}, {"画", "hua"}, {"库", "ku"}, {"廊", "lang"},
    {"展", "zhan"}, {"橱", "chu"}, {"窗", "chuang"},
    {"广", "guang"}, {"推", "tui"}, {"营", "ying"}, {"销", "xiao"},
    {"荐", "jian"}, {"精", "jing"}, {"品", "pin"}, {"热", "re"}, {"门", "men"},
    {"榜", "bang"}, {"单", "dan"}, {"次", "ci"},
    {"顺", "shun"}, {"逆", "ni"}, {"正", "zheng"}, {"倒", "dao"}, {"随", "sui"},
    {"机", "ji"}, {"乱", "luan"}, {"混", "hun"},
    {"显", "xian"}, {"呈", "cheng"}, {"现", "xian"},
    {"的", "de"}, {"了", "le"}, {"在", "zai"}, {"是", "shi"}, {"我", "wo"}, {"不", "bu"},
    {"人", "ren"}, {"们", "men"}, {"中", "zhong"}, {"来", "lai"}, {"到", "dao"}, {"说", "shuo"},
    {"会", "hui"}, {"和", "he"}, {"也", "ye"}, {"后", "hou"}, {"过", "guo"}, {"自", "zi"},
    {"而", "er"}, {"前", "qian"}, {"他", "ta"}, {"这", "zhe"}, {"那", "na"}, {"里", "li"},
    {"看", "kan"}, {"听", "ting"}, {"写", "xie"}, {"读", "du"}, {"学", "xue"}, {"做", "zuo"},
    {"想", "xiang"}, {"知", "zhi"}, {"道", "dao"}, {"见", "jian"}, {"问", "wen"}, {"答", "da"},
    {"买", "mai"}, {"卖", "mai"}, {"吃", "chi"}, {"喝", "he"}, {"睡", "shui"}, {"走", "zou"},
    {"跑", "pao"}, {"飞", "fei"}, {"坐", "zuo"}, {"站", "zhan"}, {"停", "ting"}, {"等", "deng"},
    {"给", "gei"}, {"送", "song"}, {"拿", "na"}, {"放", "fang"}, {"找", "zhao"}, {"用", "yong"},
    {"开", "kai"}, {"关", "guan"}, {"关", "guan"}, {"闭", "bi"}, {"始", "shi"}, {"终", "zhong"},
    {"高", "gao"}, {"低", "di"}, {"大", "da"}, {"小", "xiao"}, {"多", "duo"}, {"少", "shao"},
    {"长", "chang"}, {"短", "duan"}, {"远", "yuan"}, {"近", "jin"}, {"新", "xin"}, {"旧", "jiu"},
    {"老", "lao"}, {"少", "shao"}, {"男", "nan"}, {"女", "nv"}, {"父", "fu"}, {"母", "mu"},
    {"子", "zi"}, {"女", "nv"}, {"儿", "er"}, {"兄", "xiong"}, {"弟", "di"}, {"姐", "jie"},
    {"妹", "mei"}, {"家", "jia"}, {"国", "guo"}, {"城", "cheng"}, {"市", "shi"}, {"村", "cun"},
    {"学", "xue"}, {"校", "xiao"}, {"公", "gong"}, {"司", "si"}, {"店", "dian"}, {"厂", "chang"},
    {"医", "yi"}, {"院", "yuan"}, {"银", "yin"}, {"行", "xing"}, {"餐", "can"}, {"馆", "guan"},
    {"酒", "jiu"}, {"店", "dian"}, {"宾", "bin"}, {"馆", "guan"}, {"旅", "lv"}, {"游", "you"},
    {"景", "jing"}, {"区", "qu"}, {"公", "gong"}, {"园", "yuan"}, {"博", "bo"}, {"物", "wu"},
    {"图", "tu"}, {"书", "shu"}, {"馆", "guan"}, {"电", "dian"}, {"影", "ying"}, {"院", "yuan"},
    {"音", "yin"}, {"乐", "yue"}, {"体", "ti"}, {"育", "yu"}, {"场", "chang"}, {"健", "jian"},
    {"身", "shen"}, {"房", "fang"}, {"美", "mei"}, {"容", "rong"}, {"院", "yuan"}, {"理", "li"},
    {"发", "fa"}, {"店", "dian"}, {"超", "chao"}, {"市", "shi"}, {"商", "shang"}, {"场", "chang"},
    {"百", "bai"}, {"货", "huo"}, {"楼", "lou"}, {"菜", "cai"}, {"市", "shi"}, {"场", "chang"},
    {"花", "hua"}, {"鸟", "niao"}, {"鱼", "yu"}, {"虫", "chong"}, {"猫", "mao"}, {"狗", "gou"},
    {"猪", "zhu"}, {"牛", "niu"}, {"羊", "yang"}, {"马", "ma"}, {"鸡", "ji"}, {"鸭", "ya"},
    {"鹅", "e"}, {"虎", "hu"}, {"狮", "shi"}, {"豹", "bao"}, {"熊", "xiong"}, {"狼", "lang"},
    {"狐", "hu"}, {"狸", "li"}, {"兔", "tu"}, {"鼠", "shu"}, {"蛇", "she"}, {"龙", "long"},
    {"凤", "feng"}, {"凰", "huang"}, {"鹤", "he"}, {"鹰", "ying"}, {"燕", "yan"}, {"雀", "que"},
    {"鸽", "ge"}, {"鹏", "peng"}, {"鸦", "ya"}, {"鹊", "que"}, {"莺", "ying"}, {"蝉", "chan"},
    {"蝶", "die"}, {"蜂", "feng"}, {"蚁", "yi"}, {"蚊", "wen"}, {"蝇", "ying"}, {"虾", "xia"},
    {"蟹", "xie"}, {"贝", "bei"}, {"鲸", "jing"}, {"鲨", "sha"}, {"豚", "tun"}, {"鳄", "e"},
    {"龟", "gui"}, {"鳖", "bie"}, {"螺", "luo"}, {"蚌", "bang"}, {"蚕", "can"}, {"蛹", "yong"},
    {"蛙", "wa"}, {"蟾", "chan"}, {"蝌", "ke"}, {"蚪", "dou"}, {"蚯", "qiu"}, {"蚓", "yin"},
    {"蚯", "qiu"}, {"蚓", "yin"}, {"蛆", "qu"}, {"蛹", "yong"}, {"蛾", "e"}, {"萤", "ying"},
    {"天", "tian"}, {"地", "di"}, {"日", "ri"}, {"月", "yue"}, {"星", "xing"}, {"辰", "chen"},
    {"云", "yun"}, {"雨", "yu"}, {"雪", "xue"}, {"风", "feng"}, {"雷", "lei"}, {"电", "dian"},
    {"雾", "wu"}, {"露", "lu"}, {"霜", "shuang"}, {"冰", "bing"}, {"雹", "bao"}, {"虹", "hong"},
    {"霞", "xia"}, {"晴", "qing"}, {"阴", "yin"}, {"阳", "yang"}, {"光", "guang"}, {"明", "ming"},
    {"暗", "an"}, {"黑", "hei"}, {"暗", "an"}, {"白", "bai"}, {"红", "hong"}, {"绿", "lv"},
    {"蓝", "lan"}, {"黄", "huang"}, {"紫", "zi"}, {"橙", "cheng"}, {"粉", "fen"}, {"灰", "hui"},
    {"金", "jin"}, {"银", "yin"}, {"铜", "tong"}, {"铁", "tie"}, {"钢", "gang"}, {"铝", "lv"},
    {"锡", "xi"}, {"铅", "qian"}, {"锌", "xin"}, {"汞", "gong"}, {"硫", "liu"}, {"磷", "lin"},
    {"硅", "gui"}, {"硼", "peng"}, {"碳", "tan"}, {"氮", "dan"}, {"氧", "yang"}, {"氢", "qing"},
    {"氦", "hai"}, {"锂", "li"}, {"铍", "pi"}, {"钠", "na"}, {"镁", "mei"}, {"钙", "gai"},
    {"钪", "kang"}, {"钛", "tai"}, {"钒", "fan"}, {"铬", "ge"}, {"锰", "meng"}, {"钴", "gu"},
    {"镍", "nie"}, {"砷", "shen"}, {"硒", "xi"}, {"溴", "xiu"}, {"氪", "ke"}, {"铷", "ru"},
    {"锶", "si"}, {"钇", "yi"}, {"锆", "gao"}, {"铌", "ni"}, {"钼", "mu"}, {"锝", "de"},
    {"钌", "liao"}, {"铑", "lao"}, {"钯", "ba"}, {"银", "yin"}, {"镉", "ge"}, {"铟", "yin"},
    {"锡", "xi"}, {"锑", "ti"}, {"碲", "di"}, {"碘", "dian"}, {"氙", "xian"}, {"铯", "se"},
    {"钡", "bei"}, {"镧", "lan"}, {"铈", "shi"}, {"镨", "pu"}, {"钕", "nv"}, {"钷", "po"},
    {"钐", "shan"}, {"铕", "you"}, {"钆", "ga"}, {"铽", "te"}, {"镝", "di"}, {"钬", "huo"},
    {"铒", "er"}, {"铥", "diu"}, {"镱", "yi"}, {"镥", "lu"}, {"铪", "ha"}, {"钽", "tan"},
    {"钨", "wu"}, {"铼", "lai"}, {"锇", "e"}, {"铱", "yi"}, {"铂", "bo"}, {"金", "jin"},
    {"汞", "gong"}, {"铊", "ta"}, {"铅", "qian"}, {"铋", "bi"}, {"钋", "po"}, {"砹", "ai"},
    {"氡", "dong"}, {"钫", "fang"}, {"镭", "lei"}, {"锕", "a"}, {"钍", "tu"}, {"镤", "pu"},
    {"铀", "you"}, {"镎", "na"}, {"钚", "bu"}, {"镅", "mei"}, {"锔", "ju"}, {"锫", "bei"},
    {"锎", "kai"}, {"锿", "ai"}, {"镄", "fei"}, {"钔", "men"}, {"锘", "nuo"}, {"铹", "lao"},
    {"山", "shan"}, {"河", "he"}, {"湖", "hu"}, {"海", "hai"}, {"江", "jiang"}, {"溪", "xi"},
    {"泉", "quan"}, {"瀑", "pu"}, {"潭", "tan"}, {"池", "chi"}, {"塘", "tang"}, {"沼", "zhao"},
    {"泽", "ze"}, {"洋", "yang"}, {"湾", "wan"}, {"港", "gang"}, {"岛", "dao"}, {"屿", "yu"},
    {"礁", "jiao"}, {"岩", "yan"}, {"石", "shi"}, {"土", "tu"}, {"沙", "sha"}, {"泥", "ni"},
    {"尘", "chen"}, {"埃", "ai"}, {"灰", "hui"}, {"炭", "tan"}, {"煤", "mei"}, {"柴", "chai"},
    {"草", "cao"}, {"木", "mu"}, {"花", "hua"}, {"树", "shu"}, {"林", "lin"}, {"森", "sen"},
    {"松", "song"}, {"柏", "bai"}, {"柳", "liu"}, {"杨", "yang"}, {"桃", "tao"}, {"李", "li"},
    {"杏", "xing"}, {"梅", "mei"}, {"梨", "li"}, {"枣", "zao"}, {"橘", "ju"}, {"柑", "gan"},
    {"橙", "cheng"}, {"柚", "you"}, {"檬", "meng"}, {"樱", "ying"}, {"蕉", "jiao"}, {"椰", "ye"},
    {"棕", "zong"}, {"榈", "lv"}, {"藤", "teng"}, {"蔓", "man"}, {"竹", "zhu"}, {"竿", "gan"},
    {"笋", "sun"}, {"芦", "lu"}, {"苇", "wei"}, {"蒲", "pu"}, {"蒿", "hao"}, {"艾", "ai"},
    {"莲", "lian"}, {"藕", "ou"}, {"菱", "ling"}, {"荷", "he"}, {"菊", "ju"}, {"梅", "mei"},
    {"兰", "lan"}, {"竹", "zhu"}, {"松", "song"}, {"柏", "bai"}, {"桂", "gui"}, {"桐", "tong"},
    {"枫", "feng"}, {"橡", "xiang"}, {"樟", "zhang"}, {"楠", "nan"}, {"檀", "tan"}, {"槐", "huai"},
    {"榆", "yu"}, {"桑", "sang"}, {"槐", "huai"}, {"椿", "chun"}, {"槿", "jin"}, {"榕", "rong"},
    {"榆", "yu"}, {"柳", "liu"}, {"杉", "shan"}, {"柏", "bai"}, {"松", "song"}, {"桦", "hua"},
    {"杨", "yang"}, {"桐", "tong"}, {"枫", "feng"}, {"樱", "ying"}, {"梨", "li"}, {"杏", "xing"},
    {"李", "li"}, {"桃", "tao"}, {"梅", "mei"}, {"枣", "zao"}, {"柿", "shi"}, {"栗", "li"},
    {"橘", "ju"}, {"柑", "gan"}, {"柚", "you"}, {"橙", "cheng"}, {"檬", "meng"}, {"柠", "ning"},
    {"枇", "pi"}, {"杷", "pa"}, {"荔", "li"}, {"枝", "zhi"}, {"芒", "mang"}, {"果", "guo"},
    {"榴", "liu"}, {"莲", "lian"}, {"蓬", "peng"}, {"蒿", "hao"}, {"蒲", "pu"}, {"芦", "lu"},
    {"蔗", "zhe"}, {"棉", "mian"}, {"麻", "ma"}, {"丝", "si"}, {"绸", "chou"}, {"缎", "duan"},
    {"纱", "sha"}, {"布", "bu"}, {"帛", "bo"}, {"锦", "jin"}, {"绣", "xiu"}, {"线", "xian"},
    {"针", "zhen"}, {"缝", "feng"}, {"纫", "ren"}, {"织", "zhi"}, {"编", "bian"}, {"结", "jie"},
    {"网", "wang"}, {"绳", "sheng"}, {"索", "suo"}, {"缆", "lan"}, {"弦", "xian"}, {"琴", "qin"},
    {"瑟", "se"}, {"琵", "pi"}, {"琶", "pa"}, {"筝", "zheng"}, {"笛", "di"}, {"箫", "xiao"},
    {"笙", "sheng"}, {"管", "guan"}, {"号", "hao"}, {"角", "jiao"}, {"鼓", "gu"}, {"锣", "luo"},
    {"钹", "bo"}, {"钟", "zhong"}, {"铃", "ling"}, {"铛", "dang"}, {"铎", "duo"}, {"磬", "qing"},
    {"木", "mu"}, {"石", "shi"}, {"土", "tu"}, {"金", "jin"}, {"革", "ge"}, {"丝", "si"}, {"竹", "zhu"},
    {"书", "shu"}, {"画", "hua"}, {"棋", "qi"}, {"牌", "pai"}, {"球", "qiu"}, {"棒", "bang"},
    {"杆", "gan"}, {"拍", "pai"}, {"网", "wang"}, {"篮", "lan"}, {"框", "kuang"}, {"桌", "zhuo"},
    {"椅", "yi"}, {"凳", "deng"}, {"床", "chuang"}, {"柜", "gui"}, {"箱", "xiang"}, {"盒", "he"},
    {"包", "bao"}, {"袋", "dai"}, {"瓶", "ping"}, {"罐", "guan"}, {"桶", "tong"}, {"盆", "pen"},
    {"碗", "wan"}, {"盘", "pan"}, {"碟", "die"}, {"杯", "bei"}, {"壶", "hu"}, {"锅", "guo"},
    {"勺", "shao"}, {"筷", "kuai"}, {"叉", "cha"}, {"刀", "dao"}, {"剑", "jian"}, {"枪", "qiang"},
    {"炮", "pao"}, {"弹", "dan"}, {"药", "yao"}, {"针", "zhen"}, {"线", "xian"}, {"布", "bu"},
    {"纸", "zhi"}, {"笔", "bi"}, {"墨", "mo"}, {"砚", "yan"}, {"印", "yin"}, {"刷", "shua"},
    {"漆", "qi"}, {"胶", "jiao"}, {"蜡", "la"}, {"烛", "zhu"}, {"灯", "deng"}, {"火", "huo"},
    {"水", "shui"}, {"冰", "bing"}, {"油", "you"}, {"盐", "yan"}, {"酱", "jiang"}, {"醋", "cu"},
    {"茶", "cha"}, {"酒", "jiu"}, {"奶", "nai"}, {"糖", "tang"}, {"盐", "yan"}, {"酱", "jiang"},
    {"醋", "cu"}, {"米", "mi"}, {"面", "mian"}, {"粉", "fen"}, {"粥", "zhou"}, {"饭", "fan"},
    {"菜", "cai"}, {"汤", "tang"}, {"羹", "geng"}, {"糕", "gao"}, {"饼", "bing"}, {"饺", "jiao"},
    {"馒", "man"}, {"包", "bao"}, {"粽", "zong"}, {"月", "yue"}, {"糕", "gao"}, {"元", "yuan"},
    {"宵", "xiao"}, {"蛋", "dan"}, {"肉", "rou"}, {"鱼", "yu"}, {"虾", "xia"}, {"蟹", "xie"},
    {"贝", "bei"}, {"禽", "qin"}, {"畜", "chu"}, {"兽", "shou"}, {"鸟", "niao"}, {"虫", "chong"}
};

// 获取 UTF-8 字符（从字符串中提取第一个完整字符）
std::string extractUtf8Char(const std::string& text, size_t pos) {
    if (pos >= text.size()) return "";
    
    unsigned char firstByte = static_cast<unsigned char>(text[pos]);
    size_t charLen = 0;
    
    if ((firstByte & 0x80) == 0) {
        // ASCII
        charLen = 1;
    } else if ((firstByte & 0xE0) == 0xC0) {
        charLen = 2;
    } else if ((firstByte & 0xF0) == 0xE0) {
        charLen = 3;
    } else if ((firstByte & 0xF8) == 0xF0) {
        charLen = 4;
    } else {
        return "";
    }
    
    if (pos + charLen > text.size()) return "";
    
    return text.substr(pos, charLen);
}

// 将中文字符串转换为拼音（完整拼音，非首字母）
std::string toPinyin(const std::string& text) {
    std::string result;
    result.reserve(text.size() * 3);
    
    for (size_t i = 0; i < text.size();) {
        std::string ch = extractUtf8Char(text, i);
        if (ch.empty()) {
            i++;
            continue;
        }
        
        std::map<std::string, std::string>::const_iterator it = chinesePinyinMap.find(ch);
        if (it != chinesePinyinMap.end()) {
            result += it->second;
        } else {
            // 非中文或不在映射表中，保留原字符
            result += ch;
        }
        
        i += ch.size();
    }
    
    return result;
}

// 获取拼音首字母
std::string toPinyinInitials(const std::string& text) {
    std::string result;
    result.reserve(text.size());
    
    for (size_t i = 0; i < text.size();) {
        std::string ch = extractUtf8Char(text, i);
        if (ch.empty()) {
            i++;
            continue;
        }
        
        std::map<std::string, std::string>::const_iterator it = chinesePinyinMap.find(ch);
        if (it != chinesePinyinMap.end()) {
            if (!it->second.empty()) {
                result += it->second[0];
            }
        } else {
            // 非中文或不在映射表中，保留原字符
            result += ch;
        }
        
        i += ch.size();
    }
    
    return result;
}

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

        items.push_back(makeCommand("formula", "math", 815, "公式", "Formula", "打开公式面板", "Open the formula panel", "showFormulaPicker", "fas fa-superscript", "", false, {"公式", "数学公式", "formula", "latex"}, {"formula", "latex", "math"}));
        items.push_back(makeCommand("inlineFormula", "math", 810, "行内公式", "Inline Formula", "插入行内公式", "Insert an inline formula", "insertInlineFormula", "fas fa-superscript", "$x^2$", false, {"行内公式", "inline formula", "formula inline"}, {"inline", "formula"}));
        items.push_back(makeCommand("blockFormula", "math", 805, "块级公式", "Block Formula", "插入块级公式", "Insert a block formula", "insertBlockFormula", "fas fa-square-root-variable", "$$\nE=mc^2\n$$", false, {"块级公式", "block formula", "display formula"}, {"block", "formula"}));

        items.push_back(makeCommand("chart", "chart", 800, "图表", "Chart", "打开图表面板", "Open the chart panel", "showChartPicker", "fas fa-chart-bar", "", false, {"图表", "图形", "chart"}, {"chart", "mermaid", "echarts", "diagram"}));
        items.push_back(makeCommand("mermaid", "chart", 795, "Mermaid 图表", "Mermaid Chart", "插入 Mermaid 图表", "Insert a Mermaid chart", "insertMermaid", "fas fa-diagram-project", "", false, {"mermaid", "流程图", "graph"}, {"mermaid", "diagram"}));
        items.push_back(makeCommand("eCharts", "chart", 790, "ECharts 图表", "ECharts Chart", "打开 ECharts 图表面板", "Open the ECharts chart panel", "showEChartsPicker", "fas fa-chart-line", "", false, {"echarts", "ECharts", "图表"}, {"echarts", "chart"}));

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
        
        // 拼音开头匹配（对于中文字段）
        if (!compactQuery.empty() && !field.empty()) {
            std::string pinyin = toPinyin(field);
            std::string pinyinCompact = compactSearchText(pinyin);
            if (pinyinCompact.find(compactQuery) == 0) {
                // 拼音全拼匹配标题时给非常高的加分（超越基础分差距）
                if (name == "titleZh") {
                    score += prefixScore + 2000;
                } else {
                    score += prefixScore + 500;
                }
                matchedField = name + "Pinyin";
                matched = true;
                return;
            }
            
            // 拼音首字母匹配
            std::string pinyinInitials = toPinyinInitials(field);
            std::string initialsCompact = compactSearchText(pinyinInitials);
            if (initialsCompact.find(compactQuery) == 0) {
                // 拼音首字母匹配标题时给非常高的加分（超越基础分差距）
                if (name == "titleZh") {
                    score += prefixScore + 1800;
                } else {
                    score += prefixScore + 400;
                }
                matchedField = name + "PinyinInitials";
                matched = true;
                return;
            }
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
        
        // 拼音开头匹配（对于中文别名）
        if (!compactQuery.empty() && !alias.empty()) {
            std::string pinyin = toPinyin(alias);
            std::string pinyinCompact = compactSearchText(pinyin);
            if (pinyinCompact.find(compactQuery) == 0) {
                score += 200;
                matchedField = "aliasPinyin";
                matched = true;
                continue;
            }
            
            // 拼音首字母匹配
            std::string pinyinInitials = toPinyinInitials(alias);
            std::string initialsCompact = compactSearchText(pinyinInitials);
            if (initialsCompact.find(compactQuery) == 0) {
                score += 180;
                matchedField = "aliasPinyinInitials";
                matched = true;
                continue;
            }
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
        
        // 拼音开头匹配（对于中文关键词）
        if (!compactQuery.empty() && !keyword.empty()) {
            std::string pinyin = toPinyin(keyword);
            std::string pinyinCompact = compactSearchText(pinyin);
            if (pinyinCompact.find(compactQuery) == 0) {
                score += 100;
                matchedField = "keywordPinyin";
                matched = true;
                continue;
            }
            
            // 拼音首字母匹配
            std::string pinyinInitials = toPinyinInitials(keyword);
            std::string initialsCompact = compactSearchText(pinyinInitials);
            if (initialsCompact.find(compactQuery) == 0) {
                score += 80;
                matchedField = "keywordPinyinInitials";
                matched = true;
                continue;
            }
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
    bool includeHidden
) const {
    const std::string normalizedQuery = normalizeSearchText(query);
    const std::string lang = languageCode(language);
    const int maxItems = limit > 0 ? limit : 24;

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
    for (size_t i = 0; i < ranked.size() && i < static_cast<size_t>(maxItems); ++i) {
        if (i > 0) items << ",";
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
    out << "\"total\":" << ranked.size();
    out << "}";
    return out.str();
}

std::string WasmTextEngine::slashPaletteSettings(const std::string& language) const {
    return buildSettingsJson(language);
}