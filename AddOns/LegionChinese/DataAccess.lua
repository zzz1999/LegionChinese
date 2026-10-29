-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local groups, families, scopes, pools = {}, {}, {}, {}
A.Data = {}

-- The source database is eager. Packaging wraps its assignments in functions
-- inside this same addon; Lua still reads/compiles the files during startup.
local function emptyShape(value)
    local result = {}
    for key, child in pairs(value or {}) do
        if type(child) == "table" then
            result[key] = emptyShape(child)
        end
    end
    return result
end

local function ready(state)
    return not state.loading and (not state.retryAt or (GetTime and GetTime() or 0) >= state.retryAt)
end

local function failed(state, message)
    state.loading = nil
    state.error = message
    state.retryAt = (GetTime and GetTime() or 0) + 5
end

local function ensure(group)
    if group.loaded then
        return true
    end
    if not ready(group) or #group.loaders ~= group.count then
        return false
    end
    group.loading = true
    -- Publish empty targets first: generated assignments can reference sibling
    -- tables without recursively initializing the same category.
    for _, target in ipairs(group.targets) do
        rawset(target.parent, target.key, emptyShape(target.shape))
    end
    local ok, message = pcall(function()
        for _, loader in ipairs(group.loaders) do
            loader()
        end
    end)
    group.loading = nil
    if not ok then
        for _, target in ipairs(group.targets) do
            rawset(target.parent, target.key, nil)
        end
        failed(group, message)
        return false
    end
    group.loaded = true
    group.loaders, group.retryAt, group.error = nil, nil, nil
    return true
end

local function readTarget(parent, key, owners)
    local group = owners[key]
    if not group then
        return nil
    end
    if ensure(group) then
        return rawget(parent, key)
    end
    -- Direct consumers also index D.Quests[id], etc. An unavailable category
    -- must remain an empty lookup, never expose partially initialized data.
    return group.fallbacks[key]
end

function A.Data.Configure(definitions)
    for name, definition in pairs(definitions) do
        local group = { count = definition.count, loaders = {}, targets = {}, fallbacks = {} }
        groups[name] = group
        local function target(parent, key, owners)
            local shape = emptyShape(rawget(parent, key))
            group.targets[#group.targets + 1] = { parent = parent, key = key, shape = shape }
            group.fallbacks[key] = emptyShape(shape)
            owners[key] = group
            rawset(parent, key, nil)
        end
        for _, family in ipairs(definition.families) do
            target(D, family, families)
        end
        for _, scope in ipairs(definition.scopes) do
            target(D.CatalogTexts, scope, scopes)
        end
    end
    setmetatable(D, {
        __index = function(parent, key)
            return readTarget(parent, key, families)
        end,
    })
    setmetatable(D.CatalogTexts, {
        __index = function(parent, key)
            return readTarget(parent, key, scopes)
        end,
    })
end

function A.Data.Register(name, loader)
    local group = assert(groups[name], "Unknown data category: " .. name)
    assert(not group.loaded and #group.loaders < group.count, "Duplicate data registration: " .. name)
    group.loaders[#group.loaders + 1] = loader
end

local function poolValue(values, id, shards)
    if type(id) ~= "number" then
        return nil
    end
    local first, last = 1, #shards
    while first <= last do
        local middle = math.floor((first + last) / 2)
        local shard = shards[middle]
        if id < shard.first then
            last = middle - 1
        elseif id > shard.last then
            first = middle + 1
        else
            if shard.loaded or not ready(shard) then
                return nil
            end
            shard.loading = true
            local ok, message = pcall(shard.loader)
            shard.loading = nil
            if not ok then
                for key = shard.first, shard.last do
                    rawset(values, key, nil)
                end
                failed(shard, message)
                return nil
            end
            shard.loaded = true
            shard.loader, shard.retryAt, shard.error = nil, nil, nil
            return rawget(values, id)
        end
    end
end

function A.Data.RegisterPool(family, first, last, loader)
    local shards = pools[family]
    if not shards then
        shards = {}
        pools[family] = shards
        setmetatable(D[family], {
            __index = function(values, id)
                return poolValue(values, id, shards)
            end,
        })
    end
    assert(first <= last and (#shards == 0 or shards[#shards].last < first), "Overlapping string shards")
    shards[#shards + 1] = { first = first, last = last, loader = loader }
end

function A.Data.ResetFailures()
    for _, group in pairs(groups) do
        group.retryAt = nil
    end
    for _, shards in pairs(pools) do
        for _, shard in ipairs(shards) do
            shard.retryAt = nil
        end
    end
end

function A.Data.Get(family)
    return D[family]
end

function A.Data.Catalog(scope)
    return D.CatalogTexts and D.CatalogTexts[scope]
end
