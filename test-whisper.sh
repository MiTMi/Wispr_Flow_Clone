#!/bin/bash

# Test script to verify WhisperKit is working

echo "=== WhisperKit Test Script ==="
echo ""

# 1. Check if binary exists
echo "1. Checking if whisper-cli binary exists..."
if [ -f "./swift-whisper/.build/release/whisper-cli" ]; then
    echo "   ✅ Binary found at: ./swift-whisper/.build/release/whisper-cli"
    ls -lh ./swift-whisper/.build/release/whisper-cli
else
    echo "   ❌ Binary NOT found!"
    exit 1
fi

echo ""

# 2. Test list-models command
echo "2. Testing list-models command..."
./swift-whisper/.build/release/whisper-cli list-models

echo ""

# 3. Check app settings
echo "3. Checking app settings..."
SETTINGS_FILE="$HOME/Library/Application Support/wispr-flow-clone/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    echo "   Settings file exists at: $SETTINGS_FILE"
    echo "   (Note: Settings are encrypted, cannot display directly)"
else
    echo "   ⚠️  Settings file not found"
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "To enable local transcription:"
echo "1. Run: npm run dev"
echo "2. Open Settings in the app"
echo "3. Find 'Transcription Mode' section"
echo "4. Select 'On-Device Mode (WhisperKit)'"
echo "5. Choose model size (Base recommended)"
echo "6. Try recording something"
