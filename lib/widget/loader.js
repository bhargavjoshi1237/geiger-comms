// The embeddable loader (spec §7). Hard budget: under 5 KB gzipped — it is on
// the critical path of somebody else's website. Responsibilities, and nothing
// else: drain the install-snippet queue, own the anonymous id in the HOST
// page's localStorage (§4.3), style + render the launcher from /config, mount
// the iframe lazily on first open, and run the strict postMessage bridge (§8).
// ES5-flavoured on purpose: no build step, no dependencies, one global.

// SVG strings are built inline so the loader stays small; icons are kept in
// the messenger itself for richer states (idle help pill, unread-reply bubble,
// minimize button).
const SVG_BUBBLE =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const SVG_CLOSE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6"/></svg>';

export function buildLoaderScript(origin, basePath) {
  return `(function(){
"use strict";
var ORIGIN=${JSON.stringify(origin)};
var BASE=${JSON.stringify(basePath)};
var w=window,d=document;
var here=w.location.pathname.slice(BASE.length);
if(w.location.origin===ORIGIN&&(here==="/widget"||here.indexOf("/widget/")===0))return;
var queued=w.GeigerComms&&w.GeigerComms.q?w.GeigerComms.q:[];
var S={appId:null,jwt:null,email:null,hideLauncher:false,open:false,ready:false,config:null,visitorId:null,root:null,wrap:null,frame:null,btn:null,badge:null,label:null,icon:"help",minimized:false,hasUnreadReply:false,lastReplyAuthor:null};
var cbs={show:[],hide:[],unread:[],email:[],event:[]};

function emit(list,v){for(var i=0;i<list.length;i++){try{list[i](v);}catch(e){}}}
function uuid(){
  if(w.crypto&&w.crypto.randomUUID)return w.crypto.randomUUID();
  return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);});
}
function anonId(){
  try{var k="geiger_comms_anonymous_id",id=w.localStorage.getItem(k);
  if(!id){id=uuid();w.localStorage.setItem(k,id);}
  return id;}catch(e){return uuid();}
}
function appearance(){return(S.config&&S.config.appearance)||{};}
function toWidget(type,payload){
  if(S.frame&&S.frame.contentWindow){
    S.frame.contentWindow.postMessage({source:"geiger-comms",v:1,type:type,payload:payload===undefined?null:payload},ORIGIN);
  }
}
function applyConfig(config){S.config=config;renderLauncher();}
function fetchConfig(){
  try{
    fetch(ORIGIN+BASE+"/api/widget/config?appId="+encodeURIComponent(S.appId))
      .then(function(r){return r.ok?r.json():null;})
      .then(function(c){if(c)applyConfig(c);}).catch(function(){});
  }catch(e){}
}
function bootPayload(){
  return{appId:S.appId,jwt:S.jwt||null,anonymousId:anonId(),email:S.email||null,parentOrigin:w.location.origin};
}

/**
 * Render the launcher in one of three shapes:
 *   1. circular bubble (default 56×56)  — used when the messenger is closed
 *   2. pill (auto-width) with label     — used for "Help" or "Maya replied"
 *   3. circular with close icon        — used while the messenger is open
 * Pill appears when the messenger has unread replies and an optional label
 * (set via setLauncherState). Clicking the launcher always toggles open.
 */
function pillLabel(){
  if(S.label)return S.label;
  if(S.hasUnreadReply){
    var who=S.lastReplyAuthor||"New reply";
    return(who+" replied");
  }
  return"Help";
}
function isPill(){return !S.open && (S.label || S.hasUnreadReply);}
function renderLauncher(){
  if(!S.btn)return;
  S.btn.style.background=(appearance().launcherColor)||"#6366f1";
  var color=(appearance().launcherColor)||"#6366f1";
  S.btn.style.background=color;
  if(S.open){
    S.btn.style.width="48px";S.btn.style.height="48px";S.btn.style.borderRadius="9999px";
    S.btn.style.padding="0";S.btn.innerHTML=${JSON.stringify(SVG_CLOSE)};
  } else if(isPill()){
    S.btn.style.width="auto";S.btn.style.height="40px";S.btn.style.borderRadius="9999px";
    S.btn.style.padding="0 14px 0 12px";
    var t=pillLabel();
    S.btn.innerHTML='<span style="display:inline-flex;align-items:center;gap:8px;color:#fff;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;line-height:1;">'+(S.label?'<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:rgba(255,255,255,.18);">'+${JSON.stringify(SVG_BUBBLE)}+'</span>':'<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:rgba(255,255,255,.18);">'+${JSON.stringify(SVG_BUBBLE)}+'</span>')+'<span>'+escapeHtml(t)+'</span></span>';
    if(S.badge){
      S.badge.style.display="none";
    }
  } else {
    S.btn.style.width="56px";S.btn.style.height="56px";S.btn.style.borderRadius="9999px";
    S.btn.style.padding="0";S.btn.innerHTML=${JSON.stringify(SVG_BUBBLE)};
  }
  // Badge (only relevant when not a pill — pill carries its own "replied" hint).
  if(S.badge && !isPill() && !S.open){
    var n=S.unread||0;
    S.badge.style.display=n>0?"block":"none";
    S.badge.textContent=n>99?"99+":String(n);
  } else if(S.badge){
    S.badge.style.display="none";
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"})[c];});}

function buildUi(){
  if(S.root)return;
  var side=(appearance().position==="left")?"left":"right";
  var root=d.createElement("div");
  root.setAttribute("data-geiger-comms","");
  root.setAttribute("aria-live","polite");
  root.style.cssText="all:initial;position:fixed;bottom:20px;"+side+":20px;z-index:2147483000;display:flex;flex-direction:column;align-items:"+(side==="left"?"flex-start":"flex-end")+";gap:12px;pointer-events:none;";
  var wrap=d.createElement("div");
  wrap.style.cssText="pointer-events:auto;width:min(380px,calc(100vw - 40px));height:min(620px,calc(100vh - 110px));display:none;";
  var frame=d.createElement("iframe");
  frame.setAttribute("title","Geiger Comms messenger");
  frame.setAttribute("allow","clipboard-write");
  frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms allow-popups");
  frame.style.cssText="border:none;width:100%;height:100%;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);background:transparent;";
  wrap.appendChild(frame);
  var btn=d.createElement("button");
  btn.type="button";
  btn.setAttribute("aria-label","Open chat");
  btn.setAttribute("aria-expanded","false");
  btn.style.cssText="pointer-events:auto;width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;background:#6366f1;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s ease;";
  var badge=d.createElement("span");
  badge.style.cssText="position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;border-radius:9999px;background:#ef4444;color:#fff;font-size:11px;line-height:18px;text-align:center;display:none;padding:0 4px;font-family:system-ui,sans-serif;";
  btn.appendChild(badge);
  btn.addEventListener("click",function(){setOpen(!S.open);});
  root.appendChild(wrap);root.appendChild(btn);
  d.body.appendChild(root);
  S.root=root;S.wrap=wrap;S.frame=frame;S.btn=btn;S.badge=badge;
  renderLauncher();
}
function widgetUrl(){
  return ORIGIN+BASE+"/widget?appId="+encodeURIComponent(S.appId)+"&parentOrigin="+encodeURIComponent(w.location.origin);
}
function setOpen(open){
  if(open&&!S.root)buildUi();
  if(open&&!S.frame.src)S.frame.src=widgetUrl();
  S.open=open;
  S.minimized=false;
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
  if(m.type==="ready"){S.ready=true;toWidget("boot",bootPayload());}
  else if(m.type==="unreadCount"){
    var c=(m.payload&&m.payload.count)|0;
    S.unread=c;
    if(S.badge){
      S.badge.style.display=c>0&&!isPill()&&!S.open?"block":"none";
      S.badge.textContent=c>99?"99+":String(c);
    }
    emit(cbs.unread,c);
  }
  else if(m.type==="resize"){var h=m.payload&&m.payload.height;if(h&&S.wrap)S.wrap.style.height=Math.min(h,w.innerHeight-110)+"px";}
  else if(m.type==="open"){setOpen(true);}
  else if(m.type==="close"){setOpen(false);}
  else if(m.type==="visitor"){S.visitorId=m.payload&&m.payload.visitorId;}
  else if(m.type==="userEmailSupplied"){emit(cbs.email,m.payload&&m.payload.email);}
  else if(m.type==="launcher"){
    var p=m.payload||{};
    if(typeof p.label!=="undefined"){S.label=p.label||null;renderLauncher();}
    if(typeof p.unread!=="undefined"){
      S.unread=p.unread|0;
      if(S.badge){
        S.badge.style.display=S.unread>0&&!isPill()&&!S.open?"block":"none";
        S.badge.textContent=S.unread>99?"99+":String(S.unread);
      }
      emit(cbs.unread,S.unread);
    }
    if(typeof p.icon!=="undefined"){S.icon=p.icon||"help";renderLauncher();}
    if(typeof p.unreadReply!=="undefined"){S.hasUnreadReply=!!p.unreadReply;if(p.author)S.lastReplyAuthor=p.author;renderLauncher();}
  }
  else if(m.type==="event"){
    var ev=m.payload||{};
    emit(cbs.event,ev);
  }
}
w.addEventListener("message",onMsg,false);

var methods={
  boot:function(s){
    s=s||{};
    S.appId=s.appId||S.appId;
    S.jwt=s.jwt||null;
    S.email=(s.user&&s.user.email)||null;
    S.hideLauncher=!!(s.options&&s.options.hideDefaultLauncher);
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
  shutdown:function(){
    toWidget("shutdown");
    if(S.root&&S.root.parentNode)S.root.parentNode.removeChild(S.root);
    S.root=S.wrap=S.frame=S.btn=S.badge=null;
    S.ready=false;S.open=false;S.unread=0;S.label=null;S.hasUnreadReply=false;S.lastReplyAuthor=null;
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
  onShow:function(cb){if(typeof cb==="function")cbs.show.push(cb);},
  onHide:function(cb){if(typeof cb==="function")cbs.hide.push(cb);},
  onUnreadCountChange:function(cb){if(typeof cb==="function")cbs.unread.push(cb);emit(cbs.unread,S.unread||0);},
  onUserEmailSupplied:function(cb){if(typeof cb==="function")cbs.email.push(cb);},
  onEvent:function(cb){if(typeof cb==="function")cbs.event.push(cb);},
  onTrackedEvent:function(cb){if(typeof cb==="function")cbs.event.push(cb);}
};

function api(method,arg){
  if(methods[method])methods[method](arg);
}
api.boot=methods.boot;
for(var k in methods){if(Object.prototype.hasOwnProperty.call(methods,k))api[k]=methods[k];}
api.q=[];
w.GeigerComms=api;
for(var i=0;i<queued.length;i++){
  var item=queued[i];
  if(item&&item.length)api(item[0],item[1]);
}
})();`;
}
