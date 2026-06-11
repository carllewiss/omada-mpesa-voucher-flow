#!/usr/bin/env bash
# Applies the SIM-2 SMS Capacitor plugin into the freshly-generated android/ project.
# Idempotent — safe to run on every build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
OVERLAY="$ROOT/android-overlay"

if [ ! -d "$ANDROID_DIR" ]; then
  echo "android/ not found. Run: npx cap add android" >&2
  exit 1
fi

# 1) Copy Kotlin plugin sources
mkdir -p "$ANDROID_DIR/app/src/main/java/app/lovable/sim2sms"
cp -f "$OVERLAY/app/src/main/java/app/lovable/sim2sms/Sim2SmsPlugin.kt" \
      "$ANDROID_DIR/app/src/main/java/app/lovable/sim2sms/Sim2SmsPlugin.kt"

# 2) Inject permissions into AndroidManifest.xml (only if missing)
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
for PERM in SEND_SMS READ_PHONE_STATE; do
  if ! grep -q "android.permission.$PERM" "$MANIFEST"; then
    sed -i.bak "s|<application|<uses-permission android:name=\"android.permission.$PERM\" />\n    <application|" "$MANIFEST"
    rm -f "$MANIFEST.bak"
  fi
done

# 3) Register the plugin in MainActivity.java (Capacitor auto-discovers @CapacitorPlugin classes
#    on the classpath, but we also explicitly register to be safe across versions).
MAIN_ACTIVITY="$(find "$ANDROID_DIR/app/src/main/java" -name 'MainActivity.java' | head -n1 || true)"
if [ -n "$MAIN_ACTIVITY" ] && ! grep -q "Sim2SmsPlugin" "$MAIN_ACTIVITY"; then
  python3 - "$MAIN_ACTIVITY" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()
if "Sim2SmsPlugin" in s:
    sys.exit(0)
# add import
s = re.sub(r"(package [^\n]+;\n)", r"\1\nimport app.lovable.sim2sms.Sim2SmsPlugin;\nimport com.getcapacitor.BridgeActivity;\n", s, count=1)
# add registerPlugin call inside onCreate; if onCreate missing, add it
if "onCreate" in s:
    s = re.sub(
        r"(super\.onCreate\([^)]*\);)",
        r"\1\n        registerPlugin(Sim2SmsPlugin.class);",
        s, count=1)
else:
    s = re.sub(
        r"(public class MainActivity extends BridgeActivity \{)",
        r"\1\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        registerPlugin(Sim2SmsPlugin.class);\n    }\n",
        s, count=1)
open(p, "w").write(s)
PY
fi

echo "Android overlay applied."