#include <cassert>
#include <iostream>

#include "../src/text_engine.h"

int main() {
    WasmTextEngine engine;

    std::string diffJson = engine.diff("A\nB\nC", "A\nB2\nC\nD");
    assert(diffJson.find("\"added\":2") != std::string::npos || diffJson.find("\"added\":1") != std::string::npos);
    assert(diffJson.find("\"ops\"") != std::string::npos);

    std::string mergeJson = engine.merge3(
        "line1\nline2",
        "line1\nline2-local",
        "line1\nline2-remote",
        "manual"
    );
    assert(mergeJson.find("\"hasConflict\":true") != std::string::npos);

    engine.indexDocument("file-1", "markdown editor supports sync and search");
    engine.indexDocument("file-2", "ppt generation and merge conflict resolver");
    std::string searchJson = engine.search("search", 10, false, false);
    assert(searchJson.find("file-1") != std::string::npos);

    std::string analyzeJson = engine.analyze("hello\nworld");
    assert(analyzeJson.find("\"lines\":2") != std::string::npos);

    std::string simJson = engine.similarity("abc", "abd");
    assert(simJson.find("\"distance\":1") != std::string::npos);

    std::string utf8FindJson = engine.findInText("此刻是测试🙂此刻", "此刻", false);
    assert(utf8FindJson.find("\"count\":2") != std::string::npos);
    assert(utf8FindJson.find("\"start\":0") != std::string::npos);

    std::cout << "smoke test passed" << std::endl;
    return 0;
}

