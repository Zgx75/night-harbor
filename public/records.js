// The browser and API use the same validation, including when the phone is offline.
export const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const minutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export const nightMinutes = s => minutes(s) < 720 ? minutes(s) + 1440 : minutes(s);
function invalid(message) { throw Object.assign(new Error(message), { code: 'RECORDS' }); }
export function cleanRecords(input = []) {
  if (!Array.isArray(input) || input.length > 60) invalid('最多使用最近 60 筆紀錄。');
  const dates = new Set();
  return input.map(r => {
    if (!r || !isDate(r.date) || dates.has(r.date)) invalid('紀錄日期有誤或重複。');
    dates.add(r.date);
    const row = { date: r.date };
    for (const k of ['bedAt', 'sleepAt', 'wakeAt', 'caffeineAt', 'exerciseAt']) {
      if (r[k] && !isTime(r[k])) invalid('請檢查時間格式。');
      row[k] = r[k] || '';
    }
    for (const k of ['fatigue', 'mood', 'sleepQuality']) {
      const n = r[k] == null || r[k] === '' ? null : Number(r[k]);
      if (n !== null && (!Number.isInteger(n) || n < 1 || n > 5)) invalid('心情與疲勞度為 1 到 5。');
      row[k] = n;
    }
    if (!['', 'light', 'moderate', 'vigorous'].includes(r.exerciseIntensity || '')) invalid('運動強度有誤。');
    row.exerciseIntensity = r.exerciseIntensity || '';
    for (const [key,max] of [['screenMinutes',60],['napMinutes',180]]) {
      const n=r[key]==null||r[key]===''?null:Number(r[key]);
      if(n!==null&&(!Number.isInteger(n)||n<0||n>max))invalid(`${key==='screenMinutes'?'睡前螢幕':'午睡'}分鐘數有誤。`);
      row[key]=n;
    }
    row.insomnia=r.insomnia||'unknown';
    if(!['yes','no','unknown'].includes(row.insomnia))invalid('請選擇是否有難入睡或夜醒。');
    if(row.bedAt&&(nightMinutes(row.bedAt)<1080||nightMinutes(row.bedAt)>1800))invalid('上床時間請填晚間 18:00 到隔天 06:00。');
    if(row.bedAt&&row.sleepAt&&nightMinutes(row.sleepAt)<nightMinutes(row.bedAt))invalid('大約入睡時間不應早於上床時間。');
    return row;
  }).sort((a, b) => a.date.localeCompare(b.date));
}
