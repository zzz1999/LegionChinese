# 数据与署名

## 简短交付提示的插件规则（1.3.7）

任务 `CompletionLog` 没有可用整句译文时，仅对完整的 `Return to NPC姓名.` 尝试匹配现有 `NPCNames` 索引，显示“返回中文姓名处。”。**该句式由插件编写，经使用者授权采用，不标为暴雪官方整句译文或客户端模板。** 不根据任务 ID 推测 NPC，不解析玩家姓名变量；未知姓名、额外地点或指示、内嵌标记及其他文字字段不适用。现有整句和已核验模板优先，姓名沿用已有简体优先、繁体补缺与歧义排除规则。

截图中的 Aoren Sunglow／奥伦·日冕、Lidia Sunglow／莉迪亚·日冕、Commander Eligor Dawnbringer／指挥官埃里戈尔·黎明使者、Furgus Warpwood／费尔古斯·扭木均已由 `TrinityCore TDB 735.00` 的 `creature_template_locale` 收录，姓名记录标记 `VerifiedBuild=25549`。没有新增或改写姓名译文。对应任务 27682、27681、27223、27104、27105 在所核对的 2018 基础库中没有可用的 `QuestCompletionLog`；这一规则只补充界面显示，不将合成句子写回译文数据库。

## 世界地图任务提示与征令板

