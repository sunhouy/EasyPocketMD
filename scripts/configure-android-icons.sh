#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_DIR="$PROJECT_ROOT/src-tauri/icons/android"
RES_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/res"

if [ ! -f "$ICON_DIR/mipmap-mdpi/ic_launcher_foreground.png" ] &&
   [ ! -f "$RES_DIR/mipmap-mdpi/ic_launcher_foreground.png" ]; then
    echo "Android icons missing; run tauri icon src-tauri/icon-rgba.png first" >&2
    exit 1
fi

# Preserve Tauri's density-specific legacy icons instead of copying a 1024px
# source into every density bucket. Apply after every Android project init.
mkdir -p "$RES_DIR/drawable-v26" "$RES_DIR/mipmap-anydpi-v26" "$RES_DIR/values"
# Android init can consume the generated icon directory while installing it
# into the project. In that case its resources are already density-correct.
if [ -d "$ICON_DIR" ]; then
    for directory in "$ICON_DIR"/mipmap-*; do
        [ -d "$directory" ] && cp -R "$directory" "$RES_DIR/"
    done
fi

# Android masks the central 72dp of its 108dp adaptive layer. Inset the full
# web icon by 18/108 on each edge so the M retains the web/PWA proportions.
cat > "$RES_DIR/drawable-v26/epm_launcher_foreground.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@mipmap/ic_launcher_foreground"
    android:insetLeft="16.666667%"
    android:insetTop="16.666667%"
    android:insetRight="16.666667%"
    android:insetBottom="16.666667%" />
EOF

cat > "$RES_DIR/values/epm_launcher_background.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="epm_launcher_background">#0B121C</color>
</resources>
EOF

for name in ic_launcher ic_launcher_round; do
    cat > "$RES_DIR/mipmap-anydpi-v26/$name.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/epm_launcher_background" />
    <foreground android:drawable="@drawable/epm_launcher_foreground" />
</adaptive-icon>
EOF
done
echo "✅ Android launcher icons use web proportions and density-specific resources"
