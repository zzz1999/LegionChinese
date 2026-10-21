-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
function A.InstallProfessions(hook,hookMethod)
    local details=TradeSkillFrame and TradeSkillFrame.DetailsFrame
    local contents=details and details.Contents
    if contents then
        bind(hookMethod,contents.Description,"Profession")
        bind(hookMethod,contents.SourceText,"Profession")
    end
end
