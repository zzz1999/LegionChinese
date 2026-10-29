-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local bind = A.BindCatalog
function A.InstallAchievementCriteria(hook, hookMethod)
    hook("AchievementButton_GetCriteria", function(index, offscreen)
        local criteria = _G["AchievementFrameCriteria" .. (offscreen and "OffScreen" or "") .. index]
        bind(hookMethod, criteria and criteria.name, "Objective")
    end)
end
