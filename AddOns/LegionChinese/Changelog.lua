-- SPDX-License-Identifier: GPL-2.0-or-later
-- Generated from release notes; run npm run build:changelog after editing CHANGELOG.md.
LegionChinese.Changelog = {
    version = "1.3.7",
    entries = {
        "补齐任务列表与右侧追踪栏中仅含“Return to NPC姓名.”的简短交付提示：只有姓名命中现有可靠中文库时才显示“返回中文姓名处。”，包括奥伦·日冕、莉迪亚·日冕、指挥官埃里戈尔·黎明使者和费尔古斯·扭木。",
        "上述固定句式为插件编写的补充规则，不是新增官方整句译文。已有整句译文优先，NPC 姓名沿用简体优先、繁体补缺；未知姓名、附带地点或其他指示的句子继续保留原文，不套用任务 ID 推测交付对象。",
        "在同一个插件内将 NPC 姓名索引独立初始化，交付提示查询姓名时不再连带初始化整组对白数据。",
        "补充 6 条回归测试，覆盖真实姓名数据、任务列表与追踪栏、控件复用、行高与原生字体、已有译文优先级及姓名资料按需初始化；实际游戏显示仍需复测。",
    },
}
