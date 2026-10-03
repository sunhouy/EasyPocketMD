"""User-style Windows/macOS font overrides must work in the Linux sandbox."""
import warnings
import matplotlib.pyplot as plt
import matplotlib
from matplotlib import font_manager, ft2font

warnings.filterwarnings('error', message=r'Glyph .* missing from font')
matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'Arial Unicode MS']
matplotlib.rcParams['axes.unicode_minus'] = False

years = [2021, 2022, 2023, 2024, 2025]
population = [141260, 141175, 140967, 140828, 140489]
fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(years, population, marker='o', linewidth=2.5, markersize=8,
        color='#1f77b4', label='年末总人口')
for year, pop in zip(years, population):
    ax.annotate(f'{pop:,}', xy=(year, pop), xytext=(0, 12),
                textcoords='offset points', ha='center', fontsize=10, fontweight='bold')
ax.set_title('2021–2025年中国年末总人口变化', fontsize=16, fontweight='bold', pad=20)
ax.set_xlabel('年份', fontsize=12)
ax.set_ylabel('人口（万人）', fontsize=12)
ax.set_xlim(2020.5, 2025.5)
ax.set_ylim(140000, 142000)
ax.grid(True, linestyle='--', alpha=0.6)
ax.annotate('2021年峰值后连续下降', xy=(2022, 141175), xytext=(2023.2, 141400),
            arrowprops=dict(arrowstyle='->', color='gray', lw=1.2), fontsize=11, color='gray')
fig.text(0.12, 0.02, '数据来源：国家统计局年度统计公报', fontsize=9, color='gray')
plt.tight_layout()
assert ax.title.get_fontsize() == 16
assert ax.title.get_fontweight() == 'bold'
# Assert actual fallback font contains the Chinese glyphs, not just that PNG exists.
prop = font_manager.FontProperties(family=['SimHei', 'Arial Unicode MS'])
font = ft2font.FT2Font(font_manager.findfont(prop, fallback_to_default=False))
assert all(font.get_char_index(ord(char)) for char in '中国人口年份变化数据来源统计')
plt.show()

# Per-text overrides, generic families and styles also need to work after startup.
with matplotlib.rc_context({'font.family': 'serif', 'font.serif': ['Missing User Font']}):
    fig, ax = plt.subplots()
    ax.plot([-1, 0, 1], [-2, 0, 2])
    ax.set_title('中文标题及负数', fontfamily='PingFang SC', fontweight='bold')
    ax.set_xlabel('字体回退', fontfamily='Microsoft YaHei')
    ax.set_ylabel('已有英文字体也支持中文', fontfamily='DejaVu Sans')
    valid = font_manager.FontProperties(family='DejaVu Sans', style='italic')
    assert valid.get_family()[0] == 'DejaVu Sans'
    assert valid.get_style() == 'italic'
    plt.tight_layout()
    plt.show()
print('Chinese font overrides passed')
