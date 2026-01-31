#!/bin/bash
SOURCE_IMG=$1
DEST_ICNS=$2

if [ -z "$SOURCE_IMG" ] || [ -z "$DEST_ICNS" ]; then
  echo "Usage: ./create_icns.sh <SourceImage> <DestIcns>"
  exit 1
fi

ICONSET_DIR="Llamatic.iconset"
mkdir -p "$ICONSET_DIR"

# Resize images
sips -z 16 16     -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_16x16.png" > /dev/null
sips -z 32 32     -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_16x16@2x.png" > /dev/null
sips -z 32 32     -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_32x32.png" > /dev/null
sips -z 64 64     -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_32x32@2x.png" > /dev/null
sips -z 128 128   -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_128x128.png" > /dev/null
sips -z 256 256   -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_128x128@2x.png" > /dev/null
sips -z 256 256   -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_256x256.png" > /dev/null
sips -z 512 512   -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_256x256@2x.png" > /dev/null
sips -z 512 512   -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_512x512.png" > /dev/null
sips -z 1024 1024 -s format png "$SOURCE_IMG" --out "${ICONSET_DIR}/icon_512x512@2x.png" > /dev/null

# Create ICNS
iconutil -c icns "$ICONSET_DIR" -o "$DEST_ICNS"

# Cleanup
rm -rf "$ICONSET_DIR"

echo "Created $DEST_ICNS"
