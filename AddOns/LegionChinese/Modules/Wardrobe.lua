-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
local function list(hookMethod,scroll)
    if not scroll or scroll.IsForbidden and scroll:IsForbidden() then return end
    for _,button in ipairs(scroll.buttons or {}) do
        if not (button.IsForbidden and button:IsForbidden()) then
            bind(hookMethod,button.Name,"Collection");bind(hookMethod,button.Label,"Collection")
        end
    end
end
local function sets(hookMethod,frame)
    if not frame or frame.IsForbidden and frame:IsForbidden() then return end
    local details=frame.DetailsFrame
    if details and not (details.IsForbidden and details:IsForbidden()) then
        for _,field in ipairs({"Name","LongName","Label","VariantSetsButton"}) do bind(hookMethod,details[field],"Collection") end
    end
    list(hookMethod,frame.ScrollFrame)
end
local function appearance(sources)
    local names={}
    for _,source in ipairs(type(sources)=="table" and sources or {}) do
        if type(source)=="table" and type(source.name)=="string" and not A.IsChinese(source.name) then
            local info=source
            if not info.itemID and C_TransmogCollection and type(C_TransmogCollection.GetSourceInfo)=="function" then
                local ok,value=pcall(C_TransmogCollection.GetSourceInfo,source.sourceID)
                if ok and type(value)=="table" then info=value end
            end
            local row=LegionChineseDB.ItemNames[info.itemID]
            -- A visual source may be a bonus/suffix variant. Only use the base
            -- item translation when its whole displayed name agrees too.
            if row and A.NameFingerprint(source.name)==row[2] then names[source.name]=row[1] end
        end
    end
    A.UpdateCatalogTooltip(GameTooltip,"Collection",function(source) return names[source] end,true)
end
function A.InstallWardrobe(hook,hookMethod,hookScript)
    local root=WardrobeCollectionFrame
    local frame=root and root.SetsCollectionFrame
    local function modelTooltip(model)
        local tip=GameTooltip
        if tip and tip.GetOwner and tip:GetOwner()==model then A.UpdateCatalogTooltip(tip,"Collection") end
    end
    local function models()
        local current=WardrobeCollectionFrame
        for _,collection in pairs({current and current.ItemsCollectionFrame,current and current.SetsTransmogFrame}) do
            if not (collection.IsForbidden and collection:IsForbidden()) then
                for _,model in ipairs(collection.Models or {}) do
                    hookMethod(model,"RefreshTooltip",modelTooltip)
                    hookScript(model,"OnEnter",modelTooltip)
                end
            end
        end
    end
    local function refresh(self) sets(hookMethod,self) end
    for _,object in pairs({WardrobeSetsCollectionMixin,frame}) do
        hookMethod(object,"DisplaySet",refresh)
        hookMethod(object,"Refresh",refresh)
    end
    for _,object in pairs({WardrobeSetsCollectionScrollFrameMixin,frame and frame.ScrollFrame}) do
        hookMethod(object,"Update",function(self) list(hookMethod,self) end)
    end
    hook("HybridScrollFrame_CreateButtons",function(scroll)
        local collection=WardrobeCollectionFrame and WardrobeCollectionFrame.SetsCollectionFrame
        if collection and collection.ScrollFrame==scroll then list(hookMethod,scroll) end
    end)
    hook("WardrobeCollectionFrame_SetAppearanceTooltip",function(_,sources) appearance(sources) end)
    hook("UIDropDownMenu_AddButton",function(_,level)
        local frame=WardrobeCollectionFrame and WardrobeCollectionFrame.SetsCollectionFrame
        local details=frame and frame.DetailsFrame
        A.UpdateCatalogMenu(details and details.VariantSetsDropDown,"Collection",level)
    end)
    for _,mixin in pairs({WardrobeItemsModelMixin,WardrobeSetsTransmogModelMixin}) do
        hookMethod(mixin,"RefreshTooltip",modelTooltip)
    end
    hook("WardrobeCollectionFrame_OnLoad",models)
    models()
    sets(hookMethod,frame)
    -- OutfitDropDown, search boxes and user-saved outfits are not bound.
end
