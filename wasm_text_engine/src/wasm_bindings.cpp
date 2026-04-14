#ifdef __EMSCRIPTEN__

#include <emscripten/bind.h>

#include "text_engine.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(text_engine_module) {
    class_<WasmTextEngine>("WasmTextEngine")
        .constructor<>()
        .function("diff", &WasmTextEngine::diff)
        .function("merge3", &WasmTextEngine::merge3)
        .function("indexDocument", &WasmTextEngine::indexDocument)
        .function("removeDocument", &WasmTextEngine::removeDocument)
        .function("clearIndex", &WasmTextEngine::clearIndex)
        .function("search", &WasmTextEngine::search)
        .function("analyze", &WasmTextEngine::analyze)
        .function("similarity", &WasmTextEngine::similarity)
        .function("extractTags", &WasmTextEngine::extractTags)
        .function("findInText", &WasmTextEngine::findInText)
        .function("normalizePath", &WasmTextEngine::normalizePath)
        .function("parentPath", &WasmTextEngine::parentPath)
        .function("basenamePath", &WasmTextEngine::basenamePath)
        .function("pathBasename", &WasmTextEngine::pathBasename)
        .function("compareVersions", &WasmTextEngine::compareVersions)
        .function("isHiddenCrossSearchFile", &WasmTextEngine::isHiddenCrossSearchFile)
        .function("collectFolderPaths", &WasmTextEngine::collectFolderPaths)
        .function("replaceAllText", &WasmTextEngine::replaceAllText)
        .function("slashPalette", select_overload<std::string(const std::string&, const std::string&, int, int, bool) const>(&WasmTextEngine::slashPalette), "query", "language", with_default<int>(24), with_default<int>(0), with_default<bool>(false))
        .function("slashPaletteSettings", &WasmTextEngine::slashPaletteSettings);
}

#endif

