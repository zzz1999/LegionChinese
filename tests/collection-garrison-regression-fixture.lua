-- Models the call order of Gethe's 7.3.5 snapshot 67ecbf5ce0e50cc7483c2295caecf410460f0994:
-- WorldMapPOI_OnEnter / WorldMapFrame_EvaluateAreaLabels, GarrisonMissionMechanic*_OnEnter,
-- GarrisonTalentButtonMixin.OnEnter/Refresh and GarrisonFollowerTabMixin.ShowAbilities.
-- Unlike the small base fixture, these paths defer labels, copy methods, reuse pool objects,
-- toggle child visibility and reset a font object AFTER writing its name.
local E=Examples
local function visible(object)
    object.shown=true
    function object:IsShown()return self.shown end
    function object:Show()self.shown=true end
    function object:Hide()self.shown=false end
    function object:SetShown(value)self.shown=not not value end
    function object:IsForbidden()return self.forbidden end
    return object
end
local function label(text)return visible(RichWidget(text))end
local function box(height)
    local object=visible(ScriptFrame());object.height=height or 0
    function object:GetHeight()return self.height end
    function object:SetHeight(value)self.height=value end
    function object:SetTexture(value)self.texture=value end
    function object:SetAtlas(value)self.atlas=value end
    function object:SetParent(value)self.parent=value end
    function object:SetFrameStrata()end
    function object:ClearAllPoints()end
    function object:SetPoint()end
    return object
