#!/bin/bash
APP_NAME=$1
BINARY_SOURCE=$2
ICON_SOURCE=$3

if [ -z "$APP_NAME" ] || [ -z "$BINARY_SOURCE" ]; then
  echo "Usage: ./build_app.sh <AppName> <SourceBinary> [IconSource]"
  exit 1
fi

APP_DIR="${APP_NAME}.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
DMG_NAME="${APP_NAME}.dmg"

echo "Building ${APP_DIR}..."

# Clean up previous build
rm -rf "${APP_DIR}" "${DMG_NAME}"

# Create directories
mkdir -p "${MACOS_DIR}"
mkdir -p "${RESOURCES_DIR}"

# Copy binary
cp "${BINARY_SOURCE}" "${MACOS_DIR}/${APP_NAME}"
chmod +x "${MACOS_DIR}/${APP_NAME}"

# Copy public assets as fallback/primary resource
cp -r "public" "${RESOURCES_DIR}/"

# Handle Icon
ICON_FILE=""
if [ ! -z "$ICON_SOURCE" ]; then
    echo "Generating icon from ${ICON_SOURCE}..."
    ./create_icns.sh "${ICON_SOURCE}" "${RESOURCES_DIR}/AppIcon.icns"
    ICON_FILE="<key>CFBundleIconFile</key><string>AppIcon</string>"
fi

# Create Info.plist
cat > "${CONTENTS_DIR}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.ishtwow.llamatic</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <true/>
    ${ICON_FILE}
</dict>
</plist>
EOF

echo "${APP_DIR} created successfully."

# Create DMG
echo "Creating DMG..."
hdiutil create -volname "${APP_NAME}" -srcfolder "${APP_DIR}" -ov -format UDZO "${DMG_NAME}"
echo "${DMG_NAME} created."
