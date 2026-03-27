
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    // 图表模板定义 - 使用函数动态生成，支持数据输入
    var chartTemplates = [
        {
            icon: '<i class="fas fa-project-diagram"></i>',
            name: '流程图 (Flowchart)',
            keywords: ['flowchart', '流程图', 'flow'],
            description: isEn() ? 'Create a flowchart with custom steps' : '创建带自定义步骤的流程图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var steps = data.steps || ['开始', '处理', '决策', '结束'];
                var directions = data.directions || ['TD'];
                var code = 'graph ' + directions[0] + '\n';
                for (var i = 0; i < steps.length; i++) {
                    var nodeId = String.fromCharCode(65 + i);
                    var nextId = String.fromCharCode(65 + i + 1);
                    if (i < steps.length - 1) {
                        if (steps[i].indexOf('?') > -1 || steps[i].indexOf('决策') > -1) {
                            code += '    ' + nodeId + '{' + steps[i] + '} -->|' + (isEn() ? 'Yes' : '是') + '| ' + nextId + '[' + steps[i+1] + ']\n';
                            code += '    ' + nodeId + ' -->|' + (isEn() ? 'No' : '否') + '| ' + String.fromCharCode(65 + Math.max(0, i-1)) + '\n';
                        } else {
                            code += '    ' + nodeId + '[' + steps[i] + '] --> ' + nextId + '[' + steps[i+1] + ']\n';
                        }
                    }
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'steps', label: isEn() ? 'Flow Steps (one per line)' : '流程步骤（每行一个）', type: 'textarea', placeholder: isEn() ? 'Start\nProcess\nDecision?\nEnd' : '开始\n处理\n决策?\n结束', defaultValue: isEn() ? 'Start\nProcess\nDecision?\nEnd' : '开始\n处理\n决策?\n结束' },
                    { name: 'direction', label: isEn() ? 'Direction' : '方向', type: 'select', options: [
                        { value: 'TD', label: isEn() ? 'Top to Bottom' : '从上到下' },
                        { value: 'LR', label: isEn() ? 'Left to Right' : '从左到右' },
                        { value: 'BT', label: isEn() ? 'Bottom to Top' : '从下到上' },
                        { value: 'RL', label: isEn() ? 'Right to Left' : '从右到左' }
                    ], defaultValue: 'TD' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-exchange-alt"></i>',
            name: '序列图 (Sequence Diagram)',
            keywords: ['sequence', '序列图', '时序图'],
            description: isEn() ? 'Create a sequence diagram with participants' : '创建带参与者的序列图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var participants = data.participants || ['用户', '系统', '数据库'];
                var messages = data.messages || ['请求数据', '查询', '返回结果'];
                var code = 'sequenceDiagram\n';
                participants.forEach(function(p, i) {
                    code += '    participant ' + String.fromCharCode(65 + i) + ' as ' + p + '\n';
                });
                for (var i = 0; i < messages.length && i < participants.length - 1; i++) {
                    code += '    ' + String.fromCharCode(65 + i) + '->>' + String.fromCharCode(65 + i + 1) + ': ' + messages[i] + '\n';
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'participants', label: isEn() ? 'Participants (one per line)' : '参与者（每行一个）', type: 'textarea', placeholder: isEn() ? 'User\nFrontend\nAPI\nDatabase' : '用户\n前端\nAPI\n数据库', defaultValue: isEn() ? 'User\nSystem\nDatabase' : '用户\n系统\n数据库' },
                    { name: 'messages', label: isEn() ? 'Messages (one per line)' : '消息（每行一个）', type: 'textarea', placeholder: isEn() ? 'Request data\nQuery\nReturn result' : '请求数据\n查询\n返回结果', defaultValue: isEn() ? 'Request data\nQuery\nReturn result' : '请求数据\n查询\n返回结果' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-sitemap"></i>',
            name: '类图 (Class Diagram)',
            keywords: ['class', '类图', 'classDiagram'],
            description: isEn() ? 'Create a class diagram' : '创建类图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var classes = data.classes || ['Animal', 'Dog', 'Cat'];
                var code = 'classDiagram\n';
                for (var i = 1; i < classes.length; i++) {
                    code += '    ' + classes[0] + ' <|-- ' + classes[i] + ' : ' + (isEn() ? 'extends' : '继承') + '\n';
                }
                code += '    class ' + classes[0] + ' {\n        +String name\n        +makeSound()\n    }\n';
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'classes', label: isEn() ? 'Class Names (one per line, first is parent)' : '类名（每行一个，第一个是父类）', type: 'textarea', placeholder: isEn() ? 'Animal\nDog\nCat\nBird' : '动物\n狗\n猫\n鸟', defaultValue: isEn() ? 'Animal\nDog\nCat' : '动物\n狗\n猫' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-sync-alt"></i>',
            name: '状态图 (State Diagram)',
            keywords: ['state', '状态图', 'stateDiagram'],
            description: isEn() ? 'Create a state diagram' : '创建状态图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var states = data.states || ['待付款', '已付款', '已发货', '已收货'];
                var code = 'stateDiagram-v2\n    [*] --> ' + states[0] + '\n';
                for (var i = 0; i < states.length - 1; i++) {
                    code += '    ' + states[i] + ' --> ' + states[i+1] + ' : ' + (isEn() ? 'event' : '事件') + (i+1) + '\n';
                }
                code += '    ' + states[states.length-1] + ' --> [*]\n';
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'states', label: isEn() ? 'State Names (one per line)' : '状态名（每行一个）', type: 'textarea', placeholder: isEn() ? 'Pending\nPaid\nShipped\nReceived' : '待付款\n已付款\n已发货\n已收货', defaultValue: isEn() ? 'Pending\nPaid\nShipped\nReceived' : '待付款\n已付款\n已发货\n已收货' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-chart-gantt"></i>',
            name: '甘特图 (Gantt Chart)',
            keywords: ['gantt', '甘特图', 'project'],
            description: isEn() ? 'Create a Gantt chart' : '创建甘特图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var tasks = data.tasks || ['需求分析', '设计', '开发', '测试'];
                var durations = data.durations || ['7d', '5d', '10d', '5d'];
                var code = 'gantt\n    title ' + (isEn() ? 'Project Plan' : '项目计划') + '\n    dateFormat YYYY-MM-DD\n';
                for (var i = 0; i < tasks.length; i++) {
                    var taskId = 'task' + i;
                    var after = i > 0 ? ', after task' + (i-1) : '';
                    code += '    ' + tasks[i] + ' :' + taskId + after + ', ' + durations[i] + '\n';
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'tasks', label: isEn() ? 'Task Names (one per line)' : '任务名（每行一个）', type: 'textarea', placeholder: isEn() ? 'Analysis\nDesign\nDevelopment\nTesting' : '需求分析\n设计\n开发\n测试', defaultValue: isEn() ? 'Analysis\nDesign\nDevelopment\nTesting' : '需求分析\n设计\n开发\n测试' },
                    { name: 'durations', label: isEn() ? 'Durations (one per line, e.g., 7d, 2w)' : '持续时间（每行一个，如7d, 2w）', type: 'textarea', placeholder: '7d\n5d\n10d\n5d', defaultValue: '7d\n5d\n10d\n5d' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-chart-pie"></i>',
            name: '饼图 (Pie Chart)',
            keywords: ['pie', '饼图', '比例'],
            description: isEn() ? 'Create a pie chart' : '创建饼图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var items = data.items || ['产品A', '产品B', '产品C'];
                var values = data.values || [35, 25, 40];
                var code = 'pie title ' + (data.title || (isEn() ? 'Distribution' : '分布')) + '\n';
                for (var i = 0; i < items.length && i < values.length; i++) {
                    code += '    "' + items[i] + '" : ' + values[i] + '\n';
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', placeholder: isEn() ? 'Distribution' : '分布', defaultValue: isEn() ? 'Market Share' : '市场份额' },
                    { name: 'items', label: isEn() ? 'Item Names (one per line)' : '项目名（每行一个）', type: 'textarea', placeholder: isEn() ? 'Product A\nProduct B\nProduct C' : '产品A\n产品B\n产品C', defaultValue: isEn() ? 'Product A\nProduct B\nProduct C' : '产品A\n产品B\n产品C' },
                    { name: 'values', label: isEn() ? 'Values (one per line)' : '数值（每行一个）', type: 'textarea', placeholder: '35\n25\n40', defaultValue: '35\n25\n40' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-chart-line"></i>',
            name: '折线图 (Line Chart)',
            keywords: ['line', '折线图', '趋势'],
            description: isEn() ? 'Create a line chart' : '创建折线图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var xLabels = data.xLabels || ['Jan', 'Feb', 'Mar', 'Apr'];
                var yValues = data.yValues || [10, 20, 30, 40];
                var code = '---\ntitle: ' + (data.title || (isEn() ? 'Line Chart' : '折线图')) + '\n---\nxychart-beta\n    title "' + (data.title || (isEn() ? 'Trend' : '趋势')) + '"\n    x-axis [' + xLabels.join(', ') + ']\n    y-axis "' + (data.yLabel || (isEn() ? 'Value' : '数值')) + '" 0 --> ' + Math.max.apply(null, yValues) * 1.2 + '\n    line [' + yValues.join(', ') + ']\n';
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Sales Trend' : '销售趋势' },
                    { name: 'xLabels', label: isEn() ? 'X-Axis Labels (comma separated)' : 'X轴标签（逗号分隔）', type: 'text', placeholder: 'Jan, Feb, Mar, Apr', defaultValue: 'Q1, Q2, Q3, Q4' },
                    { name: 'yLabel', label: isEn() ? 'Y-Axis Label' : 'Y轴标签', type: 'text', defaultValue: isEn() ? 'Sales' : '销售额' },
                    { name: 'yValues', label: isEn() ? 'Y Values (comma separated)' : 'Y轴数值（逗号分隔）', type: 'text', placeholder: '10, 20, 30, 40', defaultValue: '100, 150, 120, 180' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-chart-bar"></i>',
            name: '柱状图 (Bar Chart)',
            keywords: ['bar', '柱状图', '条形图'],
            description: isEn() ? 'Create a bar chart' : '创建柱状图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var xLabels = data.xLabels || ['A', 'B', 'C'];
                var yValues = data.yValues || [10, 20, 15];
                var code = '---\ntitle: ' + (data.title || (isEn() ? 'Bar Chart' : '柱状图')) + '\n---\nxychart-beta\n    title "' + (data.title || (isEn() ? 'Comparison' : '对比')) + '"\n    x-axis ["' + xLabels.join('", "') + '"]\n    y-axis "' + (data.yLabel || (isEn() ? 'Value' : '数值')) + '" 0 --> ' + Math.max.apply(null, yValues) * 1.2 + '\n    bar [' + yValues.join(', ') + ']\n';
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Quarterly Sales' : '季度销售' },
                    { name: 'xLabels', label: isEn() ? 'X-Axis Labels (comma separated)' : 'X轴标签（逗号分隔）', type: 'text', placeholder: 'A, B, C', defaultValue: 'Q1, Q2, Q3, Q4' },
                    { name: 'yLabel', label: isEn() ? 'Y-Axis Label' : 'Y轴标签', type: 'text', defaultValue: isEn() ? 'Sales' : '销售额' },
                    { name: 'yValues', label: isEn() ? 'Y Values (comma separated)' : 'Y轴数值（逗号分隔）', type: 'text', placeholder: '10, 20, 15', defaultValue: '150, 180, 120, 190' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-database"></i>',
            name: 'ER图 (Entity Relationship)',
            keywords: ['er', 'er图', 'entity'],
            description: isEn() ? 'Create an ER diagram' : '创建ER图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var entities = data.entities || ['USER', 'ORDER', 'PRODUCT'];
                var code = 'erDiagram\n';
                for (var i = 0; i < entities.length - 1; i++) {
                    code += '    ' + entities[i] + ' ||--o{ ' + entities[i+1] + ' : ' + (isEn() ? 'has' : '拥有') + '\n';
                }
                entities.forEach(function(e) {
                    code += '    ' + e + ' {\n        int id PK\n        string name\n    }\n';
                });
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'entities', label: isEn() ? 'Entity Names (one per line)' : '实体名（每行一个）', type: 'textarea', placeholder: isEn() ? 'USER\nORDER\nPRODUCT' : '用户\n订单\n产品', defaultValue: isEn() ? 'USER\nORDER\nPRODUCT' : '用户\n订单\n产品' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-walking"></i>',
            name: '用户旅程图 (User Journey)',
            keywords: ['journey', '用户旅程'],
            description: isEn() ? 'Create a user journey map' : '创建用户旅程图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var sections = data.sections || ['浏览', '购买', '售后'];
                var tasks = data.tasks || ['查看商品', '下单支付', '收货评价'];
                var code = 'journey\n    title ' + (data.title || (isEn() ? 'User Journey' : '用户旅程')) + '\n';
                for (var i = 0; i < sections.length && i < tasks.length; i++) {
                    code += '    section ' + sections[i] + '\n      ' + tasks[i] + ': 5: ' + (isEn() ? 'User' : '用户') + '\n';
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Journey Title' : '旅程标题', type: 'text', defaultValue: isEn() ? 'Shopping Experience' : '购物体验' },
                    { name: 'sections', label: isEn() ? 'Sections (one per line)' : '阶段（每行一个）', type: 'textarea', placeholder: isEn() ? 'Browse\nPurchase\nAfter-sales' : '浏览\n购买\n售后', defaultValue: isEn() ? 'Browse\nPurchase\nAfter-sales' : '浏览\n购买\n售后' },
                    { name: 'tasks', label: isEn() ? 'Tasks (one per line)' : '任务（每行一个）', type: 'textarea', placeholder: isEn() ? 'View products\nPlace order\nLeave review' : '查看商品\n下单支付\n收货评价', defaultValue: isEn() ? 'View products\nPlace order\nLeave review' : '查看商品\n下单支付\n收货评价' }
                ]
            }
        },
        {
            icon: '<i class="fab fa-git-alt"></i>',
            name: 'Git分支图 (Git Graph)',
            keywords: ['git', 'git graph', '分支'],
            description: isEn() ? 'Create a Git branch graph' : '创建Git分支图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var branches = data.branches || ['main', 'develop', 'feature'];
                var code = 'gitGraph\n';
                code += '    commit id: "' + (isEn() ? 'Initial commit' : '初始提交') + '"\n';
                for (var i = 1; i < branches.length; i++) {
                    code += '    branch ' + branches[i] + '\n';
                    code += '    checkout ' + branches[i] + '\n';
                    code += '    commit id: "' + (isEn() ? 'Commit on ' : '提交在') + branches[i] + '"\n';
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'branches', label: isEn() ? 'Branch Names (one per line, first is main)' : '分支名（每行一个，第一个是主干）', type: 'textarea', placeholder: 'main\ndevelop\nfeature/login', defaultValue: 'main\ndevelop\nfeature' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-brain"></i>',
            name: '思维导图 (Mindmap)',
            keywords: ['mindmap', '思维导图', 'mind'],
            description: isEn() ? 'Create a mind map' : '创建思维导图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var center = data.center || (isEn() ? 'Topic' : '主题');
                var branches = data.branches || ['分支1', '分支2', '分支3'];
                var code = 'mindmap\n  root((' + center + '))\n';
                branches.forEach(function(b) {
                    code += '    ' + b + '\n';
                });
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'center', label: isEn() ? 'Center Topic' : '中心主题', type: 'text', defaultValue: isEn() ? 'Project' : '项目' },
                    { name: 'branches', label: isEn() ? 'Branches (one per line)' : '分支（每行一个）', type: 'textarea', placeholder: isEn() ? 'Planning\nDesign\nDevelopment\nTesting' : '规划\n设计\n开发\n测试', defaultValue: isEn() ? 'Planning\nDesign\nDevelopment' : '规划\n设计\n开发' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-clock"></i>',
            name: '时间线图 (Timeline)',
            keywords: ['timeline', '时间线', '历史'],
            description: isEn() ? 'Create a timeline' : '创建时间线',
            hasDataInput: true,
            generateTemplate: function(data) {
                var title = data.title || (isEn() ? 'Project Timeline' : '项目时间线');
                var sections = data.sections || ['Phase 1', 'Phase 2', 'Phase 3'];
                var events = data.events || ['Start', 'Milestone', 'Complete'];
                var code = 'timeline\n    title ' + title + '\n';
                for (var i = 0; i < sections.length && i < events.length; i++) {
                    code += '    section ' + sections[i] + '\n        ' + events[i] + '\n';
                }
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Timeline Title' : '时间线标题', type: 'text', defaultValue: isEn() ? 'Project Milestones' : '项目里程碑' },
                    { name: 'sections', label: isEn() ? 'Sections (one per line)' : '阶段（每行一个）', type: 'textarea', placeholder: isEn() ? 'Phase 1\nPhase 2\nPhase 3' : '第一阶段\n第二阶段\n第三阶段', defaultValue: isEn() ? 'Phase 1\nPhase 2\nPhase 3' : '第一阶段\n第二阶段\n第三阶段' },
                    { name: 'events', label: isEn() ? 'Events (one per line)' : '事件（每行一个）', type: 'textarea', placeholder: isEn() ? 'Kickoff\nReview\nLaunch' : '启动\n评审\n上线', defaultValue: isEn() ? 'Kickoff\nReview\nLaunch' : '启动\n评审\n上线' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-cubes"></i>',
            name: 'C4架构图 (C4 Diagram)',
            keywords: ['c4', '架构图', 'architecture'],
            description: isEn() ? 'Create a C4 architecture diagram' : '创建C4架构图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var type = data.type || 'Context';
                var systemName = data.systemName || (isEn() ? 'My System' : '我的系统');
                var code = 'C4' + type + '\n    title ' + (isEn() ? 'System ' : '系统') + type + ' ' + (isEn() ? 'Diagram' : '图') + '\n\n';
                code += '    Person(user, "' + (isEn() ? 'User' : '用户') + '", "' + (isEn() ? 'System user' : '系统用户') + '")\n';
                code += '    System(system, "' + systemName + '", "' + (isEn() ? 'Core system' : '核心系统') + '")\n';
                code += '    Rel(user, system, "' + (isEn() ? 'Uses' : '使用') + '")\n';
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'type', label: isEn() ? 'Diagram Type' : '图表类型', type: 'select', options: [
                        { value: 'Context', label: 'Context ' + (isEn() ? 'Diagram' : '图') },
                        { value: 'Container', label: 'Container ' + (isEn() ? 'Diagram' : '图') }
                    ], defaultValue: 'Context' },
                    { name: 'systemName', label: isEn() ? 'System Name' : '系统名称', type: 'text', defaultValue: isEn() ? 'Web Application' : 'Web应用' }
                ]
            }
        },
        {
            icon: '<i class="fas fa-network-wired"></i>',
            name: '网络拓扑图 (Network)',
            keywords: ['network', '网络图', '拓扑'],
            description: isEn() ? 'Create a network topology diagram' : '创建网络拓扑图',
            hasDataInput: true,
            generateTemplate: function(data) {
                var layers = data.layers || [isEn() ? 'Internet' : '互联网', isEn() ? 'DMZ' : 'DMZ区', isEn() ? 'App' : '应用层', isEn() ? 'Data' : '数据层'];
                var code = 'graph TB\n';
                layers.forEach(function(layer, i) {
                    code += '    subgraph ' + layer + '\n        Node' + i + '[' + layer + ' ' + (isEn() ? 'Node' : '节点') + ']\n    end\n';
                    if (i < layers.length - 1) {
                        code += '    Node' + i + ' --> Node' + (i+1) + '\n';
                    }
                });
                return '```mermaid\n' + code + '```';
            },
            dataConfig: {
                fields: [
                    { name: 'layers', label: isEn() ? 'Network Layers (one per line)' : '网络层（每行一个）', type: 'textarea', placeholder: isEn() ? 'Internet\nDMZ\nApplication\nDatabase' : '互联网\nDMZ区\n应用层\n数据层', defaultValue: isEn() ? 'Internet\nDMZ\nApplication\nDatabase' : '互联网\nDMZ区\n应用层\n数据层' }
                ]
            }
        }
    ];

    var currentModal = null;
    var currentChart = null;

    function closeChartPicker() {
        if (currentModal && currentModal.parentNode) {
            currentModal.parentNode.removeChild(currentModal);
        }
        currentModal = null;
        currentChart = null;
    }

    // 显示图表数据输入对话框
    function showChartDataInput(chart) {
        var nightMode = g('nightMode') === true;
        currentChart = chart;

        // 如果已有模态框，先关闭
        if (currentModal) {
            closeChartPicker();
        }

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'chart-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';
        currentModal = modal;

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.innerHTML = chart.icon + ' ' + chart.name;
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 5px; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 描述
        var desc = document.createElement('div');
        desc.textContent = chart.description;
        desc.style.cssText = 'font-size: 13px; color: ' + (nightMode ? '#aaa' : '#666') + '; margin-bottom: 20px;';
        container.appendChild(desc);

        // 数据输入表单
        var form = document.createElement('div');
        form.style.cssText = 'margin-bottom: 20px;';

        var formData = {};

        if (chart.dataConfig && chart.dataConfig.fields) {
            chart.dataConfig.fields.forEach(function(field) {
                var fieldContainer = document.createElement('div');
                fieldContainer.style.cssText = 'margin-bottom: 15px;';

                var label = document.createElement('label');
                label.textContent = field.label;
                label.style.cssText = 'display: block; margin-bottom: 5px; font-size: 13px; color: ' + (nightMode ? '#ddd' : '#333') + ';';
                fieldContainer.appendChild(label);

                var input;
                if (field.type === 'textarea') {
                    input = document.createElement('textarea');
                    input.rows = 4;
                } else if (field.type === 'select') {
                    input = document.createElement('select');
                    field.options.forEach(function(opt) {
                        var option = document.createElement('option');
                        option.value = opt.value;
                        option.textContent = opt.label;
                        input.appendChild(option);
                    });
                } else {
                    input = document.createElement('input');
                    input.type = field.type || 'text';
                }

                input.style.cssText = 'width: 100%; padding: 8px 12px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; box-sizing: border-box;';
                input.placeholder = field.placeholder || '';
                if (field.defaultValue !== undefined) {
                    input.value = field.defaultValue;
                }

                // 保存引用
                formData[field.name] = input;

                fieldContainer.appendChild(input);
                form.appendChild(fieldContainer);
            });
        }

        container.appendChild(form);

        // 预览区域
        var previewContainer = document.createElement('div');
        previewContainer.style.cssText = 'margin-bottom: 20px; padding: 15px; background: ' + (nightMode ? '#1a1a1a' : '#f5f5f5') + '; border-radius: 8px;';

        var previewLabel = document.createElement('div');
        previewLabel.textContent = isEn() ? 'Preview:' : '预览：';
        previewLabel.style.cssText = 'font-size: 12px; color: ' + (nightMode ? '#888' : '#666') + '; margin-bottom: 8px;';
        previewContainer.appendChild(previewLabel);

        var previewCode = document.createElement('pre');
        previewCode.style.cssText = 'margin: 0; font-size: 11px; color: ' + (nightMode ? '#aaa' : '#555') + '; overflow-x: auto; white-space: pre-wrap; word-break: break-all;';
        previewContainer.appendChild(previewCode);

        container.appendChild(previewContainer);

        // 更新预览函数
        function updatePreview() {
            var data = {};
            for (var key in formData) {
                var input = formData[key];
                if (input.tagName === 'TEXTAREA') {
                    data[key] = input.value.split('\n').filter(function(l) { return l.trim(); });
                } else if (input.tagName === 'SELECT') {
                    data[key] = input.value;
                } else {
                    if (input.value.indexOf(',') > -1) {
                        data[key] = input.value.split(',').map(function(s) { return s.trim(); });
                    } else {
                        data[key] = input.value;
                    }
                }
            }

            try {
                var template = chart.generateTemplate(data);
                previewCode.textContent = template;
            } catch (e) {
                previewCode.textContent = 'Error: ' + e.message;
            }
        }

        // 绑定输入事件
        for (var key in formData) {
            formData[key].addEventListener('input', updatePreview);
        }

        // 初始预览
        updatePreview();

        // 按钮栏
        var buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
        cancelBtn.style.cssText = 'padding: 10px 20px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        cancelBtn.onclick = closeChartPicker;

        var insertBtn = document.createElement('button');
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (isEn() ? 'Insert' : '插入');
        insertBtn.style.cssText = 'padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        insertBtn.onclick = function() {
            var data = {};
            for (var key in formData) {
                var input = formData[key];
                if (input.tagName === 'TEXTAREA') {
                    data[key] = input.value.split('\n').filter(function(l) { return l.trim(); });
                } else if (input.tagName === 'SELECT') {
                    data[key] = input.value;
                } else {
                    if (input.value.indexOf(',') > -1) {
                        data[key] = input.value.split(',').map(function(s) { return s.trim(); });
                    } else {
                        data[key] = input.value;
                    }
                }
            }

            try {
                var template = chart.generateTemplate(data);
                insertChartTemplate(template);
            } catch (e) {
                global.showMessage(isEn() ? 'Failed to generate chart' : '生成图表失败', 'error');
            }
        };

        buttonBar.appendChild(cancelBtn);
        buttonBar.appendChild(insertBtn);
        container.appendChild(buttonBar);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeChartPicker();
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                closeChartPicker();
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);
    }

    function insertChartTemplate(template) {
        try {
            if (g('vditor')) {
                g('vditor').insertValue(template + '\n\n');
                global.showMessage(isEn() ? 'Chart inserted' : '图表已插入');
            }
        } catch (e) {
            console.error('插入图表错误', e);
            if (global.showMessage) {
                global.showMessage(isEn() ? 'Failed to insert chart' : '插入图表失败', 'error');
            }
        }
        closeChartPicker();
    }

    // 显示AI生成对话框（自然语言描述）
    function showAIGenerateDialog() {
        var nightMode = g('nightMode') === true;

        // 如果已有模态框，先关闭
        if (currentModal) {
            closeChartPicker();
        }

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'chart-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';
        currentModal = modal;

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 600px; max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.innerHTML = '<i class="fas fa-magic" style="color: #667eea;"></i> ' + (isEn() ? 'AI Chart Generator' : 'AI图表生成器');
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 5px; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 描述
        var desc = document.createElement('div');
        desc.textContent = isEn() ? 'Describe the chart you want in natural language' : '用自然语言描述你想要的图表';
        desc.style.cssText = 'font-size: 13px; color: ' + (nightMode ? '#aaa' : '#666') + '; margin-bottom: 20px;';
        container.appendChild(desc);

        // 示例提示
        var examples = document.createElement('div');
        examples.style.cssText = 'margin-bottom: 15px; padding: 10px; background: ' + (nightMode ? '#1a1a1a' : '#f0f0f0') + '; border-radius: 6px; font-size: 12px; color: ' + (nightMode ? '#888' : '#666') + ';';
        examples.innerHTML = '<strong>' + (isEn() ? 'Examples:' : '示例：') + '</strong><br>' +
            (isEn() ? 
                '• Show me a login flowchart with email verification<br>' +
                '• Create a sequence diagram for online payment<br>' +
                '• Draw a class diagram for an e-commerce system with users, orders and products<br>' +
                '• Make a Gantt chart for a 3-month software project' :
                '• 显示一个带邮箱验证的登录流程图<br>' +
                '• 创建一个在线支付的序列图<br>' +
                '• 绘制一个电商系统的类图，包含用户、订单和商品<br>' +
                '• 制作一个3个月软件项目的甘特图');
        container.appendChild(examples);

        // 输入框
        var inputLabel = document.createElement('label');
        inputLabel.textContent = isEn() ? 'Describe your chart:' : '描述你的图表：';
        inputLabel.style.cssText = 'display: block; margin-bottom: 8px; font-size: 14px; color: ' + (nightMode ? '#ddd' : '#333') + ';';
        container.appendChild(inputLabel);

        var input = document.createElement('textarea');
        input.rows = 4;
        input.placeholder = isEn() ? 'e.g., A flowchart showing user registration process with email verification and password setup' : '例如：一个显示用户注册流程的流程图，包含邮箱验证和密码设置步骤';
        input.style.cssText = 'width: 100%; padding: 12px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; box-sizing: border-box; resize: vertical;';
        container.appendChild(input);

        // 结果区域
        var resultContainer = document.createElement('div');
        resultContainer.style.cssText = 'margin-top: 20px; display: none;';

        var resultLabel = document.createElement('div');
        resultLabel.textContent = isEn() ? 'Generated Chart:' : '生成的图表：';
        resultLabel.style.cssText = 'font-size: 13px; color: ' + (nightMode ? '#888' : '#666') + '; margin-bottom: 8px;';
        resultContainer.appendChild(resultLabel);

        var resultCode = document.createElement('pre');
        resultCode.style.cssText = 'margin: 0; padding: 15px; background: ' + (nightMode ? '#1a1a1a' : '#f5f5f5') + '; border-radius: 8px; font-size: 12px; color: ' + (nightMode ? '#aaa' : '#555') + '; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto;';
        resultContainer.appendChild(resultCode);

        container.appendChild(resultContainer);

        // 按钮栏
        var buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
        cancelBtn.style.cssText = 'padding: 10px 20px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        cancelBtn.onclick = closeChartPicker;

        var generateBtn = document.createElement('button');
        generateBtn.innerHTML = '<i class="fas fa-magic"></i> ' + (isEn() ? 'Generate' : '生成');
        generateBtn.style.cssText = 'padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';

        var insertBtn = document.createElement('button');
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (isEn() ? 'Insert' : '插入');
        insertBtn.style.cssText = 'padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; display: none;';

        var generatedCode = '';

        generateBtn.onclick = async function() {
            var description = input.value.trim();
            if (!description) {
                global.showMessage(isEn() ? 'Please enter a description' : '请输入描述', 'error');
                return;
            }

            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn() ? 'Generating...' : '生成中...');

            try {
                var apiUrl = (window.getApiBaseUrl ? window.getApiBaseUrl() : 'api') + '/ai/chart';

                var response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + (window.currentUser ? (window.currentUser.token || window.currentUser.username) : '')
                    },
                    body: JSON.stringify({
                        description: description,
                        language: isEn() ? 'en' : 'zh'
                    })
                });

                var result = await response.json();

                if (result.code === 200 && result.data) {
                    generatedCode = result.data;
                    resultCode.textContent = generatedCode;
                    resultContainer.style.display = 'block';
                    generateBtn.style.display = 'none';
                    insertBtn.style.display = 'inline-block';
                } else {
                    global.showMessage(result.message || (isEn() ? 'Generation failed' : '生成失败'), 'error');
                    generateBtn.disabled = false;
                    generateBtn.innerHTML = '<i class="fas fa-magic"></i> ' + (isEn() ? 'Generate' : '生成');
                }
            } catch (error) {
                console.error('AI生成错误:', error);
                global.showMessage(isEn() ? 'Network error' : '网络错误', 'error');
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-magic"></i> ' + (isEn() ? 'Generate' : '生成');
            }
        };

        insertBtn.onclick = function() {
            if (generatedCode) {
                insertChartTemplate(generatedCode);
            }
        };

        buttonBar.appendChild(cancelBtn);
        buttonBar.appendChild(generateBtn);
        buttonBar.appendChild(insertBtn);
        container.appendChild(buttonBar);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeChartPicker();
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                closeChartPicker();
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);

        // 聚焦输入框
        input.focus();
    }

    // 显示图表选择器主界面
    function showChartPicker() {
        var nightMode = g('nightMode') === true;

        // 如果已有模态框，先关闭
        if (currentModal) {
            closeChartPicker();
        }

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'chart-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';
        currentModal = modal;

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 700px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.textContent = isEn() ? 'Insert Mermaid Chart' : '插入Mermaid图表';
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 15px; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // AI生成按钮
        var aiBtn = document.createElement('button');
        aiBtn.innerHTML = '<i class="fas fa-magic"></i> ' + (isEn() ? 'AI Generate (Natural Language)' : 'AI生成');
        aiBtn.style.cssText = 'width: 100%; padding: 12px; margin-bottom: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;';
        aiBtn.onclick = showAIGenerateDialog;
        container.appendChild(aiBtn);

        // 分隔线
        var divider = document.createElement('div');
        divider.style.cssText = 'display: flex; align-items: center; margin-bottom: 15px; color: ' + (nightMode ? '#888' : '#999') + '; font-size: 12px;';
        divider.innerHTML = '<span style="flex: 1; height: 1px; background: ' + (nightMode ? '#444' : '#ddd') + ';"></span><span style="padding: 0 10px;">' + (isEn() ? 'OR choose a template' : '或选择模板') + '</span><span style="flex: 1; height: 1px; background: ' + (nightMode ? '#444' : '#ddd') + ';"></span>';
        container.appendChild(divider);

        // 搜索框
        var searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = isEn() ? 'Search chart templates...' : '搜索图表模板...';
        searchBox.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 15px; border: 1px solid ' + (nightMode ? '#444' : '#ccc') + '; border-radius: 6px; font-size: 14px; background: ' + (nightMode ? '#222' : '#fafafa') + '; color: ' + (nightMode ? '#eee' : '#333') + '; outline: none; box-sizing: border-box;';
        container.appendChild(searchBox);

        // 图表网格
        var chartGrid = document.createElement('div');
        chartGrid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; overflow-y: auto; max-height: 350px; padding-right: 5px;';
        container.appendChild(chartGrid);

        // 渲染图表列表
        function renderCharts(items) {
            chartGrid.innerHTML = '';

            if (!items || items.length === 0) {
                var emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'text-align: center; color: #888; padding: 30px; grid-column: 1/-1;';
                emptyMsg.textContent = isEn() ? 'No matching charts' : '无匹配图表';
                chartGrid.appendChild(emptyMsg);
                return;
            }

            items.forEach(function(chart) {
                var chartBtn = document.createElement('button');
                chartBtn.style.cssText = 'padding: 15px; border: 2px solid transparent; background: ' + (nightMode ? '#3d3d3d' : '#f5f5f5') + '; cursor: pointer; border-radius: 8px; transition: all 0.2s; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';

                var iconDiv = document.createElement('div');
                iconDiv.style.cssText = 'font-size: 28px; margin-bottom: 8px; color: #667eea;';
                iconDiv.innerHTML = chart.icon;

                var nameDiv = document.createElement('div');
                nameDiv.style.cssText = 'font-weight: bold; font-size: 12px; margin-bottom: 4px;';
                nameDiv.textContent = chart.name.split('(')[0].trim();

                var descDiv = document.createElement('div');
                descDiv.style.cssText = 'font-size: 11px; color: ' + (nightMode ? '#aaa' : '#666') + '; line-height: 1.3;';
                descDiv.textContent = chart.description;

                chartBtn.appendChild(iconDiv);
                chartBtn.appendChild(nameDiv);
                chartBtn.appendChild(descDiv);

                chartBtn.onclick = function() {
                    if (chart.hasDataInput) {
                        showChartDataInput(chart);
                    } else {
                        insertChartTemplate(chart.template);
                    }
                };

                chartBtn.onmouseenter = function() {
                    this.style.background = nightMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                    this.style.borderColor = '#667eea';
                };

                chartBtn.onmouseleave = function() {
                    this.style.background = nightMode ? '#3d3d3d' : '#f5f5f5';
                    this.style.borderColor = 'transparent';
                };

                chartGrid.appendChild(chartBtn);
            });
        }

        // 初始渲染
        renderCharts(chartTemplates);

        // 搜索功能
        searchBox.addEventListener('input', function() {
            var q = this.value.trim().toLowerCase();
            if (!q) {
                renderCharts(chartTemplates);
                return;
            }

            var results = chartTemplates.filter(function(chart) {
                if (chart.name.toLowerCase().includes(q)) return true;
                if (chart.description.toLowerCase().includes(q)) return true;
                if (chart.keywords && chart.keywords.some(function(k) { return k.toLowerCase().includes(q); })) return true;
                return false;
            });

            renderCharts(results);
        });

        // 取消按钮
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = isEn() ? 'Cancel' : '取消';
        cancelBtn.style.cssText = 'margin-top: 15px; padding: 10px 20px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; align-self: center;';
        cancelBtn.onclick = closeChartPicker;
        container.appendChild(cancelBtn);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeChartPicker();
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                closeChartPicker();
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);
    }

    global.showChartPicker = showChartPicker;

})(typeof window !== 'undefined' ? window : this);
