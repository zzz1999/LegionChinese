-- SPDX-License-Identifier: GPL-2.0-or-later
-- Generated from release notes; run npm run build:changelog after editing CHANGELOG.md.
LegionChinese.Changelog = {
    version = "1.3.8",
    entries = {
        "扩充 NPC 姓名资料：按 NPC ID 与完整原名匹配的姓名库新增 611 个 ID、625 组名称对应，其中 603 组简体、22 组繁体；累计覆盖 96,372 个 ID。",
        "用于简短交任务提示等入口的姓名索引新增 259 个无歧义名称，其中 242 个简体、17 个繁体，累计 65,060 个名称键。两种统计存在重叠，不能相加当作新增 NPC 数量。",
        "核对 7.3.5.26972 客户端 Creature 数据和 2018 年 build 26365 中英繁社区采集。新增对应优先采用简体，繁体补缺；保留已有译文，不猜测缺失姓名，不把社区资料标为已独立核实的官方译文。",
        "增加来源校验、歧义排除和实际姓名查询的回归测试；沿用一个插件内按需初始化数据的结构。尚未穷尽所有 NPC，服务器自定义及没有可靠对应的姓名继续保留原文。",
    },
}
