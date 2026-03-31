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
        std::string snippet = text.substr(0, 120);
        items << "{"
              << "\"docId\":\"" << jsonEscape(rows[i].first) << "\","
              << "\"score\":" << rows[i].second << ","
              << "\"snippet\":\"" << jsonEscape(snippet) << "\""
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


