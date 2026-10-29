# CurseForge 自动发布（维护者）

项目 ID：**1750538**。游戏版本：**World of Warcraft 7.3.5**。

本仓库使用 GitHub Actions 打包，再调用 [CurseForge 官方上传 API](https://support.curseforge.com/support/solutions/articles/9000197321-curseforge-api)。GitHub 和 CurseForge 使用同一份 `LegionChinese-版本号.zip`，更新说明取自对应的 GitHub Release。

1.3.5 的发布 ZIP 仍只有一个 `LegionChinese` 文件夹和 TOC。打包时为资料添加单插件内部的按需初始化入口，检查任务核对转换前后所有资源赋值等价及 Lua 5.1 语法；源码目录保留一份完整资料。

[原生 Automatic Packaging](https://support.curseforge.com/support/solutions/articles/9000197281-automatic-packaging) 是另一种方式：通过 webhook 让 CurseForge 从源码重新打包。本仓库的插件位于 `AddOns/LegionChinese/`，还有数据生成、测试和发布版本分配步骤，因此沿用现有经过验证的安装包。**不需要配置打包 webhook 或 `.pkgmeta`**；不要同时启用另一条自动打包流程，以免重复发布。

## 一次性设置

1. 登录 [CurseForge 作者后台](https://authors.curseforge.com/)，在账户的 **API Tokens** 页面生成发布令牌。使用项目作者的上传令牌，不是向开发者平台申请的检索 API Key。
2. 打开 [GitHub 新建 Actions Secret](https://github.com/zzz1999/LegionChinese/settings/secrets/actions/new)。名称填写 **`CF_API_TOKEN`**，值填写刚生成的令牌。令牌只保存在 Secret 中，不写入仓库或聊天。
3. 打开 [GitHub Actions](https://github.com/zzz1999/LegionChinese/actions/workflows/check.yml)，选择 **Check and release addon → Run workflow → main**。也可以等待下一次 push 到 main。
4. 查看工作流的 **Upload to CurseForge** 步骤和任务摘要；成功时会返回 CurseForge 文件 ID。再到 [项目作者后台](https://authors.curseforge.com/#/projects/1750538/files) 确认文件的处理、审核和公开状态。

令牌尚未配置时，该步骤会明确提示跳过，GitHub Release 仍正常发布。添加 Secret 本身不会触发工作流，需要执行第 3 步。当前提交已有 GitHub Release 时会复用该版本，不会因为补传而分配一个新版本号。

## 自动流程

`main push → 测试和资源检查 → 分配版本 → 打包 → GitHub Release → 校验已发布 ZIP → CurseForge 上传`

- PR 和其他分支只运行检查；不会读取发布令牌或上传。
- 只上传当前 Latest 的正式版本，防止旧任务重跑后再次成为 CurseForge 的最新文件。
- 文件显示名称为 `v版本号`，文件名为 `LegionChinese-版本号.zip`。
- 分配版本后先准备本次更新说明，安装包中的 `/lcn about` 和 GitHub Release 使用同一份内容。没有对应版本的手写记录时，使用上一版本以来的真实提交说明；重跑草稿时沿用已准备的说明，不把上一版记录改名后重复发布。
- 从 CurseForge 的 WoW 版本列表准确查找 **7.3.5**，找不到时停止上传，不会改标为其他版本。
- 安装包和 SHA-256 校验文件从已发布的 GitHub Release 下载；重跑也使用这些已发布字节。
- 每次只提交一次上传请求，不会因网络重试自动重复提交。成功记录保存为 GitHub Release 正文末尾的隐藏 HTML 注释，不增加下载附件。
- 上传成功表示平台已接收文件，**不代表审核通过或已经可以公开下载**。审核通过后按平台设置发布。

## 失败与重跑

GitHub 发布完成后，即使 CurseForge 上传失败，已发布的 GitHub 安装包仍可下载。修正令牌或其他配置后，重跑该工作流。已经成功上传的版本会根据文件 ID 跳过，不会重复提交。

如果日志提示 **uncertain outcome**，表示上次 POST 超时、服务端报错或成功回执保存中断。先在 CurseForge 作者后台按版本号和文件名检查：

- **确认没有收到文件**：编辑对应 GitHub Release，删除正文末尾整条 `<!-- legionchinese-curseforge:... -->` 隐藏注释，保存后重跑。
- **已经收到文件**：不要再次上传。把这条注释中的 `"status":"pending"` 改为 `"status":"uploaded"`，并添加数值形式的 `"fileId":文件ID`，其他字段保持不变。保存后重跑即可验证跳过。
- **无法确定**：保留注释，先核实 CurseForge 状态，不要删除后盲目重跑。

这些回执只包含项目 ID、版本、ZIP 校验值、状态和文件 ID，不包含令牌。更新说明的可见内容不受影响。
