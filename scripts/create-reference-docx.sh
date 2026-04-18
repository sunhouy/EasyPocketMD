#!/bin/bash
# 创建Pandoc reference.docx模板

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REFERENCE_DIR="$PROJECT_DIR/reference-docs"
TEMP_MD="$REFERENCE_DIR/temp.md"
REFERENCE_DOCX="$REFERENCE_DIR/reference.docx"

# 创建目录
mkdir -p "$REFERENCE_DIR"

# 创建示例Markdown文件，包含所有样式
cat > "$TEMP_MD" << 'EOF'
# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

这是正文段落。这是正文段落。这是正文段落。这是正文段落。

- 列表项1
- 列表项2
- 列表项3

1. 编号列表1
2. 编号列表2
3. 编号列表3

**粗体文本** 和 *斜体文本*

> 引用文本
> 引用文本

| 表头1 | 表头2 | 表头3 |
|-------|-------|-------|
| 单元格1 | 单元格2 | 单元格3 |
| 单元格4 | 单元格5 | 单元格6 |

`代码文本`

```
代码块
代码块
```
EOF

# 使用Pandoc生成默认的reference.docx
echo "生成默认reference.docx..."
pandoc "$TEMP_MD" -o "$REFERENCE_DOCX" --reference-doc=/dev/null 2>/dev/null || pandoc "$TEMP_MD" -o "$REFERENCE_DOCX"

if [ -f "$REFERENCE_DOCX" ]; then
    echo "✓ Reference文档已创建: $REFERENCE_DOCX"
    echo ""
    echo "请使用Microsoft Word或LibreOffice打开此文件，并修改以下样式："
    echo "  - 标题1-6: 设置为黑体(SimHei)"
    echo "  - 正文: 设置为宋体(SimSun)"
    echo "  - 所有文本颜色设置为黑色"
    echo ""
    echo "修改完成后，保存文件，然后在.env中设置："
    echo "  PANDOC_REFERENCE_DOCX=$REFERENCE_DOCX"
else
    echo "✗ 创建失败，请确保已安装Pandoc"
    exit 1
fi

# 清理临时文件
rm -f "$TEMP_MD"
