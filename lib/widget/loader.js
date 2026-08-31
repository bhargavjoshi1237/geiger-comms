// The embeddable loader (spec §7). Hard budget: under 5 KB gzipped — it is on
// the critical path of somebody else's website. Responsibilities, and nothing
// else: drain the install-snippet queue, own the anonymous id in the HOST
// page's localStorage (§4.3), style + render the launcher from /config, mount
// the iframe lazily on first open, and run the strict postMessage bridge (§8).
// ES5-flavoured on purpose: no build step, no dependencies, one global.

// SVG strings are built inline so the loader stays small; icons are kept in
// the messenger itself for richer states (idle help pill, unread-reply bubble,
// minimize button).
// Same Lucide outlines the messenger draws (components/widget/widget_primitives)
// so the launcher glyph and the in-panel icons are one set, not two.
//
// SVG_BUBBLE is the one exception, and it is the brand mark: a chat bubble whose
// three message lines are the three leaning strokes of the Geiger logo
// (public/logo1.svg), at the logo's own 38-degree lean. It reads as "chat" from
// across the page and as "Geiger" up close — the same glyph the messenger draws
// on its boot screen.
const SVG_BUBBLE =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M6.9 14.7 11.2 9.3" stroke-width="1.6"/><path d="M10.5 14.7 14.8 9.3" stroke-width="1.6"/><path d="M14.1 14.7 18.4 9.3" stroke-width="1.6"/></svg>';
const SVG_CLOSE =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
const SVG_AI =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>';
const SVG_MINIMIZE =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

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
 *   1. circular (default 56x56)      — messenger closed, nothing to say
 *   2. pill (auto-width) with label  — "Help", or "Maya replied"
 *   3. circular 48x48 with an X      — messenger open
 *
 * The glyph inside is chosen by iconFor(): the messenger can ask for "ai"
 * (sparkles, e.g. while Ask mode is armed) or "minimize" (chevron) and the
 * host page can override any of them through setLauncherState({ icon }).
 */
var ICONS={
  help:${JSON.stringify(SVG_BUBBLE)},
  ai:${JSON.stringify(SVG_AI)},
  minimize:${JSON.stringify(SVG_MINIMIZE)},
  close:${JSON.stringify(SVG_CLOSE)}
};
function iconFor(){
  if(S.open)return ICONS.close;
  if(S.icon&&ICONS[S.icon])return ICONS[S.icon];
  return ICONS.help;
}
function pillLabel(){
  if(S.label)return S.label;
  if(S.hasUnreadReply){
    var who=S.lastReplyAuthor||"New reply";
    return(who+" replied");
  }
  return"Help";
}
function isPill(){return !S.open && (!!S.label || !!S.hasUnreadReply);}
// Pick a legible glyph colour for any launcherColor. The sRGB gamma step is
// skipped deliberately — the loader is on someone else's critical path and the
// extra accuracy would not move a single decision here.
function readable(hex){
  var h=String(hex||"").replace("#","");
  if(h.length===3)h=h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);
  if(!/^[0-9a-fA-F]{6}$/.test(h))return"#161616";
  var l=(0.2126*parseInt(h.slice(0,2),16)+0.7152*parseInt(h.slice(2,4),16)+0.0722*parseInt(h.slice(4,6),16))/255;
  return l>0.6?"#161616":"#ffffff";
}

function renderLauncher(){
  if(!S.btn)return;
  // The launcher is a white circle with a dark brand glyph by default; a
  // customer's launcherColor replaces the fill and the glyph follows it. Open
  // state inverts to a neutral surface either way.
  var bg=S.open?"#333333":(appearance().launcherColor||"#ffffff");
  var fg=S.open?"#e7e7e7":readable(bg);
  var icon=iconFor();
  S.btn.style.background=bg;
  S.btn.style.color=fg;
  if(S.open){
    S.btn.style.width="56px";S.btn.style.height="56px";S.btn.style.borderRadius="50%";
    S.btn.style.padding="0";S.btn.innerHTML=icon;
  } else if(isPill()){
    S.btn.style.width="auto";S.btn.style.height="44px";S.btn.style.borderRadius="9999px";
    S.btn.style.padding="0 16px 0 14px";
    S.btn.innerHTML='<span style="display:inline-flex;align-items:center;gap:8px;color:inherit;font-family:inherit;font-size:13px;font-weight:600;line-height:1;">'+
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;">'+icon+'</span>'+
      '<span>'+escapeHtml(pillLabel())+'</span></span>';
  } else {
    S.btn.style.width="56px";S.btn.style.height="56px";S.btn.style.borderRadius="50%";
    S.btn.style.padding="0";S.btn.innerHTML=icon;
  }
  // innerHTML above replaces the button's children, so the badge is re-hung
  // every render. Badge only matters on the plain circle — a pill carries its
  // own hint.
  if(S.badge){
    var n=S.unread||0;
    var showBadge=n>0&&!isPill()&&!S.open;
    S.badge.style.display=showBadge?"block":"none";
    // Ring the badge in the launcher's own fill so it reads as lifted off it.
    S.badge.style.borderColor=bg;
    S.badge.textContent=n>99?"99+":String(n);
    S.btn.appendChild(S.badge);
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"})[c];});}

function buildUi(){
  if(S.root)return;
  var side=(appearance().position==="left")?"left":"right";
  var root=d.createElement("div");
  root.setAttribute("data-geiger-comms","");
  root.setAttribute("aria-live","polite");
  root.style.cssText="all:initial;position:fixed;bottom:20px;"+side+":20px;z-index:2147483000;display:flex;flex-direction:column;align-items:"+(side==="left"?"flex-start":"flex-end")+";gap:14px;pointer-events:none;";
  var wrap=d.createElement("div");
  wrap.style.cssText="pointer-events:auto;width:min(384px,calc(100vw - 40px));height:min(620px,calc(100vh - 110px));display:none;";
  var frame=d.createElement("iframe");
  frame.setAttribute("title","Geiger Comms messenger");
  frame.setAttribute("allow","clipboard-write");
  frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms allow-popups");
  frame.style.cssText="border:none;width:100%;height:100%;border-radius:16px;box-shadow:0 24px 48px -12px rgba(0,0,0,.6);background:transparent;color-scheme:normal;";
  wrap.appendChild(frame);
  var btn=d.createElement("button");
  btn.type="button";
  btn.setAttribute("aria-label","Open chat");
  btn.setAttribute("aria-expanded","false");
  btn.style.cssText="pointer-events:auto;position:relative;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:#ffffff;color:#161616;box-shadow:0 8px 24px -6px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;transition:transform .16s ease;";
  var badge=d.createElement("span");
  badge.style.cssText="position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;border-radius:10px;background:#3b82f6;color:#fff;font-size:11px;font-weight:600;line-height:20px;text-align:center;display:none;padding:0 5px;border:2px solid #161616;font-family:inherit;";
  btn.appendChild(badge);
  btn.addEventListener("mouseenter",function(){btn.style.transform="scale(1.04)";});
  btn.addEventListener("mouseleave",function(){btn.style.transform="none";});
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
