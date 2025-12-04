#!/bin/bash
set -e

echo "Building CloudKit native module with Swift support..."

# Get the project root
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NATIVE_ROOT="$PROJECT_ROOT/native/cloudkit"
SWIFT_OBJ_DIR="$NATIVE_ROOT/build/swift"

# Create Swift object directory (separate from node-gyp)
mkdir -p "$SWIFT_OBJ_DIR"

# Step 1: Compile Swift to object file
echo "Step 1: Compiling Swift code..."
swiftc -c \
    -sdk "$(xcrun --show-sdk-path)" \
    -target arm64-apple-macosx10.15 \
    -emit-objc-header \
    -emit-objc-header-path "$NATIVE_ROOT/src/wispr-flow-clone-Swift.h" \
    -import-objc-header "$NATIVE_ROOT/src/cloudkit_bridge.h" \
    -module-name wispr_flow_clone \
    -o "$SWIFT_OBJ_DIR/cloudkit_bridge.o" \
    "$NATIVE_ROOT/src/cloudkit_bridge.swift" \
    -F "$(xcrun --show-sdk-path)/System/Library/Frameworks"

echo "Swift compilation successful!"
echo "Swift object at: $SWIFT_OBJ_DIR/cloudkit_bridge.o"
echo "Generated bridging header at: $NATIVE_ROOT/src/wispr-flow-clone-Swift.h"

# Step 2: Now run node-gyp which will compile the C++ and Obj-C++ files
echo "Step 2: Building native module with node-gyp..."
cd "$NATIVE_ROOT"
node-gyp configure
node-gyp build

echo "Build complete!"
