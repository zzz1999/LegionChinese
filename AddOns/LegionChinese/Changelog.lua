-- SPDX-License-Identifier: GPL-2.0-or-later
-- Generated from release notes; run npm run build:changelog after editing CHANGELOG.md.
LegionChinese.Changelog = {
    version = "1.3.6",
    entries = {
        "修复查看 NPC 名称或头衔提示时，连带初始化无关法术数据库的问题；NPC 提示继续查询生物资料，法术资料在实际需要时初始化。",
        "阅读已有中文的书页时不再提前初始化书籍数据库；遇到外文页才查询译文，并保留第一页的匹配线索，支持中英文书页交错及换书后的上下文清理。",
        "补充 5 条回归测试，覆盖分类隔离、首次需要法术时的翻译、中文首页匹配线索、中文玩家名和换书流程。本版未新增译文；游戏内内存与首次使用耗时仍需实测。",
    },
}
