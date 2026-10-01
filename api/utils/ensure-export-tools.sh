#!/usr/bin/env bash
# Called before switching the deployed service to a new release.
set -euo pipefail
export PATH="${PATH}:/usr/local/bin:/usr/bin:/bin"
pandoc_cmd="${PANDOC_PATH:-pandoc}"
pdf_cmd="${WKHTMLTOPDF_PATH:-wkhtmltopdf}"
missing=()
command -v "$pandoc_cmd" >/dev/null 2>&1 || missing+=(pandoc)
command -v "$pdf_cmd" >/dev/null 2>&1 || missing+=(wkhtmltopdf)
if ((${#missing[@]})); then
    if ! command -v apt-get >/dev/null 2>&1; then
        echo "请安装 ${missing[*]}，或设置 PANDOC_PATH / WKHTMLTOPDF_PATH。导出依赖未就绪，停止部署。" >&2
        exit 1
    fi
    elevate=()
    if ((EUID != 0)); then
        command -v sudo >/dev/null && sudo -n true || { echo '安装导出依赖需要 root 或免密 sudo。' >&2; exit 1; }
        elevate=(sudo -n)
    fi
    "${elevate[@]}" apt-get update
    "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
fi
"$pandoc_cmd" --version
QT_QPA_PLATFORM=offscreen "$pdf_cmd" --version
# Check the converter actually runs without an X server (including unpatched Qt).
probe_dir=$(mktemp -d)
trap 'rm -rf "$probe_dir"' EXIT
printf '<html><body><p>Export dependency check</p></body></html>' | QT_QPA_PLATFORM=offscreen timeout 20 "$pdf_cmd" --quiet --disable-javascript --disable-local-file-access - "$probe_dir/check.pdf"
test -s "$probe_dir/check.pdf"
echo '✓ Pandoc 和 PDF 转换器验证完成'
