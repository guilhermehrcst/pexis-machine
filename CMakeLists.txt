cmake_minimum_required(VERSION 3.20)

project(PexisMachine VERSION 0.1.0 LANGUAGES CXX)

option(PEXIS_MACHINE_BUILD_TESTS "Build Pexis Machine tests" ON)
option(PEXIS_MACHINE_ENABLE_SANITIZERS "Enable AddressSanitizer and UndefinedBehaviorSanitizer" OFF)

add_library(pexis_machine STATIC
    src/experiments.cpp
    src/machine.cpp
    src/memory.cpp
    src/program.cpp
)

add_library(Pexis::Machine ALIAS pexis_machine)

target_include_directories(pexis_machine
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_compile_features(pexis_machine PUBLIC cxx_std_20)

if(MSVC)
    target_compile_options(pexis_machine PRIVATE /W4 /WX /permissive-)
else()
    target_compile_options(pexis_machine PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

if(PEXIS_MACHINE_ENABLE_SANITIZERS)
    if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        target_compile_options(pexis_machine PUBLIC -fsanitize=address,undefined -fno-omit-frame-pointer)
        target_link_options(pexis_machine PUBLIC -fsanitize=address,undefined)
    else()
        message(FATAL_ERROR "Sanitizers are currently supported only with GCC or Clang")
    endif()
endif()

add_executable(pxm-demo apps/pxm/main.cpp)
target_link_libraries(pxm-demo PRIVATE Pexis::Machine)

if(MSVC)
    target_compile_options(pxm-demo PRIVATE /W4 /WX /permissive-)
else()
    target_compile_options(pxm-demo PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

if(PEXIS_MACHINE_BUILD_TESTS)
    enable_testing()

    add_executable(pexis_machine_tests tests/machine_tests.cpp)
    target_link_libraries(pexis_machine_tests PRIVATE Pexis::Machine)

    if(MSVC)
        target_compile_options(pexis_machine_tests PRIVATE /W4 /WX /permissive-)
    else()
        target_compile_options(pexis_machine_tests PRIVATE -Wall -Wextra -Wpedantic -Werror)
    endif()

    add_test(NAME pexis_machine_tests COMMAND pexis_machine_tests)
endif()

# WebAssembly adapter for the Web Lab. Configure with `emcmake cmake ...`.
# The module is a narrow bridge over the same Machine used natively; it owns
# no machine semantics. See docs/wasm-boundary.md.
if(EMSCRIPTEN)
    add_executable(pexis_machine_wasm wasm/bindings.cpp)
    target_link_libraries(pexis_machine_wasm PRIVATE Pexis::Machine)
    target_compile_options(pexis_machine_wasm PRIVATE -Wall -Wextra -Wpedantic -Werror)
    set_target_properties(pexis_machine_wasm PROPERTIES OUTPUT_NAME "pexis-machine" SUFFIX ".js")
    target_link_options(pexis_machine_wasm PRIVATE
        -lembind
        -sMODULARIZE=1
        -sEXPORT_ES6=1
        -sEXPORT_NAME=createPexisMachine
        -sENVIRONMENT=web,node
        -sWASM_BIGINT=1
        -sFILESYSTEM=0
        -sALLOW_MEMORY_GROWTH=0
        -sINITIAL_MEMORY=4194304
        -sSTACK_SIZE=262144
        -sDYNAMIC_EXECUTION=0
    )
endif()
