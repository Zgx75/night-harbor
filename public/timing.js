export function eventDate(point, offset = 0) {
  const date = new Date(point.date + 'T00:00:00');
  date.setMinutes(point.bedtimeMinutes + offset);
  return date;
}
export function canNudge({ enabled, visible, flow, handled, snoozedUntil, lastActivity, point, now }) {
  if (!enabled || !visible || flow !== 'home' || handled || !point || now < snoozedUntil || now - lastActivity > 5 * 60000) return false;
  const delta = now - eventDate(point, -30).getTime();
  return delta >= 0 && delta < 4 * 3600000;
}
export function calendarText(points, now = new Date()) {
  const stamp = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`;
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Night Harbor//Evening Plan//ZH-TW','CALSCALE:GREGORIAN','X-WR-CALNAME:夜泊收尾提醒','X-WR-TIMEZONE:Asia/Taipei'];
  const utcStamp = now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  points.forEach(p => [[-30,'留一點時間給自己：開始收心'],[-15,'把燈光調暗，慢慢收尾'],[0,'今晚先到這裡，準備就寢']].forEach(([offset,title]) => {
    const start = eventDate(p,offset), end = new Date(start.getTime()+5*60000);
    lines.push('BEGIN:VEVENT',`UID:night-harbor-${p.date}-${p.bedtime.replace(':','')}-${offset}@localhost`,`DTSTAMP:${utcStamp}`,`DTSTART;TZID=Asia/Taipei:${stamp(start)}`,`DTEND;TZID=Asia/Taipei:${stamp(end)}`,`SUMMARY:${title}`,'DESCRIPTION:夜泊的暫定作息提醒。更新路徑後請刪除舊行程再匯入，避免重複。','BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY',`DESCRIPTION:${title}`,'END:VALARM','END:VEVENT');
  }));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n')+'\r\n';
}
