
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var newId=function(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,9)};
function lsGet(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function P(x){return Promise.resolve(x)}
function use(n){try{return window.claude&&window.claude.use?Promise.resolve(window.claude.use(n)).catch(function(){return null}):Promise.resolve(null)}catch(e){return Promise.resolve(null)}}
var toastTimer=null;
function toast(msg){var t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.hidden=true},3800)}
function setStatus(id,msg,err){var el=$(id);el.textContent=msg||'';el.classList.toggle('err',!!err)}
function pad(n){return n<10?'0'+n:''+n}
function clock(ms){var s=Math.max(0,Math.floor(ms/1000));return pad(Math.floor(s/3600))+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60)}
function mmss(ms){var s=Math.max(0,Math.floor(ms/1000));var h=Math.floor(s/3600),m=Math.floor(s/60)%60;return h?h+':'+pad(m)+':'+pad(s%60):m+':'+pad(s%60)}
function hm(ms){var m=Math.round(ms/60000);var h=Math.floor(m/60);return h?(h+'h '+(m%60)+'m'):(m+'m')}
function dayKey(ts){var d=new Date(ts);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function fmtSize(b){return b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB'}

/* ---------- preferences (follow the account) ---------- */
var DEFAULTS={branch:'',nick:'',skin:'auto',accent:'',density:'cozy',font:'chunky',hide:{},squad:true,goal:4};
var SKINS=[
  {id:'auto',label:'Auto',dots:['#F3EFFF','#6B4CFF','#C8FF3A']},
  {id:'lime',label:'Lime Shock',dots:['#F3EFFF','#6B4CFF','#C8FF3A']},
  {id:'night',label:'Night Shift',dots:['#0F0D1A','#9C86FF','#C8FF3A']},
  {id:'bubble',label:'Bubblegum',dots:['#FFE8F2','#FF3D8B','#4DE3FF']},
  {id:'matcha',label:'Matcha',dots:['#E6F3DA','#1E7F4F','#FFD93B']},
  {id:'mono',label:'Mono',dots:['#F2F2F2','#0A0A0A','#FFE600']}
];
var LEVELS=[{n:'Backbencher',min:0},{n:'Chai Tapri Regular',min:300},{n:'Jugaadu',min:1200},{n:'Library Resident',min:3000},{n:'Gold Medalist',min:6000},{n:"Dean's Favourite",min:12000}];
var prefs=Object.assign({},DEFAULTS,lsGet('sd_prefs2',{}));
if(!prefs.hide||typeof prefs.hide!=='object')prefs.hide={};

var data={sessions:[],library:[]};
var CFG=window.LOCKED_IN_CONFIG||{};
var sb=null,myUid=null,sessionsLoaded=false,boardRows=[],lastBoardKey='';
var configured=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&String(CFG.SUPABASE_URL).indexOf('YOUR_')<0&&window.supabase);
if(configured){sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}
function sortSessions(){data.sessions.sort(function(a,b){return (b.startedAt||0)-(a.startedAt||0)})}
function sortLibrary(){data.library.sort(function(a,b){return (b.added||0)-(a.added||0)})}
function put(coll,obj){
  if(!sb||!myUid)return Promise.reject(new Error('signed out'));
  return P(sb.from(coll).upsert({id:obj.id,user_id:myUid,data:obj})).then(function(r){
    if(r.error)throw r.error;
    data[coll]=data[coll].filter(function(x){return x.id!==obj.id}).concat([obj]);
    if(coll==='sessions')sortSessions();else sortLibrary();
    renderAll();
  });
}
function remove(coll,id){
  if(!sb||!myUid)return Promise.reject(new Error('signed out'));
  return P(sb.from(coll).delete().eq('id',id)).then(function(r){
    if(r.error)throw r.error;
    data[coll]=data[coll].filter(function(x){return x.id!==id});renderAll();
  });
}
function rowsToData(rows){return (rows||[]).map(function(x){var o=x.data||{};o.id=x.id;return o})}
function loadBoard(){
  if(!sb||!myUid)return Promise.resolve();
  return P(sb.from('board').select('user_id,nick,week_ms,streak,xp').order('week_ms',{ascending:false}).limit(50)).then(function(r){
    if(r.error)return;
    boardRows=(r.data||[]).map(function(x){return {id:x.user_id,nick:x.nick,weekMs:x.week_ms,streak:x.streak,xp:x.xp}});
    renderSquad();
  });
}
function loadAll(){
  return Promise.all([
    P(sb.from('sessions').select('id,data').order('created_at',{ascending:false}).limit(1000)),
    P(sb.from('library').select('id,data').order('created_at',{ascending:false}).limit(1000)),
    P(sb.from('prefs').select('data').eq('user_id',myUid).maybeSingle())
  ]).then(function(r){
    if(r[0].error)throw r[0].error;
    if(r[1].error)throw r[1].error;
    data.sessions=rowsToData(r[0].data);data.library=rowsToData(r[1].data);
    sortSessions();sortLibrary();sessionsLoaded=true;
    if(r[2].data&&r[2].data.data){
      prefs=Object.assign({},DEFAULTS,r[2].data.data);
      if(!prefs.hide||typeof prefs.hide!=='object')prefs.hide={};
      lsSet('sd_prefs2',prefs);
    }
    applyPrefs();renderAll();
    return loadBoard();
  });
}
function savePrefs(patch,persist){
  prefs=Object.assign({},prefs,patch);
  lsSet('sd_prefs2',prefs);applyPrefs();
  if(persist!==false&&sb&&myUid){
    P(sb.from('prefs').upsert({user_id:myUid,data:prefs,updated_at:new Date().toISOString()})).then(function(r){if(r.error)toast('Could not save your settings.')});
  }
  syncBoard();
}
function readable(hex){
  var n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return (0.299*r+0.587*g+0.114*b)>150?'#15112B':'#FFFFFF';
}
var curTab=lsGet('sd_tab2','home');
function showTab(t){
  if(prefs.hide&&prefs.hide[t])t='home';
  curTab=t;
  if(t==='squad'&&sb&&myUid)loadBoard();
  $$('.dk').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===t?'true':'false')});
  $$('.pane').forEach(function(p){p.hidden=p.id!=='pane-'+t});
  lsSet('sd_tab2',t);
}
$$('.dk').forEach(function(b){b.addEventListener('click',function(){showTab(b.dataset.tab)})});

