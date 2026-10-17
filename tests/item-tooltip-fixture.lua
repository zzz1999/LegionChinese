description='Place within the Font of Power inside the dungeon on Mythic difficulty.'
translatedDescription='在傳奇難度中，放置在地城裡的能量之泉內。'
function MakeItemTooltip(name)
    local tip=ScriptFrame();tip.name=name;tip.owner=UIParent;tip.shown=false
    for _,method in ipairs({"GetOwner","GetUnit","GetItem","GetSpell","IsShown","Show","Hide","IsForbidden"}) do tip[method]=GameTooltip[method] end
    function tip:GetName() return self.name end
    function tip:NumLines() return self.lineCount or 0 end
    function tip:Populate(link,text)
        self:Fire("OnTooltipCleared")
        self.unitName=nil;self.unit=nil;self.spell=nil;self.spellRank=nil;self.spellID=nil
        if self.noItemAPI then self.itemLink=nil else self.itemLink=link end
        self.item=self.itemLink and "钥石：英灵殿" or nil
        local lines={"钥石：英灵殿", "史诗等级 12", "拾取后绑定", "激励", "持续时间：4天", text or ('"'..description..'"')}
        self.lineCount=#lines
        for i,value in ipairs(lines) do
            local key=name.."TextLeft"..i
            _G[key]=_G[key] or Widget("");_G[key]:SetText(value)
        end
        self:Fire("OnTooltipSetItem");self:Show()
    end
    function tip:SetHyperlink(link) self:Populate(link,self.pendingText);return "native result",nil,3 end
    function tip:SetBagItem(bag,slot) self:Populate(self.bagLink or "item:138019::::::::",self.pendingText);return true end
    tip:SetScript("OnTooltipSetItem",function(self) self.nativeItems=(self.nativeItems or 0)+1 end)
    tip:SetScript("OnUpdate",function(self) self.nativeUpdates=(self.nativeUpdates or 0)+1 end)
    return tip
end
GameTooltip=MakeItemTooltip("GameTooltip")
ItemRefTooltip=MakeItemTooltip("ItemRefTooltip")
function GetContainerItemID() return bagItemID or 138019 end
