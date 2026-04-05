#include "text_engine.h"

#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdint>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace {

struct DiffOp {
    std::string type;
    std::string text;
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
                    out += hex[(ch >> 4) & 0x0f];
                    out += hex[ch & 0x0f];
                } else {
                    out += ch;
                }
        }
    }
    return out;
}

std::vector<std::string> splitLines(const std::string& text) {
    std::vector<std::string> lines;
    std::string current;
    std::istringstream stream(text);
    while (std::getline(stream, current)) {
        lines.push_back(current);
    }
    if (!text.empty() && text.back() == '\n') {
        lines.push_back("");
    }
    return lines;
}

std::string toAsciiLower(const std::string& input) {
    std::string out = input;
    for (size_t i = 0; i < out.size(); ++i) {
        out[i] = static_cast<char>(std::tolower(static_cast<unsigned char>(out[i])));
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

bool isTagBoundary(unsigned char ch) {
    return !(std::isalnum(ch) || ch == '_' || ch == '-' || ch >= 0x80);
}

std::string normalizeTagToken(const std::string& raw) {
    std::string token = trimAscii(raw);
    if (token.empty()) return "";

    while (!token.empty() && (token[0] == '#' || token[0] == '-' || token[0] == '"' || token[0] == '\'')) {
        token.erase(token.begin());
    }
    while (!token.empty() && (token[token.size() - 1] == ',' || token[token.size() - 1] == '.' || token[token.size() - 1] == ';' || token[token.size() - 1] == '"' || token[token.size() - 1] == '\'' || token[token.size() - 1] == ']')) {
        token.erase(token.end() - 1);
    }

    token = trimAscii(token);
    if (token.empty()) return "";
    return toAsciiLower(token);
}

void collectFrontmatterTags(const std::string& text, std::set<std::string>& outTags) {
    if (!(text.rfind("---\n", 0) == 0 || text.rfind("---\r\n", 0) == 0)) return;

    size_t metaStart = text.find('\n');
    if (metaStart == std::string::npos) return;
    ++metaStart;

    size_t metaEnd = text.find("\n---", metaStart);
    if (metaEnd == std::string::npos) return;

    const std::string meta = text.substr(metaStart, metaEnd - metaStart);
    std::istringstream stream(meta);
    std::string line;
    bool inTagList = false;

    while (std::getline(stream, line)) {
        const std::string lower = toAsciiLower(trimAscii(line));
        if (lower.empty()) {
            inTagList = false;
            continue;
        }

        if (lower.rfind("tags:", 0) == 0) {
            inTagList = true;
            std::string remain = trimAscii(line.substr(line.find(':') + 1));
            if (!remain.empty()) {
                if (!remain.empty() && remain[0] == '[') {
                    if (!remain.empty() && remain[remain.size() - 1] == ']') {
                        remain = remain.substr(1, remain.size() - 2);
                    }
                    std::stringstream ss(remain);
                    std::string token;
                    while (std::getline(ss, token, ',')) {
                        const std::string normalized = normalizeTagToken(token);
                        if (!normalized.empty()) outTags.insert(normalized);
                    }
                } else {
                    const std::string normalized = normalizeTagToken(remain);
                    if (!normalized.empty()) outTags.insert(normalized);
                }
                inTagList = false;
            }
            continue;
        }

        if (!inTagList) continue;

        std::string trimmed = trimAscii(line);
        if (!trimmed.empty() && trimmed[0] == '-') {
            const std::string normalized = normalizeTagToken(trimmed.substr(1));
            if (!normalized.empty()) outTags.insert(normalized);
        } else {
            inTagList = false;
        }
    }
}

void collectHashtagTags(const std::string& text, std::set<std::string>& outTags) {
    for (size_t i = 0; i < text.size(); ++i) {
        if (text[i] != '#') continue;

        if (i > 0 && !isTagBoundary(static_cast<unsigned char>(text[i - 1]))) {
            continue;
        }

        size_t j = i + 1;
        while (j < text.size()) {
            const unsigned char ch = static_cast<unsigned char>(text[j]);
            if (isTagBoundary(ch)) break;
            ++j;
        }

        if (j <= i + 1) continue;

        const std::string raw = text.substr(i + 1, j - i - 1);
        const std::string normalized = normalizeTagToken(raw);
        if (normalized.size() >= 2) {
            outTags.insert(normalized);
        }

        i = j;
    }
}

bool isUtf8Continuation(unsigned char ch) {
    return (ch & 0xC0) == 0x80;
}

bool isUtf8Boundary(const std::string& text, size_t pos) {
    if (pos == 0 || pos >= text.size()) return true;
    return !isUtf8Continuation(static_cast<unsigned char>(text[pos]));
}

size_t clampUtf8Start(const std::string& text, size_t pos) {
    if (pos >= text.size()) return text.size();
    while (pos > 0 && isUtf8Continuation(static_cast<unsigned char>(text[pos]))) {
        --pos;
    }
    return pos;
}

size_t clampUtf8End(const std::string& text, size_t pos) {
    if (pos >= text.size()) return text.size();
    while (pos < text.size() && isUtf8Continuation(static_cast<unsigned char>(text[pos]))) {
        ++pos;
    }
    return pos;
}

std::string utf8SafeSlice(const std::string& text, size_t start, size_t end) {
    size_t s = clampUtf8Start(text, std::min(start, text.size()));
    size_t e = clampUtf8End(text, std::min(end, text.size()));
    if (e < s) e = s;
    return text.substr(s, e - s);
}

std::vector<std::pair<size_t, size_t> > findAllByteRanges(
    const std::string& text,
    const std::string& query,
    bool caseSensitive
) {
    std::vector<std::pair<size_t, size_t> > matches;
    if (query.empty()) return matches;

    const std::string hay = caseSensitive ? text : toAsciiLower(text);
    const std::string needle = caseSensitive ? query : toAsciiLower(query);

    size_t pos = hay.find(needle, 0);
    while (pos != std::string::npos) {
        const size_t end = pos + needle.size();
        // Ensure match does not split UTF-8 code points.
        if (isUtf8Boundary(text, pos) && isUtf8Boundary(text, end)) {
            matches.push_back(std::make_pair(pos, end));
        }
        pos = hay.find(needle, pos + 1);
    }

    return matches;
}

std::vector<std::string> tokenize(const std::string& text, bool caseSensitive) {
    std::vector<std::string> tokens;
    std::string current;

    auto flush = [&]() {
        if (!current.empty()) {
            tokens.push_back(caseSensitive ? current : toAsciiLower(current));
            current.clear();
        }
    };

    for (size_t i = 0; i < text.size(); ++i) {
        unsigned char ch = static_cast<unsigned char>(text[i]);
        if (std::isalnum(ch) || ch == '_') {
            current.push_back(static_cast<char>(ch));
            continue;
        }

        if (ch >= 0x80) {
            flush();
            std::string utf8Chunk;
            utf8Chunk.push_back(static_cast<char>(ch));
            // Keep contiguous non-ASCII bytes together as one token.
            while (i + 1 < text.size() && static_cast<unsigned char>(text[i + 1]) >= 0x80) {
                ++i;
                utf8Chunk.push_back(text[i]);
            }
            tokens.push_back(utf8Chunk);
            continue;
        }

        flush();
    }
    flush();

    return tokens;
}

size_t levenshteinDistance(const std::string& a, const std::string& b) {
    if (a.empty()) return b.size();
    if (b.empty()) return a.size();

    std::vector<size_t> prev(b.size() + 1, 0);
    std::vector<size_t> curr(b.size() + 1, 0);

    for (size_t j = 0; j <= b.size(); ++j) {
        prev[j] = j;
    }

    for (size_t i = 1; i <= a.size(); ++i) {
        curr[0] = i;
        for (size_t j = 1; j <= b.size(); ++j) {
            size_t cost = (a[i - 1] == b[j - 1]) ? 0 : 1;
            curr[j] = std::min({
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            });
        }
        std::swap(prev, curr);
    }

    return prev[b.size()];
}

} // namespace

struct WasmTextEngine::Impl {
    std::unordered_map<std::string, std::string> docs;
    std::unordered_map<std::string, std::unordered_set<std::string> > inverted;
};

WasmTextEngine::WasmTextEngine() : impl_(new Impl()) {}

WasmTextEngine::~WasmTextEngine() {
    delete impl_;
}

std::string WasmTextEngine::diff(const std::string& oldText, const std::string& newText) const {
    const std::vector<std::string> left = splitLines(oldText);
    const std::vector<std::string> right = splitLines(newText);

    const size_t n = left.size();
    const size_t m = right.size();

    std::vector<std::vector<int> > dp(n + 1, std::vector<int>(m + 1, 0));

    for (size_t i = 1; i <= n; ++i) {
        for (size_t j = 1; j <= m; ++j) {
            if (left[i - 1] == right[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = std::max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    std::vector<DiffOp> revOps;
    size_t i = n;
    size_t j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && left[i - 1] == right[j - 1]) {
            revOps.push_back({"equal", left[i - 1]});
            --i;
            --j;
        } else if (j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            revOps.push_back({"add", right[j - 1]});
            --j;
        } else if (i > 0) {
            revOps.push_back({"delete", left[i - 1]});
            --i;
        }
    }

    std::reverse(revOps.begin(), revOps.end());

    size_t added = 0;
    size_t removed = 0;
    std::ostringstream opsJson;
    opsJson << "[";
    for (size_t k = 0; k < revOps.size(); ++k) {
        if (k > 0) opsJson << ",";
        opsJson << "{\"type\":\"" << revOps[k].type << "\",\"text\":\"" << jsonEscape(revOps[k].text) << "\"}";
        if (revOps[k].type == "add") ++added;
        if (revOps[k].type == "delete") ++removed;
    }
    opsJson << "]";

    std::ostringstream result;
    result << "{"
           << "\"summary\":{"
           << "\"added\":" << added << ","
           << "\"deleted\":" << removed << ","
           << "\"beforeLines\":" << n << ","
           << "\"afterLines\":" << m
           << "},"
           << "\"ops\":" << opsJson.str()
           << "}";

    return result.str();
}

std::string WasmTextEngine::merge3(
    const std::string& baseText,
    const std::string& localText,
    const std::string& remoteText,
    const std::string& strategy
) const {
    const std::vector<std::string> base = splitLines(baseText);
    const std::vector<std::string> local = splitLines(localText);
    const std::vector<std::string> remote = splitLines(remoteText);

    const size_t maxLines = std::max(base.size(), std::max(local.size(), remote.size()));
    std::vector<std::string> merged;
    std::vector<std::pair<int, std::pair<std::string, std::string> > > conflicts;

    for (size_t i = 0; i < maxLines; ++i) {
        std::string b = (i < base.size()) ? base[i] : "";
        std::string l = (i < local.size()) ? local[i] : "";
        std::string r = (i < remote.size()) ? remote[i] : "";

        if (l == r) {
            merged.push_back(l);
            continue;
        }

        if (l == b) {
            merged.push_back(r);
            continue;
        }

        if (r == b) {
            merged.push_back(l);
            continue;
        }

        if (strategy == "local") {
            merged.push_back(l);
            continue;
        }

        if (strategy == "remote") {
            merged.push_back(r);
            continue;
        }

        std::ostringstream marker;
        marker << "<<<<<<< LOCAL\n" << l << "\n=======\n" << r << "\n>>>>>>> REMOTE";
        merged.push_back(marker.str());
        conflicts.push_back(std::make_pair(static_cast<int>(i + 1), std::make_pair(l, r)));
    }

    std::ostringstream mergedText;
    for (size_t i = 0; i < merged.size(); ++i) {
        mergedText << merged[i];
        if (i + 1 < merged.size()) mergedText << "\n";
    }

    std::ostringstream conflictsJson;
    conflictsJson << "[";
    for (size_t i = 0; i < conflicts.size(); ++i) {
        if (i > 0) conflictsJson << ",";
        conflictsJson << "{"
                      << "\"line\":" << conflicts[i].first << ","
                      << "\"local\":\"" << jsonEscape(conflicts[i].second.first) << "\","
                      << "\"remote\":\"" << jsonEscape(conflicts[i].second.second) << "\""
                      << "}";
    }
    conflictsJson << "]";

    std::ostringstream out;
    out << "{"
        << "\"mergedText\":\"" << jsonEscape(mergedText.str()) << "\","
        << "\"conflictCount\":" << conflicts.size() << ","
        << "\"hasConflict\":" << (conflicts.empty() ? "false" : "true") << ","
        << "\"conflicts\":" << conflictsJson.str()
        << "}";

    return out.str();
}

void WasmTextEngine::indexDocument(const std::string& docId, const std::string& text) {
    removeDocument(docId);

    impl_->docs[docId] = text;
    const std::vector<std::string> tokens = tokenize(text, false);
    for (size_t i = 0; i < tokens.size(); ++i) {
        impl_->inverted[tokens[i]].insert(docId);
    }
}

void WasmTextEngine::removeDocument(const std::string& docId) {
    if (impl_->docs.find(docId) == impl_->docs.end()) {
        return;
    }

    const std::vector<std::string> tokens = tokenize(impl_->docs[docId], false);
    for (size_t i = 0; i < tokens.size(); ++i) {
        std::unordered_map<std::string, std::unordered_set<std::string> >::iterator it = impl_->inverted.find(tokens[i]);
        if (it == impl_->inverted.end()) {
            continue;
        }
        it->second.erase(docId);
        if (it->second.empty()) {
            impl_->inverted.erase(it);
        }
    }

    impl_->docs.erase(docId);
}

void WasmTextEngine::clearIndex() {
    impl_->docs.clear();
    impl_->inverted.clear();
}

std::string WasmTextEngine::search(const std::string& query, int limit, bool caseSensitive, bool wholeWord) const {
    std::vector<std::string> queryTokens = tokenize(query, caseSensitive);
    if (queryTokens.empty()) {
        return "{\"query\":\"\",\"results\":[],\"total\":0}";
    }

    std::unordered_map<std::string, int> score;
    if (wholeWord) {
        for (size_t i = 0; i < queryTokens.size(); ++i) {
            std::unordered_map<std::string, std::unordered_set<std::string> >::const_iterator it = impl_->inverted.find(caseSensitive ? queryTokens[i] : toAsciiLower(queryTokens[i]));
            if (it == impl_->inverted.end()) continue;
            for (std::unordered_set<std::string>::const_iterator docIt = it->second.begin(); docIt != it->second.end(); ++docIt) {
                score[*docIt] += 2;
            }
        }
    } else {
        const std::string q = caseSensitive ? query : toAsciiLower(query);
        for (std::unordered_map<std::string, std::string>::const_iterator it = impl_->docs.begin(); it != impl_->docs.end(); ++it) {
            std::string candidate = caseSensitive ? it->second : toAsciiLower(it->second);
            if (candidate.find(q) != std::string::npos) {
                score[it->first] += 3;
            }
        }
    }

    std::vector<std::pair<std::string, int> > rows(score.begin(), score.end());
    std::sort(rows.begin(), rows.end(), [](const std::pair<std::string, int>& a, const std::pair<std::string, int>& b) {
        if (a.second != b.second) return a.second > b.second;
        return a.first < b.first;
    });

    if (limit <= 0) limit = 20;
    const size_t maxRows = static_cast<size_t>(limit);

    std::ostringstream items;
    items << "[";
    for (size_t i = 0; i < rows.size() && i < maxRows; ++i) {
        if (i > 0) items << ",";
        std::unordered_map<std::string, std::string>::const_iterator docIt = impl_->docs.find(rows[i].first);
        const std::string& text = docIt != impl_->docs.end() ? docIt->second : std::string();
        std::vector<std::pair<size_t, size_t> > hits = findAllByteRanges(text, query, caseSensitive);
        std::string snippet;
        if (!hits.empty()) {
            const size_t start = (hits[0].first > 24) ? (hits[0].first - 24) : 0;
            const size_t end = std::min(text.size(), hits[0].second + 24);
            snippet = utf8SafeSlice(text, start, end);
        } else {
            snippet = utf8SafeSlice(text, 0, 120);
        }

        std::ostringstream hitJson;
        hitJson << "[";
        for (size_t h = 0; h < hits.size(); ++h) {
            if (h > 0) hitJson << ",";
            const size_t hs = (hits[h].first > 24) ? (hits[h].first - 24) : 0;
            const size_t he = std::min(text.size(), hits[h].second + 24);
            hitJson << "{"
                    << "\"start\":" << hits[h].first << ","
                    << "\"end\":" << hits[h].second << ","
                    << "\"snippet\":\"" << jsonEscape(utf8SafeSlice(text, hs, he)) << "\""
                    << "}";
        }
        hitJson << "]";

        items << "{"
              << "\"docId\":\"" << jsonEscape(rows[i].first) << "\","
              << "\"score\":" << rows[i].second << ","
              << "\"snippet\":\"" << jsonEscape(snippet) << "\","
              << "\"matchCount\":" << hits.size() << ","
              << "\"hits\":" << hitJson.str()
              << "}";
    }
    items << "]";

    std::ostringstream out;
    out << "{"
        << "\"query\":\"" << jsonEscape(query) << "\","
        << "\"results\":" << items.str() << ","
        << "\"total\":" << rows.size()
        << "}";

    return out.str();
}

std::string WasmTextEngine::analyze(const std::string& text) const {
    size_t lines = 0;
    size_t words = 0;
    size_t chars = text.size();

    if (!text.empty()) {
        lines = 1;
        for (size_t i = 0; i < text.size(); ++i) {
            if (text[i] == '\n') ++lines;
        }
    }

    std::vector<std::string> tokens = tokenize(text, false);
    words = tokens.size();

    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < text.size(); ++i) {
        hash ^= static_cast<uint8_t>(text[i]);
        hash *= 16777619u;
    }

    std::ostringstream out;
    out << "{"
        << "\"lines\":" << lines << ","
        << "\"words\":" << words << ","
        << "\"chars\":" << chars << ","
        << "\"fingerprint\":\"" << hash << "\""
        << "}";
    return out.str();
}

std::string WasmTextEngine::similarity(const std::string& leftText, const std::string& rightText) const {
    const size_t maxLen = std::max(leftText.size(), rightText.size());
    if (maxLen == 0) {
        return "{\"score\":1,\"distance\":0}";
    }

    const size_t dist = levenshteinDistance(leftText, rightText);
    const double score = 1.0 - static_cast<double>(dist) / static_cast<double>(maxLen);

    std::ostringstream out;
    out << "{"
        << "\"score\":" << score << ","
        << "\"distance\":" << dist
        << "}";

    return out.str();
}

std::string WasmTextEngine::extractTags(const std::string& text) const {
    std::set<std::string> tags;
    collectFrontmatterTags(text, tags);
    collectHashtagTags(text, tags);

    std::ostringstream tagsJson;
    tagsJson << "[";
    size_t index = 0;
    for (std::set<std::string>::const_iterator it = tags.begin(); it != tags.end(); ++it) {
        if (index > 0) tagsJson << ",";
        tagsJson << "\"" << jsonEscape(*it) << "\"";
        ++index;
    }
    tagsJson << "]";

    std::ostringstream out;
    out << "{"
        << "\"tags\":" << tagsJson.str() << ","
        << "\"count\":" << tags.size()
        << "}";
    return out.str();
}

std::string WasmTextEngine::findInText(const std::string& text, const std::string& query, bool caseSensitive) const {
    if (query.empty()) {
        return "{\"query\":\"\",\"matches\":[],\"count\":0}";
    }

    std::vector<std::pair<size_t, size_t> > hits = findAllByteRanges(text, query, caseSensitive);

    std::ostringstream matches;
    matches << "[";
    for (size_t i = 0; i < hits.size(); ++i) {
        if (i > 0) matches << ",";
        const size_t hs = (hits[i].first > 24) ? (hits[i].first - 24) : 0;
        const size_t he = std::min(text.size(), hits[i].second + 24);
        matches << "{"
                << "\"start\":" << hits[i].first << ","
                << "\"end\":" << hits[i].second << ","
                << "\"snippet\":\"" << jsonEscape(utf8SafeSlice(text, hs, he)) << "\""
                << "}";
    }
    matches << "]";

    std::ostringstream out;
    out << "{"
        << "\"query\":\"" << jsonEscape(query) << "\","
        << "\"count\":" << hits.size() << ","
        << "\"matches\":" << matches.str()
        << "}";
    return out.str();
}

std::string WasmTextEngine::replaceAllText(
    const std::string& text,
    const std::string& query,
    const std::string& replacement,
    bool caseSensitive
) const {
    if (query.empty()) {
        std::ostringstream unchanged;
        unchanged << "{\"text\":\"" << jsonEscape(text) << "\",\"replaced\":0}";
        return unchanged.str();
    }

    std::vector<std::pair<size_t, size_t> > hits = findAllByteRanges(text, query, caseSensitive);
    if (hits.empty()) {
        std::ostringstream unchanged;
        unchanged << "{\"text\":\"" << jsonEscape(text) << "\",\"replaced\":0}";
        return unchanged.str();
    }

    std::ostringstream rebuilt;
    size_t cursor = 0;
    for (size_t i = 0; i < hits.size(); ++i) {
        rebuilt << text.substr(cursor, hits[i].first - cursor);
        rebuilt << replacement;
        cursor = hits[i].second;
    }
    rebuilt << text.substr(cursor);

    std::ostringstream out;
    out << "{"
        << "\"text\":\"" << jsonEscape(rebuilt.str()) << "\","
        << "\"replaced\":" << hits.size()
        << "}";
    return out.str();
}