function applyPrefs(){
  var r=document.documentElement;
  if(prefs.skin&&prefs.skin!=='auto')r.setAttribute('data-skin',prefs.skin);else r.removeAttribute('data-skin');
  r.setAttribute('data-font',prefs.font==='clean'?'clean':'chunky');
  r.setAttribute('data-density',prefs.density==='compact'?'compact':'cozy');
  if(/^#[0-9a-f]{6}$/i.test(prefs.accent||'')){r.style.setProperty('--p',prefs.accent);r.style.setProperty('--p-fg',readable(prefs.accent))}
  else{r.style.removeProperty('--p');r.style.removeProperty('--p-fg')}
  $('#greet').innerHTML='yo, <mark>'+esc(prefs.nick||'you')+'</mark>';
  ['shelf','pdf','ask','squad'].forEach(function(k){var b=$('.dk[data-tab="'+k+'"]');if(b)b.hidden=!!prefs.hide[k]});
  var goal=parseFloat(prefs.goal);if(goal>0){goalH=goal;$('#goal').value=goal}
  syncSettings();
  if(typeof syncAsk==='function')syncAsk();
  showTab(curTab);
  renderStats();
}
function syncSettings(){
  if(document.activeElement!==$('#set-nick'))$('#set-nick').value=prefs.nick||'';
  $$('#skins .sw').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===(prefs.skin||'auto'))});
  $('#set-accent').value=/^#[0-9a-f]{6}$/i.test(prefs.accent||'')?prefs.accent:'#6b4cff';
  $$('#set-font .chip').forEach(function(c){c.setAttribute('aria-pressed',c.dataset.v===prefs.font)});
  $$('#set-density .chip').forEach(function(c){c.setAttribute('aria-pressed',c.dataset.v===prefs.density)});
  ['shelf','pdf','ask','squad'].forEach(function(k){$('#sec-'+k).checked=!prefs.hide[k]});
  $('#opt-squad').checked=!!prefs.squad;
}
$('#skins').innerHTML=SKINS.map(function(s){
  return '<button class="sw" data-v="'+s.id+'" aria-pressed="false"><span class="dots">'+s.dots.map(function(c){return '<i style="background:'+c+'"></i>'}).join('')+'</span>'+esc(s.label)+'</button>';
}).join('');
$('#skins').addEventListener('click',function(e){var b=e.target.closest('.sw');if(b)savePrefs({skin:b.dataset.v})});
$('#set-font').addEventListener('click',function(e){var b=e.target.closest('.chip');if(b)savePrefs({font:b.dataset.v})});
$('#set-density').addEventListener('click',function(e){var b=e.target.closest('.chip');if(b)savePrefs({density:b.dataset.v})});
$('#set-nick').addEventListener('change',function(){savePrefs({nick:this.value.trim().slice(0,24)})});
$('#set-accent').addEventListener('input',function(){savePrefs({accent:this.value},false)});
$('#set-accent').addEventListener('change',function(){savePrefs({accent:this.value})});
$('#set-accent-reset').addEventListener('click',function(){savePrefs({accent:''})});
['shelf','pdf','ask','squad'].forEach(function(k){
  $('#sec-'+k).addEventListener('change',function(){var h=Object.assign({},prefs.hide);if(this.checked)delete h[k];else h[k]=true;savePrefs({hide:h})});
});
$('#opt-squad').addEventListener('change',function(){
  var on=this.checked;savePrefs({squad:on});
  if(!on&&sb&&myUid){lastBoardKey='';P(sb.from('board').delete().eq('user_id',myUid)).then(loadBoard)}
});
$('#set-reset').addEventListener('click',function(){savePrefs({skin:'auto',accent:'',font:'chunky',density:'cozy',hide:{}})});
function openSettings(first){
  $('#set-title').textContent=first?'Make it yours':'Customize';
  $('#set-welcome').hidden=!first;
  $('#sheet').hidden=false;syncSettings();
  setTimeout(function(){$('#set-nick').focus()},30);
}
function closeSettings(){
  var v=$('#set-nick').value.trim().slice(0,24);if(v!==(prefs.nick||''))savePrefs({nick:v});
  $('#sheet').hidden=true;
}
$('#open-settings').addEventListener('click',function(){openSettings(false)});
$('#set-close').addEventListener('click',closeSettings);
$('#sheet').addEventListener('click',function(e){if(e.target===this)closeSettings()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('#sheet').hidden)closeSettings()});

/* ---------- FOCUS TIMER (reused below) ---------- */
/* ---------- FOCUS TIMER ---------- */
var GRACE=60000;
var S=lsGet('sd_active',null)||{phase:'idle'};
function saveS(){lsSet('sd_active',S);lsSet('sd_active_uid',myUid)}
var audioCtx=null;
function ensureAudio(){try{if(!audioCtx){var AC=window.AudioContext||window.webkitAudioContext;if(AC)audioCtx=new AC()}if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume()}catch(e){}}
function beep(){try{if(!audioCtx)return;var o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.value=.08;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.25)}catch(e){}}

function credit(now){return S.blockStart==null?0:Math.min(Math.max(0,now-S.blockStart),S.interval)}
function focusMs(now){return (S.focusMs||0)+(S.phase==='running'?credit(now):0)}
function wallMs(now){
  if(S.phase==='ended')return S.wallMs;
  var w=now-S.startedAt-(S.pausedMs||0);
  if(S.phase==='paused'&&S.pauseStart!=null)w-=now-S.pauseStart;
  return Math.max(w,focusMs(now));
}
function startSession(){
  var now=Date.now();
  S={phase:'running',subject:$('#subject').value.trim()||'General study',interval:(+$('#interval').value||10)*60000,startedAt:now,blockStart:now,focusMs:0,pausedMs:0,pauseStart:null,checkins:0,missed:0,askAt:null,auto:false};
  ensureAudio();saveS();tick();
}
function pauseSession(){var now=Date.now();S.focusMs+=credit(now);S.blockStart=null;S.askAt=null;S.phase='paused';S.pauseStart=now;S.auto=false;saveS();tick()}
function resumeSession(){var now=Date.now();S.pausedMs+=now-S.pauseStart;S.pauseStart=null;S.blockStart=now;S.phase='running';S.auto=false;ensureAudio();saveS();tick()}
function confirmPresence(){S.focusMs+=S.interval;S.checkins++;S.blockStart+=S.interval;S.askAt=null;saveS();tick()}
function stopSession(){
  var now=Date.now();
  if(S.phase==='running'){S.focusMs+=credit(now)}
  else if(S.phase==='paused'&&S.pauseStart!=null){S.pausedMs+=now-S.pauseStart}
  S.blockStart=null;S.askAt=null;S.pauseStart=null;S.endedAt=now;
  S.wallMs=Math.max(now-S.startedAt-S.pausedMs,S.focusMs);
  S.phase='ended';saveS();tick();
}
function tick(){
  var now=Date.now();
  if(S.phase==='running'){
    if(S.askAt==null&&now>=S.blockStart+S.interval){S.askAt=now+GRACE;beep();saveS()}
    if(S.askAt!=null&&now>=S.askAt){
      S.missed++;S.phase='paused';S.pauseStart=S.askAt;S.blockStart=null;S.askAt=null;S.auto=true;beep();saveS();
    }
  }
  renderTimer(now);
}
function renderTimer(now){
  var ph=S.phase;
  var f=ph==='idle'?0:focusMs(now), w=ph==='idle'?0:wallMs(now);
  $('#clock').firstChild.textContent=clock(f);
  $('#t-wall').textContent=mmss(w);
  $('#t-off').textContent=mmss(w-f);
  $('#t-rate').textContent=w>30000?Math.round(f/w*100)+'%':'--';
  var label={idle:'Ready',running:'Locked in: '+(S.subject||''),paused:'Paused: '+(S.subject||''),ended:'Session finished: '+(S.subject||'')}[ph]||'Ready';
  $('#phase').textContent=label;
  var asking=ph==='running'&&S.askAt!=null;
  $('#banner').hidden=!asking;
  if(asking)$('#ask-left').textContent=Math.max(0,Math.ceil((S.askAt-now)/1000))+'s left to answer';
  $('#auto-note').hidden=!(ph==='paused'&&S.auto);
  $('#btn-start').hidden=ph!=='idle';
  $('#btn-pause').hidden=ph!=='running';
  $('#btn-resume').hidden=ph!=='paused';
  $('#btn-stop').hidden=!(ph==='running'||ph==='paused');
  $('#wrapup').hidden=ph!=='ended';
  $('#subject').disabled=ph!=='idle';$('#interval').disabled=ph!=='idle';
  if(ph==='ended'&&!$('#wrap-sentence').dataset.set){
    $('#wrap-sentence').textContent='You sat for '+hm(S.wallMs)+' and focused for '+hm(S.focusMs)+'. '+(S.missed?S.missed+' check-in'+(S.missed>1?'s':'')+' went unanswered.':'Every check-in answered.');
    $('#claimed').value=Math.round(S.wallMs/60000);
    $('#wrap-sentence').dataset.set='1';
  }
}
$('#btn-start').addEventListener('click',startSession);
$('#btn-pause').addEventListener('click',pauseSession);
$('#btn-resume').addEventListener('click',resumeSession);
$('#btn-confirm').addEventListener('click',confirmPresence);
$('#btn-stop').addEventListener('click',stopSession);
function resetSession(){S={phase:'idle'};saveS();delete $('#wrap-sentence').dataset.set;tick();renderStats()}
$('#btn-discard').addEventListener('click',resetSession);
$('#btn-save').addEventListener('click',function(){
  var claimed=parseInt($('#claimed').value,10);
  var rec={id:newId(),subject:S.subject,startedAt:S.startedAt,endedAt:S.endedAt,wallMs:S.wallMs,focusMs:S.focusMs,missed:S.missed,checkins:S.checkins,claimedMin:isNaN(claimed)?null:claimed,day:dayKey(S.startedAt)};
  var btn=$('#btn-save');btn.disabled=true;
  Promise.resolve(put('sessions',rec)).then(function(){
    var gap=rec.claimedMin==null?null:rec.claimedMin-Math.round(rec.focusMs/60000);
    toast(gap!=null&&gap>0?'Saved. You guessed '+gap+' min more than you really focused.':'Saved.');
    resetSession();
  }).catch(function(){toast('Could not save the session. Try again.')}).then(function(){btn.disabled=false});
});
setInterval(tick,1000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)tick()});

