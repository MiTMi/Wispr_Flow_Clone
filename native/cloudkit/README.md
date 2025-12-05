# CloudKit Native Module

This native module provides CloudKit iCloud sync functionality for the Wispr Flow Clone app.

## Important: Development vs Production

### CloudKit ONLY works in signed, built apps
CloudKit requires proper code signing and entitlements to function. **It will crash in development mode** (`npm run dev`) because the app is not signed with the necessary entitlements.

### Testing CloudKit Sync

**❌ DON'T:**
```bash
npm run dev  # CloudKit will crash
```

**✅ DO:**
```bash
# Build the signed app
npm run build:mac

# Run the built app
dist/mac-arm64/wispr-flow-clone.app/Contents/MacOS/wispr-flow-clone

# Or install from DMG
open dist/wispr-flow-clone-1.0.0.dmg
```

## Why This Happens

1. CloudKit requires the app to have specific entitlements in `build/entitlements.mac.plist`
2. Development mode doesn't sign the app with these entitlements
3. When CloudKit tries to initialize without proper entitlements, it crashes immediately
4. This is a fundamental Apple security requirement - there's no workaround

## Building the Native Module

```bash
cd native/cloudkit
npm run build
```

This will:
1. Compile Swift code to an object file (.o)
2. Compile C++/Objective-C++ wrapper code
3. Link everything into `build/Release/cloudkit.node`

## Architecture

```
TypeScript (Main Process)
    ↓
CloudKit Sync Manager (src/main/cloudkit-sync.ts)
    ↓
Node.js N-API (node_addon.cpp)
    ↓
Objective-C++ Wrapper (cloudkit_wrapper.mm)
    ↓
Swift CloudKit Manager (cloudkit_bridge.swift)
    ↓
Apple CloudKit Framework
```

## Files

- `src/cloudkit_bridge.swift` - Swift CloudKit implementation
- `src/cloudkit_wrapper.mm` - Objective-C++ bridge to Swift
- `src/node_addon.cpp` - Node.js N-API addon
- `src/cloudkit_bridge.h` - C header for inter-language communication
- `binding.gyp` - node-gyp build configuration
- `scripts/build.sh` - Custom build script (Swift + node-gyp)

## Requirements

- macOS 10.15+ (CloudKit framework)
- Xcode Command Line Tools
- Node.js 18+
- Valid Apple Developer account
- Properly configured CloudKit container (iCloud.app.mit.wissper)

## CloudKit Schema

The module expects these record types in CloudKit:

### Settings
- hotkey (String)
- triggerMode (String)
- holdKey (Int64, optional)
- startOnLogin (Int64) - 0 or 1
- style (String)
- language (String)
- customInstructions (String)
- deviceId (String, indexed)
- modifiedAt (Date/Time, indexed)

### HistoryItem
- itemId (String, indexed)
- text (String)
- timestamp (Date/Time, indexed)
- duration (Double)
- wpm (Int64)
- deviceId (String, indexed)

### NoteItem
- itemId (String, indexed)
- content (String)
- timestamp (Date/Time, indexed)
- deviceId (String, indexed)
