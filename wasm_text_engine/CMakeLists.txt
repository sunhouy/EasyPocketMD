cmake_minimum_required(VERSION 3.16)
project(wasm_text_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(text_engine_core STATIC
    src/text_engine.cpp
)

target_include_directories(text_engine_core PUBLIC src)

add_executable(smoke_test
    tests/smoke_test.cpp
)

target_link_libraries(smoke_test PRIVATE text_engine_core)

if(EMSCRIPTEN)
    add_executable(text_engine_wasm
        src/text_engine.cpp
        src/wasm_bindings.cpp
    )

    set_target_properties(text_engine_wasm PROPERTIES
        OUTPUT_NAME "text_engine"
        SUFFIX ".js"
        LINK_FLAGS "--bind -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker,node"
    )
endif()