/* goal */
var goalH=lsGet('sd_goal',4);$('#goal').value=goalH;
$('#goal').addEventListener('change',function(){var v=parseFloat(this.value);if(v>0){goalH=v;lsSet('sd_goal',v);savePrefs({goal:v});renderStats()}});

function renderStats(){
  var ss=data.sessions, today=dayKey(Date.now());
  var tf=0;ss.forEach(function(s){if(s.day===today)tf+=s.focusMs||0});
  $('#today-focus').textContent=hm(tf)+' focused';
  var pct=Math.min(100,tf/(goalH*3600000)*100);
  $('#goal-bar').style.width=pct+'%';
  $('#goal-text').textContent=tf>=goalH*3600000?'Goal reached. Anything more is a bonus.':hm(goalH*3600000-tf)+' to go for your '+goalH+'h goal.';
  var days=[],i;
  for(i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push({key:dayKey(d.getTime()),label:d.toLocaleDateString('en-IN',{weekday:'short'}),wall:0,foc:0})}
  var map={};days.forEach(function(d){map[d.key]=d});
  var tw=0,tfw=0;
  ss.forEach(function(s){var d=map[s.day];if(d){d.wall+=s.wallMs||0;d.foc+=s.focusMs||0;tw+=s.wallMs||0;tfw+=s.focusMs||0}});
  var maxW=Math.max.apply(null,[2*3600000].concat(days.map(function(d){return d.wall})));
  var scaleH=Math.ceil(maxW/3600000);var scale=scaleH*3600000;
  $('#week-scale').textContent='Scale 0 to '+scaleH+'h';
  $('#week').innerHTML=days.map(function(d){
    return '<div class="col" title="'+esc(d.label+': focused '+hm(d.foc)+' of '+hm(d.wall)+' sitting')+'"><div class="wall" style="height:'+(d.wall/scale*100)+'%"></div><div class="foc" style="height:'+(d.foc/scale*100)+'%"></div></div>';
  }).join('');
  $('#weeklabels').innerHTML=days.map(function(d){return '<div><b>'+(d.foc?(d.foc/3600000).toFixed(1):'0')+'</b>'+esc(d.label)+'</div>'}).join('');
  var insight='';
  if(!ss.length){insight='Finish your first session and this week fills in. The gap between the dashed and solid bars is time you sat down without studying.'}
  else if(tw>0){
    insight='This week: '+hm(tfw)+' focused out of '+hm(tw)+' sitting, a '+Math.round(tfw/tw*100)+'% focus rate.';
    var g=0,n=0;ss.slice(0,30).forEach(function(s){if(s.claimedMin!=null){g+=s.claimedMin-(s.focusMs||0)/60000;n++}});
    if(n>=2){var avg=Math.round(g/n);insight+=avg>0?' When you guess your study time, you are off by about '+avg+' min per session, too high.':' Your guesses are close to the real numbers.'}
  }
  $('#insight').textContent=insight;renderGame();
  var list=ss.slice(0,8);
  $('#sessions').innerHTML=list.length?list.map(function(s){
    var rate=s.wallMs>0?Math.round((s.focusMs||0)/s.wallMs*100):0;
    var when=new Date(s.startedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
    return '<div class="srow"><div><div class="t">'+esc(s.subject||'Study')+'</div><div class="m">'+esc(when)+' · focused '+hm(s.focusMs||0)+' of '+hm(s.wallMs||0)+' ('+rate+'%)'+(s.claimedMin!=null?' · you guessed '+s.claimedMin+'m':'')+'</div></div><button class="btn sm danger" data-del-session="'+esc(s.id)+'">Delete</button></div>';
  }).join(''):'<p class="empty">No sessions yet. Pick a subject above and press Start studying.</p>';
}
var delArm={};
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-del-session]');if(!b)return;
  var id=b.dataset.delSession;
  if(!delArm[id]){delArm[id]=true;b.textContent='Sure?';setTimeout(function(){delete delArm[id];if(b.isConnected)b.textContent='Delete'},3000);return}
  delete delArm[id];remove('sessions',id).catch(function(){toast('Could not delete.')});
});

var BRANCHES={
  'First year (all branches)':['Engineering Mathematics','Engineering Physics','Engineering Chemistry','Basic Electrical Engineering','Engineering Mechanics','Programming in C','Engineering Graphics'],
  'CSE / IT':['Data Structures','Algorithms','DBMS','Operating Systems','Computer Networks','Theory of Computation','Computer Organization','Compiler Design','Software Engineering','Discrete Mathematics','Machine Learning','Web Technologies'],
  'ECE / EEE':['Signals and Systems','Analog Electronics','Digital Electronics','Network Theory','Control Systems','EM Theory','Communication Systems','Microprocessors','Electrical Machines','Power Systems'],
  'Mechanical':['Thermodynamics','Fluid Mechanics','Strength of Materials','Machine Design','Heat Transfer','Theory of Machines','Manufacturing Processes'],
  'Civil':['Structural Analysis','Surveying','Concrete Technology','Geotechnical Engineering','Transportation Engineering','Environmental Engineering']
};
/* ---------- game: xp, streak, stickers ---------- */
function dnum(key){var p=key.split('-');return Math.round(Date.UTC(+p[0],+p[1]-1,+p[2])/86400000)}
function streaks(){
  var tot={};data.sessions.forEach(function(s){if(s.day)tot[s.day]=(tot[s.day]||0)+(s.focusMs||0)});
  var nums=[];Object.keys(tot).forEach(function(k){if(tot[k]>=20*60000)nums.push(dnum(k))});
  nums.sort(function(a,b){return a-b});
  var best=0,run=0,prev=null;
  nums.forEach(function(n){run=(prev!==null&&n===prev+1)?run+1:1;if(run>best)best=run;prev=n});
  var set={};nums.forEach(function(n){set[n]=1});
  var t=dnum(dayKey(Date.now()));var c=set[t]?t:(set[t-1]?t-1:null);var cur=0;
  while(c!==null&&set[c]){cur++;c--}
  return {cur:cur,best:best};
}
function renderGame(){
  var totMs=0,honest=0;
  data.sessions.forEach(function(s){
    totMs+=s.focusMs||0;
    var f=(s.focusMs||0)/60000;
    if(s.claimedMin!=null&&f>=20&&Math.abs(s.claimedMin-f)<=Math.max(5,f*0.15))honest++;
  });
  var xp=Math.floor(totMs/60000),li=0,i;
  for(i=0;i<LEVELS.length;i++){if(xp>=LEVELS[i].min)li=i}
  var lv=LEVELS[li],nx=LEVELS[li+1];
  $('#lvl-name').textContent=lv.n;
  $('#xp-bar').style.width=(nx?(xp-lv.min)/(nx.min-lv.min)*100:100)+'%';
  $('#xp-text').textContent=nx?(nx.min-xp)+' XP to '+nx.n+' (1 XP = 1 focused minute)':'Max level. The Dean knows your name.';
  var st=streaks();
  $('#streak-n').textContent=st.cur;
  $('#total-h').textContent=(totMs/3600000).toFixed(1)+'h';
  var B=[
    {n:'First lock-in',on:data.sessions.length>=1},
    {n:'3-day streak',on:st.best>=3},
    {n:'7-day streak',on:st.best>=7},
    {n:'10 hours deep',on:xp>=600},
    {n:'Honest guesser',on:honest>=3}
  ];
  $('#badges').innerHTML=B.map(function(b){return '<span class="badge'+(b.on?' on':'')+'">'+esc(b.n)+'</span>'}).join('');
  $('#hero-sub').textContent=st.cur?('You are on a '+st.cur+'-day streak as a '+lv.n+'. Keep it going.'):'Start a session. The timer only counts the minutes you actually answer for.';
}

