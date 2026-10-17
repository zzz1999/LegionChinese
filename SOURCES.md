# 数据与署名

## 插件启发来源

- TauriHun：作者 **WorldOfHuncraft**，发布账号 **TauriHun**。
- [作品页面](https://www.curseforge.com/wow/addons/taurihun)、[许可页面](https://www.curseforge.com/wow/addons/taurihun/license)。调查时许可为 All Rights Reserved，未找到原作者公开 GitHub 仓库。
- 本项目重新实现客户端逻辑，没有复制 TauriHun 的 Lua、匈牙利语数据库或字体。

## 任务、对话与书籍

- [TrinityCore TDB 735.00](https://github.com/TrinityCore/TrinityCore/releases/tag/TDB735.00)：2018-02-19 world 与 hotfixes 数据。使用任务、广播等表的 zhCN 和 zhTW 文本及匹配所需的其他语言信息。基础库大量文本的 VerifiedBuild 为 25549；数据库发行版本不等于每条记录最后采集版本。
- [The Legion Preservation Project TDB735.25051](https://github.com/The-Legion-Preservation-Project/TrinityCore/releases/tag/TDB735.25051)：使用 `TDB_full_735.26972_2025_05_11.7z` 中的 hotfixes 广播文本和 world 书页、NPC 对话选项、任务进行中及交任务对话。该库的 zhCN、zhTW 广播记录标记为 7.3.5.26365；**简繁中文书页及多数补充任务对话的 VerifiedBuild 为 0，不能据此证实是未经修改的官方译文**。world 库还混有后续版本记录，导入时排除标记高于 7.3.5 最终构建 26972 的条目；任务只补充 `quest_request_items_locale` 和 `quest_offer_reward_locale`，保留现有的标题、描述和目标数据。
- [TrinityCore 中文任务补丁](https://github.com/TrinityCore/TrinityCore/blob/49bd093968e6ed7a662d44c7c10653800bfc23e6/sql/old/7/world/19061_2019_07_15/2018_05_26_19_world.sql)：中文记录标记为 26365。
- [MagicStorm 历史 SQL](https://github.com/welder1976/MagicStorm/tree/e941af4df2f394e7d0e0753ca15c0677271698c1/sql/sql)：固定在提交 `e941af4df2f394e7d0e0753ca15c0677271698c1`。从 world 与 hotfixes 补丁导入选定的中文任务字段、广播文本、NPC 选项和 8 个书页。多数相关文件含 WowPacketParser 的 zhCN、客户端版本采集头；没有采集头的补丁单独标记为 `community-capture`。法师书页来自 7.3.5.26365；德鲁伊书页标记为更早的军团再临版本 22594。不执行其 SQL、服务器脚本或程序。
- [TrinityCore 书页原文补丁](https://github.com/TrinityCore/TrinityCore/blob/49bd093968e6ed7a662d44c7c10653800bfc23e6/sql/old/7/world/19061_2019_07_15/2018_09_24_00_world.sql)：通过稳定的页面 ID 配对上述军团再临书页，生成原文指纹。该补丁部分原文记录标记为后续版本 27843；只有客户端实际全文匹配才替换。原文不随 AddOns 分发。
- [AzerothCore 历史书页](https://github.com/azerothcore/azerothcore-wotlk/blob/add9cadc2d4eeafdd53288570efd3fa5c5768b43/data/sql/base/db_world/page_text_locale.sql)：固定在提交 `add9cadc2d4eeafdd53288570efd3fa5c5768b43`，同时读取 `page_text.sql` 和 `page_text_locale.sql`。这是 3.3.5 社区库，**仅当军团再临库缺少同一语言的可用译文，且页面 ID 与规范化英文全文均与军团再临记录一致时**，补入相同旧世界书页的中文文本。当前得到 28 个补充候选（不含损坏占位符）；标记为 `legacy-compatible-unverified`，不当作已核实的官中。

- [AzerothCore 任务交付提示](https://github.com/azerothcore/azerothcore-wotlk/blob/4d9d1d4b5723e819c5c390f6ca1177283dbfb8e3/data/sql/base/db_world/quest_template_locale.sql)：从同一固定提交读取 `quest_template.sql` 和 `quest_template_locale.sql`。只导入任务 ID、英文标题、任务目标及正文均与 7.3.5 基础库一致的任务；若军团再临已有英文交付提示，该字段也必须一致。只补充 `CompletedText`，运行时需匹配交付提示的完整原文指纹，不能仅凭任务 ID 套用旧版本地点。保留现有军团再临 `CompletionLog` 字段的优先级。截图中任务 12680 的补充简体为“去东瘟疫之地：血色领地找死亡裂口的骑手萨拉纳尔。”，VerifiedBuild 为 0，标记为 `legacy-compatible-unverified`，不冒充已核实官中。逐项来源见 [docs/completion-provenance.json](docs/completion-provenance.json)。

### 选择与核验规则

感谢 TrinityCore、The Legion Preservation Project、MagicStorm、AzerothCore 的维护者和数据库贡献者。相关仓库包含 GNU GPL 许可。游戏名称、故事、人物与原始文本的权利归各自权利人；本项目不将社区数据库等同于暴雪发布或授权的完整官方译文库。

- 所有类别均按“可用 zhCN → 可用 zhTW → 原文”处理，繁体译文直接来自上游 zhTW 字段，不经机器转换。任务逐字段回退，全文索引逐键回退。
- 在各自语言内，广播译文必须有不高于 26972 的正数 VerifiedBuild，优先采用军团再临较新的记录；同版本优先 hotfixes 客户端数据表，其次采集补丁。同等优先级有冲突的广播 ID 不导入该语言。VerifiedBuild 是上游记录的来源证据，不是本项目逐条核实官方原文的证明。
- 导入完整广播库中能配对的文本，不再只按旧 world 数据库中不完整的 NPC 引用筛选。构建时读取原文语言以生成指纹，发布资源只保留中文正文。
- 在同一种中文内，书页优先保留有采集标记的军团再临译文，再用军团再临社区库；最后才用 ID 和英文均核对一致的旧世界补充。低优先级译文不会覆盖或使高优先级译文失效，繁体也不会覆盖可用的简体译文。
- 任务进行中与交任务对话按任务 ID 导入；同一种中文的较高 VerifiedBuild 记录优先于社区库的 0 版本记录。`data-audit.json` 的 `questDialogueSources` 单独统计最终选用的有版本标记字段与社区未核实字段。截图中的任务 12680 进度译文来自上述 7.3.5 社区库，VerifiedBuild 为 0；未将其标为已核实官中。
- 相同全文在同一语言中对应同等级的不同译文时排除该语言的键；简体无可用键时才尝试繁体，两者都不可用则保留原文。任何已知指纹碰撞（包括简繁之间的碰撞）一律排除。页面候选数、语言候选数、最终有效指纹数和可匹配页面数分别统计，不能互相替代。
- 未导入截断的 `2018_05_17_99_01_hostfixes_agus1.sql`，也未导入标记为 27326、27547 的后续资料片广播补丁。原始 SQL 只解析选定的数据表，不执行其中语句。
- 不调用机器翻译，不把繁体中文转换后冒充简体官中。缺少可信来源或匹配不确定时保留原文。
- 不分发无法解析的数字占位符字段（如任务数量、物品或世界状态变量）；简体字段不可用时仍尝试繁体，再保留原文。运行时也拦截残留变量，不用数据库中的旧数量猜测服务器当前要求。

[docs/book-provenance.json](docs/book-provenance.json) 按页面 ID 和语言记录来源、VerifiedBuild、证据类别和最终英文匹配结果；[docs/data-audit.json](docs/data-audit.json) 记录简繁覆盖统计、被版本过滤的数量和全部源文件哈希。安装包中的本文件保留署名，完整审计记录可在 [GitHub 仓库](https://github.com/zzz1999/TauriChinese/tree/main/docs) 查阅。

## 字体

- 1.1.6 起中文客户端沿用每个原版控件自身的字体、字号和描边，包括书籍正文及各级标题；介绍窗口使用游戏字体。其他语言客户端先尝试游戏自带 `Fonts\ARKai_T.ttf`，加载失败才使用以下后备字体。只引用客户端中的游戏字体，不将其复制或随插件分发。
- [霞鹜文楷](https://github.com/lxgw/LxgwWenKai)，作者 LXGW，OFL-1.1。1.1.5 起使用完整版，补足 Lite 字库缺少的「抷」字。
- 固定版本：`00279e1e74e582eb42dc8891d05cf6becb783a9e` 的 `LXGWWenKai-Regular.ttf`。构建检查逐字核验现有 Lua 文本中的汉字覆盖。
- 字体未修改；完整许可证随字体保存在 `AddOns/TauriChinese/Media/OFL.txt`。

## 界面接口依据

对照 [Gethe 保存的 7.3.5 原版界面源码](https://github.com/Gethe/wow-ui-source/tree/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML) 核对事件、函数和控件名称。`ItemTextFrame.xml` 和 `QuestFrame.xml` 在 XML 中绑定事件处理函数，因此书籍、任务进度及问候窗口通过 `HookScript` 挂钩实际窗口事件；只挂钩同名全局函数不会更新已经绑定的处理函数。参考源码不随插件分发。

右侧任务追踪栏对照同一提交的 `AddOns/Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua` 和 `Blizzard_ObjectiveTracker.lua`，使用任务模块方法的安全后置挂钩，在后续目标及任务定位之前更新文字与行高，不替换全局任务 API。字体规则参考 `FrameXML/Fonts.xml` 与 `SharedXML/SharedFonts.xml`。

所有参与构建的数据文件与字体的固定 URL、SHA-256 均列于 `sources.json`。生成产物只保留中文值与匹配指纹。
