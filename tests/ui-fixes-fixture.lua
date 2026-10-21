-- Native function bodies from Gethe/wow-ui-source, 7.3.5 commit
-- 67ecbf5ce0e50cc7483c2295caecf410460f0994. No network/cache needed by tests.
-- StaticPopup/Pools/Minimap/OrderHall source hashes are recorded in the UI audit.
function UseResearchConfirmations()
  StaticPopup1=ScriptFrame();StaticPopup1.text=RichWidget('')
  function StaticPopup1:IsShown()return not self.hidden end
  function StaticPopup1:IsForbidden()return self.forbidden end
  function StaticPopup1.text:SetFormattedText(format,...)self.text=string.format(format,...)end
  function StaticPopup_Show(which,message,_,data)
    local p=StaticPopup1;p.which=which;p.data=data
    p.text:SetFormattedText('%s',message);StaticPopup_Resize(p,which)
    return p,nil,3
  end
  function StaticPopup_Resize(p,which)p.resizes=(p.resizes or 0)+1;p.measured=p.text:GetText()end
  ORDER_HALL_RESEARCH_CONFIRMATION='Research %s for %s %s in %s?'
  ORDER_HALL_RESEARCH_CONFIRMATION_NO_TIME='Research %s for %s %s?'
  ORDER_HALL_RESEARCH_CONFIRMATION_NO_COST='Research %s in %s?'
  LE_GARRISON_TALENT_AVAILABILITY_AVAILABLE=1
  function GetCurrencyInfo()return 'Currency',1000,'ResourceTexture' end
  function BreakUpLargeNumbers(value)return tostring(value)end
  function SecondsToTime(value)return tostring(value)..' seconds' end
  function OrderHallTalentFrame:GetResearchingTalentID()return 0 end
  GarrisonTalentButtonMixin={}
function GarrisonTalentButtonMixin:OnClick()
	local researchingTalentID = self:GetParent():GetResearchingTalentID();
	if (researchingTalentID and researchingTalentID ~= 0 and researchingTalentID ~= self.talent.id) then
		UIErrorsFrame:AddMessage(ERR_CANT_DO_THAT_RIGHT_NOW, RED_FONT_COLOR:GetRGBA());
		--return;
	end
	if (self.talent.talentAvailability == LE_GARRISON_TALENT_AVAILABILITY_AVAILABLE) then
		local _, _, currencyTexture = GetCurrencyInfo(self:GetParent().currency);

		local hasCost = self.talent.researchCost and self.talent.researchCost > 0;
		local hasTime = self.talent.researchDuration and self.talent.researchDuration > 0;
		if (hasCost or hasTime) then
			local str;
			if (hasCost and hasTime) then
				str = string.format(ORDER_HALL_RESEARCH_CONFIRMATION, self.talent.name, BreakUpLargeNumbers(self.talent.researchCost), currencyTexture, SecondsToTime(self.talent.researchDuration, false, true));
			elseif (hasCost) then
				str = string.format(ORDER_HALL_RESEARCH_CONFIRMATION_NO_TIME, self.talent.name, BreakUpLargeNumbers(self.talent.researchCost), currencyTexture);
			elseif (hasTime) then
				str = string.format(ORDER_HALL_RESEARCH_CONFIRMATION_NO_COST, self.talent.name, SecondsToTime(self.talent.researchDuration, false, true));
			end
			StaticPopup_Show("ORDER_HALL_TALENT_RESEARCH", str, nil, { id = self.talent.id, hasTime = hasTime, button = self });
		else
			PlaySound(SOUNDKIT.UI_ORDERHALL_TALENT_SELECT);
			C_Garrison.ResearchTalent(self.talent.id);
			self:GetParent():SetResearchingTalentID(self.talent.id);
		end
	end
end
end

function UseMinimapTooltip()
  MinimapZoneTextButton={};MinimapZoneText=RichWidget('')
  function MinimapZoneText:SetTextColor()end
  function GameTooltip:IsOwned(owner)return self.owner==owner end
  function GameTooltip:IsShown()return not self.hidden end
  function GameTooltip:SetOwner(owner)self.owner=owner;self.count=0 end
  function GameTooltip:AddLine(text)
    self.count=self.count+1;_G['GameTooltipTextLeft'..self.count]=RichWidget(text)
  end
  NORMAL_FONT_COLOR={r=1,g=1,b=1}
  MiniZone=Examples.zone.source;MiniSubzone=Examples.subzone.source
  function GetZonePVPInfo()return MiniPVP end
  function GetMinimapZoneText()return MiniZone end
  function GetZoneText()return MiniZone end
  function GetSubZoneText()return MiniSubzone end
