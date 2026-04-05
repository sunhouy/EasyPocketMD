#ifndef WASM_TEXT_ENGINE_TEXT_ENGINE_H
#define WASM_TEXT_ENGINE_TEXT_ENGINE_H

#include <string>

class WasmTextEngine {
public:
    WasmTextEngine();
    ~WasmTextEngine();
    WasmTextEngine(const WasmTextEngine&) = delete;
    WasmTextEngine& operator=(const WasmTextEngine&) = delete;

    std::string diff(const std::string& oldText, const std::string& newText) const;
    std::string merge3(
        const std::string& baseText,
        const std::string& localText,
        const std::string& remoteText,
        const std::string& strategy
    ) const;

    void indexDocument(const std::string& docId, const std::string& text);
    void removeDocument(const std::string& docId);
    void clearIndex();
    std::string search(const std::string& query, int limit, bool caseSensitive, bool wholeWord) const;

    std::string analyze(const std::string& text) const;
    std::string similarity(const std::string& leftText, const std::string& rightText) const;
    std::string extractTags(const std::string& text) const;
    std::string findInText(const std::string& text, const std::string& query, bool caseSensitive) const;
    std::string replaceAllText(
        const std::string& text,
        const std::string& query,
        const std::string& replacement,
        bool caseSensitive
    ) const;

private:
    struct Impl;
    Impl* impl_;
};

#endif


