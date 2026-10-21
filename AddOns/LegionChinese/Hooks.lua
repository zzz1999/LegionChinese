-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
if A.Hooks then return end
local methods=setmetatable({}, {__mode="k"})
local scripts=setmetatable({}, {__mode="k"})
local contexts={}

local function register(registry,object,name,key,callback,script)
    if not object or object.IsForbidden and object:IsForbidden() or type(callback)~="function" then return false end
    if script then
        if type(object.HookScript)~="function" then return false end
    elseif type(object[name])~="function" then return false end
    local entries=registry[object]
    if not entries then entries={};registry[object]=entries end
    local entry=entries[name]
    if not entry then
        entry={order={},callbacks={}};entries[name]=entry
        local function dispatch(...)
            for _,id in ipairs(entry.order) do entry.callbacks[id](...) end
        end
        if script then object:HookScript(name,dispatch) else hooksecurefunc(object,name,dispatch) end
    end
    if not entry.callbacks[key] then entry.order[#entry.order+1]=key end
    entry.callbacks[key]=callback
    return true
end

-- Feature keys are stable across late addon loads. Anonymous functions may be
-- refreshed without adding another native hook; different features coexist.
A.Hooks={}
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
