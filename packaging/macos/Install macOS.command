#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -f "plugin/manifest.json" ]; then
  echo "The plugin folder is missing. Extract the whole ZIP and run this script again."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if [ "$EUID" -ne 0 ]; then
  echo "Requesting administrator privileges..."
  sudo "$0"
  exit
fi

found=0
for ps in /Applications/Adobe\ Photoshop*/; do
  [ -d "$ps" ] || continue
  dest="$ps/Plug-ins/Lumiform Colorpicker"
  echo "Installing into $dest"
  mkdir -p "$dest"
  cp -R "plugin/." "$dest/"
  found=1
done

if [ "$found" -eq 0 ]; then
  echo "No Photoshop installation was found in /Applications."
  echo "Copy the 'plugin' folder into Photoshop's Plug-ins directory manually."
fi

read -n 1 -s -r -p "Press any key to close..."
