-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
if A.Hooks then return end
local methods=setmetatable({}, {__mode="k"})
local scripts=setmetatable({}, {__mode="k"})
local contexts={}

local function attach(object,name,entry,script)
    if object.IsForbidden and object:IsForbidden() then return false end
    if script then
        if type(object.HookScript)~="function" then return false end
        if not entry.installed then object:HookScript(name,entry.dispatch);entry.installed=true end
    else
        local current=object[name]
        if type(current)~="function" or type(hooksecurefunc)~="function" then return false end
        if not entry.hooked[current] then
            hooksecurefunc(object,name,entry.dispatch)
            -- WoW may keep the function identity; test/compatibility wrappers
            -- may replace it. Remember the identity AFTER the native hook.
            entry.hooked[object[name]]=true
        end
    end
    return true
end

local function register(registry,object,name,key,callback,script)
    if not object or object.IsForbidden and object:IsForbidden() or type(callback)~="function" then return false end
    local entries=registry[object]
    if not entries then entries={};registry[object]=entries end
    local entry=entries[name]
    if not entry then
        entry={order={},callbacks={},hooked=setmetatable({}, {__mode="k"})};entries[name]=entry
        entry.dispatch=function(...)
            for _,id in ipairs(entry.order) do entry.callbacks[id](...) end
        end
    end
    if not entry.callbacks[key] then entry.order[#entry.order+1]=key end
    entry.callbacks[key]=callback
    -- Keep registrations for known objects whose methods have not loaded yet.
    return attach(object,name,entry,script)
end

-- Feature keys are stable across late addon loads. Anonymous functions may be
-- refreshed without adding another native hook; different features coexist.
A.Hooks={}
function A.Hooks.Refresh()
    -- Called on addon/login events only, over registered targets. No frame
    -- enumeration or per-frame polling, and unchanged hooks are left alone.
    for object,entries in pairs(methods) do
        for name,entry in pairs(entries) do attach(object,name,entry,false) end
    end
    for object,entries in pairs(scripts) do
        for name,entry in pairs(entries) do attach(object,name,entry,true) end
    end
end
function A.Hooks.ForFeature(feature)
    if not contexts[feature] then
        local function key(slot) return feature..":"..(slot or "default") end
        local function hook(name,callback,slot) return register(methods,_G,name,key(slot),callback,false) end
        local function method(object,name,callback,slot) return register(methods,object,name,key(slot),callback,false) end
        local function script(widget,event,callback,slot) return register(scripts,widget,event,key(slot),callback,true) end
        contexts[feature]={hook,method,script}
    end
    return (unpack or table.unpack)(contexts[feature])
end
