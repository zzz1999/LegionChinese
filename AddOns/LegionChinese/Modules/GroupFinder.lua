-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local bind = A.BindCatalog
local function dungeonRewards(frame, hookMethod)
    if not frame then
        return
    end
    bind(hookMethod, frame.title, "GroupFinder")
    bind(hookMethod, frame.description, "GroupFinder")
    -- Reward quantities and editable premade-group listings are separate.
end

function A.InstallGroupFinder(hook, hookMethod)
    dungeonRewards(LFDQueueFrameRandomScrollFrameChildFrame, hookMethod)
    hook("LFGRewardsFrame_OnLoad", function(frame)
        dungeonRewards(frame, hookMethod)
    end)
    hook("LFGRewardsFrame_UpdateFrame", function(frame)
        dungeonRewards(frame, hookMethod)
    end)
end