function Minimap_SetTooltip( pvpType, factionName )
	if ( GameTooltip:IsOwned(MinimapZoneTextButton) ) then
		GameTooltip:SetOwner(MinimapZoneTextButton, "ANCHOR_LEFT");
		local zoneName = GetZoneText();
		local subzoneName = GetSubZoneText();
		if ( subzoneName == zoneName ) then
			subzoneName = "";
		end
		GameTooltip:AddLine( zoneName, 1.0, 1.0, 1.0 );
		if ( pvpType == "sanctuary" ) then
			GameTooltip:AddLine( subzoneName, 0.41, 0.8, 0.94 );
			GameTooltip:AddLine(SANCTUARY_TERRITORY, 0.41, 0.8, 0.94);
		elseif ( pvpType == "arena" ) then
			GameTooltip:AddLine( subzoneName, 1.0, 0.1, 0.1 );
			GameTooltip:AddLine(FREE_FOR_ALL_TERRITORY, 1.0, 0.1, 0.1);
		elseif ( pvpType == "friendly" ) then
			if (factionName and factionName ~= "") then
				GameTooltip:AddLine( subzoneName, 0.1, 1.0, 0.1 );
				GameTooltip:AddLine(format(FACTION_CONTROLLED_TERRITORY, factionName), 0.1, 1.0, 0.1);
			end
		elseif ( pvpType == "hostile" ) then
			if (factionName and factionName ~= "") then
				GameTooltip:AddLine( subzoneName, 1.0, 0.1, 0.1 );
				GameTooltip:AddLine(format(FACTION_CONTROLLED_TERRITORY, factionName), 1.0, 0.1, 0.1);
			end
		elseif ( pvpType == "contested" ) then
			GameTooltip:AddLine( subzoneName, 1.0, 0.7, 0.0 );
			GameTooltip:AddLine(CONTESTED_TERRITORY, 1.0, 0.7, 0.0);
		elseif ( pvpType == "combat" ) then
			GameTooltip:AddLine( subzoneName, 1.0, 0.1, 0.1 );
			GameTooltip:AddLine(COMBAT_ZONE, 1.0, 0.1, 0.1);
		else
			GameTooltip:AddLine( subzoneName, NORMAL_FONT_COLOR.r, NORMAL_FONT_COLOR.g, NORMAL_FONT_COLOR.b );
		end
		GameTooltip:Show();
	end
end
function Minimap_Update()
	MinimapZoneText:SetText(GetMinimapZoneText());

	local pvpType, isSubZonePvP, factionName = GetZonePVPInfo();
	if ( pvpType == "sanctuary" ) then
		MinimapZoneText:SetTextColor(0.41, 0.8, 0.94);
	elseif ( pvpType == "arena" ) then
		MinimapZoneText:SetTextColor(1.0, 0.1, 0.1);
	elseif ( pvpType == "friendly" ) then
		MinimapZoneText:SetTextColor(0.1, 1.0, 0.1);
	elseif ( pvpType == "hostile" ) then
		MinimapZoneText:SetTextColor(1.0, 0.1, 0.1);
	elseif ( pvpType == "contested" ) then
		MinimapZoneText:SetTextColor(1.0, 0.7, 0.0);
	else
		MinimapZoneText:SetTextColor(NORMAL_FONT_COLOR.r, NORMAL_FONT_COLOR.g, NORMAL_FONT_COLOR.b);
	end

	Minimap_SetTooltip( pvpType, factionName );
end
end

function UseNativeBindingPool()
  ObjectPoolMixin={}
function ObjectPoolMixin:OnLoad(creationFunc, resetterFunc)
	self.creationFunc = creationFunc;
	self.resetterFunc = resetterFunc;

	self.activeObjects = {};
	self.inactiveObjects = {};

	self.numActiveObjects = 0;
end
function ObjectPoolMixin:Acquire()
	local numInactiveObjects = #self.inactiveObjects;
	if numInactiveObjects > 0 then
		local obj = self.inactiveObjects[numInactiveObjects];
		self.activeObjects[obj] = true;
		self.numActiveObjects = self.numActiveObjects + 1;
		self.inactiveObjects[numInactiveObjects] = nil;
		return obj, false;
	end

	local newObj = self.creationFunc(self);
	if self.resetterFunc then
		self.resetterFunc(self, newObj);
	end
	self.activeObjects[newObj] = true;
	self.numActiveObjects = self.numActiveObjects + 1;
	return newObj, true;
end
function ObjectPoolMixin:Release(obj)
	self.inactiveObjects[#self.inactiveObjects + 1] = obj;
	self.activeObjects[obj] = nil;
	self.numActiveObjects = self.numActiveObjects - 1;
	if self.resetterFunc then
		self.resetterFunc(self, obj);
	end
end
function ObjectPoolMixin:ReleaseAll()
	for obj in pairs(self.activeObjects) do
		self:Release(obj);
	end
end
function ObjectPoolMixin:EnumerateActive()
	return pairs(self.activeObjects);
end
function ObjectPoolMixin:EnumerateInactive()
	return ipairs(self.inactiveObjects);
end
  function NativeBindingPool(create)
    local p=setmetatable({}, {__index=ObjectPoolMixin})
    p:OnLoad(create,function()end);return p
  end
end
