
(function(global) {
    'use strict';

    function g(name) { return global[name]; }

    var chartTemplates = [
        { icon: '<i class="fas fa-project-diagram"></i>', name: '流程图 (Flowchart)', template: '```mermaid\ngraph TD\n    A[开始] --> B(处理过程)\n    B --> C{决策?}\n    C -->|是| D[结束]\n    C -->|否| B\n```' },
        { icon: '<i class="fas fa-exchange-alt"></i>', name: '序列图 (Sequence Diagram)', template: '```mermaid\nsequenceDiagram\n    participant A as 用户\n    participant B as 系统\n    A->>B: 请求数据\n    B-->>A: 返回数据\n    Note right of B: 这是注释\n    A->>B: 确认接收\n```' },
        { icon: '<i class="fas fa-sitemap"></i>', name: '类图 (Class Diagram)', template: '```mermaid\nclassDiagram\n    Class01 <|-- Class02 : 继承\n    Class03 *-- Class04 : 组合\n    Class05 o-- Class06 : 聚合\n    Class07 .. Class08 : 关联\n    Class09 --> Class10 : 依赖\n    class Class01 {\n        +属性1\n        -属性2\n        +方法1()\n        -方法2()\n    }\n```' },
        { icon: '<i class="fas fa-sync-alt"></i>', name: '状态图 (State Diagram)', template: '```mermaid\nstateDiagram-v2\n    [*] --> 状态1\n    状态1 --> 状态2 : 事件1\n    状态2 --> 状态3 : 事件2\n    状态3 --> [*] : 事件3\n    state 状态1 {\n        [*] --> 子状态1\n        子状态1 --> 子状态2\n    }\n```' },
        { icon: '<i class="fas fa-chart-gantt"></i>', name: '甘特图 (Gantt Chart)', template: '```mermaid\ngantt\n    title 项目开发计划\n    dateFormat YYYY-MM-DD\n    section 设计\n    需求分析 :done, des1, 2024-01-01, 7d\n    技术设计 :active, des2, after des1, 5d\n    section 开发\n    前端开发 :dev1, after des2, 10d\n    后端开发 :dev2, after des2, 12d\n    section 测试\n    单元测试 :test1, after dev1, 5d\n    集成测试 :test2, after dev2, 7d\n```' },
        { icon: '<i class="fas fa-chart-pie"></i>', name: '饼图 (Pie Chart)', template: '```mermaid\npie title 市场份额\n    "产品A" : 35\n    "产品B" : 25\n    "产品C" : 20\n    "产品D" : 15\n    "其他" : 5\n```' },
        { icon: '<i class="fas fa-chart-line"></i>', name: '折线图 (Line Chart)', template: '```mermaid\n---\ntitle: 折线图示例\n---\nxychart-beta\n    title "销售增长"\n    x-axis [2020, 2021, 2022, 2023, 2024]\n    y-axis "销售额（万元）" 0 --> 100\n    line [30, 45, 60, 75, 90]\n```' },
        { icon: '<i class="fas fa-chart-bar"></i>', name: '柱状图 (Bar Chart)', template: '```mermaid\n---\ntitle: 柱状图示例\n---\nxychart-beta\n    title "季度销售额"\n    x-axis ["Q1", "Q2", "Q3", "Q4"]\n    y-axis "销售额" 0 --> 200\n    bar [150, 180, 120, 190]\n```' }
    ];

    function insertChartTemplate(template) {
        try {
            if (g('vditor')) {
                // 确保在插入图表后添加两个空行
                g('vditor').insertValue(template + '\n\n');
                global.showMessage('图表模板已插入');
            }
        } catch (e) {
            console.error('插入图表错误', e);
            if (global.showMessage) {
                global.showMessage('插入图表失败，请重试', 'error');
            }
        }
        global.hideMobileActionSheet();
    }

    function showChartPicker() {
        var chartOptions = chartTemplates.map(function(opt) {
            return { icon: opt.icon, text: opt.name, action: function() { insertChartTemplate(opt.template); } };
        });
        global.showMobileActionSheet('选择图表类型', chartOptions);
    }

    global.showChartPicker = showChartPicker;

})(typeof window !== 'undefined' ? window : this);