- 地图可接任务名称复用现有任务库。补充索引仅使用通过 `QuestSources` 任务 ID、字段及原文校验的标题；同名译文冲突继续按现有简繁回退规则处理，无法消歧则保留原文。“A Recent Discovery”对应任务 50341 的“近期发现”，补充原文来自 TDB735.25051 的同 ID 简英记录，标记构建为 26365，与已安装中文标题一致。
- 征令板五个地区名来自 [7.3.5.26972 AdventureJournal](https://wago.tools/db2/AdventureJournal?build=7.3.5.26972)：35／艾萨拉、34／北贫瘠之地、29／银松森林、8／灰谷、41／石爪山脉。按 ID、任务 ID、地图区域和非文本元数据核对简英繁记录；只借用完全同名的地区名称，**不把冒险指南中措辞不同的说明替代为征令板正文**。三种语言导出及 SHA-256 固定在 `sources.json`。
- 2026-10-22 截图中的“For the Horde!”按钮复用本地 7.3.5.26972 `GlobalStrings` 记录 22583 的 `TagText_lang`：“为了部落！”。该完整简英对已在 `data/local-client-735.json` 核对、由既有 `System` 范围中文索引收录；运行时只在完整实时提问、响应 ID、地区标题与当前按钮文字都能核对时借用已有界面译文，不新增人工译文或匹配字串片段。
- 任务板顶部提示、卡片正文及其余未核实按钮保留原文。“Orgrimmar Portals”在 2018 数据库中为 `points_of_interest` 510、构建 23420，没有对应中文；后来同坐标的“Orgrimmar Cataclysm Portals”及“奥格瑞玛大灾变传送门”标记为 44325，文字已改变，未采用或删词拼接。按照项目使用者要求，缺口不填入人工译文。
- 逐项采纳与排除记录见 `data/quest-board-reviews.json`、`docs/map-ui-audit.json` 和 `docs/MAP-UI.md`。原版地图入口依据 [7.3.5 WorldMapFrameTemplates.xml](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML/WorldMapFrameTemplates.xml) 中 `WorldMapStoryLineTemplate` 的流程；它提供当前任务名称与索引，没有可直接用于此提示的任务 ID。

## 1.2.16 客户端说明与显示入口

新增说明复用已固定为 **7.3.5.26972** 的 Achievement、CurrencyTypes、BattlePetSpecies、BattlePetAbility、JournalEncounter、JournalEncounterSection 和 AdventureJournal 三语 CSV。来源是暴雪客户端 DB2 的 Wago 社区导出，构建逐个验证 `sources.json` 中的 URL、build、SHA-256 及唯一 ID。没有把其他 build 的中文补到这些条目，也不自动转换简繁字形。

`scripts/client-descriptions.mjs` 按 ID 和字段选择简体或繁体；保留完整原文指纹，无 ID 的入口只使用同类别、同字段内无译文冲突的索引。数据包括成就说明与奖励、货币说明、宠物背景与来源、宠物技能、首领与章节正文和冒险推荐。分项语言、拒绝数量和输入清单见 `docs/client-descriptions-audit.json`。冒险推荐文字只用于对应界面，不替代措辞不同的征令板。

战斗宠物技能的方括号表达式仅在原文与中文完全相同、出现次数也相同时保留，交给 [7.3.5 原版 SharedPetBattleTemplates](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML/SharedPetBattleTemplates.lua) 的解析器读取当前宠物属性。不编写或计算额外技能公式。其余静态字段拒绝未处理的变量及内嵌标记。

`scripts/dynamic-spell-text.mjs` 读取相同 build 的固定 Spell 三语 CSV。仅收录效果数值变量身份和出现次数相同、固定数字也一致的原文与中文；生成完整结构指纹和中文占位模板。运行时核对整个当前说明并复制对应数值，支持普通小数和英文千分位；不计算基础伤害、治疗、持续时间、角色等级或装备缩放。来源及语言统计见 `docs/dynamic-spell-audit.json`。

地图、任务追踪、成就、宠物手册、冒险指南、NPC 头像对白与字幕接口均依据固定的 [7.3.5 原版界面快照](https://github.com/Gethe/wow-ui-source/tree/67ecbf5ce0e50cc7483c2295caecf410460f0994)。新增普通 NPC 名称和气泡／字幕入口复用本文件已注明来源的数据库，不把社区来源升级标记为独立核实的官方译文。只分发中文、数字 ID、指纹及必要的原生表达式，不携带原始英文正文、CSV 或 SQL。范围和仍缺可靠依据的条目见 `docs/COVERAGE-EXPANSION.md`。

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

#### 尚喜师父的两项新手训练（1.2.12）

截图中的 **沙袋训练（29406）** 完成对白与 **戒骄（29524）** 进行中对白缺少中文；现已一并补充两项任务的进行中、完成对白，共 4 段。

简繁译文来自 [alexkulya/pandaria_5.4.8 的固定本地化快照](https://github.com/alexkulya/pandaria_5.4.8/blob/e0a20613d73e2b9324ac13a4783c724fec1d4559/sql/old/world/2026_08_06_16_world_quest_locale_import.sql#L90987)。1.2.12 仅提取这两个 ID 的 `quest_offer_reward_locale.RewardText` 和 `quest_request_items_locale.CompletionText`，8 条简繁记录均标注 `VerifiedBuild=18414`。该版本号是上游资料标记，尚无独立原始抓包证明，归类为 `reviewed-legacy-dialogue`，不声称已逐字核实官方译文；同一文件中较晚版本的日志字段未导入。

已核对 5.4.8 与 7.3.5 的英文标题、目标、描述一致；4 段运行时原文取自 [Legion Proyect 固定 7.3.5 快照](https://github.com/zitengzela/LegionCore-7.3.5V2/blob/80ad17a234fd4ed462bc9a23e401b70f86f15a0d/sql/base/Legion_Proyect-DB.7z) 中 build 26972 的记录，其中两段与用户截图吻合。只在当前完整对白指纹匹配时使用，角色名与换行按现有规则处理，不按同 ID 强行替换旧对白。简体缺失或不可用才取繁体；已有中文与修改过的原文保持不变。

#### 任务对白批量补缺（1.2.13）

继续筛查上述快照中的全部 **29,258 条简繁对白记录**，以对应的 5.4.8 world 数据为旧版上下文，并交叉核对 TDB 2018、TDB 2025 与 Legion Proyect 三份固定 7.3.5 资料。29,072 条未标记采集版本的旧记录没有作为本次新增来源；此前已收录的同类记录保持不变。另有 98 条标记为 52649/55261 的后续版本记录被排除。其余 88 条有适用版本标记的记录中，9 条任务上下文仍不一致、10 条缺少可安全配对的原文，暂不导入；另有 9 条候选经过显式的前后版本上下文复核。

核对后得到 38 个任务、54 个字段的 69 条简繁候选；其中 2 个字段已有中文，继续使用原有来源。实际补充库覆盖 **36 个任务的 52 个字段**（进行中 20、完成 32；简体 15、繁体 37），较 1.2.12 新增 **34 个任务、48 个字段**。这些是任务/阶段的数量，不是全文覆盖率；不同职业任务可能共用一段对白。

- 默认要求任务 ID、完整标题、日志目标和描述与当前基础库相符。四个显式复核例外（26177、26488、29412、30027）同时固定旧版和当前完整上下文，只接受与改动数量、武器种类无关的通用对白，或已核实的原文标点／大小写变体；任何未列出的上下文变化仍拒绝。
- `cross-version-exact`：27 条简繁候选的旧版原文还与至少一份 7.3.5 记录全文一致。
- `legacy-full-text`：28 条候选保留旧库的完整英文作为匹配依据。部分 Legion Proyect 基础字段实际是西班牙语，不能将它冒充已核对的英文；只有客户端在同一任务、同一阶段实际显示该旧英文时才替换。其他措辞或语言不猜测对应关系。
- `reviewed-current`：5 条候选来自三条单独复核的进行中对白（29406、29524、29408）。旧库相应原文字段为空，但完整任务上下文相同，已复核 7.3.5 原文与版本标记为 18414 的简繁字段含义一致。具体原文与理由固定在 `data/quest-dialogue-reviews.json`。
- `reviewed-context`：9 条简繁候选来自上述四个复核任务，最终补充 7 个字段。前后任务内容、适用对白与理由保存在 `data/quest-dialogue-reviews.json`；不是放宽所有任务的匹配规则。
- 运行时同时匹配**任务 ID、对白阶段、完整原文指纹**；补缺字段简体优先、繁体补充，保留已有译文的优先级。没有可靠译文、上下文冲突、后续版本或原文不匹配时保留客户端文字；不机器翻译，不将繁体转换后冒充简体官中。

全部新采用的中文都标注 `VerifiedBuild=18414`，仍属于社区保存的历史版本记录，**版本标记不构成官方原文的独立证明**。没有把补充库宣称为完整的官方对白库。

固定输入文件与哈希、逐字段英文及简繁文字见 `data/reviewed-quest-dialogue.json`；实际导入语言、未采用原因及指纹见 `docs/reviewed-quest-dialogue-audit.json`。运行 `node scripts/collect-reviewed-dialogue.mjs <本地化SQL> <5.4.8世界SQL> <Legion Proyect SQL> [TDB 2018 SQL] [TDB 2025 SQL]` 可重新提取；后两个路径默认使用 `.cache/` 中的固定文件。脚本核对全部输入 SHA-256，拒绝重复记录，生成快照并同步清单哈希。构建再次校验快照、人工复核清单与任务上下文；AddOns 仅保留中文、数值 ID 和匹配指纹，不携带原始 SQL 或外文正文。

#### 保卫贫瘠之地

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

- [Spell](https://wago.tools/db2/Spell?build=7.3.5.26972)：法术名称使用 `Name_lang`。1.2.13 另接入无动态公式的描述、光环说明和副标题，详见下文；不计算战斗数值。最终收录 160,721 个法术 ID，其中简体 141,175 个、繁体补充 19,546 个。包含 NPC 技能和历史记录，不能当作玩家技能数量或任一服务器的实测覆盖率。
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

聊天普通物品链接优先使用完整 `item:` 参数向客户端 `GetItemInfo` 查询中文名称；1.2.13 在客户端未返回中文时，补查同版本 ItemSparse 的 103,910 个离线名称。存在随机后缀或奖励变体参数时，只有显示名称与已核对英文基础名一致才使用离线基础名，避免把有区别的变体名称抹掉。已有中文、未知 ID 和缺少明确副本信息的通用钥石保持原样；超链接参数、颜色及玩家发言正文不变。

史诗钥石单独解析链接中的副本 ID 和层数，通过 7.3.5 原生 `C_ChallengeMode.GetMapInfo` 取得中文副本名称；没有中文时保持原文。接口依据为 [ChallengeModeInfoLua.lua](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_APIDocumentation/ChallengeModeInfoLua.lua)，延迟资料通过原版挑战界面使用的 `RequestMapInfo` 和 `CHALLENGE_MODE_MAPS_UPDATE` 刷新。显示格式采用客户端中文 `CHALLENGE_MODE_KEYSTONE_HYPERLINK`，否则使用 [GlobalStrings 7.3.5.26972](https://wago.tools/db2/GlobalStrings?build=7.3.5.26972) 记录 36209 的简体格式“钥石：%s (%d)”。原生五字段链接结构交叉核对 [LegionCore ChatLink.cpp 的 KeystoneChatLink::Initialize](https://github.com/The-Legion-Preservation-Project/LegionCore-7.3.5/blob/fed58f79c498521836612acd12009e9fa9e60e31/src/server/game/Chat/ChatLink.cpp#L1487)。保留整个原始链接和词缀参数，不查询玩家自己持有的钥石来代替别人的链接；通用 `item:138019` 缺少明确副本信息时不猜测。

1.2.4 对照同一 7.3.5 快照的 [SharedXML/ScrollingMessageFrame.lua](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/SharedXML/ScrollingMessageFrame.lua)，在原版窗口 `AddMessage` 和 `BackFillMessage` 后处理 `historyBuffer` 中的消息。首次未取得中文名时，收到 `GET_ITEM_INFO_RECEIVED` 或打开对应物品提示后重新查询，合并同批通知并更新原消息的 `message` 字段，再调用 `MarkDisplayDirty` 重新布局；消息对象、时间戳、颜色、额外参数、顺序、滚动位置和淡出时间均保留。不清空聊天、不重新投递聊天事件、不发送消息。已解析的中文名会留在对应消息中，等待另一个链接加载时不会退回外文。

插件加载后自动汉化，登录时重新处理原版窗口的现有聊天记录。刷新直接处理当前消息，保留已经取得的中文名称与其他插件后续修改；不再为汉化开关保存原文副本。临时密语窗口依据 `FrameXML/FloatingChatFrame.lua` 的 `FCF_OpenTemporaryWindow` 安装；消息记录使用弱引用，移出聊天缓冲区后可以回收。没有原版聊天缓冲区的第三方窗口保留 `ChatFrame_AddMessageEventFilter` 的即时处理，仅能替换当时已经取得的中文名称。对应原始过滤接口仍见 `FrameXML/ChatFrame.lua`。

## 字体

1.2.9 起不再打包第三方字体。中文客户端保留原版控件的字体、字号和描边，关于窗口使用游戏字体模板；非中文客户端仅尝试客户端已有的 `Fonts\ARKai_T.ttf`，缺失时保留原字体。魔兽世界字体不随插件分发。

## 界面接口依据

对照 [Gethe 保存的 7.3.5 原版界面源码](https://github.com/Gethe/wow-ui-source/tree/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML) 核对事件、函数和控件名称。`ItemTextFrame.xml` 和 `QuestFrame.xml` 在 XML 中绑定事件处理函数，因此书籍、任务进度及问候窗口通过 `HookScript` 挂钩实际窗口事件；只挂钩同名全局函数不会更新已经绑定的处理函数。参考源码不随插件分发。

右侧任务追踪栏对照同一提交的 `AddOns/Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua` 和 `Blizzard_ObjectiveTracker.lua`，使用任务模块方法的安全后置挂钩，在后续目标及任务定位之前更新文字与行高，不替换全局任务 API。字体规则参考 `FrameXML/Fonts.xml` 与 `SharedXML/SharedFonts.xml`。

1.3.3 进一步核对原版 `QuestObjectiveTracker_DoQuestObjectives`：`GetQuestLogLeaderBoard` 的当前原文直接交给数字键的 `QUEST_TRACKER_MODULE:AddObjective`。普通任务的前置计数此前没有进入与场景／世界任务相同的回退路径，现补入这一已确认入口；只分离原样保留的整数进度前缀，对完整目标正文查询既有库。截图中 `Help Raggaran`、`Help Misha Tor'kren`、`Help Zen'Taji`、`Runaway Shredder Captured` 和 `Razormane Quilboar slain` 的原文指纹已有对应，不另造译文；`tests/tracker-font.test.mjs` 直接读取安装资源验证简繁、行高、复用、未知文字及受保护控件。

读条对照 `FrameXML/CastingBarFrame.lua`、XML 及 `PetFrame.lua`。`UnitFrame.lua` 的施法消耗预测明确读取 `UnitCastingInfo` 的第 10 个返回值作为法术 ID；若客户端未提供，则核对起始事件中的第 5 个参数，不能把第 4 个参数的施法执行编号当作法术 ID。宠物名称对照 `UnitFrame.lua`、`CompactUnitFrame.lua`、`UnitPopup.lua` 和 `AddOns/Blizzard_NamePlates/Blizzard_NamePlates.lua`，只后置更新现有控件，跳过禁止插件访问的姓名板，不替换 `UnitName` 或更改名字、姓名板设置。

下载数据文件的固定 URL、SHA-256 均列于 `sources.json`；本地审核摘录也固定自身 SHA-256，其逐项外部来源在摘录与审计文件中记录。生成产物只保留中文值与匹配指纹。

## 客户端语言设置

README 中的 `textLocale`（文字）和 `audioLocale`（语音）对应客户端已有的语言配置项；变量含义可在 [AdvancedInterfaceOptions 保存的客户端 CVar 描述](https://github.com/Stanzilla/AdvancedInterfaceOptions/blob/03fa08ea8bca354f7009e477ea2fd202cd5a5569/cvars.dump#L4-L5) 中核对。暴雪的[文字语言设置说明](https://tw.support.blizzard.com/zh/article/11417)也区分文字与语音语言，但其当前安装器操作不能作为旧版 7.3.5 配套登录器行为的保证。语言资源需与所用客户端版本匹配，修改配置并不会提供缺失的语言文件，也不能替代服务器未下发的中文文本。

## 1.2.9 同版本任务补充

从 [wow-quest-archive 固定快照](https://github.com/zzz1999/wow-quest-archive/tree/bca7fa8d35b3697417027f74eaea2ddcf0727b97/data/legion) 提取 Legion 7.3.5 的缺失中文字段，保存为 `data/quest-supplement-735.json`，自身 SHA-256 固定于 `sources.json`。没有导入 Classic、WotLK、Cataclysm 或 MoP 的同 ID 任务。与本项目 TDB735.00 基础库核对 ID、英文标题、至少一个非空英文上下文字段；原字段非空时还要求英文原文一致，排除标记为自定义、测试及绝对值高于 26972 的 build，只填缺项，不覆盖已有简繁中文。

补充的 13,727 个字段涉及 4,428 个任务。原始资料来自 [Legion Proyect](https://github.com/zitengzela/LegionCore-7.3.5V2/tree/80ad17a234fd4ed462bc9a23e401b70f86f15a0d)（13,708 个字段）和 The Legion Preservation Project（19 个字段）；具体仓库、提交、下载地址、哈希、许可证与每个字段的语言、表列、英文原文和 build 均保留在摘录中。上游许可证位于 `data/licenses/`；项目采用 GPL-2.0 项目声明，并保留上游对 LegionCore/UWOW 派生背景的说明。这些是社区保存的游戏文本，正数 build 是采集版本标记，不代表本项目已逐字独立验证官方译文。44 个字段 build 为 0，明确按未核实社区记录保留。

合并审计见 `docs/quest-supplement-audit.json`。英文原文、来源 JSON 和 SQL 不随 AddOns 安装包分发；运行资源仅包含中文和匹配指纹。

### 1.3.4 网页任务字段交叉核对

在上述补充快照中增加来源 `cnwow-wowhead-crosschecked-20261024`，只采用 [军团再临中文资料站](https://110.cnwow.cn/) 的 5 个字段：37841《最后突击》的目标与正文、12774《暴风城》的目标、26398《与大地母亲同行》的目标与正文。固定其公开 SQLite 快照 `becf48caf402` 的下载 URL、解压后长度及 SHA-256，不导入整个网站数据库；中文逐字段与 [37841](https://www.wowhead.com/cn/quest=37841/最后突击)、[12774](https://www.wowhead.com/cn/quest=12774/暴风城)、[26398](https://www.wowhead.com/cn/quest=26398/与大地母亲同行) 的同 ID 中文页面交叉核对。

英文身份、原文列和完整文字来自固定 `TDB_world_735.00_2018_02_19.sql`：37841／12774 原文 build 为 25549，26398 为 23360。逐项核对人物、阵营、地点、物品、行动要求以及角色名／种族和换段标记。网页没有提供这些中文字段的历史 build 或官方客户端采集证明，中文 `build` 为 0，来源为 `community-web-crosschecked`，`officialChineseVerified=false`；不能把英文原文的 build 当成中文采集版本，也不声称这些字段是独立验证的官中。

新增字段仍由 `compatibleSupplement` 与已有任务原文指纹检查，不放宽匹配条件。未找到可靠中文的 14135／27921 交付对白继续缺省；7491 正文人物存在来源差异、39692 正文与原文阵营不一致，均不采用。逐项核验见 `docs/reviewed-web-quest-fields-audit.json`，安装包仍只包含中文、ID 与指纹。

### 1.3.4 繁体任务字段兼容核验

另从 [TrinityCore Issue 27869](https://github.com/TrinityCore/TrinityCore/issues/27869)（作者 leelf00、3.3.5 分支、最后更新 2022-03-22）采用 7 个繁体字段：14167 正文／目标、13381 标题／正文／目标、14350 正文／目标。原始 issue 正文和 SQL 代码块的 SHA-256、作者、更新时间及 URL 固定在补充快照来源 `trinity-27869-zhtw-reviewed` 中。研究时只将 MySQL 双引号字符串等价改写为单引号以供只读解析，没有执行 SQL，也没有改变译文。

候选逐字段核对铁炉堡墓地与矮人灵魂、轰炸任务的地区／敌人／护盾／弹药，以及血色十字军、斯坦索姆、提尔之手和纳萨诺斯；保留角色名、种族和换段标记。对应英文来自固定 `TDB_world_735.00_2018_02_19.sql`，原文 build 分别为 25549、20182、15595。它们属于 7.3.5 世界库中保存的原文记录，不保证每个服务器都提供这些历史任务。

中文记录保持原补丁 `build=0`，来源为 `community-legacy-field-reviewed`，`officialChineseVerified=false`；不把 3.3.5 来源伪装为 7.3.5 客户端采集，也不将原文 build 当成中文采集证明。只填缺项、保留已有简体及繁体，继续要求任务 ID、字段、完整原文一致。逐字段原文、译文和核验说明见 `docs/reviewed-traditional-quest-fields-audit.json`。本次没有新增《树上的敌人》或《消灭爪牙》的交付对白。

2026-10-18 的反馈指出“学海无涯”的任务日志描述或目标未汉化。核对八条同名任务记录后，确认 30040、30042、30045 缺少标题、目标和描述。`sources.json.questSupplement.fieldAliases` 显式列出这三个目标 ID，复用同一快照中 30043 的三个 zhCN 字段（来源 `legion-proyect-735`，build 26972）。构建时要求来源和目标在固定的 TDB735.00 库中都有相同的非空英文标题、目标、描述，并再次校验来源字段原文与版本；不按标题自动推广到其他任务，不覆盖已有中文，不复用各职业不同的进行中或交任务对白。审计逐字段记录 `sourceQuestID`，不将复用记录冒充目标 ID 自身的官服采集。这三个现有中文字段来自社区保存的 Legion 数据，尚未独立逐字确认其官服采集来源。

## 1.2.9 聊天链接与怪物动作

任务链接按任务 ID 查询离线标题，缺失时尝试客户端 `GetQuestLink`；法术和制作配方按法术 ID 查询 `GetSpellInfo` 与离线法术库。成就、货币、天赋、战斗宠物及宠物技能分别使用 7.3.5 的 `GetAchievementInfo`、`GetCurrencyInfo`、`GetTalentInfoByID`、`C_PetJournal.GetPetInfoBySpeciesID`、`C_PetBattles.GetAbilityInfoByID`。只采用中文名称，保留原始超链接参数和外围文本，不把普通方括号当作超链接。接口返回值参考同一原版界面快照的 `Blizzard_TalentUI.lua`、`BattlePetTooltip.lua` 和 `SharedPetBattleTemplates.lua`。

怪物提示仅注册 `CHAT_MSG_MONSTER_EMOTE` 和 `CHAT_MSG_RAID_BOSS_EMOTE`，使用现有 BroadcastText 中文指纹匹配，不处理玩家聊天正文。截图的逃跑提示来自 TDB735.00 热修复库 BroadcastText **1150**，简体原文“%s充满恐惧地想要转身逃跑！”、build **25549**。发送者名字通过同一基础世界库 `creature_template` / `creature_template_locale` 配对，简体优先、繁体补充，同名译文冲突时排除；例如 creature **3267** 的“钢鬃掠夺者”。这些名字仅供怪物系统提示使用，不改变玩家或随机宠物名。只允许原生聊天格式化可承接的 %s 字符串参数；无法可靠匹配时保留原消息。关闭插件只影响后续怪物动作消息，已经输出的动作消息保持当时内容。

## 1.2.10 聊天副本链接

名称取自暴雪 **7.3.5.26972** 客户端 DB2 的 [JournalInstance](https://wago.tools/db2/JournalInstance/csv?build=7.3.5.26972&locale=zhCN) 和 [Map](https://wago.tools/db2/Map/csv?build=7.3.5.26972&locale=zhCN)，由 Wago 导出；同时读取相同 build 的 zhTW 文件。不是人工或机器重译。四个原始 CSV 的 URL、SHA-256 和行数见 `sources.json` 与 `docs/dungeon-name-audit.json`。

冒险指南保留 136 条中文名称；副本进度仅导入 Map 的地下城/团队类型，得到 150 条名称记录（149 简体、1 繁体）。这些是不同 ID 空间的记录数，不是去重后的可玩副本数量。例如冒险指南 721 与地图 1477 都对应“英灵殿”；冒险指南 786 与地图 1530 对应“暗夜要塞”。分发文件只含中文名称及数字 ID，不包含外文、描述或地图资源。

`journal:类型:记录ID:难度` 中 0 是副本、1 是首领、2 是章节；`instancelock:玩家GUID:地图ID:难度:完成掩码` 使用 Map ID。结构参考军团再临保存项目的 [HyperlinkTags.cpp](https://github.com/The-Legion-Preservation-Project/TrinityCore/blob/3c85e24f280227620c2a163385a613e8447653a7/src/server/game/Chat/HyperlinkTags.cpp) 与 [Hyperlinks.h](https://github.com/The-Legion-Preservation-Project/TrinityCore/blob/3c85e24f280227620c2a163385a613e8447653a7/src/server/game/Chat/Hyperlinks.h)。运行时只替换显示名，完整参数、颜色、难度、进度和点击对象保持不变。

1.2.13 已补入同版本 JournalEncounter 和 JournalEncounterSection 的中文名称。客户端中文名称优先，离线库补缺；其他未入库指南名称只尝试客户端中文 API：`EJ_GetInstanceInfo`、`EJ_GetEncounterInfo`、`C_EncounterJournal.GetSectionInfo().title`，对应 [7.3.5 EncounterJournal 界面源码](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_EncounterJournal/Blizzard_EncounterJournal.lua) 与其 API 文档。副本链接点击走 `SetItemRef` 打开指南，不经过物品提示；因此在点击后或指南加载后重试待解析的聊天记录。不调用加载、打开、选择副本或难度的接口。已有中文、无可靠对应、未知类型及格式不完整的链接保留原文。

## 1.2.11 客户端物品说明

使用暴雪 **7.3.5.26972** 客户端 DB2 的 `ItemSparse.Description_lang` 字段，由 Wago 导出：[enUS](https://wago.tools/db2/ItemSparse/csv?build=7.3.5.26972&locale=enUS)、[zhCN](https://wago.tools/db2/ItemSparse/csv?build=7.3.5.26972&locale=zhCN)、[zhTW](https://wago.tools/db2/ItemSparse/csv?build=7.3.5.26972&locale=zhTW)。复用 wow-quest-archive 已下载的相同原始 CSV，逐个核对 URL、build 和 SHA-256 后导入；没有使用该项目为其他资料片生成的说明。固定来源见 `sources.json.itemDescriptionTables`，导入脚本见 `scripts/item-descriptions.mjs`，逐项 ID、指纹、语言及统计见 `docs/item-description-audit.json`。

三个文件各含 104,009 个物品 ID。enUS 的独立说明非空者为 16,355 个：其中 16,325 个固定说明有可用中文（16,302 简体、23 繁体），21 个说明包含尚未求值的附魔/法术数值公式，9 个没有汉字译文或本来就是编号、缩写与占位文字。仅导入固定说明，保留客户端中文原措辞，不机器翻译、不繁转简，也不把公式中引用的基础数值当作物品实际属性。这里统计的是说明字段，不是所有物品、使用效果或实测覆盖率。

这些中文来自客户端数据的社区存档，标记为 `client-db2-via-wago`，优先于同语言的社区补充。原有物品 138019 的钥石说明不在这批 ItemSparse 导出中，继续使用前节注明来源的繁体补充；合计 16,326 个物品 ID、24 条繁体。空值、格式不支持或没有可靠中文时保留原文。

运行时同时核对物品 ID 和完整原文的规范化指纹；忽略 ASCII 大小写与空白差异，保留引号、整行颜色包装和换行。未知的链接、纹理等内嵌标记不参与替换。按整行文本匹配，不按黄色这一颜色猜测内容；实际装备属性与使用效果仍由客户端显示。仅替换原版 GameTooltip / ItemRefTooltip 中命中的固定说明，不改写全局物品 API。安装包只包含中文、数字 ID 与指纹，不包含原始 CSV、英文说明或物品模型资源。

## 1.2.14 神器资料与选择对白

神器数据固定为 **7.3.5.26972**，通过 [Wago DB2 存档](https://wago.tools/db2/Artifact?build=7.3.5.26972)取得客户端表的 enUS、zhCN、zhTW 导出。`Artifact`、`ArtifactAppearance`、`ArtifactAppearanceSet` 按 ID 配对，并逐行要求非语言字段完全一致；名称共 43／880／222 条，其中神器名称有 2 条由繁体补充。包含历史和内部记录，不代表 43 把可获取武器或实机覆盖率。数据来自客户端中文资源的社区存档，不是社区自行翻译的名称。

`ArtifactAppearance.UnlockPlayerConditionID` 关联同 build 的 `PlayerCondition.Failure_description_lang`，只提取已引用的文字。208 个引用条件中，163 个有可用中文，45 个没有可配对原文。只支持段落 `$B` 与职业 `$C`，不把数值公式、未知变量或空白说明强行替换。该导出的不同语言对部分压缩字段的负值哨兵有不同表示；不使用也不写回条件数值和解锁逻辑。

`ArtifactPower` 与 `ArtifactPowerRank` 只用于验证特质和法术 ID 的关系（952 个特质、919 个引用法术）。运行时由 `C_ArtifactUI.GetPowerInfo(powerID).spellID` 决定当前法术；中文名称和静态说明复用现有同 build 的 Spell 库。未实现通用法术公式求值器，动态描述继续使用客户端结果。

选择对白候选来自 [MagicStorm 固定提交](https://github.com/welder1976/MagicStorm/tree/e941af4df2f394e7d0e0753ca15c0677271698c1/sql/sql/world)中的四个补丁。逐条核对 29 条选项，实际采用 `2018_06_04_99_01_playerchoice.sql` 标记 26654 的 6 段介绍及适用标签。法师冰霜选项的英文在补丁中截断，只与 [LegionCore735.24101 数据库](https://github.com/The-Legion-Preservation-Project/LegionCore-7.3.5/releases/tag/LegionCore735.24101)同 ID 的完整英文配对；截断原文不能触发汉化。该英文记录的 VerifiedBuild 为 0，只是完整原文对照。候选没有可独立验证的原始抓包头，因此标为经过语义核验的社区保存资料，不宣称全部是已独立验证的官方译文。错误职业、英文栏被中文污染、遗漏句子或有语义差异的候选保留原文。

逐条采用／排除理由、原始文字、补丁 URL 和 SHA-256 在 `data/artifact-choice-reviews.json`；`sources.json` 固定该审阅快照与 14 份客户端 CSV 的哈希。生成结果见 `docs/artifact-data-audit.json`，可读说明见 `docs/ARTIFACT-DATA.md`。英文原文、SQL 与 CSV 不随 AddOns 分发，只分发中文和匹配指纹。

界面依据固定的 [7.3.5 QuestChoice 实现](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_QuestChoice/QuestChoiceFrameMixin.lua)、[神器外观实现](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_ArtifactUI/Blizzard_ArtifactAppearances.lua)和 [神器 API 定义](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/AddOns/Blizzard_APIDocumentation/ArtifactUILua.lua)。神器选择属于 `Blizzard_QuestChoice`；原版先设置选择／选项 ID，再填入 SimpleHTML，最后计算布局。插件在填字时替换正文，沿用原版高度计算。外观按钮按当前 appearance ID 匹配解锁提示，保留选择响应、确认流程、预览、解锁条件和特质购买逻辑。

## 1.2.13 扩展资料与展示入口

### 任务变量、肖像与区域文字

从 [wow-quest-archive 的固定军团档案](https://github.com/zzz1999/wow-quest-archive/tree/3f8a6bc4861bb067397be83c10b59fe134623794/data/legion) 生成 `data/translation-extras.json`。快照保留输入 JSONL 哈希、源资料清单、逐字段原文、译文、语言、列名、build，以及任务身份和目标要求。构建校验快照 SHA-256 与 TDB735.00 基础库 SHA-256，排除后续 build、无可核对原文、已标记测试或自定义的记录；当前任务已有字段优先。

`$p` 按玩家名处理，`$ct`、`$vn` 和 `$vg` 使用同版本 **ChrClassTitle / ChrClassVillain** 的 enUS、zhCN、zhTW 数据展开；这些 CSV 的 URL 和 SHA-256 保存在快照 `archive.reading` 中。`$1oa` 等仅使用同一任务、相同目标 ID 和顺序的所需数量，不读取玩家当前完成进度。目标顺序不明确、世界状态值、未支持的职业复数等标记不猜测。修正单字母变量解析边界，避免 `$ct` 被错误替换成“职业名 + t”。

最终补充 **4,579 个任务的 5,928 个字段**，其中简体 5,505、繁体 423；包含接取肖像说明 1,005、名称 1,235，交付肖像说明 149、名称 179，区域／交付提示 722，标题 1,938，完成提示 51，接取描述 121，目标摘要 528。统计包含内部或不可见任务，不是实机覆盖率。运行时同时匹配任务 ID、字段和完整原文指纹，无法确认则不替换。45 个候选字段未通过导入条件，另有 11 个字段在采集时因缺原文或 build 被排除；详见 `docs/translation-extras-audit.json` 与快照 `deferred`。

肖像文字挂钩 [QuestFrame_ShowQuestPortrait](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML/QuestFrame.lua)，分别处理接取和交付介绍，并调用原版文字布局函数。区域文字只在有当前任务 ID 的目标显示入口匹配。

### 离线名称与静态提示说明

复用已固定的 ItemSparse、Spell、Creature 三语 CSV，另下载 **7.3.5.26972** 的 [Achievement](https://wago.tools/db2/Achievement?build=7.3.5.26972)、[CurrencyTypes](https://wago.tools/db2/CurrencyTypes?build=7.3.5.26972)、[BattlePetSpecies](https://wago.tools/db2/BattlePetSpecies?build=7.3.5.26972)、[BattlePetAbility](https://wago.tools/db2/BattlePetAbility?build=7.3.5.26972)、[JournalEncounter](https://wago.tools/db2/JournalEncounter?build=7.3.5.26972)、[JournalEncounterSection](https://wago.tools/db2/JournalEncounterSection?build=7.3.5.26972) 三语导出。原始文件版本、URL 与 SHA-256 固定在 `sources.json.extraLinkTables`；构建要求三个语言文件齐全、ID 唯一、表头和列数正确。

数据标记为 `client-db2-via-wago`，保留客户端本身的中文措辞，简体可用时优先，繁体补缺。不带公式的完整原文和中文共同通过检查后才生成说明匹配表；`$`、未知内嵌标记和控制字符被拒绝，不计算角色等级、装备缩放或服务器实际战斗数值。法术／光环按 ID、说明类型和整行原文匹配。7.3.5 的 UnitAura / UnitBuff / UnitDebuff 在第 11 个返回值提供 spellID，核对依据为同版本 [CompactUnitFrame.lua](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML/CompactUnitFrame.lua) 和 [TargetFrame.lua](https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/FrameXML/TargetFrame.lua)。

新增数量与简繁构成见 `docs/extra-client-data-audit.json`：物品名称 103,910；静态法术说明 32,592、光环说明 18,609、技能副标题 3,037；成就 5,655、货币 98、战斗宠物 1,422、战斗宠物技能 1,013、冒险指南首领 755、章节／技能 9,783。战斗宠物名称通过三语一致的 CreatureID 关联同版本 Creature 表。新增链接资料用于显示名称，不代表完整成就或冒险指南界面描述已汉化。

NPC 名称和头衔来自原有固定 TDB 2018 基础行及其简繁 locale 行，通过 Creature ID 与对应英文名称／头衔配对，收录名称 95,761 个 ID、头衔 16,947 个 ID。它们属于社区保存的世界数据库资料，不以 build 字段作为逐字官服采集证明。仅作用于可识别 Creature GUID 的原版提示框，不改玩家名称、公会名、自定义宠物名或引擎绘制的头顶浮动文字。

### 书籍上下文与 NPC 消息

沿已固定世界库的 `page_text.NextPageID` 建立书籍页链。全局指纹无法唯一确定的正文，再按第一页原文指纹、当前页码和当前正文指纹选择译文；上下文内部仍有冲突时拒绝。恢复 51 个页 ID 的匹配，共 55 个上下文／页码组合。`ITEM_TEXT_BEGIN` / `ITEM_TEXT_CLOSED` 清除旧书上下文；缺少第一页、书页顺序不同或来源冲突时保留原文。

NPC 说话、喊话、密语、首领密语复用已有 BroadcastText / Gossip 中文资料，怪物动作消息保留原有处理。只有怪物动作事件使用 `%s` 姓名格式，普通 NPC 对白不能把该模板直接写进聊天。处理不会发送聊天消息，也不改变玩家发言正文。选项 `BoxText` / `BoxBroadcastTextID` 及原版 `GOSSIP_CONFIRM` 确认框已接入匹配流程，但现有资料未发现可增加的中文 BoxText 行，不能计为新增已翻译内容。

所有新增 AddOns 数据只保留中文、数字 ID 与匹配指纹，不携带原始 SQL、CSV 或外文正文。未通过来源或格式核对的内容保持原文，范围及后续缺口见 `docs/TRANSLATION-COVERAGE.md`。

## 1.3.1 资源组织与一致性

本版按功能目录组织资源，并将地图、收藏、专业、声望、要塞等界面处理拆成独立模块。资料来源、语言优先级和匹配索引保持不变；只有重复且实际能节省源码体积的中文进入共享字符串池，原有 ID 继续指向相同译文，不合并不同语义的索引。

资源目录、分片顺序与运行模块由 `scripts/resource-layout.mjs` 统一登记。共享中文在加载时解析为普通字符串，之后释放临时池表。构建在独立临时目录完成，生成清单和哈希、检查 Lua 5.1 语法与共享引用后才替换正式目录；替换失败会回滚，无法完成回滚时保留恢复备份。重构期间逐条核对与 1.3.0 的资源赋值，结果在 `docs/refactor-equivalence.json`，基线在 `docs/refactor-baseline-1.3.0.json`，资源明细在 `docs/resource-manifest.json`。结构和构建流程见 `docs/ARCHITECTURE.md`。这些检查不代替游戏内字形、布局和兼容性验收。

## 1.3.3 显示补漏与控件池优化

专业配方复用同版 `Spell` 名称和说明索引，按当前配方 ID 与完整原文核验；数值说明只采用原有的受限格式匹配，不计算新数值。征令板新增 `AdventureJournal` 记录 8（灰谷、任务 28493、地图区域 43）和 41（石爪山脉、任务 28532、地图区域 81）的地区名，逐字段核对同版三种语言的非语言信息；仍不使用该表中与征令板原文不同的正文和按钮。

“Warchief's Command Board”与“酋长的命令布告板”配对来自原有 MagicStorm `2018_01_11_gameobject_template_locale.sql` 中条目 206109／206116，并与其明确指定的 `TDB_world_735.00_2018_02_19.sql` 原名逐条核对。中文条目 `VerifiedBuild=0`，按现有规则标为 `community-unverified`，不宣称是已独立核验的官方客户端译文；同名有冲突时仍排除。来源哈希与采用记录见 `sources.json`、`docs/world-object-audit.json`。

显示和刷新顺序继续核对同一界面源码 commit，包括 `Blizzard_TradeSkillDetails.lua`、`Constants.lua`、`Minimap.lua`、`QuestChoiceFrameMixin.lua`、`StaticPopup.lua` 和 `SharedXML/Pools.lua`。原版池的新对象在 `resetterFunc(pool, object)` 中登记；安装时也处理已有的活动／闲置对象，不修改 `Acquire` 的返回值、原版对象资料或游戏操作。

## 1.3.2 收藏、考古、研究与要塞入口

新增玩具、幻化、考古、研究、追随者和建筑显示入口，不重新采集或混入其他版本资料。固定说明复用下述本地 7.3.5.26972 客户端数据及已有同版物品库，沿用简体优先、繁体补缺和完整原文／歧义检查。追随者默认姓名复用原有可靠 NPC 名称索引，并校验实例名与客户端模板默认名；该姓名索引包含社区保存的世界数据库资料，不把这部分重新标为独立核验的官中。舰船、玩家改名及无法核对的姓名不替换。

显示路径核对固定界面源码 commit `67ecbf5ce0e50cc7483c2295caecf410460f0994`，包括 ToyBox、Wardrobe、ArchaeologyUI、OrderHallTalents、GarrisonSharedTemplates、GarrisonBuildingUI、FollowerTooltip 和 UIDropDownMenu。源码路径及 Git blob／SHA-256 记录在 `docs/collection-garrison-ui-audit.json`；入口边界与测试方法见 `docs/COLLECTION-GARRISON-UI.md`。没有新增机器翻译、人工补译或第三方字体。

## 1.3.0 本地中文客户端提取

本次从用户提供的 **7.3.5.26972、cn、zhCN** 客户端 CASC 资源中只读提取。活动 Build Key 为 `3b0517b51edbe0b96f6ac5ea7eaaed38`，Root CKey 为 `7f4cefa93ecc032a4d33d422764a8cf5`。每份 DB2 解包后要求 MD5 与 CASC CKey 一致，并记录 SHA-256；不启动游戏、不修改客户端，也不将服务器写入的 ADB/WDB 缓存视为官方译文。

读取工具固定 [CascLib](https://github.com/WoW-Tools/CascLib/tree/3f8be478177802de4ae7ebae24fb25ab860ef104)、[DBCD](https://github.com/wowdev/DBCD/tree/e732093f8864240fc5884bd1bba6b02f3dfc0d56) 与 [WoWDBDefs](https://github.com/wowdev/WoWDBDefs/tree/77582e12f6f61c7647635bc31c152b119b9dd7f9) 的版本。对缓存中的工具源码修正配置文件的只读访问，禁用本地文件缺失时的在线回退；导出时保留数值数组和大整数的精度。复现入口为 `scripts/extract-client.ps1`，工具版本与提取结果见 `docs/client-extractor-tools.json`、`docs/client-extraction-audit.json`。

本地导出 243 张表，其中 144 张含中文；内部测试表 `UnitTestSparse` 因无匹配布局定义被排除。与原有资料重叠的法术、物品、神器等 18 张中文表逐字段核对结果相同，没有凭空增加这部分覆盖率，见 `docs/client-existing-comparison.json`。新增候选来自 68 张面向玩家的表，原文使用 Wago.Tools **相同 7.3.5.26972** enUS 导出对照，缺简体时使用同版 zhTW；每张表的 URL、哈希、身份核对结果及采用数量均保留在 `data/local-client-735.json`，其整体哈希由 `sources.json.localClientSnapshot` 固定。

候选须逐记录核对 ID 和全部非语言字段，包括数组成员；同版本的两条 SpellFlyout 记录仍存在 ClassMask 差异，已排除。只有完整原文与可直接显示的可靠中文通过检查才生成索引；不推测公式、不翻译玩家输入，同名歧义不选择译文。按内容范围分别建库，已有任务标题、目标和对白索引优先；新增候选如已存在则去重。简体可用时优先，简体缺失或冲突时再用可核实的繁体。

新增显示处理核对固定的 [7.3.5 界面源码](https://github.com/Gethe/wow-ui-source/tree/67ecbf5ce0e50cc7483c2295caecf410460f0994)：地图地点、区域标签、场景与成就条件、坐骑手册、专业配方来源、地下城排队说明、声望详情及要塞任务固定字段。任务和世界目标复用原有入口。收录表还包含其他尚未单独适配的内容，不能把资源条数当成已完成的界面汉化数量；详情与复现方式见 `docs/LOCAL-CLIENT-DATA.md`。任务全文、进行中／交付对白和书页主要由服务器发送，不能靠客户端安装包完全补齐。`Casketmasher`、征令板未核实的正文及 `Orgrimmar Portals` 仍没有可采纳的中文对应。

## 1.3.5 经核验的任务变量模板

固定来源为 [TrinityCore #21889](https://github.com/TrinityCore/TrinityCore/issues/21889) 所附的 build 26365 社区采集 SQL。中文字段逐条对应任务 ID、字段及该修订中的原文；英文采用同批完整记录，缺少完整英文的更新行则与已固定的 TDB735.00（25549）完整字段核对。两者均再与固定的 7.3.5 TDB735.25051 字段比较；后者与历史采集同源，不能算独立官方证明。

快照 `data/quest-variables-735.json` 保存 URL、Gist 修订、源文件 SHA-256、原文版本、完整中英文及暂缓原因；`sources.json` 固定该快照哈希。33 个字段使用 25 个简体、8 个繁体译文；保留 55 条语言记录供复核。发行资源新增 `Data/Quests/QuestTemplates_01.lua`，只含中文、数字槽位和外文片段长度／指纹，外文正文留在开发快照。

数量由完整匹配的客户端原文绑定，不用旧库数量或可见目标索引替代。未通过完整原文匹配仍保留原文。另 3 个 `$ct` 字段未启用：本地 26972 的 `ChrClassTitle` 中文表已提取，但英文块缺失。规则和验收范围见 `docs/QUEST-VARIABLES.md`，生成统计见 `docs/quest-variable-audit.json`。