/* ---------- squad board ---------- */
function syncBoard(){
  if(!sb||!myUid||!sessionsLoaded||!prefs.squad||!prefs.nick)return;
  var keys={},i;for(i=0;i<7;i++){var d=new Date();d.setDate(d.getDate()-i);keys[dayKey(d.getTime())]=1}
  var week=0,tot=0;
  data.sessions.forEach(function(s){tot+=s.focusMs||0;if(keys[s.day])week+=s.focusMs||0});
  var payload={nick:String(prefs.nick).slice(0,24),weekMs:Math.round(week),streak:streaks().cur,xp:Math.floor(tot/60000)};
  var key=JSON.stringify(payload);if(key===lastBoardKey)return;
  lastBoardKey=key;payload.updated=Date.now();
  P(sb.from('board').upsert({user_id:myUid,nick:payload.nick,week_ms:payload.weekMs,streak:payload.streak,xp:payload.xp,updated_at:new Date().toISOString()})).then(function(r){if(r.error)lastBoardKey='';else loadBoard()});
}
function levelName(xp){var n=LEVELS[0].n;LEVELS.forEach(function(l){if(xp>=l.min)n=l.n});return n}
function renderSquad(){
  var box=$('#squad-list');
  if(!sb||!myUid){box.innerHTML='<p class="empty">Log in to see the squad board.</p>';return}
  if(!boardRows.length){box.innerHTML='<p class="empty">Nobody is on the board yet. Set a nickname in Customize and finish one session to appear here.</p>';return}
  box.innerHTML=boardRows.map(function(r,i){
    var nick=String(r.nick||'anon').slice(0,24),w=Number(r.weekMs)||0,st=Number(r.streak)||0,xp=Number(r.xp)||0;
    return '<div class="rank'+(r.id===myUid?' me':'')+'"><div class="n">'+(i+1)+'</div><div><div class="who">'+esc(nick)+'</div><div class="sub">'+esc(levelName(xp))+' · '+st+'-day streak</div></div><div class="hrs">'+(w/3600000).toFixed(1)+'h</div></div>';
  }).join('');
}

/* ---------- shelf (links) ---------- */
var libCat='All';
var CATS=['All','PYQ','Notes','Assignment','Syllabus','Other'];
function allSubjects(){
  var set={};
  data.sessions.forEach(function(s){if(s.subject&&s.subject!=='General study')set[s.subject]=1});
  data.library.forEach(function(l){if(l.subject)set[l.subject]=1});
  (BRANCHES[prefs.branch]||[]).forEach(function(s){set[s]=1});
  return Object.keys(set).sort();
}
function renderLibrary(){
  var subs=allSubjects();
  $('#subjects').innerHTML=subs.map(function(s){return '<option value="'+esc(s)+'"></option>'}).join('');
  var sf=$('#lib-subjfilter'),cur=sf.value;
  sf.innerHTML='<option value="">All subjects</option>'+subs.map(function(s){return '<option>'+esc(s)+'</option>'}).join('');
  sf.value=subs.indexOf(cur)>-1?cur:'';
  var counts={All:data.library.length};
  data.library.forEach(function(l){counts[l.cat]=(counts[l.cat]||0)+1});
  $('#lib-cats').innerHTML=CATS.map(function(c){return '<button class="chip" data-cat="'+c+'" aria-pressed="'+(c===libCat)+'">'+c+' ('+(counts[c]||0)+')</button>'}).join('');
  var q=$('#lib-search').value.trim().toLowerCase(),sub=sf.value;
  var items=data.library.filter(function(l){
    if(libCat!=='All'&&l.cat!==libCat)return false;
    if(sub&&l.subject!==sub)return false;
    if(!q)return true;
    return (l.name+' '+(l.subject||'')+' '+(l.year||'')+' '+(l.tags||[]).join(' ')).toLowerCase().indexOf(q)>-1;
  });
  items.sort(function(a,b){return (b.year||'').localeCompare(a.year||'')||(b.added||0)-(a.added||0)});
  var box=$('#lib-items');
  if(!items.length){
    box.innerHTML='<p class="empty" style="grid-column:1/-1">'+(data.library.length?'Nothing matches that.':'The shelf is empty. Paste the link to last year\'s PYQ above.')+'</p>';return;
  }
  box.innerHTML=items.map(function(l){
    var ok=/^https?:\/\//i.test(l.url||'');
    return '<div class="card item"><div><span class="tag cat">'+esc(l.cat||'Other')+'</span></div><div class="name">'+esc(l.name)+'</div>'
      +'<div class="small muted">'+esc([l.subject,l.year].filter(Boolean).join(' · ')||'No subject')+'</div>'
      +((l.tags&&l.tags.length)?'<div>'+l.tags.map(function(t){return '<span class="tag">'+esc(t)+'</span> '}).join('')+'</div>':'')
      +'<div class="acts">'+(ok?'<a class="btn sm primary" href="'+esc(l.url)+'" target="_blank" rel="noopener">Open</a>':'')+'<button class="btn sm danger" data-del-lib="'+esc(l.id)+'">Delete</button></div></div>';
  }).join('');
}
$('#lib-cats').addEventListener('click',function(e){var b=e.target.closest('[data-cat]');if(b){libCat=b.dataset.cat;renderLibrary()}});
$('#lib-search').addEventListener('input',renderLibrary);
$('#lib-subjfilter').addEventListener('change',renderLibrary);
$('#lib-addlink').addEventListener('click',function(){
  var name=$('#lib-linkname').value.trim(),url=$('#lib-url').value.trim();
  if(!name||!/^https?:\/\//i.test(url)){setStatus('#lib-status','Add a name and a link that starts with https://',true);return}
  var rec={id:newId(),url:url,name:name,added:Date.now(),subject:$('#lib-subject').value.trim(),cat:$('#lib-cat').value,year:$('#lib-year').value.trim(),
    tags:$('#lib-tags').value.split(',').map(function(t){return t.trim()}).filter(Boolean).slice(0,8)};
  put('library',rec).then(function(){$('#lib-linkname').value='';$('#lib-url').value='';setStatus('#lib-status','On the shelf.')})
    .catch(function(){setStatus('#lib-status','Could not save. Check your connection and try again.',true)});
});
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-del-lib]');if(!b)return;
  var id=b.dataset.delLib;
  if(!delArm[id]){delArm[id]=true;b.textContent='Sure?';setTimeout(function(){delete delArm[id];if(b.isConnected)b.textContent='Delete'},3000);return}
  delete delArm[id];remove('library',id).catch(function(){toast('Could not delete.')});
});

function renderAll(){renderStats();renderLibrary();syncBoard();renderSquad()}
applyPrefs();renderAll();tick();


