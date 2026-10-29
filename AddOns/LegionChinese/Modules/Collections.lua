-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local bind = A.BindCatalog
local function mounts(hookMethod)
    local journal = MountJournal
    local info = journal and journal.MountDisplay and journal.MountDisplay.InfoButton
    if info then
        for _, field in ipairs({ "Name", "Source", "Lore" }) do
            bind(hookMethod, info[field], "Collection")
        end
    end
    for _, button in ipairs(journal and journal.ListScrollFrame and journal.ListScrollFrame.buttons or {}) do
        bind(hookMethod, button.name, "Collection")
    end
end

function A.InstallCollections(hook, hookMethod)
    hook("MountJournal_UpdateMountList", function()
        mounts(hookMethod)
    end)
    hook("MountJournal_UpdateMountDisplay", function()
        mounts(hookMethod)
    end)
    mounts(hookMethod)
end
