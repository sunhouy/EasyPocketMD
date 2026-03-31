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
        .function("similarity", &WasmTextEngine::similarity);
}

#endif

