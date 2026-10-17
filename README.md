# TauriChinese

面向《魔兽世界》军团再临 7.3.5（Interface 70300）的离线中文插件，简体优先，繁体补充。

任务、NPC 对话和书页逐段处理：已有简体或繁体中文保持原样；非中文内容按“可用简体中文 → 可用繁体中文 → 原文”匹配。不调用翻译 API，无需密钥，也不自动转换简繁字形。

这是独立实现，设计受到 [TauriHun](https://www.curseforge.com/wow/addons/taurihun) 启发。TauriHun 作者为 **WorldOfHuncraft**，CurseForge 发布账号为 **TauriHun**。本项目没有复制其程序、匈牙利语资源或字体，也不是原作者维护的分支。

## 安装

1. 下载 [最新版 TauriChinese-latest.zip](https://github.com/zzz1999/TauriChinese/releases/latest/download/TauriChinese-latest.zip)，将其中的 `TauriChinese` 文件夹放到游戏的 `Interface\AddOns\`。
2. 确认最终路径为 `Interface\AddOns\TauriChinese\TauriChinese.toc`。
3. 在角色选择界面启用 TauriChinese，并停用 TauriHun 等同类文本替换插件，避免它们互相覆盖。
4. 进入游戏或 `/reload`。首次安装默认开启；`/tcn off` 关闭，`/tcn on` 开启；重新打开相关窗口生效。以前手动关闭过的设置会保留。

安装包包含可分发的霞鹜文楷 Lite 中文字体，英文客户端也可以显示替换后的中文。插件不修改客户端 CASC 文件或服务器数据库。

## 首次启动与反馈

首次进入游戏时自动显示介绍窗口，包含插件版本、用途、作者 **zzz1999**、TauriHun 原作者 **WorldOfHuncraft** 的启发署名及资料贡献者。窗口按游戏账号记忆，只自动显示一次；切换角色、重新登录和 `/reload` 不会重复弹出。旧版用户升级后也会首次显示一次。

发现问题或有建议，请到 [GitHub Issues](https://github.com/zzz1999/TauriChinese/issues) 反馈。窗口中的网址可点击选中，按 **Ctrl+C** 复制后在浏览器打开。输入 `/tcn about` 随时重新查看；查看介绍不会改变汉化开关。

## 当前覆盖

| 内容 | 已导入 |
|---|---:|
| 至少有一个可用中文字段的任务 | 17,321 个 |
| 含可用中文任务正文 | 15,456 个 |
| 选入的简体中文广播候选 | 125,929 条 |
| 选入的繁体中文广播候选 | 125,859 条 |
| 有可用英文匹配的书籍、信件等阅读页面 | 1,705 页（简体 1,654、繁体补充 51） |
| 按任务 ID 保存的交任务对话 | 19 条 |
| 按任务 ID 保存的任务进行中对话 | 5 条 |

这些数字包含旧资料片内容，不是 Tauri 服务器的实测覆盖率。广播库不再受旧 world 数据库中不完整的 NPC 引用限制；没有原文配对、存在歧义或含损坏占位符的文本不会生成匹配键。接交任务文本也会尝试匹配广播库，但不保证命中。

简繁库会出现相同广播 ID，不能把两种语言的候选数相加当作覆盖数。最终 NPC 索引保留 997,033 个简体匹配键，并新增 7,968 个繁体补充键。任务按字段补入 47 个繁体标题、30 段繁体正文、31 个繁体目标字段；损坏占位符不计入可用字段数。

书页候选覆盖 1,830 个页面 ID，其中简体候选 1,830 条、繁体候选 1,793 条。最终可匹配的页面中，8 页有客户端采集标记，其余为注明来源的社区资料，尚未核实为官中。候选数、页面数和去重后的指纹数分别统计，未匹配页面继续显示原文。

支持原版任务详情、任务日志详情及列表标题、NPC 对话窗口与选项、ItemTextFrame 书页。尚未适配第三方任务 UI、世界气泡、过场字幕或聊天框台词；数据库含有对应台词不代表所有显示位置已经接入。书籍窗口标题没有对应译文时继续保留。

## 判断和匹配规则

- 每个显示字段独立判断，中文标题不会阻止英文正文汉化。
- 任务按字段选择简体，缺少可用简体字段时才选繁体。NPC、书页、标题和目标指纹先分别排除各语言的冲突，再用繁体补齐无可用简体的键；两种中文都不可用时保留原文。
- 去掉颜色、链接参数和显示标签，排除英文句子中的中文玩家姓名后，含汉字即保留。此规则保守处理混合文本，并不是通用语言识别器。
- 任务优先按任务 ID 和字段查询；NPC、书页及选项按规范化后的全文指纹匹配。
- 指纹包含两组 32 位散列和 UTF-8 字节长度。在同一种中文内，书页优先采用有客户端采集标记的译文，社区数据仅作补充。同等级的相同原文对应不同译文时排除该语言的键；包括简繁之间在内的散列冲突一律排除。
- 支持玩家姓名、种族、职业、性别和换行占位符，以及任务目标计数。原文变动较大、未知动态变量或数据库缺失时保持原文。
- `AddOns/TauriChinese/Data/` 只包含中文显示文本、数字 ID 和不可还原原文的匹配指纹；没有英语、匈牙利语等正文副本。原始多语言 SQL 仅放在构建缓存中，不提交、不打包。

## 数据来源与构建

来源、版本、许可说明见 [SOURCES.md](SOURCES.md)，固定下载地址和 SHA-256 见 [sources.json](sources.json)，导入统计见 [docs/data-audit.json](docs/data-audit.json)，逐页来源与可匹配状态见 [docs/book-provenance.json](docs/book-provenance.json)。本次补充采用 [The Legion Preservation Project 的 7.3.5.26972 数据库](https://github.com/The-Legion-Preservation-Project/TrinityCore/releases/tag/TDB735.25051)及历史采集补丁，优先保留有客户端来源记录的译文。中文资料由社区保存，未逐条验证为未经修改的官方原文，也不宣称暴雪官方发布或全量官中。

需要 Node.js 20+、PowerShell 和 7-Zip：

```powershell
npm ci --ignore-scripts
./scripts/fetch-data.ps1
npm run build
npm test
npm run check
./scripts/package.ps1
```

抓取脚本校验哈希；构建器只解析 SQL 数据，不执行 SQL。安装包仅含 `AddOns/TauriChinese`，不包含 npm 依赖、原始 SQL 或测试夹具。

## 自动发布

每次推送到 `main`，GitHub Actions 先执行测试及资源检查，通过后生成独立的 `build-编号` Release，上传安装包和 SHA-256 校验文件，并更新[最新版入口](https://github.com/zzz1999/TauriChinese/releases/latest)。其他分支和 PR 只运行检查；也可以在 Actions 中手动运行此工作流。

历史版本保留；重跑已发布的构建不会覆盖其文件。发布任务排队执行，较早的构建不会把较新的成功版本降为旧版。检查或上传失败时不会发布不完整的安装包。工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需配置额外密钥。

安装包内的版本号带构建编号和提交缩写，例如 `0.1.2+build.5.abcdef0`；仓库中的基础版本不因自动构建产生额外提交。要在本地生成同样命名的包，可执行：

```powershell
./scripts/package.ps1 -Version 0.1.2+build.local -ArchiveName TauriChinese-latest.zip
```

## 验证状态

已完成 Lua 5.1 语法检查、中文资源检查、字体校验，以及 SQL 解析、构建端与运行端指纹一致性、已有中文保留、中文玩家姓名、任务切换、缺失回退、歧义过滤、书籍翻页和开关的自动化测试。数据导入测试检查简繁逐字段回退、版本过滤、采集来源优先级、旧世界书页 ID 与全文校对、损坏占位符排除；欢迎窗口测试检查首次显示、记忆关闭、手动重开、网址复制交互和保留开关设置。

逻辑测试在 Fengari 模拟运行环境完成，界面 API 使用模拟对象。**尚未在真实 Tauri 7.3.5 客户端验证显示、滚动、兼容性和实际命中率。** 实机验收步骤见 [docs/CLIENT-CHECK.md](docs/CLIENT-CHECK.md)。

程序代码采用 GPL-2.0-or-later；字体采用 OFL-1.1。上游资料与游戏文本的署名说明见 SOURCES.md。
