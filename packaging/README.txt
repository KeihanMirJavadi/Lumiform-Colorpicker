Lumiform Colorpicker
====================

A real-time 3D lighting reference and color picker for Photoshop.

Requirements
------------
- Photoshop 2025 (26.0) or newer
- Windows 10/11 or macOS 12+
- Hardware acceleration enabled in Photoshop

Install on Windows
------------------
1. Close Photoshop.
2. Double-click "Install Windows.cmd".
3. Approve the administrator prompt.
4. Restart Photoshop, then open Plugins > Lumiform Colorpicker.

Install on macOS
----------------
1. Close Photoshop.
2. If macOS refuses to run the script, open Terminal in this folder and run:
   chmod +x "Install macOS.command"
3. Double-click "Install macOS.command" and enter your password.
4. Restart Photoshop, then open Plugins > Lumiform Colorpicker.

Manual install
--------------
Copy the "Lumiform Colorpicker" folder into Photoshop's Plug-ins directory:

Windows:
  C:\Program Files\Adobe\Adobe Photoshop 2025\Plug-ins\Lumiform Colorpicker

macOS:
  /Applications/Adobe Photoshop 2025/Plug-ins/Lumiform Colorpicker

Restart Photoshop afterwards.

The .ccx package
----------------
If Adobe Creative Cloud Desktop is installed, you can also double-click
Lumiform-Colorpicker.ccx and choose "Install locally". The ZIP above is the
fallback for machines where the .ccx does not open.

Troubleshooting
---------------
- The panel is missing: confirm the Photoshop version, restart Photoshop, and
  check that the Lumiform Colorpicker folder sits directly under Plug-ins with
  manifest.json inside it.
- The viewport is black: enable Preferences > Performance > Use Graphics
  Processor and update the GPU driver.
- Colors do not reach Photoshop: click inside the panel first and check that
  the status bar reads "Connected to Photoshop".
