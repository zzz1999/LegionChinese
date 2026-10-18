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

1.2.1 补充布林顿每日礼物的交任务正文。旧导入只读取 `quest_offer_reward_locale`，漏掉了上游将中文写入普通 `quest_offer_reward` 表的采集记录。本次只按清单中审核过的任务 ID、语言和采集版本导入正文，不执行 SQL，也不导入奖励物品或其他服务器逻辑：

- **布林顿 5000（34774）**：[MagicStorm 2018_03_31_99_01_world.sql](https://github.com/welder1976/MagicStorm/blob/e941af4df2f394e7d0e0753ca15c0677271698c1/sql/sql/world/2018_03_31_99_01_world.sql#L378)。文件头记录 WowPacketParser、`Detected locale: zhCN` 和 7.3.5.26124，目标行 VerifiedBuild 为 26124，标记为 `client-sniff`。只将 `RewardText` 转入该任务的 Completion 字段。
- **布林顿 6000（40753）**：[MagicStorm 2018_02_25_99_world_04.sql](https://github.com/welder1976/MagicStorm/blob/e941af4df2f394e7d0e0753ca15c0677271698c1/sql/sql/world/2018_02_25_99_world_04.sql#L1641)。文件头及目标行记录 7.3.5.25996；正文为简体中文，但文件头未声明采集语言，保守标为 `community-capture`，不声称已逐字核实官中。

两份文件均固定上述提交及 SHA-256。未在清单内的任务、缺少正文的版本更新、非中文或超出目标版本的记录不导入。`docs/data-audit.json` 的对应源条目列出实际导入 ID、表和版本；原始 SQL 不随 AddOns 分发。布林顿 3000 的搏击俱乐部任务没有套用领取礼物的正文。

### 已确认的任务译文缺口

2026-10-17 的游戏截图反馈 **保卫贫瘠之地（26642）** 在卡加尔·战痕处的交任务正文仍为英文。当前资源已有中文标题、描述、目标及交付位置提示，但没有 `Completion` 字段。交任务正文通过 `QuestInfoRewardText` 单独查询，不会因为标题已经是中文而跳过正文；这次属于译文数据缺失。

已检查 TDB 735.00（2018-02-19）、TDB 735.26972（2025-05-11），以及 LegionCore 的 2020-04-25、2024-10-23 快照，均未找到该字段的可用 zhCN 或 zhTW 记录。进一步核对大灾变旧库 [mangosthree Chinese_Quest.sql](https://github.com/r-log/mangosthree-database/blob/b1c5e0c107566c3769d3c767e2a1378ec8398098/Translations/Translations/Chinese/Chinese_Quest.sql#L14327)，同一任务也只有标题、说明和目标；其 [Chinese_Quest_missing.sql](https://github.com/r-log/mangosthree-database/blob/b1c5e0c107566c3769d3c767e2a1378ec8398098/Translations/Translations_TODO/Chinese/Chinese_Quest_missing.sql#L1027) 将与截图一致的完整英文交付正文列为待译（word_id 181821）。该旧库仅用于核对缺口，没有导入其数据。

此条目前仍待补充有出处的简繁中文译文，按既定回退规则保留原文。不能拿接任务说明或“去前沿哨所报到”的位置提示替代交任务对白，也未将自译文字冒充官方译文。

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

[docs/book-provenance.json](docs/book-provenance.json) 按页面 ID 和语言记录来源、VerifiedBuild、证据类别和最终英文匹配结果；[docs/data-audit.json](docs/data-audit.json) 记录简繁覆盖统计、被版本过滤的数量和全部源文件哈希。安装包中的本文件保留署名，完整审计记录可在 [GitHub 仓库](https://github.com/zzz1999/LegionChinese/tree/main/docs) 查阅。

## 法术与宠物默认名称

1.1.8 起使用 Wago.Tools 保存的 **7.3.5.26972** 客户端 DB2 表，分别获取 enUS、zhCN 和 zhTW 的 CSV 导出。来源是该版本客户端中的名称字段，优先采用其简体译名；这是社区维护的客户端资料存档，不是暴雪发布或背书的插件数据库。

- [Spell](https://wago.tools/db2/Spell?build=7.3.5.26972)：只导入 `Name_lang`，不导入法术描述、光环说明或数值。最终收录 160,721 个法术 ID，其中简体 141,175 个、繁体补充 19,546 个。包含 NPC 技能和历史记录，不能当作玩家技能数量或任一服务器的实测覆盖率。
- [Creature](https://wago.tools/db2/Creature?build=7.3.5.26972)：按生物 ID 配对客户端名称，保存中文名称和原名指纹；仅在运行时确认是自己的宠物或召唤物，且当前名字与该记录的默认原名一致时使用。它不等同于完整的服务器生物库。
- [CreatureFamily](https://wago.tools/db2/CreatureFamily?build=7.3.5.26972)：用于核对狼、食尸鬼等默认种类名。猎人仅处理当前仍可改名且名字与默认种类匹配的宠物，其他名字保留。

每张表均固定同一个 build，不自动切换到最新版本。9 个源文件的 URL、SHA-256 和记录数见 [docs/client-name-audit.json](docs/client-name-audit.json)；下载清单见 `sources.json` 的 `clientTables`。按 ID 选择可用简体，再选繁体；缺少 ID 时只使用无歧义的原名指纹，777 个在简繁中均无法消除歧义的名称键没有导入。不同 ID 的同名技能仍可通过 ID 区分。CSV 的英文名称、描述和原始导出仅用于构建，不随 AddOns 分发。

**随机专有名字只采用可核实的中文对应，缺失时保留原名。** 2026-10-17 再次检查食尸鬼随机姓名：上述两套 TDB，以及 LegionCore 的 2020-04-25、2024-10-23 world 快照中，`pet_name_generation` 均有食尸鬼 26125 的 53 条英文片段，但没有中文片段或中文本地化记录。其中 ID 280 为前缀 `Casket`，ID 292 为后缀 `masher`，能组成截图中的 `Casketmasher`；这些 ID 是服务器名字表的记录编号，不能当成中文客户端的姓名 ID。

[LegionCore 7.3.5 的生成函数](https://github.com/The-Legion-Preservation-Project/LegionCore-7.3.5/blob/fed58f79c498521836612acd12009e9fa9e60e31/src/server/game/Globals/ObjectMgr.cpp#L5690) 从两组片段中各取一个并拼接。客户端 [NameGen 7.3.5.26972](https://wago.tools/db2/NameGen?build=7.3.5.26972) 的 enUS、zhCN、zhTW 导出此次均返回相同的 15,599 条记录，无中文，也没有上述片段；其字段是角色 RaceID 和 Sex，[调用代码](https://github.com/The-Legion-Preservation-Project/LegionCore-7.3.5/blob/fed58f79c498521836612acd12009e9fa9e60e31/src/server/game/DataStores/DB2Stores.cpp#L3059) 也按角色种族、性别取名，不能作为食尸鬼名字的中英对照。现有 Creature、CreatureFamily 和 GlobalStrings 存档也未找到 `Casketmasher` 的配对记录。

补查 AzerothCore 固定提交 `26c74d61b857233dc4a53e3e6085037f7c4bc066` 的 [pet_name_generation_locale.sql](https://github.com/azerothcore/azerothcore-wotlk/blob/26c74d61b857233dc4a53e3e6085037f7c4bc066/data/sql/base/db_world/pet_name_generation_locale.sql)，该文件的 106 条本地化记录只有 esES、esMX，没有 zhCN/zhTW。这些检查仅能说明所查资料没有可用对应，不代表官方从未提供中文名字；也没有据此将旧版本的社区译名认定为 7.3.5 官中。

本轮新增可核实的随机姓名译文为 **0**，因此未导入随机姓名表。`Casketmasher` 等继续保持原样，不拼接种类名、不自行音译，也不修改服务器上的宠物名字。后续若得到可核对的官方名字或生成片段及组合规则，按简体优先、繁体补充的规则接入；不能仅凭英文单词的常见译法组合出“官方名字”。

同日进一步扩大随机姓名的查找范围，覆盖小鬼、地狱猎犬、虚空行者、魅魔、恶魔卫士及食尸鬼。将 2018 年 7.3.5 名字表可生成的 **4,564 个不同完整名字**，逐个与 7.3.5.26972 的 Creature、Spell 客户端记录和上述两份 TDB 的生物名称及简繁本地化记录对照。匹配只用于寻找线索：英文同名的其他 NPC、法术或物种，不能直接当作随机宠物姓名的官方对应。比如 `Corpsefeeder` 在客户端表里对应“食尸虫”，`Spinestalker` 在服务器表里对应“猎脊冰龙”，均不套用到食尸鬼；`Casketmasher` 没有找到完整名字匹配。

还补查了 [MaNGOS Two 的名字表](https://github.com/mangostwo/database/blob/19e19c6a0449b11df47991c4883dd09730da4be6/World/Setup/FullDB/pet_name_generation.sql)、[MistCore 的名字表](https://github.com/MistCore/MC-Database/blob/fc24a618f49318b0198dc141de10445c38c9aff3/main_db/world/pet_name_generation.sql)，均无中文；以及 [旧版中文库](https://github.com/BluetomatoBo/wow_db_chinese/tree/772f43a14c093ba0ad6e954a462c2d71e51062be)、[3.3.5 中文库](https://github.com/zwisus/3.3.5_wow_db_chinese/tree/2ebf26be14bfa7ce7f0ae04c547fef5c8c2431bb) 的文件清单，均未提供随机宠物姓名表。完整名字的对照结果和来源清单见 [docs/random-pet-name-research.json](https://github.com/zzz1999/LegionChinese/blob/main/docs/random-pet-name-research.json)。这些结果是本次查找记录，不是断言其他资料中也不存在译文；仍未新增可用于随机姓名的译文。

## 场景物件名称

1.2.0 起单独处理 GameObject 的世界鼠标提示。优先使用 Wago.Tools 存档的 [GameObjects 7.3.5.26972](https://wago.tools/db2/GameObjects?build=7.3.5.26972) 中 enUS、zhCN、zhTW 的名称字段，再使用上述两个 7.3.5 world 库的 `gameobject_template` 与 `gameobject_template_locale` 补充。完整 SQL 库内按同一源文件的物件 ID 配对；单独语言补丁须指定基础快照、审核过的物件 ID 和完全相同的英文原名。不把客户端 DB2 的 ID 当成服务器模板 ID。

同一种中文内，客户端 DB2 优先，其次为有正数 VerifiedBuild 的记录，最后是未核实社区记录；高于 26972 的条目不导入。同优先级同名对应不同译文时排除该语言，简体无可用匹配才尝试繁体。不导入动态占位符或带界面标记的名字，匹配时也不代入玩家姓名。原文与 SQL 不随 AddOns 分发。

截图中的 `Death Gate` 使用服务器物件 **190942** 的简体“死亡之门”，繁体记录为“死亡之門”，两者标记为 **18019**；7.3.5 库保留了这条较早的客户端记录。此来源标记不能代替逐字官方核实。它与法术 **50977** 的“黑锋之门”是不同名称字段，不互相套用。完整记录、选择结果及源文件哈希见 [docs/world-object-audit.json](docs/world-object-audit.json)。

运行时仅后置更新世界场景中原版 GameTooltip 的名称，排除单位、物品、技能及界面控件提示。7.3.5 没有对应的 `OnTooltipSetGameObject` 事件，因此使用实际提示框的 `OnShow`、`OnUpdate`，并在隐藏、清空或切换内容时丢弃缓存。参考 `FrameXML/GameTooltip.lua` 和 `GameTooltip.xml`；不替换其原始处理函数或对象交互接口。

1.2.2 补充 `Portal to Ashran`：从同一固定提交的 [MagicStorm gameobject_template_locale](https://github.com/welder1976/MagicStorm/blob/e941af4df2f394e7d0e0753ca15c0677271698c1/sql/sql/world/2018_01_11_gameobject_template_locale.sql#L4344) 读取物件 **233610、237733** 的简体“到阿什兰的传送门”（VerifiedBuild 18019）。只与清单指定的 2018-02-19 基础库及审核过的英文名称配对；最终两条同名记录合并为一个名称指纹，原文与译文源文件分别写入审计。此记录是社区保存的带版本标记资料，不将它描述为已经逐字核实的官方译文。

2026-10-17 的截图还反馈 `HERETICS WILL BURN`（现有服务器模板 221526）。两个基础库没有可用简繁中文名称，英文记录标记为 -18019；当前客户端 GameObjects 存档也未提供对应名称。没有据此自译、套用别的告示或将负数标记当作可靠采集记录，仍保留原文。

## 钥石物品说明

1.2.2 单独加入物品 **138019** 的使用说明。英文全文与 [DestinyCore 保存的 7.3.5 热修复记录](https://github.com/slash0x/DestinyCore/blob/2d631f4e79b1d1dd0bcc674f97436ae4785700e0/sql/old/7/hotfixes/ashamane/2018_06_10_00_hotfixes.sql#L3) 一致，源记录标记为 26654。繁体取自 [Wowhead 同一物品的数据库条目](https://www.wowhead.com/tw/item=138019/%E5%82%B3%E5%A5%87%E9%91%B0%E7%9F%B3) 的物品说明字段；没有使用评论、机器翻译或把后来资料片的不同物品 ID 当成 7.3.5 资料。

该网页没有提供这一中文字段的采集 build，所以明确标为 `community-item-database`、`verifiedBuild: null`，不能声称已逐字核实为 7.3.5 官中。未找到同一条目的可核对简体记录，按约定使用繁体原文。审核摘录与来源保存在 `data/item-descriptions.json`，自身 SHA-256 固定在 `sources.json`；选择结果见 [docs/item-description-audit.json](docs/item-description-audit.json)。此处只摘录一条说明，网页原文和英文资料不随 AddOns 分发。

运行时要求物品 ID 和完整说明指纹同时匹配，支持 GameTooltip 与聊天链接使用的 ItemRefTooltip，保留外围引号、整行颜色及客户端字体。`item:` 与 `keystone:` 链接通过原版 SetHyperlink 的安全后置挂钩识别，背包通过 GetItem 或 SetBagItem 后的 GetContainerItemID 识别；说明模块不修改链接、聊天文字、层数、词缀或服务器物品。依据为同一 7.3.5 界面快照的 `FrameXML/ItemRef.lua`、`ItemRef.xml` 和 `ContainerFrame.lua`。1.2.4 修正原生 `keystone:副本ID:层数:词缀1:词缀2:词缀3` 被误当成物品 ID 的问题，同时接受带 `138019` 物品前缀的变体。

## 聊天物品链接

聊天普通物品链接不使用网页译名表：使用完整 `item:` 参数向客户端 `GetItemInfo` 查询名称，只采用返回的中文名称，保留超链接参数、颜色和发言正文；已有中文或特殊链接保持不变。

史诗钥石单独解析链接中的副本 ID 和层数，通过 7.3.5 原生 `C_ChallengeMode.GetMapInfo` 取得中文副本名称；没有中文时保持原文。接口依据为 [ChallengeModeInfoLua.lua](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_APIDocumentation/ChallengeModeInfoLua.lua)，延迟资料通过原版挑战界面使用的 `RequestMapInfo` 和 `CHALLENGE_MODE_MAPS_UPDATE` 刷新。显示格式采用客户端中文 `CHALLENGE_MODE_KEYSTONE_HYPERLINK`，否则使用 [GlobalStrings 7.3.5.26972](https://wago.tools/db2/GlobalStrings?build=7.3.5.26972) 记录 36209 的简体格式“钥石：%s (%d)”。原生五字段链接结构交叉核对 [LegionCore ChatLink.cpp 的 KeystoneChatLink::Initialize](https://github.com/The-Legion-Preservation-Project/LegionCore-7.3.5/blob/fed58f79c498521836612acd12009e9fa9e60e31/src/server/game/Chat/ChatLink.cpp#L1487)。保留整个原始链接和词缀参数，不查询玩家自己持有的钥石来代替别人的链接；通用 `item:138019` 缺少明确副本信息时不猜测。

1.2.4 对照同一 7.3.5 快照的 [SharedXML/ScrollingMessageFrame.lua](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/SharedXML/ScrollingMessageFrame.lua)，在原版窗口 `AddMessage` 和 `BackFillMessage` 后处理 `historyBuffer` 中的消息。首次未取得中文名时，收到 `GET_ITEM_INFO_RECEIVED` 或打开对应物品提示后重新查询，合并同批通知并更新原消息的 `message` 字段，再调用 `MarkDisplayDirty` 重新布局；消息对象、时间戳、颜色、额外参数、顺序、滚动位置和淡出时间均保留。不清空聊天、不重新投递聊天事件、不发送消息。已解析的中文名会留在对应消息中，等待另一个链接加载时不会退回外文。

`/lcn on` 会重新处理原版窗口的现有聊天记录，`/lcn off` 只还原仍与本插件上次输出一致的名称，避免覆盖其他插件后续修改。临时密语窗口依据 `FrameXML/FloatingChatFrame.lua` 的 `FCF_OpenTemporaryWindow` 安装；消息记录使用弱引用，移出聊天缓冲区后可以回收。没有原版聊天缓冲区的第三方窗口保留 `ChatFrame_AddMessageEventFilter` 的即时处理，仅能替换当时已经取得的中文名称。对应原始过滤接口仍见 `FrameXML/ChatFrame.lua`。

## 字体

1.2.9 起不再打包第三方字体。中文客户端保留原版控件的字体、字号和描边，关于窗口使用游戏字体模板；非中文客户端仅尝试客户端已有的 `Fonts\ARKai_T.ttf`，缺失时保留原字体。魔兽世界字体不随插件分发。

## 界面接口依据

对照 [Gethe 保存的 7.3.5 原版界面源码](https://github.com/Gethe/wow-ui-source/tree/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML) 核对事件、函数和控件名称。`ItemTextFrame.xml` 和 `QuestFrame.xml` 在 XML 中绑定事件处理函数，因此书籍、任务进度及问候窗口通过 `HookScript` 挂钩实际窗口事件；只挂钩同名全局函数不会更新已经绑定的处理函数。参考源码不随插件分发。

右侧任务追踪栏对照同一提交的 `AddOns/Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua` 和 `Blizzard_ObjectiveTracker.lua`，使用任务模块方法的安全后置挂钩，在后续目标及任务定位之前更新文字与行高，不替换全局任务 API。字体规则参考 `FrameXML/Fonts.xml` 与 `SharedXML/SharedFonts.xml`。

读条对照 `FrameXML/CastingBarFrame.lua`、XML 及 `PetFrame.lua`。`UnitFrame.lua` 的施法消耗预测明确读取 `UnitCastingInfo` 的第 10 个返回值作为法术 ID；若客户端未提供，则核对起始事件中的第 5 个参数，不能把第 4 个参数的施法执行编号当作法术 ID。宠物名称对照 `UnitFrame.lua`、`CompactUnitFrame.lua`、`UnitPopup.lua` 和 `AddOns/Blizzard_NamePlates/Blizzard_NamePlates.lua`，只后置更新现有控件，跳过禁止插件访问的姓名板，不替换 `UnitName` 或更改名字、姓名板设置。

下载数据文件的固定 URL、SHA-256 均列于 `sources.json`；本地审核摘录也固定自身 SHA-256，其逐项外部来源在摘录与审计文件中记录。生成产物只保留中文值与匹配指纹。

## 客户端语言设置

README 中的 `textLocale`（文字）和 `audioLocale`（语音）对应客户端已有的语言配置项；变量含义可在 [AdvancedInterfaceOptions 保存的客户端 CVar 描述](https://github.com/Stanzilla/AdvancedInterfaceOptions/blob/03fa08ea8bca354f7009e477ea2fd202cd5a5569/cvars.dump#L4-L5) 中核对。暴雪的[文字语言设置说明](https://tw.support.blizzard.com/zh/article/11417)也区分文字与语音语言，但其当前安装器操作不能作为旧版 7.3.5 配套登录器行为的保证。语言资源需与所用客户端版本匹配，修改配置并不会提供缺失的语言文件，也不能替代服务器未下发的中文文本。

## 1.2.9 同版本任务补充

从 [wow-quest-archive 固定快照](https://github.com/zzz1999/wow-quest-archive/tree/bca7fa8d35b3697417027f74eaea2ddcf0727b97/data/legion) 提取 Legion 7.3.5 的缺失中文字段，保存为 `data/quest-supplement-735.json`，自身 SHA-256 固定于 `sources.json`。没有导入 Classic、WotLK、Cataclysm 或 MoP 的同 ID 任务。与本项目 TDB735.00 基础库核对 ID、英文标题、至少一个非空英文上下文字段；原字段非空时还要求英文原文一致，排除标记为自定义、测试及绝对值高于 26972 的 build，只填缺项，不覆盖已有简繁中文。

补充的 13,727 个字段涉及 4,428 个任务。原始资料来自 [Legion Proyect](https://github.com/zitengzela/LegionCore-7.3.5V2/tree/80ad17a234fd4ed462bc9a23e401b70f86f15a0d)（13,708 个字段）和 The Legion Preservation Project（19 个字段）；具体仓库、提交、下载地址、哈希、许可证与每个字段的语言、表列、英文原文和 build 均保留在摘录中。上游许可证位于 `data/licenses/`；项目采用 GPL-2.0 项目声明，并保留上游对 LegionCore/UWOW 派生背景的说明。这些是社区保存的游戏文本，正数 build 是采集版本标记，不代表本项目已逐字独立验证官方译文。44 个字段 build 为 0，明确按未核实社区记录保留。

合并审计见 `docs/quest-supplement-audit.json`。英文原文、来源 JSON 和 SQL 不随 AddOns 安装包分发；运行资源仅包含中文和匹配指纹。

2026-10-18 的反馈指出“学海无涯”的任务日志描述或目标未汉化。核对八条同名任务记录后，确认 30040、30042、30045 缺少标题、目标和描述。`sources.json.questSupplement.fieldAliases` 显式列出这三个目标 ID，复用同一快照中 30043 的三个 zhCN 字段（来源 `legion-proyect-735`，build 26972）。构建时要求来源和目标在固定的 TDB735.00 库中都有相同的非空英文标题、目标、描述，并再次校验来源字段原文与版本；不按标题自动推广到其他任务，不覆盖已有中文，不复用各职业不同的进行中或交任务对白。审计逐字段记录 `sourceQuestID`，不将复用记录冒充目标 ID 自身的官服采集。这三个现有中文字段来自社区保存的 Legion 数据，尚未独立逐字确认其官服采集来源。

## 1.2.9 聊天链接与怪物动作

任务链接按任务 ID 查询离线标题，缺失时尝试客户端 `GetQuestLink`；法术和制作配方按法术 ID 查询 `GetSpellInfo` 与离线法术库。成就、货币、天赋、战斗宠物及宠物技能分别使用 7.3.5 的 `GetAchievementInfo`、`GetCurrencyInfo`、`GetTalentInfoByID`、`C_PetJournal.GetPetInfoBySpeciesID`、`C_PetBattles.GetAbilityInfoByID`。只采用中文名称，保留原始超链接参数和外围文本，不把普通方括号当作超链接。接口返回值参考同一原版界面快照的 `Blizzard_TalentUI.lua`、`BattlePetTooltip.lua` 和 `SharedPetBattleTemplates.lua`。

怪物提示仅注册 `CHAT_MSG_MONSTER_EMOTE` 和 `CHAT_MSG_RAID_BOSS_EMOTE`，使用现有 BroadcastText 中文指纹匹配，不处理玩家聊天正文。截图的逃跑提示来自 TDB735.00 热修复库 BroadcastText **1150**，简体原文“%s充满恐惧地想要转身逃跑！”、build **25549**。发送者名字通过同一基础世界库 `creature_template` / `creature_template_locale` 配对，简体优先、繁体补充，同名译文冲突时排除；例如 creature **3267** 的“钢鬃掠夺者”。这些名字仅供怪物系统提示使用，不改变玩家或随机宠物名。只允许原生聊天格式化可承接的 %s 字符串参数；无法可靠匹配时保留原消息。关闭插件只影响后续怪物动作消息，已经输出的动作消息保持当时内容。

## 1.2.10 聊天副本链接

名称取自暴雪 **7.3.5.26972** 客户端 DB2 的 [JournalInstance](https://wago.tools/db2/JournalInstance/csv?build=7.3.5.26972&locale=zhCN) 和 [Map](https://wago.tools/db2/Map/csv?build=7.3.5.26972&locale=zhCN)，由 Wago 导出；同时读取相同 build 的 zhTW 文件。不是人工或机器重译。四个原始 CSV 的 URL、SHA-256 和行数见 `sources.json` 与 `docs/dungeon-name-audit.json`。

冒险指南保留 136 条中文名称；副本进度仅导入 Map 的地下城/团队类型，得到 150 条名称记录（149 简体、1 繁体）。这些是不同 ID 空间的记录数，不是去重后的可玩副本数量。例如冒险指南 721 与地图 1477 都对应“英灵殿”；冒险指南 786 与地图 1530 对应“暗夜要塞”。分发文件只含中文名称及数字 ID，不包含外文、描述或地图资源。

`journal:类型:记录ID:难度` 中 0 是副本、1 是首领、2 是章节；`instancelock:玩家GUID:地图ID:难度:完成掩码` 使用 Map ID。结构参考军团再临保存项目的 [HyperlinkTags.cpp](https://github.com/The-Legion-Preservation-Project/TrinityCore/blob/3c85e24f280227620c2a163385a613e8447653a7/src/server/game/Chat/HyperlinkTags.cpp) 与 [Hyperlinks.h](https://github.com/The-Legion-Preservation-Project/TrinityCore/blob/3c85e24f280227620c2a163385a613e8447653a7/src/server/game/Chat/Hyperlinks.h)。运行时只替换显示名，完整参数、颜色、难度、进度和点击对象保持不变。

未入库的指南名称只尝试客户端中文 API：`EJ_GetInstanceInfo`、`EJ_GetEncounterInfo`、`C_EncounterJournal.GetSectionInfo().title`，对应 [7.3.5 EncounterJournal 界面源码](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_EncounterJournal/Blizzard_EncounterJournal.lua) 与其 API 文档。副本链接点击走 `SetItemRef` 打开指南，不经过物品提示；因此在点击后或指南加载后重试待解析的聊天记录。不调用加载、打开、选择副本或难度的接口。已有中文、无可靠对应、未知类型及格式不完整的链接保留原文。

## 1.2.11 客户端物品说明

使用暴雪 **7.3.5.26972** 客户端 DB2 的 `ItemSparse.Description_lang` 字段，由 Wago 导出：[enUS](https://wago.tools/db2/ItemSparse/csv?build=7.3.5.26972&locale=enUS)、[zhCN](https://wago.tools/db2/ItemSparse/csv?build=7.3.5.26972&locale=zhCN)、[zhTW](https://wago.tools/db2/ItemSparse/csv?build=7.3.5.26972&locale=zhTW)。复用 wow-quest-archive 已下载的相同原始 CSV，逐个核对 URL、build 和 SHA-256 后导入；没有使用该项目为其他资料片生成的说明。固定来源见 `sources.json.itemDescriptionTables`，导入脚本见 `scripts/item-descriptions.mjs`，逐项 ID、指纹、语言及统计见 `docs/item-description-audit.json`。

三个文件各含 104,009 个物品 ID。enUS 的独立说明非空者为 16,355 个：其中 16,325 个固定说明有可用中文（16,302 简体、23 繁体），21 个说明包含尚未求值的附魔/法术数值公式，9 个没有汉字译文或本来就是编号、缩写与占位文字。仅导入固定说明，保留客户端中文原措辞，不机器翻译、不繁转简，也不把公式中引用的基础数值当作物品实际属性。这里统计的是说明字段，不是所有物品、使用效果或实测覆盖率。

这些中文来自客户端数据的社区存档，标记为 `client-db2-via-wago`，优先于同语言的社区补充。原有物品 138019 的钥石说明不在这批 ItemSparse 导出中，继续使用前节注明来源的繁体补充；合计 16,326 个物品 ID、24 条繁体。空值、格式不支持或没有可靠中文时保留原文。

运行时同时核对物品 ID 和完整原文的规范化指纹；忽略 ASCII 大小写与空白差异，保留引号、整行颜色包装和换行。未知的链接、纹理等内嵌标记不参与替换。按整行文本匹配，不按黄色这一颜色猜测内容；实际装备属性与使用效果仍由客户端显示。仅替换原版 GameTooltip / ItemRefTooltip 中命中的固定说明，不改写全局物品 API。安装包只包含中文、数字 ID 与指纹，不包含原始 CSV、英文说明或物品模型资源。
