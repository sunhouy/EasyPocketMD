import matplotlib.pyplot as plt

# 测试中文字体显示
plt.figure(figsize=(10, 6))
plt.plot([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])
plt.title('测试中文字体标题')
plt.xlabel('横轴标签')
plt.ylabel('纵轴标签')
plt.text(2, 15, '测试中文文本')
plt.legend(['测试曲线'])

# 尝试指定其他字体，应该被强制覆盖
plt.rcParams['font.family'] = 'Arial'
plt.title('测试Arial字体标题（应该显示为中文字体）')

plt.savefig('test_chinese_font.png')
print('测试完成，图像已保存为 test_chinese_font.png')
