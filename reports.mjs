import { AppError } from './ai.mjs';
import { isDate, isTime, nightMinutes } from './domain.mjs';
// Validates the nightly targets saved before each night; coins and reviews compare against them.
export function cleanTargets(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>90)throw new AppError(400,'TARGETS','睡前目標資料有誤。');
  const output={};
  for(const [date,t] of Object.entries(input)){
    if(!isDate(date)||!t||!isTime(t.bedtime)||!Number.isFinite(Date.parse(t.createdAt)))throw new AppError(400,'TARGETS','睡前目標格式有誤。');
    if(nightMinutes(t.bedtime)<1080||nightMinutes(t.bedtime)>1800)throw new AppError(400,'TARGETS','目標上床時間超出支援範圍。');
    output[date]={bedtime:t.bedtime,createdAt:t.createdAt,source:t.source==='gemini'?'gemini':'legacy',reason:typeof t.reason==='string'?t.reason.slice(0,900):''};
  }
  return output;
}
