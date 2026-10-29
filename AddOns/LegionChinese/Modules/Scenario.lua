-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local bind = A.BindCatalog
function A.InstallScenario(hook, hookMethod)
    bind(hookMethod, ScenarioStageBlock and ScenarioStageBlock.Name, "Title")
    bind(hookMethod, ScenarioStageBlock and ScenarioStageBlock.Description, "Objective")
end
