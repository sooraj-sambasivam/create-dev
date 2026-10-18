#!/bin/sh
# Wraps the release binary in "Create Tray.app" (ad-hoc signed) so macOS permissions stick to one identity.
set -e
cd "$(dirname "$0")/.."
swift build -c release
APP=".build/Create Tray.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
cp .build/release/CreateTray "$APP/Contents/MacOS/CreateTray"
cp Resources/Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
echo "$PWD/$APP"
