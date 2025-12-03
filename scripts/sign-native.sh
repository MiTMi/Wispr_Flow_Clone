#!/bin/bash
set -e

NATIVE_MODULE="native/cloudkit/build/Release/cloudkit.node"
IDENTITY="Apple Development: michael.tubul@gmail.com (X4VTA8BYAW)"

if [ -f "$NATIVE_MODULE" ]; then
    echo "Signing native module: $NATIVE_MODULE"
    codesign --sign "$IDENTITY" --force --timestamp --options runtime "$NATIVE_MODULE"
    echo "Native module signed successfully"
else
    echo "Warning: Native module not found at $NATIVE_MODULE"
    echo "Run 'npm run build:native' first to build the native module"
    exit 1
fi
