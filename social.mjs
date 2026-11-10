import { randomBytes, randomUUID } from 'node:crypto';
import { AppError } from './ai.mjs';
import { createEconomy, normaliseEconomy, petTransaction, addDays, nightInstant } from './public/progress.js';
import { MILESTONES, rewardFacts, rewardSummary, taipeiDate, socialNight } from './rewards.mjs';

const fail=(status,code,message)=>{throw new AppError(status,code,message);};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(400,'SOCIAL_INPUT',`${label}請填 1 到 ${max} 個字。`);return value.trim();};
const id=value=>text(value,100,'識別碼');
function changePet(e,event,at){try{return petTransaction(e,event,at);}catch(error){fail(400,'PET_INPUT',error.message);}}
export function createSocialStore({ db, now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (sender TEXT NOT NULL REFERENCES users(id), receiver TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('pending','accepted')), created_at INTEGER NOT NULL, PRIMARY KEY(sender,receiver), CHECK(sender<>receiver));
    CREATE TABLE IF NOT EXISTS social_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id), share_status INTEGER NOT NULL DEFAULT 0, share_leaderboard INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'awake', status_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pet_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), invite_code TEXT NOT NULL UNIQUE, economy TEXT NOT NULL, created_at INTEGER NOT NULL, closed_at INTEGER);
    CREATE TABLE IF NOT EXISTS group_members (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES pet_groups(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at INTEGER NOT NULL, left_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_group ON group_members(user_id) WHERE left_at IS NULL;
    CREATE INDEX IF NOT EXISTS group_roster ON group_members(group_id,left_at);
    CREATE TABLE IF NOT EXISTS personal_rewards (user_id TEXT NOT NULL REFERENCES users(id), event_key TEXT NOT NULL, type TEXT NOT NULL, night TEXT, amount INTEGER NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,event_key));
    CREATE TABLE IF NOT EXISTS reward_migrations (user_id TEXT PRIMARY KEY REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS group_rewards (group_id TEXT NOT NULL REFERENCES pet_groups(id), event_key TEXT NOT NULL, amount INTEGER NOT NULL, night TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(group_id,event_key));
    CREATE TABLE IF NOT EXISTS social_checkins (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,day));
    CREATE TABLE IF NOT EXISTS checkin_encouragements (checkin_id TEXT NOT NULL REFERENCES social_checkins(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(checkin_id,user_id));
    CREATE TABLE IF NOT EXISTS goodnight_nudges (id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), receiver TEXT NOT NULL REFERENCES users(id), night TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER, UNIQUE(sender,receiver,night));
  `);
  const user=uid=>db.prepare('SELECT id,username,display_name AS displayName FROM users WHERE id=?').get(uid);
  const profile=uid=>JSON.parse(db.prepare('SELECT payload FROM profiles WHERE user_id=?').get(uid)?.payload||'{}');
  const pref=uid=>db.prepare('SELECT * FROM social_preferences WHERE user_id=?').get(uid)||{share_status:0,share_leaderboard:0,status:'awake',status_at:0};
  const roster=gid=>db.prepare('SELECT m.*,u.username,u.display_name AS displayName FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND m.left_at IS NULL ORDER BY m.joined_at,m.rowid').all(gid);
  const membership=uid=>db.prepare('SELECT g.* FROM pet_groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=? AND m.left_at IS NULL AND g.closed_at IS NULL').get(uid);
  function transaction(fn) { db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;} }
  const friendRow=(a,b)=>db.prepare('SELECT * FROM friendships WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)').get(a,b,b,a);
  function requireFriend(a,b){if(friendRow(a,b)?.state!=='accepted')fail(403,'FRIEND_REQUIRED','需要先成為好友。');}
  function groupFor(uid) {const group=membership(uid);if(!group)fail(403,'GROUP_REQUIRED','請先加入共養小組。');return group;}
  function visibleStatus(uid) {const p=pref(uid);return {shared:Boolean(p.share_status),status:p.share_status&&now()-p.status_at<18*3600000?p.status:'unknown',updatedAt:p.share_status?p.status_at:null};}
  function audience(uid) {
    const result=new Set([uid]);
    for(const f of db.prepare("SELECT sender,receiver FROM friendships WHERE state='accepted' AND (sender=? OR receiver=?)").all(uid,uid))result.add(f.sender===uid?f.receiver:f.sender);
    const group=membership(uid);if(group)for(const m of roster(group.id))result.add(m.user_id);
    return result;
  }
  function settleGroup(group) {
    const history=db.prepare('SELECT * FROM group_members WHERE group_id=?').all(group.id), nights=new Set();
    for(const member of history)for(const fact of rewardFacts(profile(member.user_id),now())) {
      const cutoff=nightInstant(fact.night,1080);
      if(cutoff<member.joined_at||(member.left_at!==null&&cutoff>=member.left_at))continue;
      nights.add(fact.night);
      if(fact.amount)db.prepare('INSERT INTO group_rewards VALUES(?,?,?,?,?) ON CONFLICT(group_id,event_key) DO UPDATE SET amount=excluded.amount WHERE excluded.amount>group_rewards.amount').run(group.id,`member:${member.user_id}:${fact.night}`,fact.onTime?10:5,fact.night,now());
    }
    for(const night of nights) {
      const cutoff=nightInstant(night,1080), cohort=history.filter(m=>m.joined_at<=cutoff&&(m.left_at===null||m.left_at>cutoff));
      if(cohort.length<2)continue;
      if(cohort.every(m=>rewardFacts(profile(m.user_id),now()).some(f=>f.night===night&&f.onTime)))db.prepare('INSERT OR IGNORE INTO group_rewards VALUES(?,?,?,?,?)').run(group.id,`all:${night}`,20,night,now());
    }
  }
  function reconcile(uid, value, previous) {
    // Only the first server settlement imports rewards already stored before this feature.
    if(!db.prepare('SELECT 1 FROM reward_migrations WHERE user_id=?').get(uid)) {
      for(const credit of normaliseEconomy(previous.economy).credits)db.prepare('INSERT OR IGNORE INTO personal_rewards VALUES(?,?,?,?,?,?,?)').run(uid,`night:${credit.night}`,'on-time',credit.night,20,JSON.stringify(credit),now());
      db.prepare('INSERT INTO reward_migrations VALUES(?)').run(uid);
    }
    if(value.economy.pet)for(const fact of rewardFacts(value,now()))if(fact.amount) {
      db.prepare(`INSERT INTO personal_rewards VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,event_key) DO UPDATE SET type=excluded.type,amount=excluded.amount,detail=excluded.detail WHERE excluded.amount>personal_rewards.amount`).run(uid,`night:${fact.night}`,fact.type,fact.night,fact.amount,JSON.stringify(fact),now());
    }
    const summary=rewardSummary(value,now());
    if(value.economy.pet)for(const milestone of MILESTONES)if(summary.longestStreak>=milestone.days)db.prepare('INSERT OR IGNORE INTO personal_rewards VALUES(?,?,?,?,?,?,?)').run(uid,`streak:${milestone.days}`,'streak',null,milestone.amount,JSON.stringify(milestone),now());
    const rewards=db.prepare('SELECT * FROM personal_rewards WHERE user_id=? ORDER BY created_at,event_key').all(uid);
    value.economy.credits=rewards.filter(r=>r.type==='on-time').map(r=>({...JSON.parse(r.detail),night:r.night,amount:20,earnedAt:new Date(r.created_at).toISOString()}));
    value.economy.bonusCredits=rewards.filter(r=>r.type!=='on-time').map(r=>({id:r.event_key,type:r.type,night:r.night,amount:r.amount,at:r.created_at,badge:JSON.parse(r.detail).badge||null}));
    return value;
  }
  function afterProfileSave(uid) {
    // A departed member may still complete a report for a night they belonged to the team.
    const groups=db.prepare('SELECT DISTINCT g.* FROM pet_groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=? AND g.closed_at IS NULL').all(uid);
    for(const group of groups)settleGroup(group);
  }
  function groupView(uid) {
    const g=membership(uid);if(!g)return null;
    const e=normaliseEconomy(JSON.parse(g.economy));
    const credits=db.prepare('SELECT event_key,amount,night FROM group_rewards WHERE group_id=? ORDER BY night DESC,event_key LIMIT 30').all(g.id);
    const earned=Number(db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM group_rewards WHERE group_id=?').get(g.id).n);
    return {id:g.id,name:g.name,ownerId:g.owner_id,inviteCode:g.invite_code,members:roster(g.id).map(m=>({id:m.user_id,username:m.username,displayName:m.displayName,...visibleStatus(m.user_id)})),economy:e,balance:earned-e.transactions.reduce((s,t)=>s+t.cost,0),earned,rewards:credits};
  }
  function wall(uid) {
    const allowed=[...audience(uid)], rows=db.prepare(`SELECT c.*,u.username,u.display_name AS displayName FROM social_checkins c JOIN users u ON u.id=c.user_id WHERE c.user_id IN (${allowed.map(()=>'?').join(',')}) ORDER BY c.created_at DESC,c.id DESC LIMIT 40`).all(...allowed);
    return rows.map(r=>({id:r.id,userId:r.user_id,username:r.username,displayName:r.displayName,day:r.day,note:r.note,createdAt:r.created_at,encouragements:Number(db.prepare('SELECT COUNT(*) AS n FROM checkin_encouragements WHERE checkin_id=?').get(r.id).n),encouraged:Boolean(db.prepare('SELECT 1 FROM checkin_encouragements WHERE checkin_id=? AND user_id=?').get(r.id,uid))}));
  }
  function leaderboard(uid,scope='friends',metric='onTime') {
    if(!['friends','group'].includes(scope)||!['onTime','improvement','streak'].includes(metric))fail(400,'SOCIAL_INPUT','排行榜選項有誤。');
    let ids;
    if(scope==='group'){const g=membership(uid);ids=g?roster(g.id).map(m=>m.user_id):[];}
    else ids=[uid,...db.prepare("SELECT sender,receiver FROM friendships WHERE state='accepted' AND (sender=? OR receiver=?)").all(uid,uid).map(f=>f.sender===uid?f.receiver:f.sender)];
    const key=metric==='streak'?'currentStreak':metric;
    const rows=ids.filter(other=>other===uid||pref(other).share_leaderboard).map(other=>({...user(other),...rewardSummary(profile(other),now())}));
    rows.sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity)||a.username.localeCompare(b.username));
    let rank=0,last;
    return {scope,metric,start:addDays(taipeiDate(now()),-6),end:taipeiDate(now()),rows:rows.map((r,i)=>{const score=r[key];if(score!==last){rank=i+1;last=score;}return {...r,rank:score===null?null:rank};})};
  }
  function dashboard(uid) {
    const mine=pref(uid),requests=db.prepare('SELECT * FROM friendships WHERE sender=? OR receiver=? ORDER BY created_at DESC').all(uid,uid);
    return {preferences:{shareStatus:Boolean(mine.share_status),shareLeaderboard:Boolean(mine.share_leaderboard)},status:visibleStatus(uid),
      friends:requests.filter(f=>f.state==='accepted').map(f=>{const other=f.sender===uid?f.receiver:f.sender;return {...user(other),...visibleStatus(other)};}),
      requests:requests.filter(f=>f.state==='pending').map(f=>({...user(f.sender===uid?f.receiver:f.sender),direction:f.sender===uid?'outgoing':'incoming'})),
      group:groupView(uid),wall:wall(uid),rewards:{...rewardSummary(profile(uid),now()),bonuses:profile(uid).economy?.bonusCredits||[],milestones:MILESTONES},
      notifications:db.prepare('SELECT n.id,n.created_at AS createdAt,n.read_at AS readAt,u.display_name AS displayName,u.username FROM goodnight_nudges n JOIN users u ON u.id=n.sender WHERE n.receiver=? ORDER BY n.created_at DESC LIMIT 20').all(uid)};
  }
  function search(uid, query) {
    if(typeof query!=='string'||!/^[A-Za-z0-9_]{3,24}$/.test(query))fail(400,'SOCIAL_INPUT','請輸入至少 3 個帳號字元。');
    return {users:db.prepare('SELECT id,username,display_name AS displayName FROM users WHERE username LIKE ? ESCAPE \'!\' AND id<>? ORDER BY username LIMIT 10').all(query.toLowerCase().replaceAll('_','!_')+'%',uid).map(u=>({...u,relationship:friendRow(uid,u.id)?.state||'none'}))};
  }
  function mutate(uid, operation, data) {
    return transaction(()=>{
      if(operation==='friends/request') {
        const username=text(data.username,24,'好友帳號').toLowerCase();
        const target=db.prepare('SELECT id FROM users WHERE username=?').get(username);
        if(!target)fail(404,'USER_NOT_FOUND','找不到這個帳號。');
        if(target.id===uid)fail(400,'SOCIAL_INPUT','不能加自己為好友。');
        if(friendRow(uid,target.id))fail(409,'FRIEND_EXISTS','已是好友或已有待處理邀請。');
        db.prepare("INSERT INTO friendships VALUES(?,?,'pending',?)").run(uid,target.id,now());
      } else if(operation==='friends/respond') {
        const other=id(data.userId), f=friendRow(uid,other);
        if(!f||f.state!=='pending'||f.receiver!==uid)fail(403,'INVITATION_REQUIRED','只能回覆別人寄給你的邀請。');
        if(!['accept','decline'].includes(data.action))fail(400,'SOCIAL_INPUT','邀請操作有誤。');
        if(data.action==='accept')db.prepare("UPDATE friendships SET state='accepted' WHERE sender=? AND receiver=?").run(other,uid);
        else db.prepare('DELETE FROM friendships WHERE sender=? AND receiver=?').run(other,uid);
      } else if(operation==='friends/remove') {
        const other=id(data.userId);db.prepare('DELETE FROM friendships WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)').run(uid,other,other,uid);
      } else if(operation==='groups/create') {
        if(membership(uid))fail(409,'GROUP_EXISTS','每個帳號只能參加一個共養小組。');
        const name=text(data.name,24,'小組名稱'),pet=changePet(createEconomy(),{type:'adopt',id:data.petId||'cat',name:text(data.petName,16,'寵物名字')},now());
        const gid=randomUUID();db.prepare('INSERT INTO pet_groups VALUES(?,?,?,?,?,?,NULL)').run(gid,name,uid,randomBytes(5).toString('hex').toUpperCase(),JSON.stringify(pet),now());
        db.prepare('INSERT INTO group_members VALUES(?,?,?,?,NULL)').run(randomUUID(),gid,uid,now());
      } else if(operation==='groups/join') {
        if(membership(uid))fail(409,'GROUP_EXISTS','請先離開目前的小組。');
        const code=text(data.code,20,'邀請碼').toUpperCase(),g=db.prepare('SELECT * FROM pet_groups WHERE invite_code=? AND closed_at IS NULL').get(code);
        if(!g)fail(404,'GROUP_NOT_FOUND','邀請碼無效或小組已結束。');
        if(roster(g.id).length>=5)fail(409,'GROUP_FULL','這個小組已滿五人。');
        db.prepare('INSERT INTO group_members VALUES(?,?,?,?,NULL)').run(randomUUID(),g.id,uid,now());
      } else if(operation==='groups/leave'||operation==='groups/kick') {
        const g=groupFor(uid),who=operation==='groups/leave'?uid:id(data.userId);
        if(operation==='groups/kick'&&(g.owner_id!==uid||who===uid))fail(403,'OWNER_REQUIRED','只有組長可以移除其他成員。');
        if(!roster(g.id).some(m=>m.user_id===who))fail(404,'MEMBER_NOT_FOUND','找不到這位小組成員。');
        settleGroup(g);
        db.prepare('UPDATE group_members SET left_at=? WHERE group_id=? AND user_id=? AND left_at IS NULL').run(now(),g.id,who);
        const remaining=roster(g.id);
        if(!remaining.length)db.prepare('UPDATE pet_groups SET closed_at=? WHERE id=?').run(now(),g.id);
        else if(g.owner_id===who)db.prepare('UPDATE pet_groups SET owner_id=? WHERE id=?').run(remaining[0].user_id,g.id);
      } else if(operation==='groups/rotate') {
        const g=groupFor(uid);if(g.owner_id!==uid)fail(403,'OWNER_REQUIRED','只有組長可以更新邀請碼。');
        db.prepare('UPDATE pet_groups SET invite_code=? WHERE id=?').run(randomBytes(5).toString('hex').toUpperCase(),g.id);
      } else if(operation==='groups/pet') {
        const g=groupFor(uid);settleGroup(g);
        if(!['feed','buy','equip','adopt'].includes(data.type))fail(400,'SOCIAL_INPUT','寵物操作有誤。');
        if(data.type==='adopt'&&g.owner_id!==uid)fail(403,'OWNER_REQUIRED','只有組長可以更換共養寵物。');
        const e=normaliseEconomy(JSON.parse(g.economy)),earned=Number(db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM group_rewards WHERE group_id=?').get(g.id).n);
        e.credits=[];e.bonusCredits=[{id:'group-funds',type:'group',amount:earned}];
        const changed=changePet(e,{type:data.type,id:data.id,name:data.name},now());
        changed.bonusCredits=[];db.prepare('UPDATE pet_groups SET economy=? WHERE id=?').run(JSON.stringify(changed),g.id);
      } else if(operation==='preferences') {
        if(typeof data.shareStatus!=='boolean'||typeof data.shareLeaderboard!=='boolean')fail(400,'SOCIAL_INPUT','分享設定格式有誤。');
        db.prepare('INSERT INTO social_preferences(user_id,share_status,share_leaderboard) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET share_status=excluded.share_status,share_leaderboard=excluded.share_leaderboard').run(uid,Number(data.shareStatus),Number(data.shareLeaderboard));
      } else if(operation==='status') {
        if(!['awake','sleeping','up'].includes(data.status))fail(400,'SOCIAL_INPUT','請選擇有效狀態。');
        db.prepare('INSERT INTO social_preferences(user_id,status,status_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,status_at=excluded.status_at').run(uid,data.status,now());
      } else if(operation==='nudges') {
        const target=id(data.userId);requireFriend(uid,target);
        db.prepare('INSERT OR IGNORE INTO goodnight_nudges VALUES(?,?,?,?,?,NULL)').run(randomUUID(),uid,target,socialNight(now()),now());
      } else if(operation==='notifications/read') {
        db.prepare('UPDATE goodnight_nudges SET read_at=? WHERE receiver=?').run(now(),uid);
      } else if(operation==='checkins') {
        const today=taipeiDate(now()),p=profile(uid),row=(p.records||[]).find(r=>r.date===today);
        if(!row||!rewardFacts(p,now()).some(r=>r.date===today))fail(400,'RECORD_REQUIRED','請先保存今天的早晨上床回報，再發布打卡。');
        if(typeof data.note!=='string'||data.note.trim().length>140)fail(400,'SOCIAL_INPUT','打卡短句最多 140 個字。');
        db.prepare('INSERT INTO social_checkins VALUES(?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET note=excluded.note').run(randomUUID(),uid,today,data.note.trim(),now());
      } else if(operation==='checkins/delete') {
        const result=db.prepare('DELETE FROM social_checkins WHERE id=? AND user_id=?').run(id(data.id),uid);
        if(!result.changes)fail(404,'CHECKIN_NOT_FOUND','找不到自己的這則打卡。');
      } else if(operation==='checkins/encourage') {
        const post=db.prepare('SELECT * FROM social_checkins WHERE id=?').get(id(data.id));
        if(!post||!audience(uid).has(post.user_id))fail(404,'CHECKIN_NOT_FOUND','找不到可觀看的打卡。');
        if(typeof data.active!=='boolean')fail(400,'SOCIAL_INPUT','鼓勵操作格式有誤。');
        if(data.active)db.prepare('INSERT OR IGNORE INTO checkin_encouragements VALUES(?,?)').run(post.id,uid);
        else db.prepare('DELETE FROM checkin_encouragements WHERE checkin_id=? AND user_id=?').run(post.id,uid);
      } else fail(404,'NOT_FOUND','找不到這個社群操作。');
      return dashboard(uid);
    });
  }
  return { dashboard, search, leaderboard, reconcile, afterProfileSave, mutate };
}
