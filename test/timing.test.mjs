import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDate, canNudge, calendarText } from '../public/timing.js';
test('early-morning reminders belong to the following calendar day',()=>{
  const p={date:'2026-10-15',bedtime:'00:15',bedtimeMinutes:1455};
  const windDown=eventDate(p,-30),bedtime=eventDate(p);
  assert.equal(windDown.getDate(),15);assert.equal(windDown.getHours(),23);assert.equal(windDown.getMinutes(),45);
  assert.equal(bedtime.getDate(),16);assert.equal(bedtime.getHours(),0);
  const text=calendarText([p],new Date('2026-10-15T12:00:00Z'));
  assert.ok(text.includes('DTSTART;TZID=Asia/Taipei:20261015T234500'));
  assert.ok(text.includes('DTSTART;TZID=Asia/Taipei:20261016T001500'));
  assert.equal((text.match(/BEGIN:VEVENT/g)||[]).length,3);assert.ok(text.endsWith('\r\n'));
});
test('active-page intervention respects visibility, activity, snooze, time and once-per-night',()=>{
  const p={date:'2026-10-15',bedtime:'01:00',bedtimeMinutes:1500};
  const now=new Date('2026-10-16T00:31:00').getTime();
  const setup={enabled:true,visible:true,flow:'home',handled:false,snoozedUntil:0,lastActivity:now,point:p,now};
  assert.equal(canNudge(setup),true);
  for(const patch of [{enabled:false},{visible:false},{flow:'chat'},{handled:true},{snoozedUntil:now+1000},{lastActivity:now-6*60000},{now:now-2*60000},{now:now+5*3600000}])assert.equal(canNudge({...setup,...patch}),false);
});
