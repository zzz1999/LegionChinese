-- SPDX-License-Identifier: GPL-2.0-or-later
-- Generated from release notes; run npm run build:changelog after editing CHANGELOG.md.
LegionChinese.Changelog = {
    version = "1.2.15",
    entries = {
        "修复 NPC 说话、喊话及密语译文含百分号时触发聊天格式化错误的问题，保留原有百分比显示。",
        "基础任务库增加任务 ID、字段与完整原文校验，支持已收录的外语原文、角色名和职业变量；服务器修改过的数量或要求不再被旧译文覆盖，无法核对的字段保留原文。",
        "自动发布时，将实际发布版本与同一份更新说明同时写入安装包和 GitHub Release，修复自动递增版本后 /lcn about 仍显示上一版记录的问题。",
    },
}