/* ---------- PDF TOOLS ---------- */
var libsOK=!!(window.PDFLib&&window.pdfjsLib&&window.JSZip);
if(!libsOK)$('#lib-warn').hidden=false;
if(window.pdfjsLib){try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'}catch(e){}}

$('#tool-chips').addEventListener('click',function(e){
  var b=e.target.closest('[data-tool]');if(!b)return;
  $$('#tool-chips .chip').forEach(function(c){c.setAttribute('aria-pressed',c===b)});
  $$('.tool').forEach(function(t){t.hidden=t.id!=='tool-'+b.dataset.tool});
});
function baseName(n){return n.replace(/\.[^.]+$/,'')}
function saveFile(name,bytes,statusId){
  try{
    var type=/\.pdf$/i.test(name)?'application/pdf':/\.docx$/i.test(name)?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/octet-stream';
    var url=URL.createObjectURL(new Blob([bytes],{type:type}));
    var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove()},1500);
    setStatus(statusId,'Downloaded '+name+'.');
  }catch(e){setStatus(statusId,'Could not download the file.',true)}
  return Promise.resolve();
}
function readBuf(file){return file.arrayBuffer()}
function latin(font,s){
  s=String(s).replace(/\t/g,'    ').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/ /g,' ');
  var out='';
  for(var i=0;i<s.length;i++){var ch=s[i];try{font.encodeText(ch);out+=ch}catch(e){out+='?'}}
  return out;
}
function fileList(el,arr,onChange,labeler){
  el.innerHTML=arr.map(function(f,i){
    return '<div class="frow"><span class="fn">'+(i+1)+'. '+esc(labeler(f))+'</span><button class="btn sm" data-i="'+i+'" data-a="up"'+(i===0?' disabled':'')+'>Up</button><button class="btn sm" data-i="'+i+'" data-a="down"'+(i===arr.length-1?' disabled':'')+'>Down</button><button class="btn sm danger" data-i="'+i+'" data-a="rm">Remove</button></div>';
  }).join('');
  el.onclick=function(e){
    var b=e.target.closest('button[data-a]');if(!b)return;var i=+b.dataset.i,a=b.dataset.a;
    if(a==='rm')arr.splice(i,1);
    else if(a==='up'&&i>0){var t=arr[i];arr[i]=arr[i-1];arr[i-1]=t}
    else if(a==='down'&&i<arr.length-1){var t2=arr[i];arr[i]=arr[i+1];arr[i+1]=t2}
    fileList(el,arr,onChange,labeler);onChange();
  };
}
function needLibs(statusId){if(libsOK)return true;setStatus(statusId,'PDF libraries did not load. Reload the page.',true);return false}

/* --- edit text --- */
var E={bytes:null,doc:null,page:1,scale:1,vp:null,items:[],edits:[],sel:null,adding:false,name:'edited'};
function editKey(page,idx){return page+':'+idx}
function renderEditPage(){
  var dpr=Math.min(window.devicePixelRatio||1,2);
  return E.doc.getPage(E.page).then(function(page){
    var avail=Math.min($('#edit-scroll').clientWidth||800,900);
    var base1=page.getViewport({scale:1});
    var scale=Math.min(2,Math.max(0.5,avail/base1.width));
    var vp=page.getViewport({scale:scale});
    E.scale=scale;E.vp=vp;
    var canvas=$('#edit-canvas');canvas.width=Math.floor(vp.width*dpr);canvas.height=Math.floor(vp.height*dpr);
    canvas.style.width=vp.width+'px';canvas.style.height=vp.height+'px';
    var layer=$('#edit-layer');layer.style.width=vp.width+'px';layer.style.height=vp.height+'px';
    var task=page.render({canvasContext:canvas.getContext('2d'),viewport:vp,transform:[dpr,0,0,dpr,0,0]});
    return Promise.all([task.promise,page.getTextContent()]).then(function(r){
      E.items=r[1].items.filter(function(it){return it.str&&it.str.trim()});
      drawLayer();
      $('#edit-pageinfo').textContent='Page '+E.page+' of '+E.doc.numPages;
      $('#edit-prev').disabled=E.page<=1;$('#edit-next').disabled=E.page>=E.doc.numPages;
    });
  });
}
function drawLayer(){
  var layer=$('#edit-layer'),h='';
  var editedIdx={};E.edits.forEach(function(e){if(e.page===E.page&&e.idx!=null)editedIdx[e.idx]=1});
  E.items.forEach(function(it,i){
    if(editedIdx[i])return;
    var tx=pdfjsLib.Util.transform(E.vp.transform,it.transform);
    var size=Math.hypot(tx[0],tx[1]);
    h+='<div class="hit" data-i="'+i+'" title="Click to edit" style="left:'+(tx[4]-1)+'px;top:'+(tx[5]-size*0.86)+'px;width:'+(it.width*E.scale+2)+'px;height:'+(size*1.15)+'px"></div>';
  });
  E.edits.forEach(function(e,n){
    if(e.page!==E.page)return;
    var p=E.vp.convertToViewportPoint(e.x,e.y);var px=e.size*E.scale;
    h+='<div class="ov" style="left:'+(p[0]-1)+'px;top:'+(p[1]-px*0.86)+'px;min-width:'+(e.cover?e.w*E.scale+2:0)+'px;height:'+(px*1.15)+'px;font-size:'+px+'px;line-height:'+(px*1.15)+'px">'+esc(e.text)+'</div>';
  });
  layer.innerHTML=h;
  layer.classList.toggle('adding',E.adding);
}
function renderEditList(){
  $('#edit-list').innerHTML=E.edits.map(function(e,n){
    return '<div class="frow"><span class="fn">Page '+e.page+': '+(e.cover?'change to ':'add ')+'"'+esc(e.text)+'"</span><button class="btn sm danger" data-n="'+n+'">Undo</button></div>';
  }).join('');
  $('#edit-save').disabled=!E.edits.length;
}
$('#edit-list').addEventListener('click',function(e){
  var b=e.target.closest('[data-n]');if(!b)return;E.edits.splice(+b.dataset.n,1);renderEditList();drawLayer();
});
function openPanel(sel){
  E.sel=sel;$('#edit-panel').hidden=false;
  $('#edit-orig').textContent=sel.isNew?'New text at the spot you clicked.':'Original: '+sel.orig;
  $('#edit-text').value=sel.isNew?'':sel.orig;
  $('#edit-size-field').hidden=!sel.isNew;
  if(sel.isNew)$('#edit-size').value=12;
  $('#edit-text').focus();
}
$('#edit-layer').addEventListener('click',function(e){
  var hit=e.target.closest('.hit');
  if(hit){var it=E.items[+hit.dataset.i];openPanel({isNew:false,idx:+hit.dataset.i,orig:it.str,it:it});return}
  if(E.adding&&e.target===this){
    var r=this.getBoundingClientRect();var pt=E.vp.convertToPdfPoint(e.clientX-r.left,e.clientY-r.top);
    openPanel({isNew:true,x:pt[0],y:pt[1]});
  }
});
$('#edit-add').addEventListener('click',function(){E.adding=!E.adding;this.setAttribute('aria-pressed',E.adding);drawLayer()});
$('#edit-cancel').addEventListener('click',function(){E.sel=null;$('#edit-panel').hidden=true});
$('#edit-apply').addEventListener('click',function(){
  var s=E.sel;if(!s)return;var text=$('#edit-text').value;
  if(!s.isNew&&text===s.orig){$('#edit-panel').hidden=true;return}
  if(s.isNew){
    if(!text.trim()){setStatus('#edit-status','Type some text first.',true);return}
    E.edits.push({page:E.page,idx:null,x:s.x,y:s.y,w:0,size:Math.max(6,+$('#edit-size').value||12),text:text,cover:false});
  }else{
    var it=s.it,size=Math.hypot(it.transform[0],it.transform[1]);
    E.edits=E.edits.filter(function(e){return !(e.page===E.page&&e.idx===s.idx)});
    E.edits.push({page:E.page,idx:s.idx,x:it.transform[4],y:it.transform[5],w:it.width,size:size,text:text,cover:true});
  }
  setStatus('#edit-status','');E.sel=null;$('#edit-panel').hidden=true;renderEditList();drawLayer();
});
function gotoEditPage(n){E.page=n;E.sel=null;$('#edit-panel').hidden=true;renderEditPage().catch(function(){setStatus('#edit-status','Could not draw this page.',true)})}
$('#edit-prev').addEventListener('click',function(){if(E.page>1)gotoEditPage(E.page-1)});
$('#edit-next').addEventListener('click',function(){if(E.page<E.doc.numPages)gotoEditPage(E.page+1)});
$('#edit-file').addEventListener('change',function(){
  var f=this.files&&this.files[0];if(!f||!needLibs('#edit-status'))return;
  setStatus('#edit-status','Opening '+f.name+'...');
  readBuf(f).then(function(buf){
    E.bytes=buf.slice(0);E.name=baseName(f.name);E.edits=[];E.page=1;E.sel=null;E.adding=false;
    $('#edit-add').setAttribute('aria-pressed','false');
    return pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
  }).then(function(doc){
    E.doc=doc;$('#edit-nav').hidden=false;$('#edit-scroll').hidden=false;$('#edit-panel').hidden=true;
    renderEditList();return renderEditPage();
  }).then(function(){setStatus('#edit-status','Click any line to change it.')}).catch(function(){setStatus('#edit-status','Could not open that PDF. It may be password protected or damaged.',true)});
});
$('#edit-save').addEventListener('click',function(){
  if(!E.edits.length||!needLibs('#edit-status'))return;
  var btn=this;btn.disabled=true;setStatus('#edit-status','Building PDF...');
  var P=PDFLib;
  P.PDFDocument.load(E.bytes,{ignoreEncryption:true}).then(function(pdf){
    return pdf.embedFont(P.StandardFonts.Helvetica).then(function(font){
      var pages=pdf.getPages();
      E.edits.forEach(function(e){
        var pg=pages[e.page-1];
        if(e.cover)pg.drawRectangle({x:e.x-1,y:e.y-e.size*0.24,width:e.w+2,height:e.size*1.15,color:P.rgb(1,1,1)});
        if(e.text){
          try{font.encodeText(e.text)}catch(err){throw new Error('enc')}
          pg.drawText(e.text,{x:e.x,y:e.y,size:e.size,font:font,color:P.rgb(0,0,0)});
        }
      });
      return pdf.save();
    });
  }).then(function(bytes){return saveFile(E.name+'-edited.pdf',bytes,'#edit-status')})
  .catch(function(err){setStatus('#edit-status',err&&err.message==='enc'?'One of your edits has a character this tool cannot write (for example Hindi or special symbols). Use English letters and numbers.':'Could not build the PDF.',true)})
  .then(function(){btn.disabled=!E.edits.length});
});

