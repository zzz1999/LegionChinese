-- SPDX-License-Identifier: GPL-2.0-or-later
-- Generated from release notes; run npm run build:changelog after editing CHANGELOG.md.
LegionChinese.Changelog = {
    version = "1.3.1",
    entries = {
        "按任务、对白、书籍、物品、法术、地图、收藏等功能整理资源目录，拆分地图、坐骑、专业、声望与要塞界面模块；汉化资料及简繁回退规则与 1.3.0 保持一致。",
        "合并有实际体积收益的重复中文，保留原有索引、ID 和数值；资源仍分片加载，沿用魔兽世界中文字体。",
        "公共挂钩支持多个功能回调并分别去重；按相关界面插件的加载事件安装，避免无关插件触发重复处理。",
        "构建先在临时目录生成资源，校验通过后再替换；失败时回滚，并新增资源清单、加载依赖、共享译文引用和重构前后赋值一致性校验。",
    },
}