end
function ReusingPool(create)
    local pool={active={},inactive={}}
    function pool:Acquire()
        local object=table.remove(self.inactive)
        local isNew=not object
        object=object or create();self.active[object]=true
        return object,isNew
    end
    function pool:EnumerateActive()return pairs(self.active)end
    function pool:ReleaseAll()
        for object in pairs(self.active)do
            self.inactive[#self.inactive+1]=object
            object.talent=nil;object.tooltip=nil
            if object.Hide then object:Hide()end
        end
        self.active={}
    end
    return pool
end

function UseDeferredDigsiteMap()
    WorldMapFrame={}
    WorldMapFrameAreaLabel=label("");WorldMapFrameAreaDescription=label("")
    local pendingName,pendingDescription,dirty
    MapMouseFocus=nil
    function GetMouseFocus()return MapMouseFocus end
    function WorldMapFrame_SetAreaLabel(_,name,description)
        pendingName=name;pendingDescription=description;dirty=true
    end
    function WorldMapFrame_EvaluateAreaLabels()
        if not dirty then return end
        dirty=false
        WorldMapFrameAreaLabel:SetText(pendingName)
        WorldMapFrameAreaDescription:SetText(pendingDescription)
    end
    function WorldMapPOI_OnEnter(owner)
        MapMouseFocus=owner;WorldMapFrame.poiHighlight=true
        WorldMapFrame_SetAreaLabel(1,owner.name,owner.description)
        -- A normal, untimed dig site has no WorldMapTooltip.
    end
    function WorldMapPOI_OnLeave()MapMouseFocus=nil;WorldMapFrame.poiHighlight=nil end
    WorldMapFramePOI1.name=E.siteMap.source
    WorldMapFramePOI1.description="Live survey progress: 2/6"
    function WorldMapFramePOI1:IsForbidden()return self.forbidden end
end

function NewMechanicTooltip(counter)
    local tip=box();tip.Name=label("");tip.Icon=box(20);tip.Border=box()
    if counter then
        tip.Title=label("Threat counter");tip.Subtitle=label("")
        tip.CounterFrom=label("Countered by");tip.CounterIcon=box(20);tip.CounterName=label("")
    else tip.Description=label("") end
    return tip
end
function UseNativeMechanicTips()
    GarrisonFollowerOptions={[1]={},[4]={}}
    GarrisonMissionMechanicTooltip=NewMechanicTooltip(false)
    GarrisonMissionMechanicFollowerCounterTooltip=NewMechanicTooltip(true)
    redirectedTooltips=0
    function ShowGarrisonFollowerAbilityTooltip()redirectedTooltips=redirectedTooltips+1 end
    function ShowGarrisonFollowerMissionAbilityTooltip()redirectedTooltips=redirectedTooltips+1 end
    function GameTooltip:SetSpellByID()redirectedTooltips=redirectedTooltips+1 end
    function GameTooltip:SetOwner(owner)self.owner=owner end
    function GarrisonMissionMechanic_OnEnter(owner)
        if not owner.info then return end
        if GarrisonFollowerOptions[owner.followerTypeID].displayCounterAbilityInPlaceOfMechanic and owner.counterAbility then
            ShowGarrisonFollowerMissionAbilityTooltip(owner,owner.counterAbility.id,owner.followerTypeID);return
        end
        local tip=GarrisonMissionMechanicTooltip
        tip:SetParent(owner.mainFrame);tip.Icon:SetTexture(owner.info.icon)
        tip.Name:SetText(owner.info.name)
        tip.Description:SetText(owner.info.description)
        tip:SetHeight(tip.Icon:GetHeight()+28+tip.Description:GetHeight())
        tip:Show()
    end
    function GarrisonMissionMechanicFollowerCounter_OnEnter(owner)
        if not owner.info then return end
        if owner.info.traitID then
            ShowGarrisonFollowerAbilityTooltip(owner,owner.info.traitID,owner.followerTypeID);return
        elseif owner.info.spellID then
            GameTooltip:SetOwner(owner);GameTooltip:SetSpellByID(owner.info.spellID);GameTooltip:Show();return
        elseif GarrisonFollowerOptions[owner.followerTypeID].displayCounterAbilityInPlaceOfMechanic and owner.info.counterID then
            ShowGarrisonFollowerAbilityTooltip(owner,owner.info.counterID,owner.followerTypeID);return
        end
        local tip=GarrisonMissionMechanicFollowerCounterTooltip
        tip.Icon:SetTexture(owner.info.icon);tip.Name:SetText(owner.info.name)
        tip.Subtitle:SetText("Your followers can counter")
        local height=tip.Title:GetHeight()+tip.Subtitle:GetHeight()+tip.Icon:GetHeight()+28
        if owner.info.showCounters then
            tip.CounterFrom:Show();tip.CounterIcon:Show();tip.CounterName:Show()
            tip.CounterName:SetText(owner.info.counterName)
            height=height+21+tip.CounterFrom:GetHeight()+tip.CounterIcon:GetHeight()
        else tip.CounterFrom:Hide();tip.CounterIcon:Hide();tip.CounterName:Hide() end
        tip:SetHeight(height);tip:Show()
    end
end

function UseNativeResearchPool()
    ResearchTalents={[39]={id=39,name=E.talent.source,description=E.talentTW.source,timeRemaining=17}}
    GarrisonTalentButtonMixin={}
    function GarrisonTalentButtonMixin:OnEnter(skip)
        if skip then return end
        TooltipLines({self.talent.name,self.talent.description,"Time remaining: "..self.talent.timeRemaining},self)
        self.tooltip=GameTooltip
    end
    function GarrisonTalentButtonMixin:Refresh()
        if self.talent and self.talent.id then
            self.talent=C_Garrison.GetTalent(self.talent.id)
            if self.tooltip then self:OnEnter()end
        end
    end
    function C_Garrison.GetTalent(id)return ResearchTalents[id]end
    local function create()
        local button=visible(ScriptFrame())
        -- XML mixins copy the current functions instead of indexing the prototype later.
        button.OnEnter=GarrisonTalentButtonMixin.OnEnter;button.Refresh=GarrisonTalentButtonMixin.Refresh
        button:SetScript("OnEnter",function(self,...)self:OnEnter(...)end)
        return button
    end
    function NewResearchPool()return ReusingPool(create)end
    OrderHallTalentFrame={buttonPool=NewResearchPool()}
    ResearchButton=OrderHallTalentFrame.buttonPool:Acquire();ResearchButton.talent=ResearchTalents[39]
end

function UseNativeFollowerLayout(locale)
    function GetLocale()return locale end
    local nativeFont=locale=="zhCN" and "Fonts\\ARKai_T.TTF" or locale=="zhTW" and "Fonts\\blei00d.TTF" or "Fonts\\FRIZQT__.TTF"
    local function create()
        local entry=box();entry.Name=label("")
        entry.Name.font=nativeFont;entry.Name.size=14;entry.Name.flags=""
        function entry.Name:GetFont()return self.font,self.size,self.flags end
        function entry.Name:SetFont(font,size,flags)
            self.font=font;self.size=size;self.flags=flags;self.fontChanges=self.fontChanges+1
        end
        function entry.Name:SetFontObject(object)
            self.font=nativeFont;self.size=object=="GameFontHighlightMed2" and 14 or 16;self.flags="OUTLINE"
        end
        return entry
    end
    local page=GarrisonMissionFrame.FollowerTab
    page.abilitiesPool=ReusingPool(create)
    page.AbilitiesFrame={}
    function GarrisonFollowerTabMixin:ShowAbilities(info)
        self.abilitiesPool:ReleaseAll()
        for _,ability in ipairs(info.abilities)do
            local entry=self.abilitiesPool:Acquire()
            entry.Name:SetText(ability.name)
            -- This is AFTER SetText in the real ShowAbilities, before its final Layout.
            entry.Name:SetFontObject(self.isLandingPage and "GameFontHighlightMed2" or "GameFontNormalLarge2")
            entry.layoutFont,entry.layoutSize,entry.layoutFlags=entry.Name:GetFont()
            entry.ability=ability;entry:Show()
        end
    end
end