/* --- pdf to word --- */
var wordFile=null;
function xmlText(s){return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
$('#word-file').addEventListener('change',function(){wordFile=this.files&&this.files[0]||null;$('#word-go').disabled=!wordFile;setStatus('#word-status',wordFile?wordFile.name:'')});
$('#word-go').addEventListener('click',function(){
  if(!wordFile||!needLibs('#word-status'))return;
  var btn=this;btn.disabled=true;setStatus('#word-status','Reading pages...');
  readBuf(wordFile).then(function(buf){return pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise}).then(function(doc){
    var pagesLines=[],chars=0,sizes=[],chain=Promise.resolve();
    for(var p=1;p<=doc.numPages;p++){(function(pn){chain=chain.then(function(){
      return doc.getPage(pn).then(function(pg){return pg.getTextContent()}).then(function(tc){
        var its=tc.items.filter(function(i){return i.str&&i.str.trim().length}).map(function(i){return {s:i.str,x:i.transform[4],y:i.transform[5],sz:Math.hypot(i.transform[0],i.transform[1])||10,w:i.width}});
        its.sort(function(a,b){return Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x});
        var lines=[],cur=null;
        its.forEach(function(it){
          chars+=it.s.length;sizes.push(it.sz);
          if(cur&&Math.abs(cur.y-it.y)<Math.max(2,it.sz*0.45)){
            var gap=it.x-cur.end;
            cur.text+=(gap>it.sz*0.18&&!/\s$/.test(cur.text)&&!/^\s/.test(it.s)?' ':'')+it.s;cur.end=it.x+it.w;cur.sz=Math.max(cur.sz,it.sz);
          }else{cur={y:it.y,text:it.s,end:it.x+it.w,sz:it.sz};lines.push(cur)}
        });
        pagesLines.push(lines);
      });
    })})(p)}
    return chain.then(function(){return {pagesLines:pagesLines,chars:chars,sizes:sizes}});
  }).then(function(r){
    if(r.chars<20){setStatus('#word-status','This PDF has no selectable text. It is probably scanned, so it needs OCR, which this tool does not do.',true);return}
    var sorted=r.sizes.slice().sort(function(a,b){return a-b});var med=sorted[Math.floor(sorted.length/2)]||10;
    var body='';
    r.pagesLines.forEach(function(lines,pi){
      var paras=[],prev=null;
      lines.forEach(function(l){
        var t=l.text.replace(/\s+/g,' ').trim();if(!t)return;
        var bullet=/^(\d+[.)]|[•\-–*])\s/.test(t);
        var heading=l.sz>med*1.25;
        var newPara=!prev||bullet||heading||prev.heading||(prev.y-l.y)>Math.max(l.sz,prev.sz)*1.7;
        if(newPara){prev={text:t,y:l.y,sz:l.sz,heading:heading};paras.push(prev)}
        else{prev.text+=' '+t;prev.y=l.y}
      });
      paras.forEach(function(p){
        var half=Math.max(18,Math.min(48,Math.round(p.sz*(11/med)*2)));
        body+='<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'+(p.heading?'<w:b/>':'')+'<w:sz w:val="'+(p.heading?half:22)+'"/></w:rPr><w:t xml:space="preserve">'+xmlText(p.text)+'</w:t></w:r></w:p>';
      });
      if(pi<r.pagesLines.length-1)body+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    });
    var zip=new JSZip();
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>');
    return zip.generateAsync({type:'uint8array'}).then(function(bytes){return saveFile(baseName(wordFile.name)+'.docx',bytes,'#word-status')});
  }).catch(function(){setStatus('#word-status','Could not read that PDF.',true)}).then(function(){btn.disabled=!wordFile});
});

/* --- images to pdf --- */
var imgs=[];
function imgChanged(){$('#img-go').disabled=!imgs.length}
$('#img-file').addEventListener('change',function(){
  Array.prototype.forEach.call(this.files||[],function(f){imgs.push(f)});this.value='';
  fileList($('#img-list'),imgs,imgChanged,function(f){return f.name+' ('+fmtSize(f.size)+')'});imgChanged();
});
function toJpeg(file,maxSide){
  return createImageBitmap(file).then(function(bmp){
    var w=bmp.width,h=bmp.height,k=Math.min(1,maxSide/Math.max(w,h));w=Math.round(w*k);h=Math.round(h*k);
    var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(bmp,0,0,w,h);
    return new Promise(function(res,rej){c.toBlob(function(b){b?res(b):rej(new Error('blob'))},'image/jpeg',0.88)}).then(function(b){return b.arrayBuffer()}).then(function(buf){return {bytes:new Uint8Array(buf),w:w,h:h}});
  });
}
$('#img-go').addEventListener('click',function(){
  if(!imgs.length||!needLibs('#img-status'))return;
  var btn=this;btn.disabled=true;setStatus('#img-status','Building PDF...');
  var P=PDFLib,mode=$('#img-size').value;
  P.PDFDocument.create().then(function(pdf){
    var chain=Promise.resolve();
    imgs.forEach(function(f){chain=chain.then(function(){
      return toJpeg(f,2200).then(function(j){return pdf.embedJpg(j.bytes).then(function(im){
        if(mode==='match'){var pg=pdf.addPage([j.w,j.h]);pg.drawImage(im,{x:0,y:0,width:j.w,height:j.h})}
        else{
          var land=j.w>j.h,PW=land?841.89:595.28,PH=land?595.28:841.89,m=24;
          var k=Math.min((PW-2*m)/j.w,(PH-2*m)/j.h),dw=j.w*k,dh=j.h*k;
          var pg2=pdf.addPage([PW,PH]);pg2.drawImage(im,{x:(PW-dw)/2,y:(PH-dh)/2,width:dw,height:dh});
        }
      })});
    })});
    return chain.then(function(){return pdf.save()});
  }).then(function(bytes){return saveFile('images.pdf',bytes,'#img-status')})
  .catch(function(){setStatus('#img-status','One of the images could not be read.',true)})
  .then(function(){btn.disabled=!imgs.length});
});

