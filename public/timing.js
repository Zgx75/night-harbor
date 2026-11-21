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
