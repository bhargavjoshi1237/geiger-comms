// The embeddable loader (spec §7). Hard budget: under 5 KB gzipped — it is on
// the critical path of somebody else's website. Responsibilities, and nothing
// else: drain the install-snippet queue, own the anonymous id in the HOST
// page's localStorage (§4.3), style + render the launcher from /config, mount
// the iframe lazily on first open, run the strict postMessage bridge (§8), and
// play the reply chime.
// ES5-flavoured on purpose: no build step, no dependencies, one global.

// Inline SVG strings keep the loader small; same Lucide outlines as components/widget/widget_primitives.
// SVG_MARK is the exception: the Geiger logo itself (public/logo1.svg's three strokes), kept in step with BrandMark.
const SVG_MARK =
  '<svg width="26" height="16" viewBox="0 0 467 285" fill="currentColor" aria-hidden="true"><path d="M409 1h57L304 284h-60zM285 1h60L181 284h-58zM161 1h63L57 284H0z"/></svg>';
const SVG_AI =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>';
const SVG_MINIMIZE =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

// Comment-only lines and indentation never ship: the served script stays inside its 5 KB gzip budget. Safe because the
// template has no multi-line strings and no code line starts with // or *.
function compact(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

export function buildLoaderScript(origin, basePath) {
  return compact(`(function(){
"use strict";
var ORIGIN=${JSON.stringify(origin)};
var BASE=${JSON.stringify(basePath)};
var w=window,d=document;
var here=w.location.pathname.slice(BASE.length);
if(w.location.origin===ORIGIN&&(here==="/widget"||here.indexOf("/widget/")===0))return;
var queued=w.GeigerComms&&w.GeigerComms.q?w.GeigerComms.q:[];
var S={appId:null,jwt:null,email:null,anon:null,hideLauncher:false,open:false,ready:false,config:null,visitorId:null,root:null,wrap:null,frame:null,btn:null,badge:null,label:null,icon:"help",hasUnreadReply:false,lastReplyAuthor:null,sound:true,chimedAt:0};
var pending=[];
var cbs={show:[],hide:[],unread:[],email:[],event:[]};

function emit(list,v){for(var i=0;i<list.length;i++){try{list[i](v);}catch(e){}}}
function uuid(){
  if(w.crypto&&w.crypto.randomUUID)return w.crypto.randomUUID();
  return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);});
}
var AK="geiger_comms_anonymous_id";
function anonId(){
  try{var id=w.localStorage.getItem(AK);
  if(!id){id=S.anon||uuid();w.localStorage.setItem(AK,id);}
  S.anon=id;}catch(e){if(!S.anon)S.anon=uuid();}
  return S.anon;
}
function on(list,cb){
  if(typeof cb!=="function")return function(){};
  list.push(cb);
  return function(){var i=list.indexOf(cb);if(i>=0)list.splice(i,1);};
}
function appearance(){return(S.config&&S.config.appearance)||{};}
function post(type,payload){
  S.frame.contentWindow.postMessage({source:"geiger-comms",v:1,type:type,payload:payload===undefined?null:payload},ORIGIN);
}
// Until the iframe says ready it may not have navigated yet; hold every command and flush in order after boot.
function toWidget(type,payload){
  if(!S.ready){if(pending.length<100)pending.push([type,payload]);return;}
  if(S.frame&&S.frame.contentWindow)post(type,payload);
}
function applyConfig(config){S.config=config;placeRoot();renderLauncher();}
// The UI is built before /config answers, so the side is (re)applied whenever the appearance arrives.
function placeRoot(){
  if(!S.root)return;
  var left=appearance().position==="left",r=S.root.style;
  r.left=left?"36px":"auto";r.right=left?"auto":"36px";r.alignItems=left?"flex-start":"flex-end";
}
function fetchConfig(){
  try{
    fetch(ORIGIN+BASE+"/api/widget/config?appId="+encodeURIComponent(S.appId))
      .then(function(r){return r.ok?r.json():null;})
      .then(function(c){if(c)applyConfig(c);}).catch(function(){});
  }catch(e){}
}
// The reply chime plays here, not in the iframe: the click that opened the launcher unlocks audio for the host page, with no iframe permission needed.
var AC=null;
function audio(){
  var C=w.AudioContext||w.webkitAudioContext;
  try{if(!AC&&C)AC=new C();if(AC&&AC.state!=="running")AC.resume().catch(function(){});}catch(e){}
  return AC;
}
// Mallet: D5 then G5 on a wooden bar (partial ratio, peak, attack, decay), about -12 dBFS peak. At most one every 3s.
var MALLET=[[1,.178,.002,.5],[4,.0535,.001,.09],[9.9,.0125,.001,.025]];
function chime(){
  var now=Date.now(),c;
  if(!S.sound||now-S.chimedAt<3000||!(c=audio()))return;
  S.chimedAt=now;
  for(var n=0;n<2;n++)for(var j=0;j<3;j++){
    var p=MALLET[j],t=c.currentTime+.03+n*.1,o=c.createOscillator(),g=c.createGain();
    o.frequency.value=(n?783.99:587.33)*p[0];
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(p[1],t+p[2]);g.gain.exponentialRampToValueAtTime(3.2e-5,t+p[2]+p[3]);
    o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+p[2]+p[3]+.02);
  }
}
function bootPayload(){
  return{appId:S.appId,jwt:S.jwt||null,anonymousId:anonId(),email:S.email||null,parentOrigin:w.location.origin};
}

// Launcher shapes: a 56px circle (closed), a pill (host label or "Maya replied"), a chevron circle (open); setLauncherState({ icon }) picks the closed glyph.
var ICONS={
  help:${JSON.stringify(SVG_MARK)},
  ai:${JSON.stringify(SVG_AI)},
  minimize:${JSON.stringify(SVG_MINIMIZE)}
};
function iconFor(){
  if(S.open)return ICONS.minimize;
  return ICONS[S.icon]||ICONS.help;
}
// Brightness 0-1 of a #hex or rgb()/rgba() colour, -1 when transparent; no sRGB gamma step, which would not change a decision here.
function lum(c){
  var h=String(c||"").replace("#",""),m;
  if(h.length===3)h=h.replace(/./g,"$&$&");
  if(/^[0-9a-f]{6}$/i.test(h))m=[0,2,4].map(function(i){return parseInt(h.substr(i,2),16);});
  else{m=String(c).match(/[\\d.]+/g);if(!m||m.length<3||m[3]==0)return -1;}
  return(0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255;
}
// The host page's colour behind the launcher; transparent all the way up is the browser's white.
function pageBg(){
  var e=[d.body,d.documentElement],c;
  for(var i=0;i<2;i++){c=e[i]&&w.getComputedStyle(e[i]).backgroundColor;if(lum(c)>=0)return c;}
  return"#ffffff";
}

function renderLauncher(){
  if(!S.btn)return;
  // launcherColor fills the circle unless the page would swallow it (white on light, near-black on dark); open is a neutral minimise button.
  var page=pageBg(),light=lum(page)>.5,lc=appearance().launcherColor||"#ffffff",l=lum(lc),b=S.btn.style,pill=!S.open&&!!(S.label||S.hasUnreadReply);
  var bg=S.open?(light?"#18181b":"#2a2a2a"):(light?l>.85:l<.12)?(light?"#18181b":"#ffffff"):lc;
  // A reply reads "Maya replied" beside her "MR" disc (the messenger sends both); with no author it is just "New reply".
  var who=S.label?"":S.ini;
  b.background=bg;
  b.color=S.open||lum(bg)<=.6?"#ffffff":"#161616";
  b.border=S.open&&!light?"1px solid #333":"none";
  b.boxShadow="0 8px 24px -"+(light?"8px rgba(0,0,0,.35)":"6px rgba(0,0,0,.7)");
  b.width=pill?"auto":"56px";b.height=pill?"44px":"56px";b.borderRadius="99px";
  b.padding=pill?who?"0 16px 0 10px":"0 16px 0 14px":"0";
  // A pill names itself with its visible text; the circles need a label.
  if(pill)S.btn.removeAttribute("aria-label");
  else S.btn.setAttribute("aria-label",S.open?"Minimise messenger":"Open messenger");
  S.btn.innerHTML=pill?'<span style="display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;line-height:1;">'+
    (who?'<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;border-radius:50%;border:1.5px solid;font-size:10px;">'+escapeHtml(who)+'</span>':iconFor())+
    '<span>'+escapeHtml(S.label||(who?S.lastReplyAuthor+" replied":"New reply"))+'</span></span>':iconFor();
  // innerHTML replaced the badge, so it is re-hung every render; only the plain circle shows it.
  if(S.badge){
    var n=S.unread||0,s=S.badge.style;
    s.display=n>0&&!pill&&!S.open?"block":"none";
    // Ring the badge in the page's own colour so it reads as cut out of the launcher.
    s.borderColor=page;
    S.badge.textContent=n>99?"99+":String(n);
    S.btn.appendChild(S.badge);
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"})[c];});}

function buildUi(){
  if(S.root)return;
  var root=d.createElement("div");
  root.setAttribute("data-geiger-comms","");
  root.setAttribute("aria-live","polite");
  root.style.cssText="all:initial;position:fixed;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;gap:14px;pointer-events:none;";
  var wrap=d.createElement("div");
  wrap.style.cssText="pointer-events:auto;width:min(384px,calc(100vw - 72px));height:min(620px,calc(100vh - 110px));display:none;";
  var frame=d.createElement("iframe");
  frame.setAttribute("title","Geiger Comms messenger");
  frame.setAttribute("allow","clipboard-write");
  frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms allow-popups");
  frame.style.cssText="border:none;width:100%;height:100%;border-radius:16px;box-shadow:0 24px 48px -12px rgba(0,0,0,.6);background:transparent;color-scheme:normal;";
  wrap.appendChild(frame);
  var btn=d.createElement("button");
  btn.type="button";
  btn.setAttribute("aria-expanded","false");
  btn.style.cssText="pointer-events:auto;position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;transition:transform .16s ease;";
  var badge=d.createElement("span");
  badge.style.cssText="position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;border-radius:10px;background:#2563eb;color:#fff;font-size:11px;font-weight:600;line-height:20px;text-align:center;display:none;padding:0 5px;border:2px solid;font-family:inherit;";
  btn.appendChild(badge);
  btn.addEventListener("mouseenter",function(){btn.style.transform="scale(1.04)";});
  btn.addEventListener("mouseleave",function(){btn.style.transform="none";});
  btn.addEventListener("click",function(){setOpen(!S.open);});
  root.appendChild(wrap);root.appendChild(btn);
  d.body.appendChild(root);
  S.root=root;S.wrap=wrap;S.frame=frame;S.btn=btn;S.badge=badge;
  placeRoot();
  renderLauncher();
}
function widgetUrl(){
  return ORIGIN+BASE+"/widget?appId="+encodeURIComponent(S.appId)+"&parentOrigin="+encodeURIComponent(w.location.origin);
}
function setOpen(open){
  if(open&&S.sound)audio();
  if(open&&!S.root)buildUi();
  if(open&&!S.frame.src)S.frame.src=widgetUrl();
  S.open=open;
  if(S.wrap)S.wrap.style.display=open?"block":"none";
  if(S.btn){
    S.btn.setAttribute("aria-expanded",open?"true":"false");
    renderLauncher();
  }
  toWidget(open?"show":"hide");
  emit(open?cbs.show:cbs.hide);
}
function onMsg(event){
  if(event.origin!==ORIGIN)return;
  if(!S.frame||event.source!==S.frame.contentWindow)return;
  var m=event.data;
  if(!m||m.source!=="geiger-comms"||m.v!==1)return;
  if(m.type==="ready"){
    S.ready=true;post("boot",bootPayload());
    var q=pending;pending=[];
    for(var j=0;j<q.length;j++)post(q[j][0],q[j][1]);
  }
  else if(m.type==="unreadCount"){
    S.unread=(m.payload&&m.payload.count)|0;
    renderLauncher();
    emit(cbs.unread,S.unread);
  }
  else if(m.type==="resize"){var h=m.payload&&m.payload.height;if(h&&S.wrap)S.wrap.style.height=Math.min(h,w.innerHeight-110)+"px";}
  else if(m.type==="open"){setOpen(true);}
  else if(m.type==="close"){setOpen(false);}
  else if(m.type==="visitor"){S.visitorId=m.payload&&m.payload.visitorId;}
  else if(m.type==="userEmailSupplied"){emit(cbs.email,m.payload&&m.payload.email);}
  else if(m.type==="launcher"){
    var p=m.payload||{};
    if(p.label!==undefined)S.label=p.label||null;
    if(p.icon!==undefined)S.icon=p.icon||"help";
    if(p.unreadReply!==undefined){S.hasUnreadReply=!!p.unreadReply;if(p.author){S.lastReplyAuthor=p.author;S.ini=p.initials;}}
    if(p.unread!==undefined)S.unread=p.unread|0;
    renderLauncher();
    if(p.unread!==undefined)emit(cbs.unread,S.unread);
  }
  else if(m.type==="chime"){chime();}
  else if(m.type==="event"){emit(cbs.event,m.payload||{});}
}
w.addEventListener("message",onMsg,false);

var methods={
  boot:function(s){
    s=s||{};
    S.appId=s.appId||S.appId;
    S.jwt=s.jwt||null;
    S.email=(s.user&&s.user.email)||null;
    S.hideLauncher=!!(s.options&&s.options.hideDefaultLauncher);
    S.sound=!(s.options&&s.options.sound===false);
    if(!S.appId)return;
    buildUi();
    if(S.ready)toWidget("boot",bootPayload());
    if(S.btn)S.btn.style.display=S.hideLauncher?"none":"flex";
    fetchConfig();
  },
  update:function(data){
    data=data||{};
    if(data.jwt!==undefined)S.jwt=data.jwt;
    if(data.user&&data.user.email)S.email=data.user.email;
    if(S.ready)toWidget("update",{jwt:S.jwt,email:S.email});
  },
  // Ends the session and forgets this browser's anonymous id, so the next visitor on a shared machine starts clean.
  shutdown:function(){
    if(S.ready)post("shutdown");
    if(S.root&&S.root.parentNode)S.root.parentNode.removeChild(S.root);
    S.root=S.wrap=S.frame=S.btn=S.badge=null;
    S.ready=false;S.open=false;S.unread=0;S.label=null;S.hasUnreadReply=false;S.lastReplyAuthor=null;
    S.jwt=null;S.email=null;S.visitorId=null;S.anon=null;pending=[];
    try{w.localStorage.removeItem(AK);}catch(e){}
  },
  show:function(){setOpen(true);},
  hide:function(){setOpen(false);},
  showSpace:function(n){setOpen(true);toWidget("showSpace",n);},
  showMessages:function(){setOpen(true);toWidget("showSpace","messages");},
  showAsk:function(t){setOpen(true);toWidget("showAsk",typeof t==="string"?t:"");},
  showNewMessage:function(t){setOpen(true);toWidget("showNewMessage",typeof t==="string"?t:"");},
  showConversation:function(id){setOpen(true);toWidget("showConversation",id);},
  showArticle:function(id){setOpen(true);toWidget("showArticle",id);},
  showNews:function(id){setOpen(true);toWidget("showNews",id);},
  showTicket:function(id){setOpen(true);toWidget("showTicket",id);},
  setLauncherState:function(state){
    state=state||{};
    if(state.label!==undefined)S.label=state.label||null;
    if(state.unread!==undefined)S.unread=state.unread|0;
    if(state.icon!==undefined)S.icon=state.icon||"help";
    renderLauncher();
    // Echo to the messenger so spaces like Home can show the same label.
    toWidget("launcher",{label:S.label,unread:S.unread,icon:S.icon});
  },
  trackEvent:function(n,m){toWidget("trackEvent",{name:n,meta:m});emit(cbs.event,{name:n,meta:m});},
  getVisitorId:function(){return S.visitorId;},
  onShow:function(cb){return on(cbs.show,cb);},
  onHide:function(cb){return on(cbs.hide,cb);},
  onUnreadCountChange:function(cb){var off=on(cbs.unread,cb);if(typeof cb==="function"){try{cb(S.unread||0);}catch(e){}}return off;},
  onUserEmailSupplied:function(cb){return on(cbs.email,cb);},
  onEvent:function(cb){return on(cbs.event,cb);},
  onTrackedEvent:function(cb){return on(cbs.event,cb);}
};

// Every argument is forwarded, so queued calls like trackEvent(name, meta) keep their metadata.
function api(method){
  var f=methods[method];
  if(typeof f==="function")return f.apply(null,Array.prototype.slice.call(arguments,1));
}
for(var k in methods){if(Object.prototype.hasOwnProperty.call(methods,k))api[k]=methods[k];}
api.q=[];
w.GeigerComms=api;
for(var i=0;i<queued.length;i++){
  var item=queued[i];
  if(item&&item.length)api.apply(null,Array.prototype.slice.call(item));
}
})();`);
}
