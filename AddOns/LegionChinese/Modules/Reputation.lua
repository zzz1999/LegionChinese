-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
function A.InstallReputation(hook,hookMethod)
    for _,name in ipairs({"ReputationDetailFactionName","ReputationDetailFactionDescription"}) do bind(hookMethod,_G[name],"Faction") end
end
