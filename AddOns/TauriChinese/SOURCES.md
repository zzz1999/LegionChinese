# 数据与署名

## 插件启发来源

- TauriHun：作者 **WorldOfHuncraft**，发布账号 **TauriHun**。
- [作品页面](https://www.curseforge.com/wow/addons/taurihun)、[许可页面](https://www.curseforge.com/wow/addons/taurihun/license)。调查时许可为 All Rights Reserved，未找到原作者公开 GitHub 仓库。
- 本项目重新实现客户端逻辑，没有复制 TauriHun 的 Lua、匈牙利语数据库或字体。

## 任务、对话与书籍

- [TrinityCore TDB 735.00](https://github.com/TrinityCore/TrinityCore/releases/tag/TDB735.00)：2018-02-19 world 与 hotfixes 数据。使用任务 zhCN 文本、广播 zhCN 文本及匹配所需的其他语言信息。基础库大量文本的 VerifiedBuild 为 25549；数据库发行版本不等于每条记录最后采集版本。
- [TrinityCore 中文任务补丁](https://github.com/TrinityCore/TrinityCore/blob/49bd093968e6ed7a662d44c7c10653800bfc23e6/sql/old/7/world/19061_2019_07_15/2018_05_26_19_world.sql)：中文记录标记为 26365。
- [MagicStorm 历史 SQL](https://github.com/welder1976/MagicStorm/tree/e941af4df2f394e7d0e0753ca15c0677271698c1/sql/sql/world)：导入 `2018_04_28_99_03_quest_objectives_locale_zhCN.sql`、`2018_05_29_99_02_mage.sql`、`2018_09_16_99_01_druid.sql` 中选定的中文任务字段和书页；忽略其服务器脚本和其他 SQL。法师文件标有 WowPacketParser、7.3.5.26365、zhCN 的采集来源；部分德鲁伊记录标记更早版本。
- [TrinityCore 书页原文补丁](https://github.com/TrinityCore/TrinityCore/blob/49bd093968e6ed7a662d44c7c10653800bfc23e6/sql/old/7/world/19061_2019_07_15/2018_09_24_00_world.sql)：通过稳定的页面 ID 配对上述军团再临书页，生成原文指纹。该补丁部分原文记录标记为后续版本 27843；只有客户端实际全文匹配才替换。原文不随 AddOns 分发。

感谢 TrinityCore、其数据库贡献者和 MagicStorm 维护者。相关仓库包含 GNU GPL 许可。游戏名称、故事、人物与原始文本的权利归各自权利人；本项目不将社区数据库等同于暴雪发布或授权的完整官方译文库。

未导入来源含糊的 3.3.5 中文合集，未把繁体中文机械转换后冒充简体官中。数据不齐全是保留原文的正常原因。

## 字体

- [霞鹜文楷 Lite](https://github.com/lxgw/LxgwWenKai-Lite)，作者 LXGW，OFL-1.1。
- 固定版本：`1e6aa244f1c396e7f98c5a73f726e9dbb34b31f8` 的 `LXGWWenKaiLite-Regular.ttf`。
- 字体未修改；完整许可证随字体保存在 `AddOns/TauriChinese/Media/OFL.txt`。

## 界面接口依据

对照 [Gethe 保存的 7.3.5 原版界面源码](https://github.com/Gethe/wow-ui-source/tree/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML) 核对事件、函数和控件名称；该参考源码不随插件分发。

所有参与构建的数据文件与字体的固定 URL、SHA-256 均列于 `sources.json`。生成产物只保留中文值与匹配指纹。
