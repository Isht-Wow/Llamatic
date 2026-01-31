#!/bin/bash
# Build .deb package from the prepared llamatic-deb directory
# Run this script on a Linux machine with dpkg-deb installed

cd "$(dirname "$0")"

if ! command -v dpkg-deb &> /dev/null; then
    echo "Error: dpkg-deb is required. Install with: sudo apt-get install dpkg"
    exit 1
fi

# Build the .deb
dpkg-deb --build llamatic-deb llamatic_0.1.0_amd64.deb

echo "Created llamatic_0.1.0_amd64.deb"
echo "Install with: sudo dpkg -i llamatic_0.1.0_amd64.deb"
