
(function(global) {
    'use strict';

    function g(name) { return global[name]; }
    function isEn() { return window.i18n && window.i18n.getLanguage() === 'en'; }

    // ECharts 懒加载器
    var EChartsLoader = {
        _loaded: false,
        _loading: false,
        _callbacks: [],

        // 加载 ECharts
        load: function(callback) {
            if (this._loaded) {
                if (callback) callback();
                return;
            }

            if (callback) this._callbacks.push(callback);

            if (this._loading) return;
            this._loading = true;

            var self = this;
            var script = document.createElement('script');
            // 使用相对路径，兼容开发和生产环境
            var basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            script.src = basePath + 'echarts/echarts.min.js';
            script.async = true;
            script.onload = function() {
                self._loaded = true;
                self._loading = false;
                self._callbacks.forEach(function(cb) { cb(); });
                self._callbacks = [];
            };
            script.onerror = function() {
                self._loading = false;
                console.error('Failed to load ECharts');
                if (global.showMessage) {
                    global.showMessage(isEn() ? 'Failed to load chart library' : '图表库加载失败', 'error');
                }
            };
            document.head.appendChild(script);
        },

        // 检查是否已加载
        isLoaded: function() {
            return this._loaded || (typeof echarts !== 'undefined');
        }
    };

    // ECharts 图表配置模板
    var echartsTemplates = [
        {
            icon: '<i class="fas fa-chart-line"></i>',
            name: '折线图',
            nameEn: 'Line Chart',
            keywords: ['echarts', 'line', '折线图', '趋势'],
            description: isEn() ? 'Professional line chart with ECharts' : '使用ECharts的专业折线图',
            type: 'echarts-line',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Line Chart' : '折线图', left: 'center' },
                    tooltip: { trigger: 'axis' },
                    legend: { data: [isEn() ? 'Series 1' : '系列1'], bottom: 0 },
                    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                    xAxis: {
                        type: 'category',
                        data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                        boundaryGap: false
                    },
                    yAxis: { type: 'value' },
                    series: [{
                        name: isEn() ? 'Series 1' : '系列1',
                        type: 'line',
                        data: [120, 132, 101, 134, 90, 230],
                        smooth: true
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Sales Trend' : '销售趋势' },
                    { name: 'xAxisData', label: isEn() ? 'X-Axis Data (comma separated)' : 'X轴数据（逗号分隔）', type: 'text', defaultValue: '1月,2月,3月,4月,5月,6月' },
                    { name: 'seriesCount', label: isEn() ? 'Number of Series' : '数据系列数量', type: 'select', options: [
                        { value: '1', label: '1' },
                        { value: '2', label: '2' },
                        { value: '3', label: '3' },
                        { value: '4', label: '4' },
                        { value: '5', label: '5' }
                    ], defaultValue: '2' },
                    { name: 'series1Name', label: isEn() ? 'Series 1 Name' : '系列1名称', type: 'text', defaultValue: isEn() ? '2023' : '2023年' },
                    { name: 'series1Data', label: isEn() ? 'Series 1 Data (comma separated)' : '系列1数据（逗号分隔）', type: 'text', defaultValue: '120, 132, 101, 134, 90, 230' },
                    { name: 'series2Name', label: isEn() ? 'Series 2 Name' : '系列2名称', type: 'text', defaultValue: isEn() ? '2024' : '2024年' },
                    { name: 'series2Data', label: isEn() ? 'Series 2 Data (comma separated)' : '系列2数据（逗号分隔）', type: 'text', defaultValue: '220, 182, 191, 234, 290, 330' },
                    { name: 'series3Name', label: isEn() ? 'Series 3 Name' : '系列3名称', type: 'text', defaultValue: isEn() ? '2025' : '2025年' },
                    { name: 'series3Data', label: isEn() ? 'Series 3 Data (comma separated)' : '系列3数据（逗号分隔）', type: 'text', defaultValue: '150, 232, 201, 154, 190, 330' },
                    { name: 'series4Name', label: isEn() ? 'Series 4 Name' : '系列4名称', type: 'text', defaultValue: isEn() ? 'Target' : '目标' },
                    { name: 'series4Data', label: isEn() ? 'Series 4 Data (comma separated)' : '系列4数据（逗号分隔）', type: 'text', defaultValue: '200, 200, 200, 200, 200, 200' },
                    { name: 'series5Name', label: isEn() ? 'Series 5 Name' : '系列5名称', type: 'text', defaultValue: isEn() ? 'Forecast' : '预测' },
                    { name: 'series5Data', label: isEn() ? 'Series 5 Data (comma separated)' : '系列5数据（逗号分隔）', type: 'text', defaultValue: '180, 220, 250, 280, 300, 350' },
                    { name: 'smooth', label: isEn() ? 'Smooth Line' : '平滑曲线', type: 'select', options: [
                        { value: 'true', label: isEn() ? 'Yes' : '是' },
                        { value: 'false', label: isEn() ? 'No' : '否' }
                    ], defaultValue: 'true' },
                    { name: 'showArea', label: isEn() ? 'Show Area' : '显示面积', type: 'select', options: [
                        { value: 'true', label: isEn() ? 'Yes' : '是' },
                        { value: 'false', label: isEn() ? 'No' : '否' }
                    ], defaultValue: 'false' }
                ]
            },
            generateOption: function(data) {
                var seriesCount = parseInt(data.seriesCount) || 1;
                var series = [];
                var legendData = [];

                for (var i = 0; i < seriesCount; i++) {
                    var nameKey = 'series' + (i + 1) + 'Name';
                    var dataKey = 'series' + (i + 1) + 'Data';
                    var name = data[nameKey] || ((isEn() ? 'Series ' : '系列') + (i + 1));
                    var seriesData = data[dataKey] || '';
                    
                    if (typeof seriesData === 'string') {
                        seriesData = seriesData.split(',').map(function(s) { return parseFloat(s.trim()) || 0; });
                    }

                    var seriesItem = {
                        name: name,
                        type: 'line',
                        data: seriesData,
                        smooth: data.smooth === 'true'
                    };

                    if (data.showArea === 'true') {
                        seriesItem.areaStyle = {};
                    }

                    series.push(seriesItem);
                    legendData.push(name);
                }

                var xAxisData = data.xAxisData || '';
                if (typeof xAxisData === 'string') {
                    xAxisData = xAxisData.split(',').map(function(s) { return s.trim(); });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Line Chart' : '折线图'), left: 'center' },
                    tooltip: { trigger: 'axis' },
                    legend: { data: legendData, bottom: 0 },
                    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                    xAxis: {
                        type: 'category',
                        data: xAxisData,
                        boundaryGap: false
                    },
                    yAxis: { type: 'value' },
                    series: series
                };
            }
        },
        {
            icon: '<i class="fas fa-chart-bar"></i>',
            name: '柱状图',
            nameEn: 'Bar Chart',
            keywords: ['echarts', 'bar', '柱状图', '条形图'],
            description: isEn() ? 'Professional bar chart with ECharts' : '使用ECharts的专业柱状图',
            type: 'echarts-bar',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Bar Chart' : '柱状图', left: 'center' },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    legend: { data: [isEn() ? 'Series 1' : '系列1'], bottom: 0 },
                    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                    xAxis: {
                        type: 'category',
                        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                    },
                    yAxis: { type: 'value' },
                    series: [{
                        name: isEn() ? 'Series 1' : '系列1',
                        type: 'bar',
                        data: [120, 200, 150, 80, 70, 110, 130]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Sales Comparison' : '销售对比' },
                    { name: 'xAxisData', label: isEn() ? 'X-Axis Data (comma separated)' : 'X轴数据（逗号分隔）', type: 'text', defaultValue: '周一,周二,周三,周四,周五,周六,周日' },
                    { name: 'seriesCount', label: isEn() ? 'Number of Series' : '数据系列数量', type: 'select', options: [
                        { value: '1', label: '1' },
                        { value: '2', label: '2' },
                        { value: '3', label: '3' },
                        { value: '4', label: '4' },
                        { value: '5', label: '5' }
                    ], defaultValue: '2' },
                    { name: 'series1Name', label: isEn() ? 'Series 1 Name' : '系列1名称', type: 'text', defaultValue: isEn() ? 'Direct' : '直接访问' },
                    { name: 'series1Data', label: isEn() ? 'Series 1 Data (comma separated)' : '系列1数据（逗号分隔）', type: 'text', defaultValue: '320, 332, 301, 334, 390, 330, 320' },
                    { name: 'series2Name', label: isEn() ? 'Series 2 Name' : '系列2名称', type: 'text', defaultValue: isEn() ? 'Email' : '邮件营销' },
                    { name: 'series2Data', label: isEn() ? 'Series 2 Data (comma separated)' : '系列2数据（逗号分隔）', type: 'text', defaultValue: '120, 132, 101, 134, 90, 230, 210' },
                    { name: 'series3Name', label: isEn() ? 'Series 3 Name' : '系列3名称', type: 'text', defaultValue: isEn() ? 'Affiliate' : '联盟广告' },
                    { name: 'series3Data', label: isEn() ? 'Series 3 Data (comma separated)' : '系列3数据（逗号分隔）', type: 'text', defaultValue: '220, 182, 191, 234, 290, 330, 310' },
                    { name: 'series4Name', label: isEn() ? 'Series 4 Name' : '系列4名称', type: 'text', defaultValue: isEn() ? 'Video' : '视频广告' },
                    { name: 'series4Data', label: isEn() ? 'Series 4 Data (comma separated)' : '系列4数据（逗号分隔）', type: 'text', defaultValue: '150, 232, 201, 154, 190, 330, 410' },
                    { name: 'series5Name', label: isEn() ? 'Series 5 Name' : '系列5名称', type: 'text', defaultValue: isEn() ? 'Search' : '搜索引擎' },
                    { name: 'series5Data', label: isEn() ? 'Series 5 Data (comma separated)' : '系列5数据（逗号分隔）', type: 'text', defaultValue: '320, 332, 301, 334, 390, 330, 320' },
                    { name: 'horizontal', label: isEn() ? 'Horizontal Bar' : '水平条形', type: 'select', options: [
                        { value: 'false', label: isEn() ? 'No' : '否' },
                        { value: 'true', label: isEn() ? 'Yes' : '是' }
                    ], defaultValue: 'false' }
                ]
            },
            generateOption: function(data) {
                var seriesCount = parseInt(data.seriesCount) || 1;
                var series = [];
                var legendData = [];

                for (var i = 0; i < seriesCount; i++) {
                    var nameKey = 'series' + (i + 1) + 'Name';
                    var dataKey = 'series' + (i + 1) + 'Data';
                    var name = data[nameKey] || ((isEn() ? 'Series ' : '系列') + (i + 1));
                    var seriesData = data[dataKey] || '';
                    
                    if (typeof seriesData === 'string') {
                        seriesData = seriesData.split(',').map(function(s) { return parseFloat(s.trim()) || 0; });
                    }

                    series.push({
                        name: name,
                        type: 'bar',
                        data: seriesData
                    });
                    legendData.push(name);
                }

                var xAxisData = data.xAxisData || '';
                if (typeof xAxisData === 'string') {
                    xAxisData = xAxisData.split(',').map(function(s) { return s.trim(); });
                }

                var isHorizontal = data.horizontal === 'true';

                return {
                    title: { text: data.title || (isEn() ? 'Bar Chart' : '柱状图'), left: 'center' },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    legend: { data: legendData, bottom: 0 },
                    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                    xAxis: isHorizontal ? { type: 'value' } : { type: 'category', data: xAxisData },
                    yAxis: isHorizontal ? { type: 'category', data: xAxisData } : { type: 'value' },
                    series: series
                };
            }
        },
        {
            icon: '<i class="fas fa-chart-pie"></i>',
            name: '饼图',
            nameEn: 'Pie Chart',
            keywords: ['echarts', 'pie', '饼图', '环形图'],
            description: isEn() ? 'Professional pie chart with ECharts' : '使用ECharts的专业饼图',
            type: 'echarts-pie',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Pie Chart' : '饼图', left: 'center' },
                    tooltip: { trigger: 'item' },
                    legend: { orient: 'vertical', left: 'left' },
                    series: [{
                        name: isEn() ? 'Access Source' : '访问来源',
                        type: 'pie',
                        radius: '50%',
                        data: [
                            { value: 1048, name: isEn() ? 'Search Engine' : '搜索引擎' },
                            { value: 735, name: isEn() ? 'Direct' : '直接访问' },
                            { value: 580, name: isEn() ? 'Email' : '邮件营销' },
                            { value: 484, name: isEn() ? 'Affiliate' : '联盟广告' },
                            { value: 300, name: isEn() ? 'Video' : '视频广告' }
                        ]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Traffic Source' : '访问来源' },
                    { name: 'seriesName', label: isEn() ? 'Series Name' : '系列名称', type: 'text', defaultValue: isEn() ? 'Access Source' : '访问来源' },
                    { name: 'dataPairs', label: isEn() ? 'Data (format: name:value, one per line)' : '数据（格式：名称:数值，每行一个）', type: 'textarea', defaultValue: isEn() ? 
                        'Search Engine:1048\nDirect:735\nEmail:580\nAffiliate:484\nVideo:300' : 
                        '搜索引擎:1048\n直接访问:735\n邮件营销:580\n联盟广告:484\n视频广告:300' },
                    { name: 'chartType', label: isEn() ? 'Chart Type' : '图表类型', type: 'select', options: [
                        { value: 'pie', label: isEn() ? 'Pie' : '饼图' },
                        { value: 'doughnut', label: isEn() ? 'Doughnut' : '环形图' },
                        { value: 'rose', label: isEn() ? 'Rose' : '玫瑰图' }
                    ], defaultValue: 'pie' },
                    { name: 'showLegend', label: isEn() ? 'Show Legend' : '显示图例', type: 'select', options: [
                        { value: 'true', label: isEn() ? 'Yes' : '是' },
                        { value: 'false', label: isEn() ? 'No' : '否' }
                    ], defaultValue: 'true' }
                ]
            },
            generateOption: function(data) {
                var dataPairs = data.dataPairs || '';
                var pieData = [];
                
                if (typeof dataPairs === 'string') {
                    dataPairs.split('\n').forEach(function(line) {
                        var parts = line.split(':');
                        if (parts.length >= 2) {
                            pieData.push({
                                name: parts[0].trim(),
                                value: parseFloat(parts[1].trim()) || 0
                            });
                        }
                    });
                }

                var radius = '50%';
                if (data.chartType === 'doughnut') {
                    radius = ['40%', '70%'];
                } else if (data.chartType === 'rose') {
                    radius = ['20%', '70%'];
                }

                return {
                    title: { text: data.title || (isEn() ? 'Pie Chart' : '饼图'), left: 'center' },
                    tooltip: { trigger: 'item' },
                    legend: data.showLegend === 'true' ? { orient: 'vertical', left: 'left' } : { show: false },
                    series: [{
                        name: data.seriesName || (isEn() ? 'Data' : '数据'),
                        type: 'pie',
                        radius: radius,
                        roseType: data.chartType === 'rose' ? 'area' : false,
                        data: pieData
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-braille"></i>',
            name: '散点图',
            nameEn: 'Scatter Chart',
            keywords: ['echarts', 'scatter', '散点图'],
            description: isEn() ? 'Professional scatter chart with ECharts' : '使用ECharts的专业散点图',
            type: 'echarts-scatter',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Scatter Chart' : '散点图', left: 'center' },
                    tooltip: { trigger: 'item' },
                    xAxis: {},
                    yAxis: {},
                    series: [{
                        symbolSize: 20,
                        data: [
                            [10.0, 8.04],
                            [8.0, 6.95],
                            [13.0, 7.58],
                            [9.0, 8.81],
                            [11.0, 8.33],
                            [14.0, 9.96],
                            [6.0, 7.24],
                            [4.0, 4.26],
                            [12.0, 10.84],
                            [7.0, 4.82],
                            [5.0, 5.68]
                        ],
                        type: 'scatter'
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Scatter Chart' : '散点图' },
                    { name: 'scatterData', label: isEn() ? 'Data (format: x,y one per line)' : '数据（格式：x,y 每行一个点）', type: 'textarea', defaultValue: 
                        '10.0, 8.04\n8.0, 6.95\n13.0, 7.58\n9.0, 8.81\n11.0, 8.33\n14.0, 9.96\n6.0, 7.24\n4.0, 4.26\n12.0, 10.84\n7.0, 4.82\n5.0, 5.68' },
                    { name: 'symbolSize', label: isEn() ? 'Symbol Size' : '点大小', type: 'text', defaultValue: '20' }
                ]
            },
            generateOption: function(data) {
                var scatterData = [];
                var dataStr = data.scatterData || '';
                
                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(',');
                        if (parts.length >= 2) {
                            scatterData.push([
                                parseFloat(parts[0].trim()) || 0,
                                parseFloat(parts[1].trim()) || 0
                            ]);
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Scatter Chart' : '散点图'), left: 'center' },
                    tooltip: { trigger: 'item' },
                    xAxis: {},
                    yAxis: {},
                    series: [{
                        symbolSize: parseInt(data.symbolSize) || 20,
                        data: scatterData,
                        type: 'scatter'
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-bullseye"></i>',
            name: '雷达图',
            nameEn: 'Radar Chart',
            keywords: ['echarts', 'radar', '雷达图'],
            description: isEn() ? 'Professional radar chart with ECharts' : '使用ECharts的专业雷达图',
            type: 'echarts-radar',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Radar Chart' : '雷达图', left: 'center' },
                    tooltip: {},
                    legend: { data: [isEn() ? 'Allocated Budget' : '预算分配', isEn() ? 'Actual Spending' : '实际开销'], bottom: 0 },
                    radar: {
                        indicator: [
                            { name: isEn() ? 'Sales' : '销售', max: 6500 },
                            { name: isEn() ? 'Admin' : '管理', max: 16000 },
                            { name: isEn() ? 'IT' : '信息技术', max: 30000 },
                            { name: isEn() ? 'Customer' : '客服', max: 38000 },
                            { name: isEn() ? 'R&D' : '研发', max: 52000 },
                            { name: isEn() ? 'Marketing' : '市场', max: 25000 }
                        ]
                    },
                    series: [{
                        name: isEn() ? 'Budget vs Spending' : '预算 vs 开销',
                        type: 'radar',
                        data: [
                            {
                                value: [4200, 3000, 20000, 35000, 50000, 18000],
                                name: isEn() ? 'Allocated Budget' : '预算分配'
                            },
                            {
                                value: [5000, 14000, 28000, 26000, 42000, 21000],
                                name: isEn() ? 'Actual Spending' : '实际开销'
                            }
                        ]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Ability Analysis' : '能力分析' },
                    { name: 'indicators', label: isEn() ? 'Indicators (format: name:max, one per line)' : '指标（格式：名称:最大值，每行一个）', type: 'textarea', defaultValue: isEn() ? 
                        'Sales:100\nAdmin:100\nIT:100\nCustomer:100\nR&D:100\nMarketing:100' : 
                        '销售:100\n管理:100\n技术:100\n沟通:100\n创新:100\n执行:100' },
                    { name: 'series1Name', label: isEn() ? 'Series 1 Name' : '系列1名称', type: 'text', defaultValue: isEn() ? 'Person A' : '人员A' },
                    { name: 'series1Data', label: isEn() ? 'Series 1 Data (comma separated)' : '系列1数据（逗号分隔）', type: 'text', defaultValue: '85, 70, 90, 75, 80, 65' },
                    { name: 'series2Name', label: isEn() ? 'Series 2 Name' : '系列2名称', type: 'text', defaultValue: isEn() ? 'Person B' : '人员B' },
                    { name: 'series2Data', label: isEn() ? 'Series 2 Data (comma separated)' : '系列2数据（逗号分隔）', type: 'text', defaultValue: '70, 85, 75, 90, 65, 80' }
                ]
            },
            generateOption: function(data) {
                var indicators = [];
                var indicatorsStr = data.indicators || '';
                
                if (typeof indicatorsStr === 'string') {
                    indicatorsStr.split('\n').forEach(function(line) {
                        var parts = line.split(':');
                        if (parts.length >= 2) {
                            indicators.push({
                                name: parts[0].trim(),
                                max: parseFloat(parts[1].trim()) || 100
                            });
                        }
                    });
                }

                var seriesData = [];
                for (var i = 1; i <= 2; i++) {
                    var nameKey = 'series' + i + 'Name';
                    var dataKey = 'series' + i + 'Data';
                    var name = data[nameKey] || ((isEn() ? 'Series ' : '系列') + i);
                    var values = data[dataKey] || '';
                    
                    if (typeof values === 'string') {
                        values = values.split(',').map(function(s) { return parseFloat(s.trim()) || 0; });
                    }

                    seriesData.push({
                        value: values,
                        name: name
                    });
                }

                var legendData = seriesData.map(function(s) { return s.name; });

                return {
                    title: { text: data.title || (isEn() ? 'Radar Chart' : '雷达图'), left: 'center' },
                    tooltip: {},
                    legend: { data: legendData, bottom: 0 },
                    radar: { indicator: indicators },
                    series: [{
                        name: data.title || (isEn() ? 'Data' : '数据'),
                        type: 'radar',
                        data: seriesData
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-filter"></i>',
            name: '漏斗图',
            nameEn: 'Funnel Chart',
            keywords: ['echarts', 'funnel', '漏斗图'],
            description: isEn() ? 'Professional funnel chart with ECharts' : '使用ECharts的专业漏斗图',
            type: 'echarts-funnel',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Funnel Chart' : '漏斗图', left: 'center' },
                    tooltip: { trigger: 'item' },
                    series: [{
                        name: isEn() ? 'Funnel' : '漏斗',
                        type: 'funnel',
                        left: '10%',
                        top: 60,
                        bottom: 60,
                        width: '80%',
                        min: 0,
                        max: 100,
                        minSize: '0%',
                        maxSize: '100%',
                        sort: 'descending',
                        gap: 2,
                        label: { show: true, position: 'inside' },
                        data: [
                            { value: 60, name: isEn() ? 'Visit' : '访问' },
                            { value: 40, name: isEn() ? 'Inquiry' : '咨询' },
                            { value: 20, name: isEn() ? 'Order' : '订单' },
                            { value: 80, name: isEn() ? 'Click' : '点击' },
                            { value: 100, name: isEn() ? 'Show' : '展现' }
                        ]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Sales Funnel' : '销售漏斗' },
                    { name: 'dataPairs', label: isEn() ? 'Data (format: name:value, one per line)' : '数据（格式：名称:数值，每行一个）', type: 'textarea', defaultValue: isEn() ?
                        'Show:100\nClick:80\nVisit:60\nInquiry:40\nOrder:20' :
                        '展现:100\n点击:80\n访问:60\n咨询:40\n订单:20' },
                    { name: 'sort', label: isEn() ? 'Sort Order' : '排序方式', type: 'select', options: [
                        { value: 'descending', label: isEn() ? 'Descending' : '降序' },
                        { value: 'ascending', label: isEn() ? 'Ascending' : '升序' },
                        { value: 'none', label: isEn() ? 'None' : '不排序' }
                    ], defaultValue: 'descending' }
                ]
            },
            generateOption: function(data) {
                var funnelData = [];
                var dataStr = data.dataPairs || '';

                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(':');
                        if (parts.length >= 2) {
                            funnelData.push({
                                name: parts[0].trim(),
                                value: parseFloat(parts[1].trim()) || 0
                            });
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Funnel Chart' : '漏斗图'), left: 'center' },
                    tooltip: { trigger: 'item' },
                    series: [{
                        name: data.title || (isEn() ? 'Funnel' : '漏斗'),
                        type: 'funnel',
                        left: '10%',
                        top: 60,
                        bottom: 60,
                        width: '80%',
                        min: 0,
                        max: 100,
                        minSize: '0%',
                        maxSize: '100%',
                        sort: data.sort || 'descending',
                        gap: 2,
                        label: { show: true, position: 'inside' },
                        data: funnelData
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-tachometer-alt"></i>',
            name: '仪表盘',
            nameEn: 'Gauge Chart',
            keywords: ['echarts', 'gauge', '仪表盘', '速度表'],
            description: isEn() ? 'Professional gauge chart with ECharts' : '使用ECharts的专业仪表盘',
            type: 'echarts-gauge',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Gauge Chart' : '仪表盘', left: 'center' },
                    series: [{
                        type: 'gauge',
                        progress: { show: true, width: 18 },
                        axisLine: { lineStyle: { width: 18 } },
                        axisTick: { show: false },
                        splitLine: { length: 15, lineStyle: { width: 2, color: '#999' } },
                        axisLabel: { distance: 25, color: '#999', fontSize: 14 },
                        anchor: { show: true, showAbove: true, size: 25, itemStyle: { borderWidth: 10 } },
                        title: { show: true },
                        detail: { valueAnimation: true, fontSize: 40, offsetCenter: [0, '70%'] },
                        data: [{ value: 70, name: isEn() ? 'Score' : '得分' }]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Performance Score' : '绩效评分' },
                    { name: 'value', label: isEn() ? 'Value (0-100)' : '数值 (0-100)', type: 'text', defaultValue: '75' },
                    { name: 'name', label: isEn() ? 'Indicator Name' : '指标名称', type: 'text', defaultValue: isEn() ? 'Score' : '得分' },
                    { name: 'min', label: isEn() ? 'Minimum' : '最小值', type: 'text', defaultValue: '0' },
                    { name: 'max', label: isEn() ? 'Maximum' : '最大值', type: 'text', defaultValue: '100' }
                ]
            },
            generateOption: function(data) {
                var value = parseFloat(data.value) || 0;
                var min = parseFloat(data.min) || 0;
                var max = parseFloat(data.max) || 100;

                return {
                    title: { text: data.title || (isEn() ? 'Gauge Chart' : '仪表盘'), left: 'center' },
                    series: [{
                        type: 'gauge',
                        min: min,
                        max: max,
                        progress: { show: true, width: 18 },
                        axisLine: { lineStyle: { width: 18 } },
                        axisTick: { show: false },
                        splitLine: { length: 15, lineStyle: { width: 2, color: '#999' } },
                        axisLabel: { distance: 25, color: '#999', fontSize: 14 },
                        anchor: { show: true, showAbove: true, size: 25, itemStyle: { borderWidth: 10 } },
                        title: { show: true },
                        detail: { valueAnimation: true, fontSize: 40, offsetCenter: [0, '70%'] },
                        data: [{ value: value, name: data.name || (isEn() ? 'Score' : '得分') }]
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-th"></i>',
            name: '热力图',
            nameEn: 'Heatmap',
            keywords: ['echarts', 'heatmap', '热力图', '热图'],
            description: isEn() ? 'Professional heatmap with ECharts' : '使用ECharts的专业热力图',
            type: 'echarts-heatmap',
            hasDataInput: true,
            defaultOption: function() {
                var hours = ['12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a',
                             '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'];
                var days = ['Sat', 'Fri', 'Thu', 'Wed', 'Tue', 'Mon', 'Sun'];
                var data = [[0,0,5],[0,1,1],[0,2,0],[0,3,0],[0,4,0],[0,5,0],[0,6,0],[0,7,0],[0,8,0],[0,9,0],[0,10,0],[0,11,2],[0,12,4],[0,13,1],[0,14,1],[0,15,3],[0,16,4],[0,17,6],[0,18,4],[0,19,4],[0,20,3],[0,21,3],[0,22,2],[0,23,5],[1,0,7],[1,1,0],[1,2,0],[1,3,0],[1,4,0],[1,5,0],[1,6,0],[1,7,0],[1,8,0],[1,9,0],[1,10,5],[1,11,2],[1,12,2],[1,13,6],[1,14,9],[1,15,11],[1,16,6],[1,17,7],[1,18,8],[1,19,12],[1,20,5],[1,21,5],[1,22,7],[1,23,2],[2,0,1],[2,1,1],[2,2,0],[2,3,0],[2,4,0],[2,5,0],[2,6,0],[2,7,0],[2,8,0],[2,9,0],[2,10,3],[2,11,2],[2,12,1],[2,13,9],[2,14,8],[2,15,10],[2,16,6],[2,17,5],[2,18,5],[2,19,5],[2,20,7],[2,21,4],[2,22,2],[2,23,4],[3,0,7],[3,1,3],[3,2,0],[3,3,0],[3,4,0],[3,5,0],[3,6,0],[3,7,0],[3,8,1],[3,9,0],[3,10,5],[3,11,4],[3,12,7],[3,13,14],[3,14,13],[3,15,12],[3,16,9],[3,17,5],[3,18,5],[3,19,10],[3,20,6],[3,21,4],[3,22,4],[3,23,1],[4,0,1],[4,1,3],[4,2,0],[4,3,0],[4,4,0],[4,5,1],[4,6,0],[4,7,0],[4,8,0],[4,9,2],[4,10,4],[4,11,4],[4,12,2],[4,13,4],[4,14,4],[4,15,14],[4,16,12],[4,17,1],[4,18,8],[4,19,5],[4,20,3],[4,21,7],[4,22,3],[4,23,0],[5,0,2],[5,1,1],[5,2,0],[5,3,3],[5,4,0],[5,5,0],[5,6,0],[5,7,0],[5,8,2],[5,9,0],[5,10,4],[5,11,1],[5,12,5],[5,13,10],[5,14,5],[5,15,7],[5,16,11],[5,17,6],[5,18,0],[5,19,5],[5,20,3],[5,21,4],[5,22,2],[5,23,0],[6,0,1],[6,1,0],[6,2,0],[6,3,0],[6,4,0],[6,5,0],[6,6,0],[6,7,0],[6,8,0],[6,9,0],[6,10,1],[6,11,0],[6,12,2],[6,13,1],[6,14,3],[6,15,4],[6,16,0],[6,17,0],[6,18,0],[6,19,0],[6,20,1],[6,21,2],[6,22,2],[6,23,6]];
                data = data.map(function(item) {
                    return [item[1], item[0], item[2] || '-'];
                });

                return {
                    title: { text: isEn() ? 'Heatmap' : '热力图', left: 'center' },
                    tooltip: { position: 'top' },
                    grid: { height: '50%', top: '10%' },
                    xAxis: { type: 'category', data: hours, splitArea: { show: true } },
                    yAxis: { type: 'category', data: days, splitArea: { show: true } },
                    visualMap: { min: 0, max: 10, calculable: true, orient: 'horizontal', left: 'center', bottom: '15%' },
                    series: [{
                        name: isEn() ? 'Activity' : '活跃度',
                        type: 'heatmap',
                        data: data,
                        label: { show: true },
                        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Activity Heatmap' : '活动热力图' },
                    { name: 'xLabels', label: isEn() ? 'X-Axis Labels (comma separated)' : 'X轴标签（逗号分隔）', type: 'text', defaultValue: 'A,B,C,D,E,F' },
                    { name: 'yLabels', label: isEn() ? 'Y-Axis Labels (comma separated)' : 'Y轴标签（逗号分隔）', type: 'text', defaultValue: '1,2,3,4,5' },
                    { name: 'dataValues', label: isEn() ? 'Data (format: x,y,value one per line)' : '数据（格式：x,y,数值 每行一个）', type: 'textarea', defaultValue: '0,0,5\n0,1,1\n1,0,7\n1,1,0\n2,0,1\n2,1,1\n3,0,7\n3,1,3\n4,0,1\n4,1,3\n5,0,2\n5,1,1' }
                ]
            },
            generateOption: function(data) {
                var xLabels = (data.xLabels || 'A,B,C,D,E,F').split(',').map(function(s) { return s.trim(); });
                var yLabels = (data.yLabels || '1,2,3,4,5').split(',').map(function(s) { return s.trim(); });

                var heatmapData = [];
                var dataStr = data.dataValues || '';
                var maxVal = 0;

                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(',');
                        if (parts.length >= 3) {
                            var val = parseFloat(parts[2].trim()) || 0;
                            heatmapData.push([parseInt(parts[0].trim()) || 0, parseInt(parts[1].trim()) || 0, val]);
                            if (val > maxVal) maxVal = val;
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Heatmap' : '热力图'), left: 'center' },
                    tooltip: { position: 'top' },
                    grid: { height: '50%', top: '10%' },
                    xAxis: { type: 'category', data: xLabels, splitArea: { show: true } },
                    yAxis: { type: 'category', data: yLabels, splitArea: { show: true } },
                    visualMap: { min: 0, max: maxVal || 10, calculable: true, orient: 'horizontal', left: 'center', bottom: '15%' },
                    series: [{
                        name: isEn() ? 'Value' : '数值',
                        type: 'heatmap',
                        data: heatmapData,
                        label: { show: true },
                        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-sitemap"></i>',
            name: '树图',
            nameEn: 'Treemap',
            keywords: ['echarts', 'treemap', '树图', '矩形树图'],
            description: isEn() ? 'Professional treemap with ECharts' : '使用ECharts的专业树图',
            type: 'echarts-treemap',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Treemap' : '树图', left: 'center' },
                    tooltip: { formatter: '{b}: {c}' },
                    series: [{
                        type: 'treemap',
                        data: [
                            { name: isEn() ? 'Category A' : '类别A', value: 10, children: [
                                { name: isEn() ? 'A1' : 'A1', value: 4 },
                                { name: isEn() ? 'A2' : 'A2', value: 6 }
                            ]},
                            { name: isEn() ? 'Category B' : '类别B', value: 20, children: [
                                { name: isEn() ? 'B1' : 'B1', value: 8 },
                                { name: isEn() ? 'B2' : 'B2', value: 12 }
                            ]},
                            { name: isEn() ? 'Category C' : '类别C', value: 15 },
                            { name: isEn() ? 'Category D' : '类别D', value: 25 }
                        ]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Category Distribution' : '类别分布' },
                    { name: 'dataPairs', label: isEn() ? 'Data (format: name:value, one per line)' : '数据（格式：名称:数值，每行一个）', type: 'textarea', defaultValue: isEn() ?
                        'Electronics:40\nClothing:30\nFood:20\nBooks:10' :
                        '电子产品:40\n服装:30\n食品:20\n图书:10' }
                ]
            },
            generateOption: function(data) {
                var treemapData = [];
                var dataStr = data.dataPairs || '';

                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(':');
                        if (parts.length >= 2) {
                            treemapData.push({
                                name: parts[0].trim(),
                                value: parseFloat(parts[1].trim()) || 0
                            });
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Treemap' : '树图'), left: 'center' },
                    tooltip: { formatter: '{b}: {c}' },
                    series: [{
                        type: 'treemap',
                        data: treemapData
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-sun"></i>',
            name: '旭日图',
            nameEn: 'Sunburst',
            keywords: ['echarts', 'sunburst', '旭日图', '多层饼图'],
            description: isEn() ? 'Professional sunburst chart with ECharts' : '使用ECharts的专业旭日图',
            type: 'echarts-sunburst',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Sunburst' : '旭日图', left: 'center' },
                    series: {
                        type: 'sunburst',
                        data: [
                            { name: isEn() ? 'A' : 'A', value: 10, children: [
                                { name: isEn() ? 'A1' : 'A1', value: 4 },
                                { name: isEn() ? 'A2' : 'A2', value: 6 }
                            ]},
                            { name: isEn() ? 'B' : 'B', value: 20, children: [
                                { name: isEn() ? 'B1' : 'B1', value: 8, children: [
                                    { name: isEn() ? 'B11' : 'B11', value: 3 },
                                    { name: isEn() ? 'B12' : 'B12', value: 5 }
                                ]},
                                { name: isEn() ? 'B2' : 'B2', value: 12 }
                            ]},
                            { name: isEn() ? 'C' : 'C', value: 15 }
                        ],
                        radius: [0, '90%'],
                        label: { rotate: 'radial' }
                    }
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Hierarchical Data' : '层级数据' },
                    { name: 'dataJson', label: isEn() ? 'Data (JSON format with children)' : '数据（带children的JSON格式）', type: 'textarea', defaultValue: '[\n  {"name": "A", "value": 10},\n  {"name": "B", "value": 20, "children": [{"name": "B1", "value": 8}, {"name": "B2", "value": 12}]},\n  {"name": "C", "value": 15}\n]' }
                ]
            },
            generateOption: function(data) {
                var sunburstData = [];
                try {
                    sunburstData = JSON.parse(data.dataJson || '[]');
                } catch(e) {
                    sunburstData = [
                        { name: 'A', value: 10 },
                        { name: 'B', value: 20 },
                        { name: 'C', value: 15 }
                    ];
                }

                return {
                    title: { text: data.title || (isEn() ? 'Sunburst' : '旭日图'), left: 'center' },
                    series: {
                        type: 'sunburst',
                        data: sunburstData,
                        radius: [0, '90%'],
                        label: { rotate: 'radial' }
                    }
                };
            }
        },
        {
            icon: '<i class="fas fa-project-diagram"></i>',
            name: '桑基图',
            nameEn: 'Sankey',
            keywords: ['echarts', 'sankey', '桑基图', '流向图'],
            description: isEn() ? 'Professional sankey diagram with ECharts' : '使用ECharts的专业桑基图',
            type: 'echarts-sankey',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Sankey Diagram' : '桑基图', left: 'center' },
                    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
                    series: {
                        type: 'sankey',
                        layout: 'none',
                        emphasis: { focus: 'adjacency' },
                        data: [
                            { name: isEn() ? 'A' : 'A' },
                            { name: isEn() ? 'B' : 'B' },
                            { name: isEn() ? 'C' : 'C' },
                            { name: isEn() ? 'D' : 'D' },
                            { name: isEn() ? 'E' : 'E' }
                        ],
                        links: [
                            { source: isEn() ? 'A' : 'A', target: isEn() ? 'B' : 'B', value: 10 },
                            { source: isEn() ? 'A' : 'A', target: isEn() ? 'C' : 'C', value: 15 },
                            { source: isEn() ? 'B' : 'B', target: isEn() ? 'D' : 'D', value: 8 },
                            { source: isEn() ? 'C' : 'C', target: isEn() ? 'D' : 'D', value: 10 },
                            { source: isEn() ? 'C' : 'C', target: isEn() ? 'E' : 'E', value: 5 }
                        ]
                    }
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Flow Diagram' : '流向图' },
                    { name: 'nodes', label: isEn() ? 'Nodes (one per line)' : '节点（每行一个）', type: 'textarea', defaultValue: isEn() ? 'Source A\nSource B\nProcess C\nOutput D\nOutput E' : '来源A\n来源B\n处理C\n输出D\n输出E' },
                    { name: 'links', label: isEn() ? 'Links (format: source|target|value)' : '连接（格式：源|目标|数值）', type: 'textarea', defaultValue: isEn() ?
                        'Source A|Process C|30\nSource B|Process C|20\nProcess C|Output D|35\nProcess C|Output E|15' :
                        '来源A|处理C|30\n来源B|处理C|20\n处理C|输出D|35\n处理C|输出E|15' }
                ]
            },
            generateOption: function(data) {
                var nodes = [];
                var links = [];

                var nodesStr = data.nodes || '';
                if (typeof nodesStr === 'string') {
                    nodesStr.split('\n').forEach(function(line) {
                        if (line.trim()) {
                            nodes.push({ name: line.trim() });
                        }
                    });
                }

                var linksStr = data.links || '';
                if (typeof linksStr === 'string') {
                    linksStr.split('\n').forEach(function(line) {
                        var parts = line.split('|');
                        if (parts.length >= 3) {
                            links.push({
                                source: parts[0].trim(),
                                target: parts[1].trim(),
                                value: parseFloat(parts[2].trim()) || 0
                            });
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Sankey Diagram' : '桑基图'), left: 'center' },
                    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
                    series: {
                        type: 'sankey',
                        layout: 'none',
                        emphasis: { focus: 'adjacency' },
                        data: nodes,
                        links: links
                    }
                };
            }
        },
        {
            icon: '<i class="fas fa-network-wired"></i>',
            name: '关系图',
            nameEn: 'Graph',
            keywords: ['echarts', 'graph', '关系图', '网络图', '力导向图'],
            description: isEn() ? 'Professional graph/network with ECharts' : '使用ECharts的专业关系图',
            type: 'echarts-graph',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Graph' : '关系图', left: 'center' },
                    tooltip: {},
                    series: [{
                        type: 'graph',
                        layout: 'force',
                        animation: false,
                        label: { show: true, position: 'right', formatter: '{b}' },
                        draggable: true,
                        data: [
                            { name: isEn() ? 'Node 1' : '节点1', value: 10 },
                            { name: isEn() ? 'Node 2' : '节点2', value: 20 },
                            { name: isEn() ? 'Node 3' : '节点3', value: 15 },
                            { name: isEn() ? 'Node 4' : '节点4', value: 8 },
                            { name: isEn() ? 'Node 5' : '节点5', value: 12 }
                        ],
                        links: [
                            { source: 0, target: 1 },
                            { source: 0, target: 2 },
                            { source: 1, target: 2 },
                            { source: 2, target: 3 },
                            { source: 3, target: 4 },
                            { source: 4, target: 0 }
                        ],
                        roam: true,
                        force: { repulsion: 100 }
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Network Graph' : '网络关系图' },
                    { name: 'nodes', label: isEn() ? 'Nodes (format: name:value, one per line)' : '节点（格式：名称:数值，每行一个）', type: 'textarea', defaultValue: isEn() ?
                        'A:10\nB:20\nC:15\nD:8\nE:12' :
                        'A:10\nB:20\nC:15\nD:8\nE:12' },
                    { name: 'links', label: isEn() ? 'Links (format: source|target, one per line)' : '连接（格式：源|目标，每行一个）', type: 'textarea', defaultValue: 'A|B\nA|C\nB|C\nC|D\nD|E' }
                ]
            },
            generateOption: function(data) {
                var nodes = [];
                var links = [];

                var nodesStr = data.nodes || '';
                if (typeof nodesStr === 'string') {
                    nodesStr.split('\n').forEach(function(line, idx) {
                        var parts = line.split(':');
                        if (parts.length >= 1) {
                            nodes.push({
                                name: parts[0].trim(),
                                value: parseFloat(parts[1]) || 10,
                                id: idx
                            });
                        }
                    });
                }

                var linksStr = data.links || '';
                if (typeof linksStr === 'string') {
                    linksStr.split('\n').forEach(function(line) {
                        var parts = line.split('|');
                        if (parts.length >= 2) {
                            var sourceIdx = nodes.findIndex(function(n) { return n.name === parts[0].trim(); });
                            var targetIdx = nodes.findIndex(function(n) { return n.name === parts[1].trim(); });
                            if (sourceIdx >= 0 && targetIdx >= 0) {
                                links.push({ source: sourceIdx, target: targetIdx });
                            }
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Graph' : '关系图'), left: 'center' },
                    tooltip: {},
                    series: [{
                        type: 'graph',
                        layout: 'force',
                        animation: false,
                        label: { show: true, position: 'right', formatter: '{b}' },
                        draggable: true,
                        data: nodes,
                        links: links,
                        roam: true,
                        force: { repulsion: 100 }
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-chart-line"></i>',
            name: 'K线图',
            nameEn: 'Candlestick',
            keywords: ['echarts', 'candlestick', 'k线图', '蜡烛图', '股票'],
            description: isEn() ? 'Professional candlestick chart with ECharts' : '使用ECharts的专业K线图',
            type: 'echarts-candlestick',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Candlestick Chart' : 'K线图', left: 'center' },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
                    xAxis: { data: ['2017-10-24', '2017-10-25', '2017-10-26', '2017-10-27'] },
                    yAxis: {},
                    series: [{
                        type: 'candlestick',
                        data: [
                            [20, 34, 10, 38],
                            [40, 35, 30, 50],
                            [31, 38, 33, 44],
                            [38, 15, 5, 42]
                        ]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Stock Price' : '股票价格' },
                    { name: 'dates', label: isEn() ? 'Dates (comma separated)' : '日期（逗号分隔）', type: 'text', defaultValue: 'Day1,Day2,Day3,Day4,Day5' },
                    { name: 'candleData', label: isEn() ? 'Data (format: open,close,low,high one per line)' : '数据（格式：开盘,收盘,最低,最高 每行一个）', type: 'textarea', defaultValue: '20,34,10,38\n40,35,30,50\n31,38,33,44\n38,15,5,42\n50,45,35,55' }
                ]
            },
            generateOption: function(data) {
                var dates = (data.dates || 'Day1,Day2,Day3,Day4,Day5').split(',').map(function(s) { return s.trim(); });
                var candleData = [];

                var dataStr = data.candleData || '';
                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(',');
                        if (parts.length >= 4) {
                            candleData.push([
                                parseFloat(parts[0].trim()) || 0,
                                parseFloat(parts[1].trim()) || 0,
                                parseFloat(parts[2].trim()) || 0,
                                parseFloat(parts[3].trim()) || 0
                            ]);
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Candlestick Chart' : 'K线图'), left: 'center' },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
                    xAxis: { data: dates },
                    yAxis: {},
                    series: [{
                        type: 'candlestick',
                        data: candleData
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-box"></i>',
            name: '箱线图',
            nameEn: 'Boxplot',
            keywords: ['echarts', 'boxplot', '箱线图', '盒须图'],
            description: isEn() ? 'Professional boxplot with ECharts' : '使用ECharts的专业箱线图',
            type: 'echarts-boxplot',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Boxplot' : '箱线图', left: 'center' },
                    tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
                    grid: { left: '10%', right: '10%', bottom: '15%' },
                    xAxis: { type: 'category', data: [isEn() ? 'Group A' : '组A', isEn() ? 'Group B' : '组B', isEn() ? 'Group C' : '组C'], boundaryGap: true },
                    yAxis: { type: 'value' },
                    series: [{
                        name: 'boxplot',
                        type: 'boxplot',
                        data: [
                            [655, 850, 940, 980, 1175],
                            [672, 800, 845, 885, 1012],
                            [780, 840, 855, 880, 940]
                        ]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Data Distribution' : '数据分布' },
                    { name: 'categories', label: isEn() ? 'Categories (comma separated)' : '类别（逗号分隔）', type: 'text', defaultValue: isEn() ? 'Group A,Group B,Group C' : '组A,组B,组C' },
                    { name: 'boxData', label: isEn() ? 'Data (format: min,Q1,median,Q3,max one per line)' : '数据（格式：最小值,第一四分位数,中位数,第三四分位数,最大值 每行一个）', type: 'textarea', defaultValue: '655,850,940,980,1175\n672,800,845,885,1012\n780,840,855,880,940' }
                ]
            },
            generateOption: function(data) {
                var categories = (data.categories || 'Group A,Group B,Group C').split(',').map(function(s) { return s.trim(); });
                var boxData = [];

                var dataStr = data.boxData || '';
                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(',');
                        if (parts.length >= 5) {
                            boxData.push([
                                parseFloat(parts[0].trim()) || 0,
                                parseFloat(parts[1].trim()) || 0,
                                parseFloat(parts[2].trim()) || 0,
                                parseFloat(parts[3].trim()) || 0,
                                parseFloat(parts[4].trim()) || 0
                            ]);
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Boxplot' : '箱线图'), left: 'center' },
                    tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
                    grid: { left: '10%', right: '10%', bottom: '15%' },
                    xAxis: { type: 'category', data: categories, boundaryGap: true },
                    yAxis: { type: 'value' },
                    series: [{
                        name: 'boxplot',
                        type: 'boxplot',
                        data: boxData
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-image"></i>',
            name: '象形柱图',
            nameEn: 'PictorialBar',
            keywords: ['echarts', 'pictorialBar', '象形柱图', '图标柱状图'],
            description: isEn() ? 'Professional pictorial bar chart with ECharts' : '使用ECharts的专业象形柱图',
            type: 'echarts-pictorialbar',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Pictorial Bar' : '象形柱图', left: 'center' },
                    xAxis: { data: [isEn() ? 'A' : 'A', isEn() ? 'B' : 'B', isEn() ? 'C' : 'C', isEn() ? 'D' : 'D'], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { show: false } },
                    yAxis: { max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
                    series: [{
                        type: 'pictorialBar',
                        symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,0 C4.5,5 4.5,10 0,10 z',
                        itemStyle: { opacity: 0.5 },
                        emphasis: { itemStyle: { opacity: 1 } },
                        data: [123, 60, 25, 18],
                        z: 10
                    }, {
                        type: 'pictorialBar',
                        symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,0 C4.5,5 4.5,10 0,10 z',
                        itemStyle: { color: '#4a90e2' },
                        data: [123, 60, 25, 18],
                        z: 20,
                        symbolClip: true
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Icon Bar Chart' : '图标柱状图' },
                    { name: 'categories', label: isEn() ? 'Categories (comma separated)' : '类别（逗号分隔）', type: 'text', defaultValue: 'A,B,C,D' },
                    { name: 'values', label: isEn() ? 'Values (comma separated)' : '数值（逗号分隔）', type: 'text', defaultValue: '123,60,25,18' }
                ]
            },
            generateOption: function(data) {
                var categories = (data.categories || 'A,B,C,D').split(',').map(function(s) { return s.trim(); });
                var values = (data.values || '123,60,25,18').split(',').map(function(s) { return parseFloat(s.trim()) || 0; });

                return {
                    title: { text: data.title || (isEn() ? 'Pictorial Bar' : '象形柱图'), left: 'center' },
                    xAxis: { data: categories, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { show: false } },
                    yAxis: { max: Math.max.apply(null, values) * 1.2, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
                    series: [{
                        type: 'pictorialBar',
                        symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,0 C4.5,5 4.5,10 0,10 z',
                        itemStyle: { opacity: 0.5 },
                        emphasis: { itemStyle: { opacity: 1 } },
                        data: values,
                        z: 10
                    }, {
                        type: 'pictorialBar',
                        symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,0 C4.5,5 4.5,10 0,10 z',
                        itemStyle: { color: '#4a90e2' },
                        data: values,
                        z: 20,
                        symbolClip: true
                    }]
                };
            }
        },
        {
            icon: '<i class="fas fa-water"></i>',
            name: '主题河流图',
            nameEn: 'ThemeRiver',
            keywords: ['echarts', 'themeriver', '主题河流图', '河流图'],
            description: isEn() ? 'Professional theme river chart with ECharts' : '使用ECharts的专业主题河流图',
            type: 'echarts-themeriver',
            hasDataInput: true,
            defaultOption: function() {
                return {
                    title: { text: isEn() ? 'Theme River' : '主题河流图', left: 'center' },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: 'rgba(0,0,0,0.2)', width: 1, type: 'solid' } } },
                    singleAxis: { top: 50, bottom: 50, axisTick: {}, axisLabel: {}, type: 'time', axisPointer: { animation: true, label: { show: true } }, splitLine: { show: true, lineStyle: { type: 'dashed', opacity: 0.2 } } },
                    series: [{
                        type: 'themeRiver',
                        emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.8)' } },
                        data: [['2015/11/08', 10, 'DQ'], ['2015/11/09', 15, 'DQ'], ['2015/11/10', 35, 'DQ'], ['2015/11/11', 38, 'DQ'], ['2015/11/12', 22, 'DQ'], ['2015/11/13', 16, 'DQ'], ['2015/11/08', 35, 'TY'], ['2015/11/09', 36, 'TY'], ['2015/11/10', 37, 'TY'], ['2015/11/11', 22, 'TY'], ['2015/11/12', 24, 'TY'], ['2015/11/13', 26, 'TY'], ['2015/11/08', 21, 'SS'], ['2015/11/09', 25, 'SS'], ['2015/11/10', 28, 'SS'], ['2015/11/11', 26, 'SS'], ['2015/11/12', 30, 'SS'], ['2015/11/13', 28, 'SS']]
                    }]
                };
            },
            dataConfig: {
                fields: [
                    { name: 'title', label: isEn() ? 'Chart Title' : '图表标题', type: 'text', defaultValue: isEn() ? 'Theme River' : '主题河流图' },
                    { name: 'riverData', label: isEn() ? 'Data (format: date,value,category one per line)' : '数据（格式：日期,数值,类别 每行一个）', type: 'textarea', defaultValue: '2015/11/08,10,DQ\n2015/11/09,15,DQ\n2015/11/10,35,DQ\n2015/11/08,35,TY\n2015/11/09,36,TY\n2015/11/10,37,TY\n2015/11/08,21,SS\n2015/11/09,25,SS\n2015/11/10,28,SS' }
                ]
            },
            generateOption: function(data) {
                var riverData = [];

                var dataStr = data.riverData || '';
                if (typeof dataStr === 'string') {
                    dataStr.split('\n').forEach(function(line) {
                        var parts = line.split(',');
                        if (parts.length >= 3) {
                            riverData.push([
                                parts[0].trim(),
                                parseFloat(parts[1].trim()) || 0,
                                parts[2].trim()
                            ]);
                        }
                    });
                }

                return {
                    title: { text: data.title || (isEn() ? 'Theme River' : '主题河流图'), left: 'center' },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: 'rgba(0,0,0,0.2)', width: 1, type: 'solid' } } },
                    singleAxis: { top: 50, bottom: 50, axisTick: {}, axisLabel: {}, type: 'time', axisPointer: { animation: true, label: { show: true } }, splitLine: { show: true, lineStyle: { type: 'dashed', opacity: 0.2 } } },
                    series: [{
                        type: 'themeRiver',
                        emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.8)' } },
                        data: riverData
                    }]
                };
            }
        }
    ];

    // 生成 ECharts 图表的 HTML 代码
    function generateEChartsHtml(type, option, width, height) {
        width = width || '100%';
        height = height || '400px';
        var chartId = 'echarts_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        // 使用 Base64 编码避免 HTML 属性中的特殊字符问题
        var optionJson = JSON.stringify(option);
        var optionBase64 = btoa(unescape(encodeURIComponent(optionJson)));
        
        return '<div class="echarts-container" id="' + chartId + '" data-chart-type="' + type + '" data-chart-option-b64="' + optionBase64 + '" style="width: ' + width + '; height: ' + height + ';"></div>';
    }

    // 渲染页面中的所有 ECharts 图表
    function renderEChartsContainers() {
        if (!EChartsLoader.isLoaded()) {
            EChartsLoader.load(function() {
                renderEChartsContainers();
            });
            return;
        }

        var containers = document.querySelectorAll('.echarts-container:not([data-rendered="true"])');
        containers.forEach(function(container) {
            var type = container.dataset.chartType;
            var optionB64 = container.dataset.chartOptionB64;
            var optionJson = container.dataset.chartOption; // 兼容旧版本
            
            var option = null;
            
            try {
                if (optionB64) {
                    // 新的 Base64 编码格式 - 使用 TextDecoder 解码避免 URI malformed 错误
                    var binaryString = atob(optionB64);
                    var bytes = new Uint8Array(binaryString.length);
                    for (var i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    var jsonStr = new TextDecoder('utf-8').decode(bytes);
                    option = JSON.parse(jsonStr);
                } else if (optionJson) {
                    // 兼容旧格式
                    option = JSON.parse(optionJson.replace(/&quot;/g, '"'));
                }
            } catch (e) {
                console.error('[ECharts] Parse option error:', e);
            }
            
            if (option) {
                try {
                    var chart = echarts.init(container);
                    chart.setOption(option);
                    container.setAttribute('data-rendered', 'true');
                    
                    // 响应式
                    window.addEventListener('resize', function() {
                        chart.resize();
                    });
                } catch (e) {
                    console.error('[ECharts] Render error:', e);
                    container.innerHTML = '<div style="color: red; padding: 20px;">' + (isEn() ? 'Chart render failed' : '图表渲染失败') + '</div>';
                }
            }
        });
    }

    // 显示 ECharts 图表数据输入对话框
    function showEChartsDataInput(template) {
        var nightMode = global.nightMode === true;

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'echarts-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.innerHTML = template.icon + ' ' + (isEn() && template.nameEn ? template.nameEn : template.name);
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 5px; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 描述
        var desc = document.createElement('div');
        desc.textContent = template.description;
        desc.style.cssText = 'font-size: 13px; color: ' + (nightMode ? '#aaa' : '#666') + '; margin-bottom: 20px;';
        container.appendChild(desc);

        // 数据输入表单
        var form = document.createElement('div');
        form.style.cssText = 'margin-bottom: 20px;';

        var formData = {};
        var countFieldName = 'seriesCount';

        if (template.dataConfig && template.dataConfig.fields) {
            template.dataConfig.fields.forEach(function(field) {
                var fieldContainer = document.createElement('div');
                fieldContainer.style.cssText = 'margin-bottom: 15px;';
                fieldContainer.dataset.fieldName = field.name;

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

                formData[field.name] = input;
                fieldContainer.appendChild(input);
                form.appendChild(fieldContainer);

                // 动态显示/隐藏系列相关字段
                if (field.name.indexOf('series') === 0 && /series\d+/.test(field.name)) {
                    var match = field.name.match(/series(\d+)/);
                    if (match) {
                        var num = parseInt(match[1]);
                        setTimeout(function() {
                            var countSelect = formData[countFieldName];
                            if (countSelect) {
                                var currentCount = parseInt(countSelect.value) || 1;
                                fieldContainer.style.display = num <= currentCount ? 'block' : 'none';
                            }
                        }, 0);
                    }
                }
            });

            // 绑定数量选择器变化事件
            if (formData[countFieldName]) {
                formData[countFieldName].addEventListener('change', function() {
                    var selectedCount = parseInt(this.value) || 1;
                    template.dataConfig.fields.forEach(function(field) {
                        if (field.name.indexOf('series') === 0 && /series\d+/.test(field.name)) {
                            var match = field.name.match(/series(\d+)/);
                            if (match) {
                                var num = parseInt(match[1]);
                                var fieldContainer = form.querySelector('[data-field-name="' + field.name + '"]');
                                if (fieldContainer) {
                                    fieldContainer.style.display = num <= selectedCount ? 'block' : 'none';
                                }
                            }
                        }
                    });
                });
            }
        }

        container.appendChild(form);

        // 预览区域
        var previewContainer = document.createElement('div');
        previewContainer.style.cssText = 'margin-bottom: 20px; padding: 15px; background: ' + (nightMode ? '#1a1a1a' : '#f5f5f5') + '; border-radius: 8px; min-height: 300px;';

        var previewLabel = document.createElement('div');
        previewLabel.textContent = isEn() ? 'Preview:' : '预览：';
        previewLabel.style.cssText = 'font-size: 12px; color: ' + (nightMode ? '#888' : '#666') + '; margin-bottom: 8px;';
        previewContainer.appendChild(previewLabel);

        var previewChartDiv = document.createElement('div');
        previewChartDiv.style.cssText = 'width: 100%; height: 300px;';
        previewContainer.appendChild(previewChartDiv);

        container.appendChild(previewContainer);

        // 更新预览
        var previewChart = null;
        function updatePreview() {
            var data = {};
            for (var key in formData) {
                var input = formData[key];
                if (input.tagName === 'TEXTAREA') {
                    data[key] = input.value;
                } else if (input.tagName === 'SELECT') {
                    data[key] = input.value;
                } else {
                    data[key] = input.value;
                }
            }

            try {
                var option = template.generateOption(data);
                
                if (!EChartsLoader.isLoaded()) {
                    EChartsLoader.load(function() {
                        if (!previewChart) {
                            previewChart = echarts.init(previewChartDiv);
                        }
                        previewChart.setOption(option, true);
                    });
                } else {
                    if (!previewChart) {
                        previewChart = echarts.init(previewChartDiv);
                    }
                    previewChart.setOption(option, true);
                }
            } catch (e) {
                console.error('Preview error:', e);
            }
        }

        // 绑定输入事件
        for (var key in formData) {
            formData[key].addEventListener('input', updatePreview);
        }

        // 初始预览
        setTimeout(updatePreview, 100);

        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; width: 32px; height: 32px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = function() {
            if (previewChart) {
                previewChart.dispose();
            }
            document.body.removeChild(modal);
        };
        container.style.position = 'relative';
        container.appendChild(closeBtn);

        // 按钮栏
        var buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

        var insertBtn = document.createElement('button');
        insertBtn.innerHTML = '<i class="fas fa-plus"></i> ' + (isEn() ? 'Insert' : '插入');
        insertBtn.style.cssText = 'padding: 10px 20px; background: #4a90e2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';
        insertBtn.onclick = function() {
            var data = {};
            for (var key in formData) {
                var input = formData[key];
                if (input.tagName === 'TEXTAREA') {
                    data[key] = input.value;
                } else if (input.tagName === 'SELECT') {
                    data[key] = input.value;
                } else {
                    data[key] = input.value;
                }
            }

            try {
                var option = template.generateOption(data);
                
                // 获取预览图表的 SVG
                var svgUrl = '';
                if (previewChart) {
                    try {
                        svgUrl = previewChart.getDataURL({
                            type: 'png',
                            pixelRatio: 2,
                            backgroundColor: '#fff'
                        });
                    } catch (e) {
                        console.error('[ECharts] Get SVG error:', e);
                    }
                }
                
                // 使用与 Mermaid 图表相同的方式插入
                try {
                    if (g('vditor')) {
                        if (svgUrl) {
                            // 插入图片
                            g('vditor').insertValue('![' + (data.title || 'Chart') + '](' + svgUrl + ')\n\n');
                        } else {
                            // 回退到 HTML
                            var html = generateEChartsHtml(template.type, option);
                            g('vditor').insertValue(html + '\n\n');
                        }
                        if (global.showMessage) {
                            global.showMessage(isEn() ? 'Chart inserted' : '图表已插入');
                        }
                    }
                } catch (e) {
                    console.error('[ECharts] Insert error:', e);
                    if (global.showMessage) {
                        global.showMessage(isEn() ? 'Failed to insert chart' : '插入图表失败', 'error');
                    }
                }
                
                if (previewChart) {
                    previewChart.dispose();
                }
                document.body.removeChild(modal);
            } catch (e) {
                console.error('[ECharts] Insert error:', e);
                if (global.showMessage) {
                    global.showMessage(isEn() ? 'Failed to insert chart' : '插入图表失败', 'error');
                }
            }
        };

        buttonBar.appendChild(insertBtn);
        container.appendChild(buttonBar);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                if (previewChart) {
                    previewChart.dispose();
                }
                document.body.removeChild(modal);
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                if (previewChart) {
                    previewChart.dispose();
                }
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);
    }

    // 显示 ECharts 选择器
    function showEChartsPicker() {
        var nightMode = global.nightMode === true;

        // 创建模态框
        var modal = document.createElement('div');
        modal.className = 'echarts-picker-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;';

        // 创建容器
        var container = document.createElement('div');
        container.style.cssText = 'background: ' + (nightMode ? '#2d2d2d' : 'white') + '; border-radius: 12px; padding: 20px; width: 90%; max-width: 700px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;';

        // 标题
        var title = document.createElement('div');
        title.textContent = isEn() ? 'Insert ECharts' : '插入ECharts图表';
        title.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 15px; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';
        container.appendChild(title);

        // 搜索框
        var searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = isEn() ? 'Search chart types...' : '搜索图表类型...';
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

            items.forEach(function(template) {
                var chartBtn = document.createElement('button');
                chartBtn.style.cssText = 'padding: 15px; border: 2px solid transparent; background: ' + (nightMode ? '#3d3d3d' : '#f5f5f5') + '; cursor: pointer; border-radius: 8px; transition: all 0.2s; text-align: center; color: ' + (nightMode ? '#eee' : '#333') + ';';

                var iconDiv = document.createElement('div');
                iconDiv.style.cssText = 'font-size: 28px; margin-bottom: 8px; color: #4a90e2;';
                iconDiv.innerHTML = template.icon;

                var nameDiv = document.createElement('div');
                nameDiv.style.cssText = 'font-weight: bold; font-size: 12px; margin-bottom: 4px;';
                nameDiv.textContent = isEn() && template.nameEn ? template.nameEn : template.name;

                var descDiv = document.createElement('div');
                descDiv.style.cssText = 'font-size: 11px; color: ' + (nightMode ? '#aaa' : '#666') + '; line-height: 1.3;';
                descDiv.textContent = template.description;

                chartBtn.appendChild(iconDiv);
                chartBtn.appendChild(nameDiv);
                chartBtn.appendChild(descDiv);

                chartBtn.onclick = function() {
                    showEChartsDataInput(template);
                    document.body.removeChild(modal);
                };

                chartBtn.onmouseenter = function() {
                    this.style.background = nightMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                    this.style.borderColor = '#4a90e2';
                };

                chartBtn.onmouseleave = function() {
                    this.style.background = nightMode ? '#3d3d3d' : '#f5f5f5';
                    this.style.borderColor = 'transparent';
                };

                chartGrid.appendChild(chartBtn);
            });
        }

        // 初始渲染
        renderCharts(echartsTemplates);

        // 搜索功能
        searchBox.addEventListener('input', function() {
            var q = this.value.trim().toLowerCase();
            if (!q) {
                renderCharts(echartsTemplates);
                return;
            }

            var results = echartsTemplates.filter(function(template) {
                var name = (isEn() && template.nameEn ? template.nameEn : template.name).toLowerCase();
                if (name.includes(q)) return true;
                if (template.description.toLowerCase().includes(q)) return true;
                if (template.keywords && template.keywords.some(function(k) { return k.toLowerCase().includes(q); })) return true;
                return false;
            });

            renderCharts(results);
        });

        // 右上角关闭按钮
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.style.cssText = 'position: absolute; top: 15px; right: 15px; width: 32px; height: 32px; background: ' + (nightMode ? '#444' : '#f5f5f5') + '; color: ' + (nightMode ? '#eee' : '#333') + '; border: none; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = function() {
            document.body.removeChild(modal);
        };
        container.style.position = 'relative';
        container.appendChild(closeBtn);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // 点击外部关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // 键盘事件
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleKeydown);
            }
        }
        document.addEventListener('keydown', handleKeydown);
    }

    // 导出公共 API
    global.EChartsLoader = EChartsLoader;
    global.echartsTemplates = echartsTemplates;
    global.showEChartsPicker = showEChartsPicker;
    global.showEChartsDataInput = showEChartsDataInput;
    global.generateEChartsHtml = generateEChartsHtml;
    global.renderEChartsContainers = renderEChartsContainers;

})(typeof window !== 'undefined' ? window : this);
