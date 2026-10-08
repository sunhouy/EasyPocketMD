#!/usr/bin/env bash
set -euo pipefail
: "${HARMONY_TOOLS_URL:?请设置 HARMONY_TOOLS_URL secret：华为官方 macOS ARM64 Command Line Tools 完整 ZIP 下载地址}"
: "${HARMONY_TOOLS_SHA256:?请设置 HARMONY_TOOLS_SHA256 variable：下载包的 SHA256}"
[[ "$HARMONY_TOOLS_URL" == https://* ]] || { echo '::error::工具链下载地址必须使用 HTTPS'; exit 1; }
[[ "$HARMONY_TOOLS_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || { echo '::error::工具链 SHA256 格式错误'; exit 1; }
archive="$RUNNER_TEMP/harmony-tools.zip"
install_dir="$RUNNER_TEMP/harmony-tools"
mkdir -p "$install_dir"
curl --fail --silent --show-error --location --retry 3 "$HARMONY_TOOLS_URL" -o "$archive"
printf '%s  %s\n' "$HARMONY_TOOLS_SHA256" "$archive" | shasum -a 256 -c -
unzip -q "$archive" -d "$install_dir"
# Command Line Tools need not bundle DevEco Studio's JBR; CI installs JDK 17 separately.
find_one() {
  local result pattern
  for pattern in "$@"; do
    result=$(find -L "$install_dir" -type f -path "$pattern" -print -quit)
    if [[ -n "$result" ]]; then printf '%s' "$result"; return; fi
  done
  echo "::error::工具链压缩包缺少可用工具：$*" >&2
  exit 1
}
node_bin=$(find_one '*/node*/bin/node')
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
  java_bin="$JAVA_HOME/bin/java"
else
  java_bin=$(find_one '*/jbr*/bin/java' '*/jdk*/bin/java')
fi
"$java_bin" -version
ohpm_bin=$(find_one '*/ohpm/bin/ohpm' '*/command-line-tools/bin/ohpm')
hvigor_bin=$(find_one '*/hvigor/bin/hvigorw' '*/command-line-tools/bin/hvigorw')
signer=$(find_one '*/toolchains/lib/hap-sign-tool.jar')
packer=$(find_one '*/toolchains/lib/app_packing_tool.jar')
sdk_root=$(find "$install_dir" -type d -path '*/sdk/default' -print -quit)
[[ -n "$sdk_root" ]] || { echo '::error::压缩包必须包含完整的 HarmonyOS SDK（sdk/default）'; exit 1; }
{
  echo "NODE_HOME=$(dirname "$(dirname "$node_bin")")"
  echo "JAVA_HOME=$(dirname "$(dirname "$java_bin")")"
  echo "DEVECO_SDK_HOME=$(dirname "$sdk_root")"
  echo "HARMONY_HVIGOR=$hvigor_bin"
  echo "HARMONY_OHPM=$ohpm_bin"
  echo "HARMONY_JAVA=$java_bin"
  echo "HARMONY_SIGNER=$signer"
  echo "HARMONY_PACKER=$packer"
} >> "$GITHUB_ENV"
printf '%s\n' "$(dirname "$node_bin")" "$(dirname "$java_bin")" "$(dirname "$ohpm_bin")" "$(dirname "$hvigor_bin")" >> "$GITHUB_PATH"
rm -f "$archive"
