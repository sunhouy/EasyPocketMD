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
# Use the SDK's own Node/JBR/Hvigor/OHPM to keep tool versions compatible.
find_one() {
  local result
  result=$(find "$install_dir" -type f -path "$1" -print -quit)
  [[ -n "$result" ]] || { echo "::error::工具链压缩包缺少 $1" >&2; exit 1; }
  printf '%s' "$result"
}
node_bin=$(find_one '*/node*/bin/node')
java_bin=$(find_one '*/jbr*/bin/java')
ohpm_bin=$(find_one '*/ohpm/bin/ohpm')
hvigor_bin=$(find_one '*/hvigor/bin/hvigorw')
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
