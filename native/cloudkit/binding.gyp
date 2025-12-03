{
  "targets": [
    {
      "target_name": "cloudkit",
      "sources": [
        "src/node_addon.cpp",
        "src/cloudkit_wrapper.mm",
        "src/cloudkit_bridge.swift"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "xcode_settings": {
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CFLAGS": ["-x objective-c++"],
        "OTHER_LDFLAGS": [
          "-framework CloudKit",
          "-framework Foundation"
        ],
        "SWIFT_VERSION": "5.0",
        "CLANG_ENABLE_MODULES": "YES",
        "LD_RUNPATH_SEARCH_PATHS": [
          "@executable_path/",
          "@loader_path/"
        ]
      }
    }
  ]
}
