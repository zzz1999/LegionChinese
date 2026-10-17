units={player={guid="Player-1-000001",name="Fireball"}}
playerClass="WARLOCK";petRenameable=true;clockTime=10
function GetTime() return clockTime end
function UnitGUID(unit) return units[unit] and units[unit].guid end
function UnitName(unit) return units[unit] and units[unit].name end
function UnitClass() return playerClass,playerClass end
function UnitCreatureFamily(unit) return units[unit] and units[unit].family end
function PetCanBeRenamed() return petRenameable end
function UnitFrame_Update(frame)
    frame.name:SetText(UnitName(frame.overrideName or frame.unit))
    return "native-result"
end
function UnitFrame_OnEvent(frame,event,unit)
    if event=="UNIT_NAME_UPDATE" and unit==frame.unit then frame.name:SetText(UnitName(unit)) end
end
function CompactUnitFrame_UpdateName(frame) frame.name:SetText(UnitName(frame.unit)) end
function NewUnitFrame(unit)
    local frame=ScriptFrame();frame.unit=unit;frame.name=Widget("")
    frame:SetScript("OnEvent",UnitFrame_OnEvent)
    return frame
end
PetFrame=NewUnitFrame("pet");TargetFrame=NewUnitFrame("target");FocusFrame=NewUnitFrame("focus")
GameTooltip=ScriptFrame();GameTooltipTextLeft1=Widget("")
function GameTooltip:GetUnit() return UnitName(self.unit),self.unit end
function ShowUnitTooltip(unit)
    GameTooltip.unit=unit;GameTooltipTextLeft1:SetText(UnitName(unit));GameTooltip:Fire("OnTooltipSetUnit")
end
function SetPet(name,family,entry)
    local pet={guid="Pet-0-1-1-1-"..(entry or 416).."-000001",name=name,family=family}
    units.pet=pet;units.target=pet;units.focus=pet
    UnitFrame_Update(PetFrame);UnitFrame_Update(TargetFrame);UnitFrame_Update(FocusFrame)
    return pet
end
function CombatEvent(event,sourceGUID,destGUID)
    frames[2]:Fire("OnEvent","COMBAT_LOG_EVENT_UNFILTERED",clockTime,event,false,sourceGUID,"source",0,0,destGUID,"dest",0,0)
end
