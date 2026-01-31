#!/bin/bash
PLATFORM=$1 # win or linux
ARCH=$2     # x64 or arm64
BINARY=$3   # Path to the source binary
ICON=$4     # Optional icon source (jpeg)

if [ -z "$PLATFORM" ] || [ -z "$ARCH" ] || [ -z "$BINARY" ]; then
  echo "Usage: ./build_dist.sh <win|linux> <x64|arm64> <binary_path> [icon_path]"
  exit 1
fi

DIST_DIR="dist-${PLATFORM}-${ARCH}"
mkdir -p "${DIST_DIR}"

echo "Packaging for ${PLATFORM} (${ARCH})..."

# 1. Copy Binary
if [ "$PLATFORM" == "win" ]; then
    TARGET_BINARY="Llamatic.exe"
    cp "${BINARY}" "${DIST_DIR}/${TARGET_BINARY}"
    
    # Generate ICO if icon provided
    if [ ! -z "$ICON" ] && [ -f "create_ico.js" ]; then
        echo "Generating Windows icon..."
        node create_ico.js "${ICON}" "${DIST_DIR}/Llamatic.ico"
        # Note: rcedit would be used here if we wanted to embed it, 
        # but for a ZIP dist, just including the .ico is often fine or we can skip embedding for now.
    fi
    
    # Copy bat launcher
    if [ -f "start_detached.bat" ]; then
        cp "start_detached.bat" "${DIST_DIR}/"
    fi
else
    TARGET_BINARY="llamatic"
    cp "${BINARY}" "${DIST_DIR}/${TARGET_BINARY}"
    chmod +x "${DIST_DIR}/${TARGET_BINARY}"
    
    # Copy sh launcher
    if [ -f "start_detached.sh" ]; then
        cp "start_detached.sh" "${DIST_DIR}/"
        chmod +x "${DIST_DIR}/start_detached.sh"
    fi
fi

# 2. Copy Public Assets
cp -r "public" "${DIST_DIR}/"

# 3. Create Archive
if [ "$PLATFORM" == "win" ]; then
    PACKAGE_NAME="Llamatic-Windows-${ARCH}.zip"
    rm -f "${PACKAGE_NAME}"
    zip -r "${PACKAGE_NAME}" "${DIST_DIR}"
    echo "Created ${PACKAGE_NAME}"
else
    PACKAGE_NAME="Llamatic-Linux-${ARCH}.tar.gz"
    rm -f "${PACKAGE_NAME}"
    tar -czf "${PACKAGE_NAME}" "${DIST_DIR}"
    echo "Created ${PACKAGE_NAME}"
fi

# Cleanup
rm -rf "${DIST_DIR}"