/* --- text to pdf --- */
$('#txt-go').addEventListener('click',function(){
  var raw=$('#txt-body').value;if(!raw.trim()){setStatus('#txt-status','Add some text first.',true);return}
  if(!needLibs('#txt-status'))return;
  var btn=this;btn.disabled=true;setStatus('#txt-status','Building PDF...');
  var P=PDFLib,size=Math.min(24,Math.max(8,+$('#txt-size').value||12)),title=$('#txt-title').value.trim();
  P.PDFDocument.create().then(function(pdf){
    return Promise.all([pdf.embedFont(P.StandardFonts.Helvetica),pdf.embedFont(P.StandardFonts.HelveticaBold)]).then(function(fs){
      var font=fs[0],bold=fs[1],PW=595.28,PH=841.89,M=56,maxW=PW-2*M,lh=size*1.45;
      var pg=pdf.addPage([PW,PH]),y=PH-M;
      function line(t,f,sz){if(y-sz<M){pg=pdf.addPage([PW,PH]);y=PH-M}y-=sz;if(t)pg.drawText(t,{x:M,y:y,size:sz,font:f,color:P.rgb(0,0,0)});y-=(lh-sz)}
      if(title){wrap(latin(bold,title),bold,size+8).forEach(function(l){line(l,bold,size+8)});y-=size*0.8}
      function wrap(text,f,sz){
        var words=text.split(' '),lines=[],cur='';
        words.forEach(function(w){var t=cur?cur+' '+w:w;if(f.widthOfTextAtSize(t,sz)<=maxW)cur=t;else{if(cur)lines.push(cur);
          while(f.widthOfTextAtSize(w,sz)>maxW){var cut=w.length;while(cut>1&&f.widthOfTextAtSize(w.slice(0,cut),sz)>maxW)cut--;lines.push(w.slice(0,cut));w=w.slice(cut)}cur=w}});
        lines.push(cur);return lines;
      }
      latin(font,raw).split(/\r?\n/).forEach(function(par){
        if(!par.trim()){y-=lh*0.6;return}
        wrap(par,font,size).forEach(function(l){line(l,font,size)});
      });
      return pdf.save();
    });
  }).then(function(bytes){return saveFile((title?title.replace(/[^\w\- ]+/g,'').trim()||'notes':'notes')+'.pdf',bytes,'#txt-status')})
  .catch(function(){setStatus('#txt-status','Could not build the PDF.',true)})
  .then(function(){btn.disabled=false});
});

/* --- merge --- */
var mergeFiles=[];
function mergeChanged(){$('#merge-go').disabled=mergeFiles.length<2}
$('#merge-file').addEventListener('change',function(){
  Array.prototype.forEach.call(this.files||[],function(f){mergeFiles.push(f)});this.value='';
  fileList($('#merge-list'),mergeFiles,mergeChanged,function(f){return f.name+' ('+fmtSize(f.size)+')'});mergeChanged();
});
$('#merge-go').addEventListener('click',function(){
  if(mergeFiles.length<2||!needLibs('#merge-status'))return;
  var btn=this;btn.disabled=true;setStatus('#merge-status','Merging...');
  var P=PDFLib;
  P.PDFDocument.create().then(function(out){
    var chain=Promise.resolve();
    mergeFiles.forEach(function(f){chain=chain.then(function(){
      return readBuf(f).then(function(buf){return P.PDFDocument.load(buf,{ignoreEncryption:true})}).then(function(src){
        return out.copyPages(src,src.getPageIndices()).then(function(ps){ps.forEach(function(p){out.addPage(p)})});
      });
    })});
    return chain.then(function(){return out.save()});
  }).then(function(bytes){return saveFile('merged.pdf',bytes,'#merge-status')})
  .catch(function(){setStatus('#merge-status','One of the files could not be read. It may be protected or damaged.',true)})
  .then(function(){mergeChanged()});
});

/* --- extract --- */
var extFile=null,extPages=0;
$('#ext-file').addEventListener('change',function(){
  extFile=this.files&&this.files[0]||null;extPages=0;$('#ext-go').disabled=true;$('#ext-info').textContent='';
  if(!extFile||!needLibs('#ext-status'))return;
  readBuf(extFile).then(function(buf){return PDFLib.PDFDocument.load(buf,{ignoreEncryption:true})}).then(function(pdf){
    extPages=pdf.getPageCount();$('#ext-info').textContent=extFile.name+' has '+extPages+' pages.';$('#ext-go').disabled=false;setStatus('#ext-status','');
  }).catch(function(){setStatus('#ext-status','Could not read that PDF.',true)});
});
function parseRange(str,max){
  var out=[],seen={};
  var parts=str.split(',');
  for(var i=0;i<parts.length;i++){
    var p=parts[i].trim();if(!p)continue;
    var m=p.match(/^(\d+)\s*-\s*(\d+)$/),a,b;
    if(m){a=+m[1];b=+m[2]}else if(/^\d+$/.test(p)){a=b=+p}else return null;
    if(a<1||b>max||a>b)return null;
    for(var k=a;k<=b;k++){if(!seen[k]){seen[k]=1;out.push(k-1)}}
  }
  return out.length?out:null;
}
$('#ext-go').addEventListener('click',function(){
  var idx=parseRange($('#ext-range').value,extPages);
  if(!idx){setStatus('#ext-status','Use page numbers between 1 and '+extPages+', like 1-3, 5.',true);return}
  var btn=this;btn.disabled=true;setStatus('#ext-status','Extracting...');
  var P=PDFLib;
  readBuf(extFile).then(function(buf){return P.PDFDocument.load(buf,{ignoreEncryption:true})}).then(function(src){
    return P.PDFDocument.create().then(function(out){return out.copyPages(src,idx).then(function(ps){ps.forEach(function(p){out.addPage(p)});return out.save()})});
  }).then(function(bytes){return saveFile(baseName(extFile.name)+'-pages.pdf',bytes,'#ext-status')})
  .catch(function(){setStatus('#ext-status','Could not extract those pages.',true)})
  .then(function(){btn.disabled=false});
});

/* ---------- ASK ---------- */
var askMode='explain',askCtl=null;
var MODES={
  explain:{label:'Explain simply',t:'Explain this the way a good senior would the night before an exam: a short real-life or college-life analogy, then the exact textbook definition, then one small worked example. End with two mistakes students commonly make.'},
  exam:{label:'Exam answer',t:'Write this as a university exam answer worth {marks} marks. Match length to marks: 2 marks = 3 to 4 lines; 5 marks = definition, 4 to 5 key points and a small example; 10 or 15 marks = introduction, detailed points under sub-headings, a diagram described in words with labelled parts, an example or application, and a conclusion. Use the keywords examiners look for.'},
  solve:{label:'Solve numerical',t:'Solve this numerical step by step. Write the given data, the formula used with its name, each calculation on its own line with units, and the final answer on its own line. If data is missing, state the assumption (for example g = 9.81 m/s^2).'},
  code:{label:'Code help',t:'Help with this {lang} problem. Explain the logic in plain steps, then give clean code with comments, a dry run on a small input, and time and space complexity. If the student pasted buggy code, name the exact bug first.'},
  viva:{label:'Viva questions',t:'Give 10 viva questions on this topic from easy to tricky, each with a 1 to 2 line model answer.'},
  notes:{label:'Last-night notes',t:'Make a compact last-night revision sheet: key definitions, formulas or algorithms to memorise, a quick comparison where useful, and 3 questions commonly asked in university exams.'},
  quiz:{label:'Quiz me',t:'Write 5 exam-style questions on this topic, mixing theory with numericals or application, and list all answers at the end.'}
};
$('#ask-modes').innerHTML=Object.keys(MODES).map(function(k){return '<button class="chip" data-mode="'+k+'" aria-pressed="'+(k===askMode)+'">'+esc(MODES[k].label)+'</button>'}).join('');
function syncAskFields(){$('#f-marks').hidden=askMode!=='exam';$('#f-lang').hidden=askMode!=='code'}
function syncAsk(){
  var sel=$('#ask-branch');
  if(sel.options.length<2){Object.keys(BRANCHES).forEach(function(b){var o=document.createElement('option');o.value=b;o.textContent=b;sel.appendChild(o)})}
  sel.value=BRANCHES[prefs.branch]?prefs.branch:'';
  $('#ask-subjchips').innerHTML=(BRANCHES[sel.value]||[]).map(function(s){return '<button class="chip" data-s="'+esc(s)+'" aria-pressed="false">'+esc(s)+'</button>'}).join('');
}
$('#ask-branch').addEventListener('change',function(){savePrefs({branch:this.value})});
$('#ask-subjchips').addEventListener('click',function(e){var b=e.target.closest('[data-s]');if(b){$('#ask-subject').value=b.dataset.s}});
$('#ask-modes').addEventListener('click',function(e){
  var b=e.target.closest('[data-mode]');if(!b)return;askMode=b.dataset.mode;
  $$('#ask-modes .chip').forEach(function(c){c.setAttribute('aria-pressed',c===b)});syncAskFields();
});
syncAsk();syncAskFields();
function fmtAnswer(t){return esc(t).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>')}
$('#ask-stop').addEventListener('click',function(){if(askCtl)askCtl.abort()});
$('#ask-go').addEventListener('click',function(){
  var q=$('#ask-q').value.trim();if(!q){setStatus('#ask-status','Type or paste something first.',true);return}
  if(!sb||!myUid){setStatus('#ask-status','Log in first.',true);return}
  var btn=this;btn.disabled=true;setStatus('#ask-status','Thinking...');
  P(sb.auth.getSession()).then(function(r){
    var tok=r.data&&r.data.session&&r.data.session.access_token;
    return fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body:JSON.stringify({mode:askMode,marks:$('#ask-marks').value,lang:$('#ask-lang').value,branch:prefs.branch||'',subject:$('#ask-subject').value.trim(),q:q})});
  }).then(function(res){return res.json().catch(function(){return {}}).then(function(j){return {ok:res.ok,j:j}})}).then(function(r){
    if(!r.ok){setStatus('#ask-status',r.j.error||'Could not get an answer. Try again.',true);return}
    $('#ask-out').innerHTML=fmtAnswer(r.j.text||'');
    setStatus('#ask-status',r.j.left!=null?r.j.left+' question'+(r.j.left===1?'':'s')+' left today.':'');
  }).catch(function(){setStatus('#ask-status','Could not reach the server. Try again.',true)}).then(function(){btn.disabled=false});
});

