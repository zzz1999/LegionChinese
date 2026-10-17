-- Legion API contract: UnitCastingInfo has ten returns, and spellcast
-- events pass (unit, spell name, rank, cast execution ID, spell database ID).
activeCasts={};spellNames={};spellLookups={}
function GetLocale() return "zhCN" end
function GetSpellInfo(key) spellLookups[#spellLookups+1]=key;return spellNames[key] end
function UnitCastingInfo(unit)
    local cast=activeCasts[unit]
    if cast and not cast.channel then
        return cast.name,"",cast.text,"icon",cast.start,cast.finish,cast.trade,cast.id,false,cast.apiSpellID
    end
end
function UnitChannelInfo(unit)
    local cast=activeCasts[unit]
    if cast and cast.channel then
        return cast.name,"",cast.text,"icon",cast.start,cast.finish,cast.trade,false,cast.apiSpellID
    end
end
function CastingBarFrame_OnEvent(bar,event,unit,spellName,rank,castID,spellID)
    if event=="PLAYER_ENTERING_WORLD" then
        unit=bar.unit
        local cast=activeCasts[unit]
        event=cast and (cast.channel and "UNIT_SPELLCAST_CHANNEL_START" or "UNIT_SPELLCAST_START") or nil
    end
    if unit~=bar.unit then return end
    if event=="UNIT_SPELLCAST_START" or event=="UNIT_SPELLCAST_CHANNEL_START" then
        local cast=activeCasts[unit]
        if not cast then return end
        bar.Text:SetText(cast.text)
        bar.casting=not cast.channel or nil;bar.channeling=cast.channel or nil
        bar.castID=not cast.channel and cast.id or nil
        bar.value=1;bar.maxValue=5;bar.shown=true;bar.fadeOut=nil
    elseif event=="UNIT_SPELLCAST_STOP" or event=="UNIT_SPELLCAST_CHANNEL_STOP" then
        if event=="UNIT_SPELLCAST_CHANNEL_STOP" or castID==bar.castID then
            bar.casting=nil;bar.channeling=nil;bar.fadeOut=true
        end
    elseif event=="UNIT_SPELLCAST_FAILED" or event=="UNIT_SPELLCAST_INTERRUPTED" then
        if bar.casting and castID==bar.castID then
            bar.Text:SetText(event=="UNIT_SPELLCAST_FAILED" and "失败" or "被打断")
            bar.casting=nil;bar.channeling=nil;bar.fadeOut=true
        end
    end
end
function NewCastBar(unit,forward)
    local bar=ScriptFrame();bar.unit=unit;bar.Text=Widget("");bar.shown=false
    function bar:IsShown() return self.shown end
    -- The player XML binds the function itself; the pet wrapper calls the
    -- global handler. Both are bound BEFORE the addon installs secure hooks.
    if forward then
        bar:SetScript("OnEvent",function(self,...) CastingBarFrame_OnEvent(self,...) end)
    else
        bar:SetScript("OnEvent",CastingBarFrame_OnEvent)
    end
    return bar
end
CastingBarFrame=NewCastBar("player")
PetCastingBarFrame=NewCastBar("pet",true)
TargetCastBar=NewCastBar("target",true)
function StartCast(bar,cast)
    cast.start=cast.start or 1000;cast.finish=cast.finish or 6000;cast.id=cast.id or 77
    activeCasts[bar.unit]=cast
    bar:Fire("OnEvent",cast.channel and "UNIT_SPELLCAST_CHANNEL_START" or "UNIT_SPELLCAST_START",
        bar.unit,cast.name,"",cast.id,cast.spellID)
end
