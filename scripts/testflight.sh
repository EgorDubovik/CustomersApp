#!/usr/bin/env bash
# Build the iOS app and upload it to TestFlight.
#
# Usage:  ./scripts/testflight.sh
#
# What it does:
#   1. Bumps expo.ios.buildNumber in app.json by 1 (Apple rejects a repeated build number).
#   2. Syncs that number into the native ios/ project.
#   3. Archives a Release build (unsigned) and lets Xcode sign it with
#      the Apple Distribution certificate while uploading to App Store Connect.
#
# Requirements: Xcode signed in to the Apple ID of team UKHPRW32L4,
# node_modules and ios/Pods installed, .env.production present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

BUILD=$(node -e '
  const fs = require("fs");
  const p = "app.json";
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const next = String(Number(j.expo.ios.buildNumber || "0") + 1);
  j.expo.ios.buildNumber = next;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  process.stdout.write(next);
')
VERSION=$(node -p 'require("./app.json").expo.version')
echo "==> Building ApexFlow $VERSION ($BUILD)"

/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" ios/ApexFlow/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" ios/ApexFlow/Info.plist
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD;/g" ios/ApexFlow.xcodeproj/project.pbxproj

cd ios
rm -rf build/ApexFlow.xcarchive build/export
mkdir -p build

echo "==> Archiving (log: ios/build/archive.log)"
xcodebuild -workspace ApexFlow.xcworkspace -scheme ApexFlow -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/ApexFlow.xcarchive \
  DEVELOPMENT_TEAM=UKHPRW32L4 CODE_SIGNING_ALLOWED=NO archive > build/archive.log 2>&1 \
  || { grep -E "error:" build/archive.log | sort -u; echo "Archive failed"; exit 1; }

echo "==> Signing and uploading to App Store Connect (log: ios/build/export.log)"
xcodebuild -exportArchive -archivePath build/ApexFlow.xcarchive \
  -exportOptionsPlist ../scripts/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates > build/export.log 2>&1 \
  || { grep -E "error" build/export.log | sort -u; echo "Upload failed"; exit 1; }

echo "==> Uploaded ApexFlow $VERSION ($BUILD). It appears in TestFlight after Apple finishes processing (10-30 min)."
echo "    Commit the bumped app.json: git commit -am \"Build $BUILD\""