/* ---------- auth ---------- */
var recovery=false,authMode='signup';
function authMsg(m,err){var el=$('#auth-msg');el.textContent=m||'';el.classList.toggle('err',!!err)}
function niceErr(e){
  var m=String((e&&e.message)||'');
  if(/invalid login/i.test(m))return 'Wrong email or password.';
  if(/already (registered|exists)/i.test(m))return 'That email already has an account. Log in instead.';
  if(/rate limit|too many/i.test(m))return 'Too many attempts. Wait a few minutes and try again.';
  if(/email not confirmed/i.test(m))return 'Confirm your email first. Check your inbox.';
  return m||'Something went wrong. Try again.';
}
function setAuthMode(m){
  authMode=m;
  $$('#auth-tabs .chip').forEach(function(c){c.setAttribute('aria-pressed',c.dataset.m===m)});
  $('#auth-submit').textContent={signup:'Create account',login:'Log in',reset:'Set new password'}[m];
  $('#auth-forgot').hidden=m!=='login';
  $('#auth-email').closest('.field').hidden=m==='reset';
  $('#auth-tabs').hidden=m==='reset';
  $('#auth-pass-label').textContent=m==='reset'?'New password (8+ characters)':(m==='login'?'Password':'Password (8+ characters)');
  $('#auth-pass').autocomplete=m==='login'?'current-password':'new-password';
  authMsg('');
}
$('#auth-tabs').addEventListener('click',function(e){var b=e.target.closest('[data-m]');if(b)setAuthMode(b.dataset.m)});
$('#auth-form').addEventListener('submit',function(e){
  e.preventDefault();if(!sb)return;
  var email=$('#auth-email').value.trim(),pass=$('#auth-pass').value;
  if(authMode!=='reset'&&!/^\S+@\S+\.\S+$/.test(email)){authMsg('Enter a valid email.',true);return}
  if(pass.length<8){authMsg('Password needs at least 8 characters.',true);return}
  var btn=$('#auth-submit');btn.disabled=true;authMsg('One sec...');
  var p;
  if(authMode==='signup'){
    p=P(sb.auth.signUp({email:email,password:pass})).then(function(r){
      if(r.error)throw r.error;
      authMsg(r.data&&r.data.session?'':'Check your email to confirm your account, then log in.');
    });
  }else if(authMode==='login'){
    p=P(sb.auth.signInWithPassword({email:email,password:pass})).then(function(r){if(r.error)throw r.error;authMsg('')});
  }else{
    p=P(sb.auth.updateUser({password:pass})).then(function(r){
      if(r.error)throw r.error;
      recovery=false;authMsg('');
      return P(sb.auth.getSession()).then(function(x){if(x.data&&x.data.session){setAuthMode('login');enterApp(x.data.session.user)}});
    });
  }
  p.then(function(){$('#auth-pass').value=''}).catch(function(err){authMsg(niceErr(err),true)}).then(function(){btn.disabled=false});
});
$('#auth-forgot').addEventListener('click',function(){
  var email=$('#auth-email').value.trim();
  if(!/^\S+@\S+\.\S+$/.test(email)){authMsg('Type your email above first.',true);return}
  P(sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname})).then(function(r){
    authMsg(r.error?niceErr(r.error):'If that email has an account, a reset link is on its way.',!!r.error);
  });
});
function enterApp(user){
  myUid=user.id;sessionsLoaded=false;
  if(S.phase!=='idle'&&lsGet('sd_active_uid',null)!==myUid){S={phase:'idle'};lsSet('sd_active',S)}
  document.body.classList.remove('loading');document.body.classList.add('authed');
  $('#acct-email').textContent=user.email||'';
  tick();
  loadAll().then(function(){
    if(!prefs.nick&&!lsGet('sd_welcomed2',false)){lsSet('sd_welcomed2',true);openSettings(true)}
  }).catch(function(){toast('Could not load your data. Check your connection and reload.')});
}
function leaveApp(){
  myUid=null;data.sessions=[];data.library=[];boardRows=[];sessionsLoaded=false;lastBoardKey='';
  ['sd_prefs2','sd_active','sd_active_uid','sd_goal','sd_tab2','sd_welcomed2'].forEach(function(k){try{localStorage.removeItem(k)}catch(e){}});
  prefs=Object.assign({},DEFAULTS);S={phase:'idle'};curTab='home';
  document.body.classList.remove('authed');$('#sheet').hidden=true;
  applyPrefs();renderAll();tick();
}
$('#btn-logout').addEventListener('click',function(){if(sb)P(sb.auth.signOut())});
var wipeArmed=false;
$('#btn-wipe').addEventListener('click',function(){
  var b=this;
  if(!wipeArmed){wipeArmed=true;b.textContent='Tap again to delete everything';setTimeout(function(){wipeArmed=false;b.textContent='Delete my data'},4000);return}
  wipeArmed=false;b.textContent='Delete my data';
  Promise.all(['sessions','library','prefs','board'].map(function(t){return P(sb.from(t).delete().eq('user_id',myUid))})).then(function(rs){
    var bad=rs.some(function(r){return r.error});
    if(bad){setStatus('#acct-status','Could not delete everything. Try again.',true);return}
    data.sessions=[];data.library=[];boardRows=[];lastBoardKey='';
    prefs=Object.assign({},DEFAULTS);lsSet('sd_prefs2',prefs);
    applyPrefs();renderAll();setStatus('#acct-status','All your data was deleted.');
  });
});
if(sb){
  sb.auth.onAuthStateChange(function(event,s){
    setTimeout(function(){
      if(event==='PASSWORD_RECOVERY'){recovery=true;document.body.classList.remove('loading');setAuthMode('reset');return}
      if(recovery)return;
      if(s&&s.user){if(myUid!==s.user.id)enterApp(s.user)}
      else{document.body.classList.remove('loading');if(myUid)leaveApp()}
    },0);
  });
}else{
  document.body.classList.remove('loading');$('#auth-setup').hidden=false;
}
})();
