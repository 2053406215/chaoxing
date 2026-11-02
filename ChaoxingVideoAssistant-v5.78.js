var __starChapterCore=(function(){var module={exports:{}};
// ES5, shared by the Android adapter and Node regression tests.
// A viewport is not a learning position. Only confirmed state can select a chapter.
function normalize(value){return String(value||'').replace(/\s+/g,'').replace(/^[0-9]+(?:\.[0-9]+)+[.．、:]?/,'');}
function identity(number,title){return String(number||'')+'|'+normalize(title);}
function layout(s){return s.course+'|'+s.rows.map(function(r){return r.id+'@'+r.rect.join(',');}).join(';');}
function numberCompare(a,b){
 var x=String(a||'').split('.'),y=String(b||'').split('.');
 if(!a||!b)return 0;
 for(var i=0;i<Math.max(x.length,y.length);i++){var d=Number(x[i]||0)-Number(y[i]||0);if(d)return d<0?-1:1;}
 return 0;
}
function resolved(row){return row.status==='complete'||row.status==='incomplete';}
function Navigator(options){
 this.options=options||{};this.quietMs=this.options.quietMs||180;
 this.statusTimeout=this.options.statusTimeout||6000;this.clickTimeout=this.options.clickTimeout||5000;
 this.generation=0;this.lastMotion=-Infinity;this.touching=false;this.course='';this.manual=false;
 this.reset('');
}
Navigator.prototype.reset=function(course,anchor){
 this.course=course;this.anchor=anchor||null;this.target=null;this.records={};this.order=[];
 this.covered=false;this.previous=null;this.flight=null;this.inDirectory=false;this.waits={};
 this.signature='';this.layoutAt=0;this.samples=0;this.scrolls=0;this.halt='';this.arrivalText='';
 this.generation++;this.manual=false;
};
Navigator.prototype.motion=function(now,touching){
 this.lastMotion=now;this.samples=0;this.generation++;
 if(typeof touching==='boolean')this.touching=touching;
};
Navigator.prototype.resume=function(){this.manual=false;this.halt='';this.flight=null;this.inDirectory=false;this.scrolls=0;this.signature='';this.samples=0;this.waits={};this.touching=false;this.generation++;};
Navigator.prototype.stable=function(s,now){
 var signature=layout(s);
 if(signature!==this.signature){this.signature=signature;this.layoutAt=now;this.samples=1;return false;}
 this.samples++;
 return !this.touching&&this.samples>=2&&now-this.layoutAt>=this.quietMs&&now-this.lastMotion>=this.quietMs;
};
Navigator.prototype.waitFor=function(id,now){
 if(this.waits[id]===undefined)this.waits[id]=now;
 if(now-this.waits[id]>=this.statusTimeout){this.halt='状态未确认';return {type:'hold',reason:'状态未确认',id:id};}
 return {type:'wait',reason:'等待完成状态',id:id};
};
Navigator.prototype.waitRow=function(row,now){
 if(row.fullyVisible===false)return {type:'align',id:row.id};
 return this.waitFor(row.id,now);
};
Navigator.prototype.scroll=function(direction,s){
 if(++this.scrolls>64){this.halt='定位达到上限';return {type:'hold',reason:this.halt};}
 // 没有列表索引时只能靠相邻两屏的重叠行证明连续；整页翻动会丢失覆盖并反复回顶。
 var overlap=direction==='forward'&&!!s&&(s.from===null||s.from===undefined);
 return {type:'scroll',direction:direction,overlap:overlap};
};
Navigator.prototype.settle=function(){this.scrolls=0;this.waits={};this.samples=0;this.signature='';};
Navigator.prototype.merge=function(s){
 var ids=s.rows.map(function(r){return r.id;}),previous=this.previous;
 if(s.atStart){this.covered=true;this.order=ids.slice();}
 else if(this.covered&&previous){
  var overlap=previous.ids.some(function(id){return ids.indexOf(id)>=0;});
  var contiguous=previous.to!==null&&previous.to!==undefined&&s.from!==null&&s.from!==undefined&&s.to!==null&&s.to!==undefined&&
   s.from<=previous.to+1&&s.to>=previous.from-1;
  if(!overlap&&!contiguous)this.covered=false;
  else ids.forEach(function(id){if(this.order.indexOf(id)<0){this.order.push(id);this.scrolls=0;}},this);
 }
 delete this.waits.directory;
 s.rows.forEach(function(row){this.records[row.id]=row;if(resolved(row))delete this.waits[row.id];},this);
 this.previous={ids:ids,from:s.from,to:s.to};
};
Navigator.prototype.seek=function(s,target){
 var numbered=s.rows.filter(function(r){return r.number;});
 if(target&&target.number&&numbered.length){
  if(numberCompare(target.number,numbered[0].number)<0)return this.scroll('backward',s);
  if(numberCompare(target.number,numbered[numbered.length-1].number)>0){
   if(s.atEnd)return null;
   return this.scroll('forward',s);
  }
  if(numbered.some(function(r){return r.number===target.number;})||numbered.length>1)return null;
 }
 if(target&&this.covered&&this.order.indexOf(target.id)<0)return this.scroll('forward',s);
 if(target&&this.covered){
  var first=this.order.indexOf(s.rows[0].id),index=this.order.indexOf(target.id);
  if(first>=0&&index>=0)return this.scroll(index<first?'backward':'forward',s);
 }
 return this.scroll('backward');
};
Navigator.prototype.observe=function(s,now,anchor){
 if(s.course!==this.course)this.reset(s.course,anchor);
 this.inDirectory=true;
 if(this.manual)return {type:'manual',reason:'用户主动浏览'};
 if(this.halt)return {type:'hold',reason:this.halt};
 if(this.flight){
  if(now-this.flight.at>=this.clickTimeout){this.halt='进入结果未确认';return {type:'hold',reason:this.halt};}
  return {type:'wait',reason:'等待章节内容'};
 }
 if(!s.course||!s.rows.length)return this.waitFor('directory',now);
 var ids={};
 for(var j=0;j<s.rows.length;j++){
  if(ids[s.rows[j].id]){this.halt='章节身份重复';return {type:'hold',reason:this.halt};}
  ids[s.rows[j].id]=true;
 }
 if(!this.stable(s,now))return {type:'wait',reason:'等待滚动结束'};
 this.merge(s);
 var target=this.target||(this.anchor&&{id:this.anchor.id,title:this.anchor.title,number:this.anchor.number});
 if(target){
  var visible=s.rows.filter(function(r){return r.id===target.id;})[0];
  if(!visible){
   var sought=this.seek(s,target);if(sought)return sought;
   // 章节号范围已覆盖却找不到：保存的进度身份失效（改名、删除），丢弃后从头确认。
  }else{
   if(!resolved(visible))return this.waitRow(visible,now);
   if(visible.status==='incomplete'){
    this.target={id:visible.id,title:visible.title,number:visible.number};
    return this.openIntent(s,visible);
   }
  }
  // Re-evaluate from a proven prefix; do not advance just because a cached target changed.
  this.target=null;this.anchor=null;
  if(!s.atStart){this.covered=false;return this.scroll('backward',s);}
 }
 if(!this.covered)return this.scroll('backward');
 for(var i=0;i<this.order.length;i++){
  var row=this.records[this.order[i]];
  if(!row||!resolved(row)){
   if(row&&!ids[row.id])return this.seek(s,row)||this.scroll('backward',s);
   return row?this.waitRow(row,now):this.waitFor(this.order[i],now);
  }
  if(row.status==='incomplete'){
   this.target={id:row.id,title:row.title,number:row.number};
   if(!ids[row.id])return this.seek(s,this.target)||this.scroll('backward',s);
   return this.openIntent(s,row);
  }
 }
 if(s.atEnd){this.halt='全部章节已完成';return {type:'complete',reason:this.halt};}
 return this.scroll('forward',s);
};
Navigator.prototype.openIntent=function(s,row){
 var isProgress=this.anchor&&this.anchor.id===row.id,prefix=[];
 if(!isProgress){for(var i=0;i<s.rows.length&&s.rows[i].id!==row.id;i++)prefix.push(s.rows[i].id);}
 return {type:'open',target:this.target,ticket:{course:this.course,id:row.id,generation:this.generation,layout:layout(s),prefix:prefix}};
};
Navigator.prototype.begin=function(ticket,s,now){
 if(this.flight||this.manual||this.halt||ticket.generation!==this.generation||ticket.course!==s.course||ticket.layout!==layout(s)||!this.target||ticket.id!==this.target.id)return null;
 if(!this.stable(s,now))return null;
 var row=s.rows.filter(function(r){return r.id===ticket.id;})[0];
 if(!row||row.status!=='incomplete')return null;
 for(var i=0;i<(ticket.prefix||[]).length;i++){
  var earlier=s.rows.filter(function(r){return r.id===ticket.prefix[i];})[0];
  if(!earlier||earlier.status!=='complete'){this.target=null;return null;}
 }
 this.flight={at:now,id:row.id,title:row.title,number:row.number,course:this.course,generation:this.generation};
 this.arrivalText='';this.arrivalAt=0;this.arrivalSamples=0;
 return row;
};
Navigator.prototype.arrive=function(heading,now){
 if(this.manual)return {type:'manual',reason:'用户主动浏览'};
 if(!this.flight){
  if(this.inDirectory){this.manual=true;return {type:'manual',reason:'用户主动打开章节'};}
  return {type:'none'};
 }
 if(!heading){
  if(now-this.flight.at>=this.clickTimeout){this.halt='章节标题未加载';return {type:'hold',reason:this.halt};}
  return {type:'wait',reason:'等待章节标题'};
 }
 var flight=this.flight,title=normalize(heading.title),match=title===normalize(flight.title);
 if(heading.number&&flight.number&&heading.number!==flight.number)match=false;
 if(!match||this.generation!==flight.generation){this.manual=true;return {type:'manual',reason:'目标与内容不一致'};}
 var key=identity(heading.number,heading.title);
 if(this.arrivalText!==key){this.arrivalText=key;this.arrivalAt=now;this.arrivalSamples=1;return {type:'wait',reason:'核对章节内容'};}
 this.arrivalSamples++;
 if(this.arrivalSamples<2||now-this.arrivalAt<this.quietMs)return {type:'wait',reason:'核对章节内容'};
 this.anchor={id:flight.id,title:flight.title,number:flight.number};
 this.flight=null;this.inDirectory=false;this.halt='';this.settle();
 return {type:'entered',course:this.course,anchor:this.anchor};
};
function textStatus(text){
 var compact=String(text||'').replace(/\s+/g,'');
 if(/加载|正在获取|刷新中/.test(compact))return 'unknown';
 if(/未完成|待完成|待学习|未学习|任务点[：:]?[1-9]\d*/.test(compact))return 'incomplete';
 if(/已完成|全部完成|无任务点|没有任务点|任务点[：:]?0(?:个|$)/.test(compact))return 'complete';
 return 'unknown';
}
function pixelStatus(sample){
 // Both orange task counts and green circles with a white check have been observed on this adapter.
 if(sample.orange>=8)return 'incomplete';
 return sample.green>=8&&sample.check===true?'complete':'unknown';
}
function iconSample(read,rect){
 var w=rect[2]-rect[0],h=rect[3]-rect[1],orange=0,green=0;
 function channels(x,y){var c=read(Math.round(x),Math.round(y));return [(c>>16)&255,(c>>8)&255,c&255];}
 for(var x=rect[0]+3;x<rect[2]-3;x+=5)for(var y=rect[1]+3;y<rect[3]-3;y+=5){
  var c=channels(x,y);
  if(c[0]>210&&c[1]>95&&c[1]<220&&c[2]<105)orange++;
  if(c[0]<80&&c[1]>150&&c[2]>75&&c[2]<190)green++;
 }
 var marks=[[.32,.42],[.39,.49],[.47,.46],[.54,.39],[.61,.31]],hits=0;
 marks.forEach(function(mark){
  var hit=false,r=Math.max(1,Math.round(Math.min(w,h)*.035));
  for(var dx=-r;dx<=r;dx++)for(var dy=-r;dy<=r;dy++){
   var c=channels(rect[0]+w*mark[0]+dx,rect[1]+h*mark[1]+dy);
   if(c[0]>215&&c[1]>215&&c[2]>215)hit=true;
  }
  if(hit)hits++;
 });
 return {orange:orange,green:green,check:hits===marks.length};
}
module.exports={Navigator:Navigator,identity:identity,normalize:normalize,layout:layout,textStatus:textStatus,pixelStatus:pixelStatus,iconSample:iconSample,numberCompare:numberCompare};

return module.exports;})();
var __starChapterAndroid=(function(){var module={exports:{}};function require(name){if(name==='./chapter-navigation')return __starChapterCore;throw Error('Unknown chapter module: '+name);}
var core=require('./chapter-navigation');
var PKG='com.chaoxing.mobile';
function safe(fn,fallback){try{return fn();}catch(ignore){return fallback;}}
function nodeId(node){return safe(function(){return String(node.id());},'');}
function bounds(node){return safe(function(){var b=node.bounds();return [b.left,b.top,b.right,b.bottom];},null);}
function heading(value){
 var text=String(value||''),m=text.match(/^\s*(\d+(?:\.\d+)+)(?:[\s.．、:：]+|(?=[^\d.\s]))(.*[^\d.\s].*)$/);
 return {number:m?m[1]:'',title:m?m[2].trim():text};
}
function Bridge(env){
 this.env=env;this.nav=new core.Navigator();this.cache=null;this.revision=0;this.range=null;this.alignAttempts={};
 this.lastMessage='';this.messageAt=0;this.manualNotice=false;this.resumeEpoch=env.store.get('chapterResumeEpoch',0);
 this.owner='star-chapters-'+safe(function(){return String(engines.myEngine().id);},String(Date.now()));
 this.callbacks=[];this.eventsReady=false;this.eventService=null;this.exitBound=false;this.unsupportedService=null;
 this.enabledLast=env.store.get('autoLocateChapters',true);this.legacyFlight=null;this.returnSearch=null;this.returnArrival=null;
}
Bridge.prototype.message=function(text){if(text!==this.lastMessage||Date.now()-this.messageAt>12000){this.lastMessage=text;this.messageAt=Date.now();this.env.log(text);}};
Bridge.prototype.invalidate=function(){this.cache=null;this.revision++;};
Bridge.prototype.suspendEvents=function(){
 var svc=this.eventService,owner=this.owner;this.eventService=null;this.eventsReady=false;this.callbacks=[];
 // A touch-end event may be lost when leaving the directory. Fresh geometry still gates all later actions.
 this.nav.touching=false;
 if(svc)safe(function(){svc.removeAllAccessibilityEventCallbacks(owner);},null);
};
Bridge.prototype.bindEvents=function(){
 if(this.eventsReady)return;
 var self=this;
 try{
  var svc=typeof auto!=='undefined'?auto.service:null,callbackClass=null;
  if(!svc||svc===this.unsupportedService)return;
  if(typeof svc.addAccessibilityEventCallback!=='function'){this.unsupportedService=svc;return;}
  // Kotlin places the interface under Companion in shipped runtimes; obtain the declared parameter type.
  svc.getClass().getMethods().forEach(function(method){
   if(String(method.getName())!=='addAccessibilityEventCallback')return;
   var parameters=method.getParameterTypes();if(parameters.length!==3)return;
   var value=Packages;String(parameters[2].getName()).split('.').forEach(function(part){value=value[part];});callbackClass=value;
  });
  if(!callbackClass){this.unsupportedService=svc;return;}
  this.eventService=svc;
  // AutoJs6 eagerly resolves the event source before invoking the JS callback.
  // Content-change subscriptions can therefore query AutoJs6's own changing file-list tree on its UI thread.
  // Geometry is sampled continuously; state is read again immediately before a chapter action.
  ['view_scrolled','touch_interaction_start','touch_interaction_end'].forEach(function(name){
   var cb=new JavaAdapter(callbackClass,{onAccessibilityEvent:function(event){
    try{
     var pkg=String(event.getPackageName()||'');
     if(pkg&&pkg!==PKG)return;
     if(!self.nav.inDirectory)return;
     var touch=name.indexOf('touch_')===0;
     if(touch){self.nav.motion(Date.now(),name==='touch_interaction_start');self.invalidate();return;}
     var source=event.getSource(),inList=false;
     for(var p=source,i=0;p&&i<7;p=p.parent(),i++){if(nodeId(p)===PKG+':id/rv_knowledge'){inList=true;break;}}
     if(!inList)return;
     self.invalidate();
     if(name==='view_scrolled'){
      self.nav.motion(Date.now());
      var raw=event.getRaw(),from=Number(raw.getFromIndex()),to=Number(raw.getToIndex()),count=Number(raw.getItemCount());
      self.range=from>=0&&to>=from&&count>to?{course:self.nav.course,from:from,to:to,count:count}:null;
     }
    }catch(ignore){}
   }});
   svc.addAccessibilityEventCallback(self.owner,name,cb);self.callbacks.push(cb);
  });
  this.eventsReady=true;
  if(!this.exitBound){events.on('exit',function(){self.suspendEvents();});this.exitBound=true;}
 }catch(ignore){this.suspendEvents();this.unsupportedService=svc;this.message('目录滚动事件不可用，使用连续控件位置核对；不按固定延迟认定停止');}
};
Bridge.prototype.checkControl=function(){
 var epoch=this.env.store.get('chapterResumeEpoch',0);
 if(epoch!==this.resumeEpoch){this.resumeEpoch=epoch;this.nav.resume();this.invalidate();this.manualNotice=false;this.legacyFlight=null;this.returnSearch=null;this.returnArrival=null;this.alignAttempts={};}
 var enabled=this.env.store.get('autoLocateChapters',true);
 if(enabled!==this.enabledLast){this.enabledLast=enabled;this.nav.resume();this.invalidate();this.legacyFlight=null;}
 if(!enabled)return false;
 return true;
};
Bridge.prototype.geometry=function(){
 if(typeof auto!=='undefined'&&!auto.service){this.suspendEvents();return null;}
 if(id(PKG+':id/tv_chapter_name').findOnce()){this.suspendEvents();return null;}
 var list=id(PKG+':id/rv_knowledge').findOnce(),area=list&&bounds(list);
 var courseNode=id(PKG+':id/toolbar_tv_title').findOnce();
 var course=courseNode&&safe(function(){return String(courseNode.text()||'').trim();},'');
 if(!list||!area||!course||/^(章节|目录|章节列表)$/.test(course)){this.suspendEvents();return null;}
 this.bindEvents();
 var rows=[];
 id(PKG+':id/tv_title').find().forEach(function(node){
  var rect=bounds(node),title=safe(function(){return String(node.text()||'').trim();},'');
  if(!rect||!title||rect[3]<=area[1]||rect[1]>=area[3]||!safe(function(){return node.visibleToUser();},false))return;
  var row=null,icon=null;
  for(var p=node,i=0;p&&i<5;p=p.parent(),i++){
   var icons=safe(function(){return p.find(id(PKG+':id/iv_icon'));},null);
   var titles=safe(function(){return p.find(id(PKG+':id/tv_title'));},null);
   if(icons&&icons.size()>0&&titles&&titles.size()===1){row=p;icon=icons.get(0);break;}
  }
  var num=heading(title).number;
  if(!num&&row){var index=safe(function(){return row.findOne(textMatches(/^\s*\d+(?:\.\d+)+\s*$/.source));},null);if(index)num=String(index.text()).trim();}
  var iconRect=icon&&bounds(icon),full=rect[1]>=area[1]+2&&rect[3]<=area[3]-2;
  if(iconRect&&(iconRect[1]<area[1]+2||iconRect[3]>area[3]-2||iconRect[3]-iconRect[1]<(iconRect[2]-iconRect[0])*.95))full=false;
  rows.push({id:core.identity(num,title),title:title,number:num,status:'unknown',rect:rect,node:node,row:row,icon:icon,fullyVisible:full});
 });
 rows.sort(function(a,b){return a.rect[1]-b.rect[1];});
 var range=this.range&&this.range.course===course?this.range:null,actions=safe(function(){return Number(list.getActions());},null);
 // Supported scroll actions come from the current native list. A failed gesture is not an end marker.
 var atStart=range?range.from===0:actions!==null&&actions>0&&(actions&8192)===0;
 var atEnd=range?range.to===range.count-1:actions!==null&&actions>0&&(actions&4096)===0;
 return {course:course,rows:rows,list:list,area:area,atStart:atStart,atEnd:atEnd,from:range?range.from:null,to:range?range.to:null};
};
Bridge.prototype.snapshot=function(force){
 var before=this.geometry();if(!before)return null;
 if(before.course!==this.nav.course){this.range=null;before.from=null;before.to=null;this.cache=null;}
 var sig=core.layout(before),now=Date.now();
 if(!force&&this.cache&&this.cache.signature===sig&&this.cache.revision===this.revision&&now-this.cache.at<1500){
  before.rows.forEach(function(row){row.status=this.cache.states[row.id]||'unknown';},this);return before;
 }
 var im=null,states={},allResolved=true,revision=this.revision;
 try{
  before.rows.forEach(function(row){
   var labels=[];
   if(row.icon)labels.push(safe(function(){return String(row.icon.desc()||'');},''));
   if(row.row)row.row.find(textMatches(/[\s\S]+/.source)).forEach(function(n){
    if(nodeId(n)!==PKG+':id/tv_title'&&!/^\s*\d+(?:\.\d+)+\s*$/.test(String(n.text())))labels.push(String(n.text()||''));
   });
   var statusText=labels.join(' ');row.statusPending=/加载|正在获取|刷新中/.test(statusText);
   row.status=core.textStatus(statusText);
  });
  if(before.rows.some(function(row){return row.status==='unknown'&&row.icon&&!row.statusPending;}))im=this.env.capture();
  if(im){
   var size=this.env.size(),sx=im.getWidth()/size.w,sy=im.getHeight()/size.h;
   before.rows.forEach(function(row){
    if(row.status!=='unknown'||!row.icon||row.statusPending)return;
    var b=bounds(row.icon);if(!b||b[1]<before.area[1]||b[3]>before.area[3])return;
    var sample=core.iconSample(function(x,y){
     var px=Math.round(x*sx),py=Math.round(y*sy);if(px<0||py<0||px>=im.getWidth()||py>=im.getHeight())return 0;
     return images.pixel(im,px,py);
    },b);
    row.status=core.pixelStatus(sample);
   });
  }
 }catch(ignore){allResolved=false;}
 finally{if(im)safe(function(){im.recycle();},null);}
 var after=this.geometry();
 if(!after||revision!==this.revision||sig!==core.layout(after)){this.nav.motion(Date.now());this.cache=null;return after;}
 before.rows.forEach(function(row){states[row.id]=row.status;if(row.status==='unknown')allResolved=false;});
 // Only store resolved status; every action obtains fresh nodes and bypasses this short cache.
 if(allResolved)this.cache={signature:sig,revision:revision,at:now,states:states};else this.cache=null;
 return before;
};
Bridge.prototype.scroll=function(s,direction,small,overlap){
 this.env.requireApp();
 var fresh=this.geometry();if(!fresh||core.layout(fresh)!==core.layout(s))return false;
 this.nav.motion(Date.now());this.invalidate();this.range=null;
 // Native list actions avoid injecting a fling. Indices or overlapping rows verify coverage after each page.
 if(direction==='backward'&&safe(function(){return fresh.list.scrollBackward();},false))return true;
 // 没有滚动索引时整页翻动可能跳过章节，改用保留约七成重叠的短滑动。
 if(!small&&!overlap&&direction==='forward'&&safe(function(){return fresh.list.scrollForward();},false))return true;
 var a=fresh.area,x=Math.round((a[0]+a[2])/2),height=a[3]-a[1];
 var delta=small?.18:.30;
 return swipe(x,Math.round(a[1]+height*(direction==='backward'?.45:.45+delta)),x,Math.round(a[1]+height*(direction==='backward'?.45+delta:.45)),400);
};
Bridge.prototype.align=function(s,row){
 this.env.requireApp();var fresh=this.geometry();if(!fresh||core.layout(fresh)!==core.layout(s))return false;
 var target=fresh.rows.filter(function(r){return r.id===row.id;})[0];if(!target)return false;
 var attempts=(this.alignAttempts[row.id]||0)+1;this.alignAttempts[row.id]=attempts;
 if(attempts>4){this.nav.halt='章节未能完整显示';this.message('章节定位：边缘内容无法完整显示，停留供核对');return false;}
 this.nav.motion(Date.now());this.invalidate();this.range=null;
 if(attempts===1&&safe(function(){return (target.row||target.node).performAction(16908342);},false))return true;
 return this.scroll(fresh,target.rect[1]<fresh.area[1]+2?'backward':'forward',true);
};
Bridge.prototype.click=function(row){
 this.env.requireApp();
 // Never fall back to a saved coordinate. Recycler rows can change identity during a fling.
 if(!row.fullyVisible||!safe(function(){return String(row.node.text())===row.title;},false))return false;
 // The live native row has five non-clickable wrappers before its clickable item.
 // Traverse only within this list and retain the one-title identity check at every level.
 for(var p=row.node,i=0;p&&i<8;p=p.parent(),i++){
  if(nodeId(p)===PKG+':id/rv_knowledge')break;
  var current=p===row.node?null:safe(function(){return p.find(id(PKG+':id/tv_title'));},null);
  if(current&&(current.size()!==1||String(current.get(0).text())!==row.title))return false;
  if(safe(function(){return p.clickable();},false))return !!p.click();
 }
 return false;
};
Bridge.prototype.step=function(){
 if(!this.checkControl())return !!this.geometry();
 var geometry=this.geometry();if(!geometry)return false;
 if(geometry.course!==this.nav.course){
  var saved=this.env.store.get('chapterProgress_v1',{});
  this.nav.reset(geometry.course,saved[geometry.course]);this.cache=null;this.range=null;this.alignAttempts={};
 }
 this.nav.inDirectory=true;
 if(this.nav.flight){
  var pending=this.nav.observe(geometry,Date.now());
  if(pending.type==='hold')this.message('章节进入：'+pending.reason+'，不会重复点击');
  return true;
 }
 if(!this.nav.stable(geometry,Date.now()))return true;
 var snapshot=this.snapshot(false);if(!snapshot)return true;
 var progress=this.env.store.get('chapterProgress_v1',{}),anchor=progress[snapshot.course];
 var result=this.nav.observe(snapshot,Date.now(),anchor);
 if(result.type==='open'){
  var fresh=this.snapshot(true);if(!fresh)return true;
  var target=fresh.rows.filter(function(r){return r.id===result.ticket.id;})[0];
  if(target&&!target.fullyVisible){this.align(fresh,target);return true;}
  var row=this.nav.begin(result.ticket,fresh,Date.now());if(!row)return true;
  if(!this.click(row)){this.nav.halt='章节点击结果未确认';this.message('章节目标未能安全点击，停留核对；不会使用旧坐标或重复点击');}
  else this.message('按已确认进度进入未完成章节：'+row.title);
 }else if(result.type==='scroll'){this.scroll(snapshot,result.direction,false,result.overlap);}
 else if(result.type==='align'){
  var partial=snapshot.rows.filter(function(r){return r.id===result.id;})[0];
  if(partial)this.align(snapshot,partial);
 }
 else if(result.type==='hold'||result.type==='complete'||result.type==='manual')this.message('章节定位：'+result.reason+'；停留供你查看，点击开始学习可重新定位');
 return true;
};
Bridge.prototype.browsingDirectory=function(){
 if(this.returnSearch)return false;
 if(this.checkControl())return false;
 var visible=!!this.geometry();if(visible)this.nav.inDirectory=true;
 return visible;
};
Bridge.prototype.rememberConfirmedNext=function(title){
 // Only the existing next-section handler's confirmed heading change can advance this anchor.
 if(this.nav.manual||this.nav.flight||this.legacyFlight||this.returnSearch)return false;
 var h=heading(title);if(!h.number||!h.title)return false;
 var anchor={id:core.identity(h.number,h.title),number:h.number,title:h.title};
 // Next-section arrival is an authorized chapter transition, not a manual directory selection.
 // Loading can briefly expose the old directory tree; clear that phase only after a verified new heading.
 this.nav.inDirectory=false;this.nav.anchor=anchor;this.nav.target=null;this.nav.halt='';this.nav.settle();this.invalidate();
 if(this.nav.course){
  var progress=this.env.store.get('chapterProgress_v1',{});progress[this.nav.course]=anchor;
  this.env.store.put('chapterProgress_v1',progress);
 }
 return true;
};
Bridge.prototype.pressLegacy=function(entry){
 if(this.legacyFlight)return false;
 var geometry=this.geometry();if(!geometry)return false;
 this.nav.inDirectory=true;
 if(!this.nav.stable(geometry,Date.now()))return false;
 var fresh=this.geometry();if(!fresh||core.layout(fresh)!==core.layout(geometry))return false;
 var rows=fresh.rows.filter(function(r){return r.title===entry.t;});
 if(rows.length!==1)return false;
 var rect=bounds(entry.node);
 if(!rect||rect.join(',')!==rows[0].rect.join(',')||!this.nav.stable(fresh,Date.now()))return false;
 // An explicit return for task refresh may enter the just-completed chapter; it does not select a new learning target.
 var row=rows[0];this.legacyFlight={target:row,at:Date.now(),heading:'',headingAt:0,generation:this.nav.generation};
 var clicked=this.click(row);
 if(!clicked)this.message('返回原章节点击未确认，等待标题核对，不重复点击');
 return true;
};
Bridge.prototype.startReturn=function(target){
 var key=core.identity(target.number,target.title);
 if(this.returnSearch&&this.returnSearch.key===key)return;
 this.returnSearch={key:key,number:target.number,title:target.title,course:this.nav.course,at:Date.now(),scrolls:0,halt:''};
 this.returnArrival=null;this.alignAttempts={};
};
Bridge.prototype.resumePending=function(elapsed){
 if(!(elapsed>0))return;
 if(this.returnSearch)this.returnSearch.at+=elapsed;
 if(this.legacyFlight){this.legacyFlight.at+=elapsed;this.legacyFlight.heading='';}
 this.invalidate();this.nav.motion(Date.now());
 // The click was already issued before pausing. Recheck its target heading, without issuing another click.
 if(this.legacyFlight)this.legacyFlight.generation=this.nav.generation;
 if(this.nav.flight){this.nav.flight.at+=elapsed;this.nav.flight.generation=this.nav.generation;this.nav.arrivalText='';}
};
Bridge.prototype.returnToChapter=function(target){
 this.env.requireApp();this.checkControl();
 var key=core.identity(target.number,target.title);
 if(this.returnArrival&&this.returnArrival.key===key){this.returnArrival=null;this.returnSearch=null;return {type:'entered'};}
 this.startReturn(target);var search=this.returnSearch;
 if(search.halt||this.nav.manual)return {type:'hold',reason:search.halt||'返回原章节需要核对'};
 if(Date.now()-search.at>45000){search.halt='返回原章节定位超时';return {type:'hold',reason:search.halt};}
 if(this.legacyFlight)return {type:'wait',reason:'等待原章节标题核对'};
 var s=this.geometry();if(!s)return {type:'wait',reason:'等待章节目录'};
 if(search.course&&search.course!==s.course){search.halt='返回时课程已改变';return {type:'hold',reason:search.halt};}
 if(!this.nav.course)this.nav.course=s.course;
 search.course=s.course;this.nav.inDirectory=true;
 // Waiting for stable geometry must not inject a swipe that invalidates the next click.
 if(!this.nav.stable(s,Date.now()))return {type:'wait',reason:'等待目录停稳'};
 var matches=s.rows.filter(function(r){return core.normalize(r.title)===core.normalize(target.title)&&(!target.number||r.number===target.number);});
 if(matches.length>1){search.halt='原章节身份不唯一';return {type:'hold',reason:search.halt};}
 if(matches.length){
  var row=matches[0];
  if(!row.fullyVisible){this.align(s,row);if(this.nav.halt)search.halt=this.nav.halt;return {type:'wait',reason:'完整显示原章节'};}
  var fresh=this.geometry();if(!fresh||core.layout(fresh)!==core.layout(s)||!this.nav.stable(fresh,Date.now()))return {type:'wait',reason:'重新核对目录位置'};
  row=fresh.rows.filter(function(r){return r.id===row.id;})[0];if(!row)return {type:'wait'};
  this.legacyFlight={target:row,at:Date.now(),heading:'',headingAt:0,generation:this.nav.generation,returnKey:key};
  if(!this.click(row)){search.halt='原章节点击结果未确认';this.message('原章节点击未确认，停留核对，不重复点击');}
  return {type:'wait',reason:'核对原章节进入结果'};
 }
 if(!s.rows.length)return {type:'wait',reason:'等待目录加载'};
 var first=s.rows[0],last=s.rows[s.rows.length-1],direction;
 if(target.number&&first.number&&core.numberCompare(target.number,first.number)<0)direction='backward';
 else if(target.number&&last.number&&core.numberCompare(target.number,last.number)>0)direction='forward';
 else {search.halt='原章节未在预期目录范围显示';return {type:'hold',reason:search.halt};}
 if((direction==='backward'&&s.atStart)||(direction==='forward'&&s.atEnd)){search.halt='目录边界未找到原章节';return {type:'hold',reason:search.halt};}
 if(++search.scrolls>32){search.halt='原章节定位达到上限';return {type:'hold',reason:search.halt};}
 this.scroll(s,direction);return {type:'wait',reason:'按章节号定位原章节'};
};
Bridge.prototype.guardArrival=function(){
 var enabled=this.checkControl();
 var node=id(PKG+':id/tv_chapter_name').findOnce();
 if(node)this.suspendEvents();
 if(!enabled&&!this.legacyFlight&&!this.returnSearch){
  if(this.nav.inDirectory&&node){this.nav.manual=true;this.message('已保留手动选择的章节，点击开始学习后才恢复任务操作');}
  return this.nav.manual;
 }
 if(this.legacyFlight){
  var flight=this.legacyFlight;
  if(Date.now()-flight.at>5000){this.nav.manual=true;this.message('返回原章节结果未确认，已暂停自动处理');return true;}
  if(!node)return true;
  var h=heading(node.text());
  if(core.normalize(h.title)!==core.normalize(flight.target.title)||(h.number&&flight.target.number&&h.number!==flight.target.number)||flight.generation!==this.nav.generation){this.nav.manual=true;this.message('返回原章节的目标与内容不一致，保留当前页面并暂停');return true;}
  var key=core.identity(h.number,h.title);
  if(flight.heading!==key){flight.heading=key;flight.headingAt=Date.now();return true;}
  if(Date.now()-flight.headingAt<this.nav.quietMs)return true;
  if(flight.returnKey)this.returnArrival={key:flight.returnKey};
  this.legacyFlight=null;this.nav.inDirectory=false;this.message('已确认返回原章节，继续刷新任务状态');return false;
 }
 if(!node&&!this.nav.flight&&!this.nav.manual)return false;
 if(!node&&this.geometry())return false;
 var result=this.nav.arrive(node?heading(node.text()):null,Date.now());
 if(result.type==='entered'){
  var map=this.env.store.get('chapterProgress_v1',{});map[result.course]=result.anchor;
  this.env.store.put('chapterProgress_v1',map);this.env.onEntered();this.cache=null;
  this.message('已核对章节标题与定位目标一致');return false;
 }
 if(result.type==='none')return false;
 if(result.type==='manual'){
  if(!this.manualNotice){this.manualNotice=true;this.message('保留你主动打开的章节；已暂停自动处理。点击星伴开始学习继续，或关闭自动定位后自由浏览');}
 }
 if(result.type==='hold')this.message('章节进入：'+result.reason+'；不会重复点击');
 return true;
};
module.exports={Bridge:Bridge,heading:heading};

return module.exports;})();
// chaoxing helper v5.78 | autojs6
// 打开学习通课程章节后运行；停止时在 AutoJs6“运行中脚本”里结束。
// 同一手机只保留一份本课程助手，避免重复点击和并发滚动。
try{
  var currentEngine=engines.myEngine();
  engines.all().forEach(function(engine){
    if(engine.id!==currentEngine.id&&/ChaoxingVideoAssistant-v[\d.]+\.js/.test(String(engine.getSource())))
      engine.forceStop();
  });
}catch(ignore){}
// 无障碍由用户手动开启；不使用 auto 指令或 waitFor 自动打开系统设置。
if(!auto.service){
  toastLog('无障碍未连接，请自行开启后重新运行脚本');
  exit();
}

var PKG='com.chaoxing.mobile';
var W=Math.min(device.width,device.height),H=Math.max(device.width,device.height);
// 存储名沿用旧版，保留已保存的章节进度。
var STORE=storages.create('chaoxing_deepseek_key');
var STATE={
  video:false,finished:false,lastTime:-1,total:0,
  movedAt:0,openedAt:0,playerTap:0,lastNext:0,
  doc:false,docAt:0,docSwipes:0,lastDoc:0,
  lastLog:0,lastQuiz:'',answered:{},lastScroll:0,
  lastOpen:0,lastQuestionNav:0,lastAnswerView:null,
  capture:true,captureRetryAt:0,
  lastCaptureAt:0,lastOcrLog:0,blocked:'',blockedAt:0,navBlocked:'',
  headerSearch:0,pausedOutside:false,pausedAt:0,answerCache:{},lastFinishAt:0,
  shortAttempted:{},shortSaved:{},choiceAttempted:{},multipleConfirmed:{},multipleExpected:{},scanDrafts:{},scanFailures:{},
  quizPending:false,workTotal:0,auditMissing:[],auditRecoverySteps:0,quizContext:'',afterSubmit:false,taskTopReady:false,taskTopSignature:'',docAwaitKey:'',docAwaitAt:0,
  quizSeek:null,quizAuditHold:null,auditRecoverySignature:'',auditRecoveryStill:0,
  readingVisit:null,readingAttempts:{},readingRefresh:null,taskTopSteps:0,
  discussionTopic:null,discussionTaskKey:'',discussionDone:{},discussionWaitAt:0,discussionRefresh:null
};

var CHAPTER=new (__starChapterAndroid.Bridge)({store:STORE,capture:picture,size:function(){return {w:W,h:H};},requireApp:requireLearningApp,log:log,onEntered:function(){STATE.hadCurrentTask=false;STATE.completionRefreshed=false;STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.taskTopSteps=0;}});

// 新运行会重新识别当前页面，不能继续显示上次已结束工作脚本的网络等待状态。
STORE.remove('videoNetworkState');
console.log('课程助手 v5.78 已启动：自动定位章节、播放视频；测验和讨论请自行完成');
console.log('录屏共存模式已启用：仅使用无障碍截图');
// 开启 AutoJs6 自身的保活服务；版本不支持时保持原有等待循环。
try{
  if(typeof $settings!=='undefined'&&typeof $settings.setEnabled==='function'){
    $settings.setEnabled('foreground_service',true);
    console.log('已请求启用 AutoJs6 前台保活服务');
  }else console.log('此版本请在 AutoJs6 设置中开启前台服务以增强后台保活');
}catch(e){console.log('前台保活服务未能开启，请在 AutoJs6 设置中检查：'+e);}
console.log('后台模式：切到其他应用暂停操作，返回学习通自动继续');
if(foregroundPackage()!==PKG){
  try{
    if(app.launchPackage(PKG)){
      console.log('已切回学习通，课程助手在后台运行');
      sleep(900);
    }else console.log('未能打开学习通，请手动切回');
  }catch(e){console.log('切回学习通失败：'+e);}
}

function log(s){console.log(s);}
function foregroundPackage(){
  // AutoJs6 6.7 的全局 currentPackage 自动模式会先检查 Shizuku/Root。
  // 前台守卫只用已经连接的无障碍记录；未知时暂停，绝不回退到 shell 检测。
  if(typeof auto==='undefined'||!auto.service)return '';
  try{
    return typeof auto.currentPackage==='function'?String(auto.currentPackage()||''):'';
  }catch(ignore){return '';}
}
// 每个界面动作都检查应用，防止网络请求期间切走后误点其他应用。
function requireLearningApp(){
  if(typeof auto!=='undefined'&&!auto.service)throw Error('CX_ACCESSIBILITY_PAUSED');
  if(foregroundPackage()!==PKG)throw Error('CX_BACKGROUND_PAUSED');
}
function safeBack(){requireLearningApp();return back();}
function accessibilityScreenSize(){
  // 宿主停留在竖屏时，其 Display 可能尚未随横屏播放器更新。
  // 只采信学习通的完整应用窗口，弹窗、键盘和屏幕外页面不能扩大点击边界。
  try{
    if(typeof auto==='undefined'||!auto.service||typeof auto.service.getWindows!=='function')return null;
    var windows=auto.service.getWindows(),shortSide=Math.min(W,H),longSide=Math.max(W,H);
    for(var i=0;i<windows.size();i++){
      var win=windows.get(i);if(Number(win.getType())!==1)continue;
      var root=win.getRoot();if(!root||String(root.getPackageName())!==PKG||!root.isVisibleToUser())continue;
      var bounds=new android.graphics.Rect();win.getBoundsInScreen(bounds);
      var width=Number(bounds.width()),height=Number(bounds.height());
      var fullPortrait=Math.abs(width-shortSide)<=2&&Math.abs(height-longSide)<=2;
      var fullLandscape=Math.abs(width-longSide)<=2&&Math.abs(height-shortSide)<=2;
      if(Number(bounds.left)===0&&Number(bounds.top)===0&&(fullPortrait||fullLandscape))return {w:width,h:height};
    }
  }catch(ignore){}
  return null;
}
function screenSize(){
  var windowSize=accessibilityScreenSize();if(windowSize)return windowSize;
  var horizontal=land(),size={w:horizontal?Math.max(W,H):Math.min(W,H),h:horizontal?Math.min(W,H):Math.max(W,H)};
  try{
    var metrics=new android.util.DisplayMetrics();
    context.getSystemService(android.content.Context.WINDOW_SERVICE).getDefaultDisplay().getRealMetrics(metrics);
    if(metrics.widthPixels>0&&metrics.heightPixels>0)size={w:Number(metrics.widthPixels),h:Number(metrics.heightPixels)};
  }catch(ignore){}
  return size;
}
function pointOnScreen(x,y,size){
  size=size||screenSize();
  return typeof x==='number'&&typeof y==='number'&&isFinite(x)&&isFinite(y)&&x>=0&&y>=0&&x<size.w&&y<size.h;
}
function liveNodePoint(n,enabled,size){
  try{
    if(!n||!n.visibleToUser()||(enabled&&!n.enabled()))return null;
    var b=n.bounds(),x=Number(b.centerX()),y=Number(b.centerY());
    if(b.width()<=0||b.height()<=0||!pointOnScreen(x,y,size))return null;
    return {x:x,y:y};
  }catch(ignore){return null;}
}
function tap(x,y){
  requireLearningApp();
  if(typeof x!=='number'||typeof y!=='number'||!isFinite(x)||!isFinite(y))return false;
  x=Math.round(x);y=Math.round(y);
  if(!pointOnScreen(x,y)){
    if(!STATE.invalidTapLog||Date.now()-STATE.invalidTapLog>10000){STATE.invalidTapLog=Date.now();log('点击位置已在屏幕外，取消点击，等待重新识别');}
    return false;
  }
  requireLearningApp();return !!click(x,y);
}
function swipeQuiz(){
  requireLearningApp();
  swipe(Math.round(W*.55),Math.round(H*.60),
        Math.round(W*.55),Math.round(H*.42),300);
}
function swipeToNextQuestion(){
  requireLearningApp();
  // 已处理当前屏幕上的题目后再加大步幅；扫描选项仍使用短滑动。
  swipe(Math.round(W*.55),Math.round(H*.61),
        Math.round(W*.55),Math.round(H*.32),280);
}
function swipeQuizDown(){
  requireLearningApp();
  swipe(Math.round(W*.55),Math.round(H*.42),
        Math.round(W*.55),Math.round(H*.60),300);
}
function swipeQuizToTop(){
  requireLearningApp();
  swipe(Math.round(W*.52),Math.round(H*.28),
        Math.round(W*.52),Math.round(H*.60),330);
}
function land(){
  var windowSize=accessibilityScreenSize();if(windowSize)return windowSize.w>windowSize.h;
  try{
    var rotation=Number(context.getSystemService(android.content.Context.WINDOW_SERVICE).getDefaultDisplay().getRotation());
    return rotation===1||rotation===3;
  }catch(ignore){}
  try{
    return Number(context.getResources().getConfiguration().orientation)===2;
  }catch(e){
    return device.width>device.height;
  }
}
function pushNode(out,n,size){
  try{
    var t=String(n.text()||n.desc()||'').trim();
    // WebView keeps hidden adjacent pages at negative bounds; exclude them before parsing.
    size=size||screenSize();
    var point=liveNodePoint(n,false,size);
    if(!point||point.y<size.h*.07||point.y>size.h*.98)return;
    var checked=false,p=n;
    for(var i=0;p&&i<3;i++,p=p.parent()){
      try{
        var pb=p.bounds();
        var localRow=i===0||(pb.height()<H*.13&&Math.abs(pb.centerY()-point.y)<H*.03);
        if(localRow&&((typeof p.checked==='function'&&p.checked())||
           (typeof p.selected==='function'&&p.selected()))){
          checked=true;break;
        }
      }catch(ignore){}
    }
    if(t)out.push({t:t,x:point.x,y:point.y,node:n,
      selected:checked});
  }catch(e){}
}
// 录屏共存：仅使用无障碍截图，不申请 MediaProjection 屏幕捕获权限。
// 截图失败时保留无障碍文字识别；禁止通过系统捕获权限接管手机录屏。
function picture(){
  if(typeof auto!=='undefined'&&!auto.service)return null;
  if(Date.now()<STATE.captureRetryAt)return null;
  var remaining=350-(Date.now()-STATE.lastCaptureAt);
  if(remaining>0)sleep(remaining);
  STATE.lastCaptureAt=Date.now();
  try{
    var image=automator.captureScreen();
    if(image){
      STATE.captureRetryAt=0;
      return image;
    }
    throw Error('无障碍截图未返回图像');
  }catch(e){
    STATE.captureRetryAt=Date.now()+1500;
    if(Date.now()-STATE.lastOcrLog>30000){
      STATE.lastOcrLog=Date.now();
      log('录屏共存模式：无障碍截图暂不可用，使用页面文字识别：'+e);
    }
  }
  return null;
}
function circleSelected(im,cx,cy){
  try{
    var size=screenSize(),sw=size.w||W,sh=size.h||H;
    function blueAt(px,py){
      var x=Math.round(px*im.getWidth()/sw);
      var y=Math.round(py*im.getHeight()/sh);
      if(x<0||y<0||x>=im.getWidth()||y>=im.getHeight())
        return false;
      // AutoJs6 的 ImageWrapper 可直接取色；某些设备的 Bitmap 是硬件位图。
      var c=images.pixel(im,x,y);
      var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
      return r<105&&g>105&&b>170;
    }
    // OCR 的文字中心可能与圆圈中心上下错开；只看圆圈内部的色块。
    var ys=[-28,-14,0,14,28],grid=[-18,-9,0,9,18];
    for(var s=0;s<ys.length;s++){
      var hits=0;
      for(var a=0;a<grid.length;a++){
        for(var b=0;b<grid.length;b++){
          if(blueAt(cx+grid[a]*W/922,
                    cy+(ys[s]+grid[b])*H/2048))hits++;
        }
      }
      if(hits>=8)return true;
    }
    return false;
  }catch(e){return false;}
}
function blueChoice(im,n){
  var candidates=[];
  if(n.x>W*.03&&n.x<W*.24)candidates.push(n.x);
  candidates.push(W*.075,W*.085,W*.105,W*.125);
  return candidates.some(function(x){
    return [-H*.018,0,H*.018].some(function(dy){
      return circleSelected(im,x,n.y+dy);
    });
  });
}
function view(){
  if(typeof auto!=='undefined'&&!auto.service)throw Error('CX_ACCESSIBILITY_PAUSED');
  var out=[],im=null,size=screenSize();
  try{
    // Android 无障碍正则按整段匹配；\S+ 会丢掉含空格/换行的合并选项。
    textMatches(/[\s\S]+/.source).find().forEach(function(n){pushNode(out,n,size);});
  }catch(e){}
  try{
    descMatches(/[\s\S]+/.source).find().forEach(function(n){pushNode(out,n,size);});
  }catch(e){}
  var axHasQuestion=out.some(function(n){
    return /^\s*\d{1,3}\s*[.．、,，:：)）]?.*(单选|多选|判断|简答|问答)/.test(n.t);
  });
  if(!axHasQuestion)axHasQuestion=out.some(function(n){
    return /^\s*\d{1,3}\s*[.．、,，]?\s*$/.test(n.t)&&out.some(function(z){
      return /^[\[［【(（]?\s*(?:单选|多选|判断|简答|问答)题?\s*[\]］】)）]?$/.test(z.t)&&
        Math.abs(z.y-n.y)<H*.065;
    });
  });
  var axLabels=out.filter(function(n){
    return /^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t);
  }).length;
  var axOptionText=out.filter(function(n){return /[\u4e00-\u9fff]/.test(n.t);}).length;
  var richAccessibility=axHasQuestion&&axLabels>=2&&axOptionText>=3;
  im=picture();
  if(im){
    if(!richAccessibility&&!land())try{
      var sx=(land()?Math.max(W,H):W)/im.getWidth(),sy=(land()?Math.min(W,H):H)/im.getHeight();
      var results;
      try{results=ocr.detect(im);}
      catch(primaryError){
        if(ocr.mlkit&&ocr.mlkit.detect)
          results=ocr.mlkit.detect(im);
        else throw primaryError;
      }
      results.forEach(function(r){
        var t=String(r.label||r.text||'').trim(),b=r.bounds;
        if(!t||!b)return;
        var x=(b.left+b.right)*sx/2,y=(b.top+b.bottom)*sy/2;
        if(!pointOnScreen(x,y,size))return;
        if(!out.some(function(n){
          return n.t===t&&Math.abs(n.y-y)<15;
        }))out.push({t:t,x:x,y:y,node:null});
      });
    }catch(e){
      if(Date.now()-STATE.lastOcrLog>30000){
        STATE.lastOcrLog=Date.now();
        log('OCR 暂不可用；请检查 AutoJs6 OCR 模块：'+e);
      }
    }
    try{
      out.forEach(function(n){
        if(/^\s*[A-H](?:\s*[.．、:：)）]?\s*$|(?:\s*[.．、:：)）]\s*|\s+)\S+)/i.test(n.t))
          n.selected=n.selected||blueChoice(im,n);
      });
    }catch(e){}
    try{im.recycle();}catch(e){}
  }
  out.sort(function(a,b){return a.y-b.y||a.x-b.x;});
  var seen={},unique=[];
  out.forEach(function(n){
    var k=Math.round(n.y/10)+'|'+n.t;
    if(!seen[k]){
      seen[k]=true;
      unique.push(n);
    }
  });
  return {
    n:unique,
    s:unique.map(function(n){return n.t;}).join(' | ')
  };
}
function find(v,re,minY){
  var size=screenSize();
  for(var i=0;i<v.n.length;i++){
    var n=v.n[i];
    if(!pointOnScreen(n.x,n.y,size)||(n.node&&!liveNodePoint(n.node,false,size)))continue;
    if(n.y>(minY||0)&&re.test(n.t))return n;
  }
  return null;
}
function press(n){
  requireLearningApp();
  if(!n)return false;
  var point=null;
  if(n.node){
    point=liveNodePoint(n.node,true);
    try{if(!point||String(n.node.text()||n.node.desc()||'').trim()!==n.t||Math.abs(point.x-n.x)>8||Math.abs(point.y-n.y)>8)return false;}catch(ignore){return false;}
  }else if(!pointOnScreen(n.x,n.y))return false;
  if(n.node){try{if(String(n.node.id())===PKG+':id/tv_title')return CHAPTER.pressLegacy(n);}catch(ignore){return false;}}
  if(n.node){
    try{
      for(var p=n.node,i=0;p&&i<4;p=p.parent(),i++){
        requireLearningApp();
        var pb=p.bounds();
        var localParent=i===0||(pb&&pb.height()<H*.18&&Math.abs(pb.centerY()-point.y)<H*.06);
        if(localParent&&liveNodePoint(p,true)&&p.clickable()&&p.click())return true;
      }
    }catch(e){}
  }
  if(n.node){
    var fresh=liveNodePoint(n.node,true);
    if(!fresh||Math.abs(fresh.x-point.x)>8||Math.abs(fresh.y-point.y)>8)return false;
    return tap(fresh.x,fresh.y);
  }
  return tap(n.x,n.y);
}
function chapterNextButton(v){
  // 短章节的页尾可能在屏幕上半部；按按钮文字和实时位置识别，不按屏幕中线判断。
  return find(v,/^(?:下一节|下一讲|下一个任务点)$/,H*.13);
}
function next(v){
  if(Date.now()-STATE.lastNext<2200)return false;
  var n=chapterNextButton(v);
  if(!n||!press(n))return false;
  STATE.lastNext=Date.now();
  function title(page){
    var node=page.n.filter(function(n){return n.y<H*.30&&/^\d+(?:\.\d+)+\s*\S+/.test(n.t);})[0];
    return node?node.t.replace(/\s+/g,''):'';
  }
  var oldTitle=title(v),changed=false;
  for(var check=0;check<7;check++){
    sleep(300);
    var page=view(),newTitle=title(page);
    if(/当前章节还有任务点未完成|是否去完成/.test(page.s))break;
    if(oldTitle&&newTitle&&oldTitle!==newTitle){changed=true;break;}
    if(!oldTitle&&page.s!==v.s&&!chapterNextButton(page)&&
       !/加载中|正在加载/.test(page.s)){changed=true;break;}
  }
  if(!changed){log('下一节尚未确认切换，保留本节记录并稍后重试');return false;}
  var confirmedHeading=readChapterHeading(page);
  if(confirmedHeading)CHAPTER.rememberConfirmedNext(confirmedHeading.t);
  STATE.lastOpen=Date.now();
  STATE.lastDoc=Date.now();
  STATE.answered={};STATE.scanDrafts={};STATE.scanFailures={};
  STATE.shortAttempted={};
  STATE.shortSaved={};
  STATE.choiceAttempted={};STATE.multipleConfirmed={};STATE.multipleExpected={};
  STATE.workTotal=0;
  STATE.quizSeek=null;STATE.quizAuditHold=null;STATE.auditRecoverySignature='';STATE.auditRecoveryStill=0;
  STATE.readingVisit=null;STATE.readingAttempts={};STATE.readingRefresh=null;STATE.doc=false;
  STATE.taskTopSteps=0;
  STATE.returnBackTried=false;STATE.awaitingSubmitResult=false;STATE.afterSubmit=false;STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.docAwaitKey='';
  STATE.auditMissing=[];STATE.auditRecoverySteps=0;
  STATE.blocked='';
  STATE.navBlocked='';
  STATE.headerSearch=0;
  STATE.video=false;
  STATE.finished=false;STATE.activeVideoKey=null;STATE.activeVideoChapter='';STATE.videoChapterRefresh=null;
  STATE.videoFinishedKeys={};STATE.hadCurrentTask=false;STATE.completionRefreshed=false;
  toast('进入下一节');
  sleep(350);
  return true;
}
function markers(v){
  if(v.taskMarkers)return v.taskMarkers;
  var out=[];
  v.n.forEach(function(n){
    if(/^(?:任务点(?:已完成|未完成)?|已完成任务点)$/.test(n.t.replace(/\s+/g,''))&&n.x<W*.65&&n.y>H*.14&&n.y<H*.92){
      if(!out.some(function(m){return Math.abs(m.y-n.y)<H*.02;}))
        out.push({y:n.y,done:/已完成/.test(n.t)});
    }
  });
  // 图片中的制服、旗帜、树木等颜色不是任务点；必须先有对应文字。
  var im=out.length?picture():null;
  if(im){
    try{
      var iw=im.getWidth(),ih=im.getHeight(),last=-100;
      for(var y=Math.round(ih*.18);y<ih*.90;y+=3){
        var c=images.pixel(im,Math.round(iw*.04),y);
        var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
        var orange=r>210&&g>95&&g<220&&b<105;
        var green=g>150&&g>r+55&&g>b+25&&r<110;
        if((!orange&&!green)||y-last<ih*.028)continue;
        last=y;
        var py=y*H/ih,matched=null;
        out.forEach(function(m){
          if(Math.abs(m.y-py)<H*.03)matched=m;
        });
        if(matched)matched.done=matched.done||green;
      }
    }catch(e){log('任务点取色失败：'+e);}
    finally{try{im.recycle();}catch(e){}}
  }
  out.sort(function(a,b){return a.y-b.y;});
  v.taskMarkers=out;return out;
}
function twoTimes(s){
  var a=s.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g)||[];
  if(a.length<2)return null;
  function seconds(t){
    return t.split(':').reduce(function(x,v){
      return x*60+Number(v);
    },0);
  }
  var now=seconds(a[a.length-2]),all=seconds(a[a.length-1]);
  return all>30&&now<=all?{now:now,all:all}:null;
}
function videoRateSelected(n){
  if(n.selected)return true;
  var im=picture();if(!im)return false;
  try{
    var pw=Math.max(W,H),ph=Math.min(W,H),b=null;
    try{if(n.node)b=n.node.bounds();}catch(ignore){}
    var left=b?b.left:n.x-100,right=b?b.right:n.x+100;
    var top=b?b.top:n.y-40,bottom=b?b.bottom:n.y+40,hits=0;
    for(var y=top;y<bottom;y+=5)for(var x=left;x<right;x+=5){
      var px=Math.round(x*im.getWidth()/pw),py=Math.round(y*im.getHeight()/ph);
      if(px<0||py<0||px>=im.getWidth()||py>=im.getHeight())continue;
      var c=images.pixel(im,px,py),r=(c>>16)&255,g=(c>>8)&255,bl=c&255;
      if(r<90&&g>105&&bl>180&&bl>g+25&&++hits>=4)return true;
    }
    return false;
  }finally{try{im.recycle();}catch(ignore){}}
}
function videoView(){
  var n=[];
  ['land_current_time','land_total_time','speed','land_start'].forEach(function(name){
    var z=nativeVideoNode(name);if(!z)return;
    var b=z.bounds(),t=String(z.text()||z.desc()||'');
    n.push({t:t,x:b.centerX(),y:b.centerY(),node:z});
  });
  try{var ended=textMatches(/^(?:播放结束|播放完毕|重新播放)$/.source).findOnce();
    if(ended)n.push({t:String(ended.text()),node:ended});}catch(ignore){}
  return {n:n,s:n.map(function(z){return z.t;}).join(' | ')};
}
function nativeVideoNode(name){
  if(typeof auto!=='undefined'&&!auto.service)return null;
  try{var n=id(PKG+':id/'+name).findOnce();return liveNodePoint(n,false)?n:null;}catch(ignore){return null;}
}
function nativeVideoClick(n){
  if(!n)return false;
  requireLearningApp();
  var point=liveNodePoint(n,true);if(!point)return false;
  try{if(n.click())return true;}catch(ignore){}
  var fresh=liveNodePoint(n,true);
  return fresh&&Math.abs(fresh.x-point.x)<=8&&Math.abs(fresh.y-point.y)<=8?videoPhysicalClick(n):false;
}
function videoPhysicalClick(n){
  var point=liveNodePoint(n,true);
  if(!point){
    STATE.videoGestureResult='invalid-target';
    if(!STATE.videoTargetRejectAt||Date.now()-STATE.videoTargetRejectAt>=15000){
      STATE.videoTargetRejectAt=Date.now();
      var rejectedBounds='',rejectedSize=screenSize();
      try{var rejected=n.bounds();rejectedBounds=[rejected.left,rejected.top,rejected.right,rejected.bottom].join(',');}catch(ignore){}
      log('播放器点击目标未通过校验，控件边界 ['+rejectedBounds+']，当前屏幕 '+rejectedSize.w+'x'+rejectedSize.h+'；等待重新定位');
    }
    return false;
  }
  requireLearningApp();
  if(typeof auto==='undefined'||!auto.service||typeof auto.service.dispatchGesture!=='function')return tap(point.x,point.y);
  // 使用当前控件的真实像素，避开宿主坐标缩放；回调最多等待 1.8 秒。
  var path=new android.graphics.Path();path.moveTo(point.x,point.y);
  var gesture=new android.accessibilityservice.GestureDescription.Builder()
    .addStroke(new android.accessibilityservice.GestureDescription.StrokeDescription(path,0,100)).build();
  var done=new java.util.concurrent.CountDownLatch(1),result=new java.util.concurrent.atomic.AtomicInteger(0);
  var callback=new JavaAdapter(android.accessibilityservice.AccessibilityService.GestureResultCallback,{
    onCompleted:function(){result.set(1);done.countDown();},
    onCancelled:function(){result.set(-1);done.countDown();}
  });
  var fresh=liveNodePoint(n,true);
  if(!fresh||Math.abs(fresh.x-point.x)>8||Math.abs(fresh.y-point.y)>8)return false;
  requireLearningApp();
  if(!auto.service.dispatchGesture(gesture,callback,null)){
    STATE.videoGestureResult='rejected';log('播放器无障碍点击未被系统接受');return false;
  }
  done.await(1800,java.util.concurrent.TimeUnit.MILLISECONDS);
  var outcome=result.get();
  STATE.videoGestureResult=outcome===1?'completed':outcome===-1?'cancelled':'pending';
  if(outcome===-1){log('播放器无障碍点击被取消，等待重新定位');return false;}
  // 已派发但回调超时属于结果待核对，不能当作未点击立即重复派发。
  if(outcome===0)log('播放器点击已派发，回调超时，继续核对页面结果');
  return true;
}
function videoShowsPlayTriangle(n){
  if(!n)return false;
  var im=picture();if(!im)return false;
  try{
    var b=n.bounds(),pw=Math.max(W,H),ph=Math.min(W,H),hits=0;
    for(var dy=-6;dy<=6;dy+=6){
      var x=Math.round(b.centerX()*im.getWidth()/pw),y=Math.round((b.centerY()+dy)*im.getHeight()/ph);
      if(x<0||y<0||x>=im.getWidth()||y>=im.getHeight())continue;
      var c=images.pixel(im,x,y);
      if(((c>>16)&255)>220&&((c>>8)&255)>220&&(c&255)>220)hits++;
    }
    return hits>=2;
  }finally{try{im.recycle();}catch(ignore){}}
}
function finishVideoSpeed(message){
  STATE.speedChecked=true;
  tap(Math.max(W,H)*.30,Math.min(W,H)*.40);sleep(250);
  var play=nativeVideoNode('land_start');
  if(!play){tap(Math.max(W,H)*.50,Math.min(W,H)*.50);sleep(250);play=nativeVideoNode('land_start');}
  if(videoShowsPlayTriangle(play)){
    videoPhysicalClick(play);STATE.speedResumeAt=Date.now();STATE.speedResumeTime=STATE.lastTime;
    log('视频当前暂停，点击播放恢复；调速过程中不执行暂停');
  }
  log(message);return true;
}
function chooseVideoSpeed(v){
  if(STATE.speedChecked)return false;
  var pw=Math.max(W,H),ph=Math.min(W,H);
  var rates=[];
  try{for(var i=0;i<8;i++){
    var n=id(PKG+':id/tvItem').findOnce(i);if(!n)break;if(!liveNodePoint(n,true))continue;
    var t=String(n.text()||'').trim(),b=n.bounds();
    if(/^\d+(?:\.\d+)?\s*(?:x|X|×|倍)$/.test(t)&&b.width()>0&&b.height()>0)
      rates.push({t:t,x:b.centerX(),y:b.centerY(),node:n});
  }}catch(ignore){}
  if(!rates.length)rates=v.n.filter(function(n){return n.x>pw*.55&&/^\d+(?:\.\d+)?\s*(?:x|X|×|倍)$/.test(n.t.trim());});
  if(rates.length){
    rates.sort(function(a,b){return parseFloat(b.t)-parseFloat(a.t);});
    var highest=rates[0];
    if(!videoRateSelected(highest)){
      if(highest.node)nativeVideoClick(highest.node);else tap(highest.x,highest.y);
      sleep(450);
    }
    if(videoRateSelected(highest))return finishVideoSpeed('已确认播放器最高倍速选中：'+highest.t);
    STATE.speedAttempts=(STATE.speedAttempts||0)+1;
    if(STATE.speedAttempts<3){log('倍速未确认选中，重新定位后重试');return true;}
    return finishVideoSpeed('倍速未生效，维持当前播放速度');
  }
  STATE.speedEntryAttempts=(STATE.speedEntryAttempts||0)+1;
  if(STATE.speedEntryAttempts>4)return finishVideoSpeed('播放器未提供可选倍速，恢复正常播放');
  var button=nativeVideoNode('speed');
  if(button){nativeVideoClick(button);log('点击倍速入口，当前可用：'+button.enabled());}
  else{
    var entry=find(v,/^(?:倍速|播放速度)$/);
    if(entry)tap(entry.x,entry.y);else tap(pw*.50,ph*.50);
  }
  sleep(400);return true;
}
function videoFailureNode(){
  // 模态弹窗不在播放器快速视图中；通用网络文案必须同时有播放器证据。
  var failure=nativeVideoNode('tvMessage');
  var pattern=/[\s\S]*(?:视频加载失败|视频播放失败|播放出错|请检查网络连接或[\s\S]*切换线路)[\s\S]*/;
  if(failure&&!pattern.test(String(failure.text()||'')))failure=null;
  try{if(!failure)failure=textMatches(pattern.source).findOnce();}catch(ignore){}
  if(!failure&&STATE.video&&!nativeVideoNode('tv_chapter_name')&&
     (nativeVideoNode('cvPlayer')||nativeVideoNode('land_start'))){
    try{failure=textMatches(/[\s\S]*(?:网络连接失败|网络连接异常|网络错误|网络异常|网络不佳|连接服务器失败|获取视频信息失败)[\s\S]*/.source).findOnce();}catch(ignore){}
  }
  try{return failure&&failure.visibleToUser()?failure:null;}catch(ignore){return null;}
}
function videoDialogButton(cancel){
  var pattern=cancel?/^\s*取\s*消\s*$/:/^\s*(?:重\s*试|重新加载|点击重试)\s*$/;
  var button=nativeVideoNode(cancel?'btnCancel':'btnOk');
  if(button&&!pattern.test(String(button.text()||'')))button=null;
  try{if(!button)button=textMatches(pattern.source).findOnce();}catch(ignore){}
  try{return button&&button.visibleToUser()&&button.enabled()?button:null;}catch(ignore){return null;}
}
function clickVideoRetryButton(button){
  STATE.videoRetryDirect=typeof auto!=='undefined'&&!!auto.service&&typeof auto.service.dispatchGesture==='function';
  return STATE.videoRetryDirect?videoPhysicalClick(button):nativeVideoClick(button);
}
function refreshVideoControlCache(){
  if(typeof auto==='undefined')return;
  requireLearningApp();
  try{if(typeof auto.clearCache==='function')auto.clearCache();}catch(ignore){}
}
function waitVideoNetwork(r,reason,recheckControl){
  r.recoveryPhase=null;r.pendingClickAt=0;r.waitReason=reason;
  r.waitKind=recheckControl?'retry-control':'';
  r.controlRecheckAt=recheckControl&&!(r.controlResumes>=1)?Date.now()+5000:0;
  setVideoNetworkState('waiting',r.attempts,reason);
  if(!r.lastLog||Date.now()-r.lastLog>=15000){
    r.lastLog=Date.now();log('视频网络恢复暂停：'+reason+'；'+(r.controlRecheckAt?'等待控件恢复后自动重新核对一次':videoRetryAction())+'，本任务仍未完成');
  }
}
function recheckVideoRetryControl(r,now){
  if(r.waitKind!=='retry-control'||!r.controlRecheckAt||now<r.controlRecheckAt||r.controlResumes>=1)return false;
  // 只重新检查实际可见按钮；未知页面、隐藏控件和屏幕外坐标不能触发动作。
  r.controlRecheckAt=now+2000;
  refreshVideoControlCache();
  var retry=videoDialogButton(false);
  if(!retry||!liveNodePoint(retry)||!videoFailureNode())return false;
  r.controlResumes=(r.controlResumes||0)+1;
  r.controlRecheckAt=0;r.waitKind='';r.waitReason='';r.actionFailures=0;r.controlSince=now;r.nextAt=now;
  setVideoNetworkState('retrying',r.attempts,'重试控件已恢复，重新核对一次');
  log('重试控件已重新确认可用，恢复一次有限操作（1/1），保留原重试预算');
  return true;
}
function beginVideoNetworkReopen(r,dialog){
  if(r.reopens>=1||!r.taskKey||!r.chapter){
    waitVideoNetwork(r,r.reopens>=1?'重进原视频后仍未恢复':'尚未确认原章节和视频身份，不能自动返回其他任务');return;
  }
  r.reopens++;r.recoveryPhase=dialog?'dismiss':'leave';r.recoveryAt=Date.now();
  r.cancelAt=0;r.cancelPhysical=false;r.leaveRequested=false;r.waitReason='';
  STATE.finished=false;STATE.videoExitAt=0;
  setVideoNetworkState('reopening',r.attempts);
  log('视频重试未恢复，准备返回原章节重进同一视频（1/1），不跳过未完成任务');
}
function handleVideoLoadFailure(){
  if(!videoFailureNode())return false;
  var now=Date.now(),r=STATE.videoLoadRecovery,epoch=Number(STORE.get('videoRetryEpoch',0))||0;
  if(r&&epoch>r.manualEpoch){r=null;log('已收到手动重试请求，重新读取当前错误弹窗');}
  if(!r)r=STATE.videoLoadRecovery={attempts:0,nextAt:0,lastTime:STATE.lastTime,lastLog:0,manualEpoch:epoch,
    progressBaseline:null,lastObserved:-1,reopens:0,taskKey:STATE.activeVideoKey||'',chapter:STATE.activeVideoChapter||'',
    pendingClickAt:0,physicalTried:false,controlSince:now,progressWaitAt:0,controlResumes:0,controlRecheckAt:0};
  // 错误再次出现会中断推进证据，不能把前后两次采样合并成播放成功。
  r.progressBaseline=null;r.lastObserved=-1;
  // 弹窗存在时禁止调速、点播放及判定完成。
  STATE.finished=false;STATE.videoExitAt=0;
  if(r.recoveryPhase){sleep(850);return true;}
  if(r.waitReason&&!recheckVideoRetryControl(r,now)){sleep(850);return true;}
  if(r.pendingClickAt&&!r.physicalTried&&now-r.pendingClickAt>=1200){
    // 宿主的 node.click() 返回 true 不能证明弹窗关闭；只补一次新定位的物理点击。
    var physical=videoDialogButton(false);r.physicalTried=true;
    if(physical&&videoFailureNode()&&videoPhysicalClick(physical))log('重试弹窗仍在，已按当前可见按钮补点一次，继续核对');
    sleep(250);return true;
  }
  if(now<r.nextAt){sleep(500);return true;}
  if(r.attempts>=3){
    beginVideoNetworkReopen(r,true);sleep(500);return true;
  }
  var retry=videoDialogButton(false);
  if(!retry){
    if(now-r.controlSince>=10000)waitVideoNetwork(r,'未找到可见且可用的重试按钮',true);
    else if(!r.lastLog||now-r.lastLog>=5000){r.lastLog=now;log('检测到视频网络错误，等待可见重试按钮');}
    sleep(850);return true;
  }
  if(clickVideoRetryButton(retry)){
    r.attempts++;r.lastTime=STATE.lastTime;r.nextAt=now+[8000,16000,30000][r.attempts-1];
    r.actionFailures=0;
    r.pendingClickAt=now;r.physicalTried=!!STATE.videoRetryDirect;r.progressWaitAt=now;
    setVideoNetworkState('retrying',r.attempts);
    STATE.movedAt=now;STATE.playerTap=now;
    log('视频网络错误，已请求重试（'+r.attempts+'/3），等待弹窗消失及进度推进');
  }else{
    r.actionFailures=(r.actionFailures||0)+1;r.nextAt=now+1200;
    if(r.actionFailures>=2||now-r.controlSince>=10000)waitVideoNetwork(r,'重试按钮操作未成功，保留页面供核对',true);
  }
  sleep(250);return true;
}
function handleVideoNetworkRecovery(){
  var r=STATE.videoLoadRecovery;if(!r)return false;
  var now=Date.now(),epoch=Number(STORE.get('videoRetryEpoch',0))||0;
  if(epoch>r.manualEpoch){STATE.videoLoadRecovery=null;setVideoNetworkState('recovered',0);return false;}
  if(!r.recoveryPhase){
    if(r.waitReason||videoFailureNode())return false;
    // 弹窗消失仍可能停在旧画面；恢复以两秒实际时间推进为准。
    r.pendingClickAt=0;
    if(r.progressWaitAt&&now-r.progressWaitAt>=15000){beginVideoNetworkReopen(r,false);return true;}
    return false;
  }
  if(now-r.recoveryAt>15000){waitVideoNetwork(r,'返回或重进原视频超时，停止自动导航');return true;}
  if(r.recoveryPhase==='dismiss'){
    if(!videoFailureNode()){r.recoveryPhase='leave';r.recoveryAt=now;return true;}
    var cancel=videoDialogButton(true);
    if(!cancel){waitVideoNetwork(r,'未找到取消按钮，不能安全退出错误弹窗');return true;}
    if(!r.cancelAt){r.cancelAt=now;nativeVideoClick(cancel);}
    else if(!r.cancelPhysical&&now-r.cancelAt>=1200){
      r.cancelPhysical=true;if(videoFailureNode())videoPhysicalClick(videoDialogButton(true));
    }
    sleep(250);return true;
  }
  // 只允许退出已识别播放器一次，不能在未确认页面上连续按返回。
  if(r.recoveryPhase==='leave'){
    if(videoFailureNode()){waitVideoNetwork(r,'退出前网络弹窗再次出现');return true;}
    var heading=nativeVideoNode('tv_chapter_name');
    if(heading){r.recoveryPhase='reopen';r.recoveryAt=now;return true;}
    if(nativeVideoNode('cvPlayer')||nativeVideoNode('land_start')){
      var leave=nativeVideoNode('back');
      // 先记录在途动作，异常或切后台也不能在未知结果上重复按返回。
      r.leaveRequested=true;r.recoveryPhase='reopen';r.recoveryAt=now;
      if(!(leave?videoPhysicalClick(leave):safeBack()))waitVideoNetwork(r,'退出播放器操作未成功，停止重复返回');
    }
    sleep(250);return true;
  }
  var page=view(),current=readChapterHeading(page);
  if(!current){sleep(350);return true;}
  if(current.t.replace(/\s+/g,'')!==r.chapter){waitVideoNetwork(r,'当前章节与原视频不一致，停止重进');return true;}
  var task=taskSections(page).filter(function(t){return t.kind==='video'&&t.key===r.taskKey;})[0];
  if(!task){sleep(350);return true;}
  if(task.done){STATE.videoLoadRecovery=null;STATE.video=false;setVideoNetworkState('recovered',0);log('原视频任务点已显示完成，按页面状态继续');return false;}
  if(openVideo({n:task.nodes,s:task.text},true)){
    r.recoveryPhase=null;r.attempts=0;r.nextAt=0;r.pendingClickAt=0;r.progressWaitAt=now;
    r.controlSince=now;r.progressBaseline=null;r.lastObserved=-1;r.waitReason='';
    log('已重进原章节的同一未完成视频，继续核对播放进度');
  }
  sleep(350);return true;
}
function resumeVideoNetworkAfterPause(elapsed){
  var r=STATE.videoLoadRecovery;if(!r||elapsed<=0)return;
  ['nextAt','pendingClickAt','controlSince','progressWaitAt','recoveryAt','cancelAt','controlRecheckAt'].forEach(function(key){if(r[key])r[key]+=elapsed;});
}
function videoRetryAction(){
  try{if(String(context.getPackageName())==='org.autojs.autojs6')return '网络恢复后在 AutoJs6 重新运行本脚本';}catch(ignore){}
  return '网络恢复后回星伴点“开始学习”重新尝试';
}
function setVideoNetworkState(phase,attempts,reason){
  var signature=phase+':'+attempts+':'+(reason||'');
  if(STATE.videoNetworkSignature===signature){
    // 另一份旧运行留下的提示也要清除，不能只比较当前运行的内存签名。
    if(phase==='recovered'&&STORE.get('videoNetworkState',null))STORE.remove('videoNetworkState');
    return;
  }
  STATE.videoNetworkSignature=signature;
  if(phase==='recovered')STORE.remove('videoNetworkState');
  else STORE.put('videoNetworkState',{phase:phase,attempts:attempts,reason:reason||'',at:Date.now()});
}
function confirmVideoLoadProgress(p){
  var r=STATE.videoLoadRecovery;if(!r||!p)return;
  if(typeof p.now!=='number'||typeof p.all!=='number'||!isFinite(p.now)||!isFinite(p.all)||p.now<0||p.all<=0||p.now>p.all)return;
  // 切换线路可能从零重新播放；恢复必须依据重试后的新基线，不能要求追回故障前的进度。
  if(r.progressBaseline===null||typeof r.progressBaseline==='undefined'||p.now<r.lastObserved||(r.progressTotal&&r.progressTotal!==p.all)){
    r.progressBaseline=p.now;r.progressTotal=p.all;
  }else if(p.now>r.lastObserved&&p.now-r.progressBaseline>=2){
    STATE.videoLoadRecovery=null;setVideoNetworkState('recovered',0);
    log('视频进度已恢复推进，清除加载重试记录');return;
  }
  r.lastObserved=p.now;r.lastTime=p.now;
}
function player(v){
  if(handleVideoLoadFailure())return;
  var pw=Math.max(W,H),ph=Math.min(W,H),now=Date.now();
  var firstPlayerView=!STATE.video;
  if(firstPlayerView){STATE.video=true;STATE.openedAt=now;}
  var p=twoTimes(v.s),previous=STATE.lastTime;
  if(p){
    STATE.total=p.all;
    if(p.now!==previous){STATE.lastTime=p.now;STATE.movedAt=now;}
    confirmVideoLoadProgress(p);
    if(!STATE.videoLoadRecovery&&(p.now>=p.all-1||(previous>=p.all-1&&p.now<3)))STATE.finished=true;
  }
  if(!STATE.videoLoadRecovery&&/播放结束|播放完毕|重新播放/.test(v.s))STATE.finished=true;
  if(STATE.finished){
    // 完成状态一旦确认，就只退出，不再调速、恢复播放或触发重播。
    if(!STATE.videoExitAt||now-STATE.videoExitAt>900){
      STATE.videoExitAt=now;
      var leave=nativeVideoNode('back');
      if(leave)nativeVideoClick(leave);else safeBack();
      log('视频已播放结束，返回章节核对任务点');
    }
    sleep(450);return;
  }
  // 切回播放器后可能已经暂停；有可见播放按钮时直接确认并恢复，避免先点中央等待。
  if(!STATE.videoLoadRecovery&&(firstPlayerView||now-STATE.movedAt>3500)&&
     (!STATE.pauseProbeAt||now-STATE.pauseProbeAt>3500)){
    STATE.pauseProbeAt=now;
    var visiblePlay=nativeVideoNode('land_start');
    if(visiblePlay&&videoShowsPlayTriangle(visiblePlay)&&videoPhysicalClick(visiblePlay)){
      STATE.playerTap=now;log('视频当前暂停，按可见播放按钮恢复');sleep(250);return;
    }
  }
  if(chooseVideoSpeed(v))return;
  if(STATE.speedResumeAt&&p&&p.now>STATE.speedResumeTime){
    log('播放进度已推进，确认视频正在播放');STATE.speedResumeAt=0;
  }
  var nearEnd=p&&p.all-p.now<12;
  // 控制栏隐藏不等于播放停滞；即使时间暂不可见，也遵守展示控制栏的间隔。
  var controlsDue=!STATE.playerTap||now-STATE.playerTap>(nearEnd?1800:7000);
  if(controlsDue&&(!p||now-STATE.movedAt>10000||nearEnd)){
    STATE.playerTap=now;
    tap(pw*.50,ph*.50);sleep(180);
    var current=videoView(),fresh=twoTimes(current.s);
    if(fresh&&!STATE.videoLoadRecovery&&fresh.now>=fresh.all-1){STATE.finished=true;return;}
    if(fresh){
      var play=nativeVideoNode('land_start');
      // 展示控制栏后重新核对实际播放图标，不因旧进度计时再等十秒。
      if(videoShowsPlayTriangle(play)&&videoPhysicalClick(play))log('视频暂停，恢复播放');
    }
  }
  sleep(nearEnd?300:850);
}

function recoverChapterStall(v){
  // 阅读流程已有入口重试、返回核对和一次原章节刷新；不能被通用恢复再次退出。
  if(STATE.readingVisit||STATE.readingRefresh||STATE.doc||STATE.quizPending||STATE.awaitingSubmitResult||questions(v).length||/请输入|确认提交|是否提交/.test(v.s))return false;
  var heading=readChapterHeading(v);if(!heading)return false;
  var now=Date.now(),watch=STATE.chapterWatch;
  if(!watch||watch.title!==heading.t){watch=STATE.chapterWatch={title:heading.t,seen:{},since:now,recoveries:0};}
  if(watch.holdUntil>now){sleep(1200);return true;}
  var sig=v.n.filter(function(n){return n.y>H*.14&&n.y<H*.95&&!/写笔记/.test(n.t);}).map(function(n){return n.t+'@'+Math.round(n.y/60);}).join('|');
  var visits=watch.seen[sig]||0;watch.seen[sig]=visits+1;
  if(!visits){watch.since=now;}
  if(now-watch.since<45000||visits<6)return false;
  watch.seen={};watch.since=now;
  if(watch.recoveries>=2){
    watch.holdUntil=now+30000;log('本节恢复两次仍未推进，等待页面变化；保留作答记录，不重复输入或强制换节');return true;
  }
  if(refreshVideoChapter(v)){
    watch.recoveries++;STATE.taskTopReady=false;STATE.taskTopSignature='';
    log('章节页面持续不变或反复滚动，重新进入原章节恢复（'+watch.recoveries+'/2）');return true;
  }
  return false;
}

function questions(v){
  var starts=[];
  function typeLabel(t){
    return /^[\[［【(（]?\s*(?:单选|多选|判断|简答|问答)题?\s*[\]］】)）]?$/.test(t);
  }
  v.n.forEach(function(n){
    // 章节标题如“4.9课后测验”不能当成第 4 题。
    var direct=/^\s*\d{1,3}\s*(?:[.．、,，:：)）]\s*)?\[?\s*(?:单选|多选|判断|简答|问答)题?\]?/.test(n.t);
    var numberOnly=/^\s*\d{1,3}\s*[.．、,，:：)）]\s*$/.test(n.t);
    var split=numberOnly&&v.n.some(function(z){
      return typeLabel(z.t)&&
        Math.abs(z.y-n.y)<H*.07;
    });
    if(direct||split)starts.push(n);
  });
  // 同屏每一个分离的题号/题型都要合并，不能只补第一道题。
  v.n.filter(function(n){return n.y<H*.94&&typeLabel(n.t);}).forEach(function(typeNode){
    var nearby=v.n.filter(function(n){
      return Math.abs(n.y-typeNode.y)<H*.065&&/^\s*\d{1,3}\s*[.．、,，]?\s*$/.test(n.t);
    }).sort(function(a,b){return Math.abs(a.y-typeNode.y)-Math.abs(b.y-typeNode.y);});
    var near=nearby[0],number=near?String(near.t.match(/\d{1,3}/)[0]):'';
    if(!number&&starts.length===0){
      var card=v.s.match(/(?:^|\D)(\d{1,3})\s*\/\s*\d{1,3}(?:\D|$)/);
      number=card?card[1]:'';
    }
    if(!number)return;
    if(!starts.some(function(n){
      var m=n.t.match(/^\s*(\d{1,3})/);
      return m&&m[1]===number&&Math.abs(n.y-typeNode.y)<H*.08;
    }))starts.push({t:number+'. '+typeNode.t,x:typeNode.x,
      y:near?Math.min(near.y,typeNode.y):typeNode.y,synthetic:true});
  });
  starts.sort(function(a,b){return a.y-b.y;});
  starts=starts.filter(function(n,i){
    return n.y<H*.94&&(i===0||n.y-starts[i-1].y>H*.02);
  });
  var items=[];
  starts.forEach(function(start,idx){
    var top=start.y;
    var bottom=idx+1<starts.length?starts[idx+1].y:H*.96;
    if(idx+1===starts.length){
      v.n.forEach(function(n){
        if(n.y>Math.max(top+H*.10,H*.45)&&n.y<bottom&&
           /^(上一题|下一题|答题卡|提交答案|提交测验|下一节|上一节)/.test(n.t))
          bottom=n.y-H*.012;
      });
    }
    var section=v.n.filter(function(n){
      return n.y>=top&&n.y<bottom;
    });
    var options=[];
    section.forEach(function(n){
      var m=n.t.match(/^\s*([A-H])\s*[.．、:：)）]?\s*$/i);
      if(m&&!options.some(function(o){
        return o.l===m[1].toUpperCase();
      }))options.push({l:m[1].toUpperCase(),n:n,t:''});
      var combined=n.t.match(
        /^\s*([A-H])(?:\s*[.．、:：)）]\s*|\s+)(\S.{0,219})$/i
      );
      if(combined){
      var letter=combined[1].toUpperCase();
      var existing=options.filter(function(o){return o.l===letter;})[0];
      if(existing){
        if(combined[2].trim().length>existing.t.length)
          existing.t=combined[2].trim();
      }else options.push({l:letter,n:n,t:combined[2].trim()});
    }
    });
    options.sort(function(a,b){return a.n.y-b.n.y;});
    options.forEach(function(o,i){
      var end=i+1<options.length?options[i+1].n.y:bottom;
      var content=section.filter(function(n){
        return n.y>=o.n.y-H*.015&&n.y<end-4&&
          !/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&
          !/^\s*[A-H](?:\s*[.．、:：)）]\s*|\s+)\S+/i.test(n.t)&&
          n!==o.n&&
          !/^(下一节|上一节|写笔记|提交)$/.test(n.t);
      }).map(function(n){return n.t;}).join(' ').slice(0,220);
      if(content.length>o.t.length)o.t=content;
    });
    var first=options.length?options[0].n.y:bottom;
    if(/简答|问答/.test(start.t)){
      section.forEach(function(n){
        if(n.y>top+H*.02&&
           /^(请输入答案|请输入内容|点击输入|保存|提交)$/.test(n.t)&&
           n.y<first)first=n.y;
      });
    }
    var qNodes=section.filter(function(n){
      return n.y<first-4;
    });
    if(/简答|问答/.test(start.t)){
      var accessible=qNodes.filter(function(n){return !!n.node;});
      // 无障碍树已有题干时，忽略可能滞留的 AutoJs6 截图文字。
      if(accessible.some(function(n){return n.t.length>=16;}))
        qNodes=accessible;
    }
    var q=qNodes.map(function(n){return n.t;}).join(' ').slice(0,800);
    if(start.synthetic||
       !/^\s*\d{1,3}\s*[.．、,，:：)）]/.test(q))
      q=(start.t+' '+q).slice(0,800);
    var num=start.t.match(/^\s*(\d{1,3})/);
    if(num&&options.some(function(o){return !o.t;})){
      var parts=v.s.split('|').map(function(x){return x.trim();});
      var begin=-1,end=parts.length;
      for(var i=0;i<parts.length;i++){
        if(new RegExp('^'+num[1]+'\\s*[.．、,，]').test(parts[i])){
          begin=i;
          break;
        }
      }
      if(begin>=0){
        for(var i=begin+1;i<parts.length;i++){
          if(/^\d{1,3}\s*[.．、,，]/.test(parts[i])){
            end=i;
            break;
          }
        }
        var seg=parts.slice(begin,end);
        options.forEach(function(o){
          if(o.t)return;
          for(var i=0;i<seg.length;i++){
            if(new RegExp('^'+o.l+'\\s*$').test(seg[i])){
              var words=[];
              for(var j=i+1;j<seg.length;j++){
                if(/^[A-H]\s*$|^\d{1,3}\s*[.．、,，]/.test(seg[j]))
                  break;
                words.push(seg[j]);
              }
              o.t=words.join(' ').slice(0,220);
              break;
            }
          }
        });
      }
    }
    var headerType=(start.t.match(/(?:单选|多选|判断|简答|问答)题?/)||[])[0];
    if(!headerType){
      var typeNode=section.filter(function(n){return typeLabel(n.t);})[0];
      headerType=typeNode?typeNode.t:'单选';
    }
    items.push({
      q:q,
      kind:/多选/.test(headerType)?'multiple':
        /判断/.test(headerType)?'judge':
        /简答|问答/.test(headerType)?'short':'single',
      options:options,y:top
    });
  });
  return items;
}
function quizSubmitButton(v){return find(v,/^(提交|提交答案|提交测验|提交作业|交卷)$/,H*.13);}
function quizViewportSignature(v){
  return v.n.filter(function(n){
    return n.y>H*.15&&n.y<H*.96&&!/^(写笔记|讨论|\d{1,2}:\d{2})$/.test(n.t);
  }).map(function(n){return n.t.replace(/\s+/g,'').slice(0,160)+'@'+Math.round(n.y/24)+(n.selected?'*':'');}).join('|');
}
function unansweredWarning(v){
  return /(?:还有|存在|有).*(?:未答|未作答)|题目未.*(?:回答|作答)|未答题|漏答题|尚未作答/.test(v.s);
}
function submissionFailed(v){
  return /未达到及格线|未达及格线|请重做|提交失败|提交出错/.test(v.s);
}
function submissionSucceeded(v){
  if(submissionFailed(v)||unansweredWarning(v))return false;
  // 答题页面题干中的“成绩/得分”不是提交证据。
  var submit=quizSubmitButton(v);
  if(submit)return false;
  return v.n.some(function(n){
    return /^(已提交|作业已提交|提交成功|作业提交成功|测验已完成|作业已完成|待批阅|待批改|查看答案|我的答案[:：]?|得分[:：]\s*\d|成绩[:：]\s*\d)/.test(n.t);
  });
}
function updateQuizContext(v){
  var title=nativeField(v,'tv_chapter_name')||v.n.filter(function(n){
    return n.y<H*.25&&/^\d+(?:\.\d+)+\s*.*(?:章节|课后|测验|测试)/.test(n.t);
  })[0];
  if(!title)return;
  var chapterMatch=title.t.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(chapterMatch)STATE.workChapter={number:chapterMatch[1],title:chapterMatch[2].replace(/\s+/g,'')};
  var key=title.t.replace(/\s+/g,'');
  if(STATE.quizContext&&STATE.quizContext!==key){
    STATE.answered={};STATE.scanDrafts={};STATE.scanFailures={};STATE.shortAttempted={};STATE.shortSaved={};
    STATE.choiceAttempted={};STATE.multipleConfirmed={};STATE.multipleExpected={};STATE.auditMissing=[];STATE.auditRecoverySteps=0;
    STATE.workTotal=0;STATE.blocked='';STATE.navBlocked='';STATE.lastQuiz='';
    STATE.quizSeek=null;STATE.quizAuditHold=null;STATE.auditRecoverySignature='';STATE.auditRecoveryStill=0;
    STATE.readingVisit=null;STATE.readingAttempts={};STATE.readingRefresh=null;
    STATE.taskTopSteps=0;
    STATE.afterSubmit=false;STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.docAwaitKey='';
    STATE.lastAnswerView=null;STATE.headerSearch=0;STATE.quizPending=false;
    log('章节已变化，已清空上一节作答记录');
  }
  STATE.quizContext=key;
}
function quiz(v){
  // 测验、作业由你自己作答和提交；脚本只等待，提交成功后继续本节剩余任务点。
  if(Date.now()-STATE.lastLog>15000){STATE.lastLog=Date.now();log('当前是测验/作业页面，请自行作答并提交；提交成功后脚本继续');}
  sleep(1500);
}
function openVideo(v,preserveNetworkRecovery){
  var box=find(v,/观看时长|完成条件/);
  if(!box)return false;
  var y=box.y+W*.38;
  if(y>H*.88){
    swipeToNextQuestion();
    log('视频播放区域靠近屏幕底部，向上移动后重新定位');
    sleep(400);
    return false;
  }
  if(tap(W*.50,y)){
    STATE.lastOpen=Date.now();
    STATE.video=true;
    STATE.openedAt=Date.now();
    STATE.finished=false;
    STATE.lastTime=-1;
    if(!preserveNetworkRecovery){STATE.videoLoadRecovery=null;setVideoNetworkState('recovered',0);}
    STATE.total=0;
    STATE.speedChecked=false;STATE.speedShown=false;STATE.speedMenuAt=0;STATE.speedAttempts=0;STATE.speedPaused=false;STATE.speedPauseAttempts=0;STATE.speedEntryAttempts=0;
    toast('打开视频');
    return true;
  }
  return false;
}
function isChapterContent(v){
  if(nativeField(v,'tv_chapter_name'))return true;
  return v.n.some(function(n){return /^章节$/.test(n.t);})&&
    (/任务点|下一节|下一讲/.test(v.s)||v.n.some(function(n){
      return /^\d+(?:\.\d+)+\s*.*(?:章节|课后|测验|测试)/.test(n.t);
    }));
}
function continueAfterSubmit(v){
  if(isChapterContent(v)){
    STATE.returnBackTried=false;chapter(v);return;
  }
  var directoryEntries=v.n.filter(function(n){
    try{return n.node&&String(n.node.id())===PKG+':id/tv_title';}catch(ignore){return false;}
  });
  if(/目录|章节列表|课程章节/.test(v.s)||directoryEntries.length>1){
    var previous=STATE.quizContext;
    var entry=v.n.filter(function(n){
      var text=n.t.replace(/\s+/g,'');
      return (STATE.workChapter&&directoryEntries.indexOf(n)>=0&&text===STATE.workChapter.title)||
        (previous&&text===previous);
    })[0];
    if(entry&&press(entry)){
      STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.returnBackTried=false;
      log('已重新进入刚完成作业的章节，继续查找下一节');sleep(650);
    }else{
      if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();log('已返回目录，请打开刚完成作业的章节，脚本将自动继续');}
      sleep(700);
    }
    return;
  }
  if(submissionSucceeded(v)&&!STATE.returnBackTried){
    STATE.returnBackTried=true;safeBack();sleep(650);
    log('已从作业结果页返回一次，核对章节位置');return;
  }
  if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();log('作业已完成，尚未识别到章节导航，等待页面恢复');}
  sleep(650);
}
function taskSections(v){
  var list=markers(v).slice().sort(function(a,b){return a.y-b.y;});
  return list.map(function(m,i){
    var end=i+1<list.length?list[i+1].y:H*.96;
    var nodes=v.n.filter(function(n){return n.y>m.y+8&&n.y<end;}).sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var text=nodes.map(function(n){return n.t;}).join('|');
    var discussionCard=nodes.some(function(n){
      return /^[\u4e00-\u9fff·]{2,12}[:：].{5,}/.test(n.t)&&!/^资料来源|注意|提示/.test(n.t);
    })&&nodes.some(function(n){return n.t.length>35&&/[？?]/.test(n.t);});
    // 同屏可包含视频和后面的讨论，使用离任务点最近的明确类型。
    var typed=nodes.slice().sort(function(a,b){return a.y-b.y;}).filter(function(n){
      return /观看时长|完成条件|^(?:视频|讨论|参与讨论|章节测验|开始测验|开始作业|由此作答|阅读$|文献阅读$|去阅读$)/.test(n.t);
    })[0];
    var kind=typed?(/观看时长|完成条件|^视频/.test(typed.t)?'video':/讨论/.test(typed.t)?'discussion':/阅读/.test(typed.t)?'reading':'quiz'):
      /讨论|评论|回复[:：]|参与讨论/.test(text)||discussionCard?'discussion':/测验|作业|练习|由此作答/.test(text)?'quiz':
      /观看时长|完成条件|视频/.test(text)?'video':'reading';
    return {y:m.y,end:end,done:m.done,kind:kind,nodes:nodes,text:text,
      key:kind+':'+(kind==='reading'?readingTaskTitle(nodes):nodes.slice(0,3).map(function(n){return n.t;}).join('|'))};
  });
}
function readingTaskTitle(nodes){
  var candidates=nodes.filter(function(n){
    var t=n.t.trim();
    return t&&!/^(阅读|文献阅读|资料|附件|去阅读|开始阅读|打开阅读|查看文献|点击阅读|任务点(?:已完成|未完成)?|下一节|上一节|讨论|写笔记|\d+)$/.test(t)&&
      !/阅读总时长|当天阅读时长|完成阅读任务点|您的阅读|^点击.*阅读|^CoverNew$|^realReadNew\?|https?:\/\/|^\s*$/.test(t);
  });
  // OCR 常将换行文件名拆成片段，且排序早于完整原生控件。原生文件名优先用作身份与入口。
  var title=candidates.filter(function(n){return n.node&&/\.(?:docx?|pdf|pptx?|xlsx?|txt|epub)\s*$/i.test(n.t);})[0]||
    candidates.filter(function(n){return !!n.node;})[0]||candidates[0];
  return title?title.t.replace(/\s+/g,''):'未识别阅读标题';
}
function readChapterHeading(v){
  return nativeField(v,'tv_chapter_name')||v.n.filter(function(n){
    return n.y<H*.30&&/^\d+(?:\.\d+)+\s*[^\d.\s]/.test(n.t);
  })[0];
}
function refreshVideoChapter(v){
  var heading=readChapterHeading(v),match=heading&&heading.t.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(!match)return false;
  STATE.videoChapterRefresh={number:match[1],title:match[2].replace(/\s+/g,''),tries:0};
  CHAPTER.startReturn(STATE.videoChapterRefresh);
  safeBack();sleep(350);log('退出章节后重新进入刷新任务状态');return true;
}
function reopenVideoChapter(v){
  var target=STATE.videoChapterRefresh;if(!target)return false;
  var result=CHAPTER.returnToChapter(target);
  if(result.type==='entered'){
    STATE.videoChapterRefresh=null;STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.videoFinishedKeys={};
    log('已重新进入原章节，复查本节全部任务点');sleep(350);return true;
  }
  if(result.type==='hold'&&Date.now()-STATE.lastLog>10000){STATE.lastLog=Date.now();log('返回 '+target.number+' 原章节：'+result.reason+'；暂停换节，点击开始学习可重试');}
  sleep(result.type==='hold'?650:180);return true;
}
function scanUnfinishedChapters(v){return CHAPTER.step();}

function swipeChapterTasks(toTop){
  requireLearningApp();
  // 保留屏幕重叠区域，任务扫描比逐项答题使用更大步幅。
  swipe(Math.round(W*.52),Math.round(H*(toTop?.25:.76)),
        Math.round(W*.52),Math.round(H*(toTop?.73:.28)),220);
}
function readingTab(v){
  var tabs=v.n.filter(function(n){
    try{return n.node&&String(n.node.id())===PKG+':id/tv_title'&&/^\d+$/.test(n.t)&&n.y>H*.15&&n.y<H*.30;}
    catch(ignore){return false;}
  });
  var active=tabs.filter(function(n){
    if(n.selected)return true;
    var wrapper=v.n.some(function(row){
      try{return row.t===n.t&&Math.abs(row.y-n.y)<H*.01&&Math.abs(row.x-n.x)<W*.08&&row.node&&row.node.clickable();}catch(ignore){return false;}
    });
    if(wrapper)return false;
    try{return !n.node.parent().clickable();}catch(ignore){return false;}
  });
  if(active.length===1)return active[0].t;
  var im=tabs.length?picture():null;
  if(!im)return '';
  try{var selected=tabs.filter(function(n){return circleSelected(im,n.x,n.y);});return selected.length===1?selected[0].t:'';}
  finally{try{im.recycle();}catch(ignore){}}
}
function readingActivity(){
  try{return auto.service&&typeof auto.currentActivity==='function'?String(auto.currentActivity()||''):'';}
  catch(ignore){return '';}
}
function readingNativeLink(task){
  // 部分 WebView 的链接没有被文字/描述选择器返回，按真实控件类补读。
  // 只接受原任务范围内唯一的阅读链接，不点击封面预览或其他任务。
  try{
    var links=[];
    classNameMatches('android.view.View').find().forEach(function(n){
      var t=String(n.text()||n.desc()||'').trim(),point=liveNodePoint(n,true);
      if(point&&/^realReadNew(?:\?|$)/.test(t)&&point.y>task.y&&point.y<(task.end||H*.96))links.push({t:t,node:n,x:point.x,y:point.y});
    });
    return links.length===1?links[0]:null;
  }catch(ignore){return null;}
}
function openReadingTask(task,v){
  var heading=readChapterHeading(v),chapterKey=heading?heading.t.replace(/\s+/g,''):'';
  if(!chapterKey){log('阅读任务的原章节尚未确认，保留页面');sleep(500);return false;}
  var key=chapterKey+'|'+task.key;
  STATE.readingAttempts=STATE.readingAttempts||{};
  var history=STATE.readingAttempts[key]||{opens:0,refreshes:0};
  STATE.readingAttempts[key]=history;
  if(history.opens>=2){log('阅读任务两次进入后仍未确认完成，停留核对平台完成条件');sleep(600);return false;}
  var entry=find({n:task.nodes},/^(去阅读|开始阅读|打开阅读|查看文献|点击阅读)$/);
  // 封面按钮会打开图片预览；书籍使用真实阅读链接，不能把预览封面算作阅读。
  if(!entry)entry=task.nodes.filter(function(n){return n.node&&/^realReadNew(?:\?|$)/.test(n.t);})[0];
  if(!entry){
    var title=readingTaskTitle(task.nodes);
    entry=task.nodes.filter(function(n){return n.t.replace(/\s+/g,'')===title&&n.node;})[0];
    // 有真实书籍链接时仍优先打开读物；附件已有完整原生标题时不扫描整个控件树。
    if(!entry||! /\.(?:docx?|pdf|pptx?|xlsx?|txt|epub)\s*$/i.test(entry.t))entry=readingNativeLink(task)||entry;
  }
  // 页面切换后旧节点会失效，原分页与 Activity 必须在进入前记录。
  var tab=readingTab(v),originActivity=readingActivity();
  if(!entry||!press(entry)){
    history.entryFailures=(history.entryFailures||0)+1;
    if(history.entryFailures>=3){
      STATE.readingVisit={key:task.key,historyKey:key,chapter:chapterKey,heading:heading.t,tab:tab,originActivity:originActivity,stage:'hold',nextAt:0,tabAttempts:0};
    }
    if(Date.now()-STATE.lastLog>10000){STATE.lastLog=Date.now();log('未找到可点击的阅读入口，保留页面，不使用任务标题附近的固定坐标');}
    sleep(500);return false;
  }
  history.opens++;history.entryFailures=0;
  STATE.readingVisit={key:task.key,historyKey:key,chapter:chapterKey,heading:heading.t,tab:tab,originActivity:originActivity,
    stage:'opening',at:Date.now(),nextAt:0,backSent:false,tabAttempts:0};
  STATE.afterSubmit=false;STATE.doc=true;STATE.docAt=Date.now();STATE.docAwaitKey=task.key;
  STATE.docAwaitAt=Date.now();STATE.lastDoc=Date.now();
  log('已点击阅读入口，确认进入后返回原章节核对任务点');sleep(350);return true;
}
function readingMessage(text){
  if(Date.now()-STATE.lastLog>10000){STATE.lastLog=Date.now();log(text);}
}
function refreshReadingChapter(v){
  var pending=STATE.readingVisit,heading=readChapterHeading(v);
  if(!pending||!heading||heading.t.replace(/\s+/g,'')!==pending.chapter)return false;
  var match=pending.heading.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(!match)return false;
  var history=STATE.readingAttempts[pending.historyKey];
  if(history.refreshes>=1)return false;
  history.refreshes++;
  STATE.readingRefresh={number:match[1],title:match[2].replace(/\s+/g,'')};
  CHAPTER.startReturn(STATE.readingRefresh);
  safeBack();log('阅读状态尚未更新，重新进入原章节刷新核对');sleep(300);return true;
}
function reopenReadingChapter(){
  if(!STATE.readingRefresh)return false;
  var result=CHAPTER.returnToChapter(STATE.readingRefresh);
  if(result.type==='entered'){
    STATE.readingRefresh=null;STATE.taskTopReady=false;STATE.taskTopSignature='';
    if(STATE.readingVisit){STATE.readingVisit.nextAt=Date.now()+800;STATE.readingVisit.tabAttempts=0;STATE.readingVisit.missingAt=0;}
    log('已返回原阅读章节，重新核对阅读任务状态');
  }else if(result.type==='hold')readingMessage('原阅读章节未能确认进入，停止换节：'+result.reason);
  sleep(result.type==='hold'?600:180);return true;
}
function checkReadingTask(v){
  var pending=STATE.readingVisit;if(!pending)return false;
  var activity=readingActivity();
  if(pending.originActivity&&activity&&activity!==pending.originActivity){readingMessage('阅读尚未返回原章节页面，停止继续任务');sleep(400);return true;}
  var heading=readChapterHeading(v);
  if(!heading||heading.t.replace(/\s+/g,'')!==pending.chapter){
    readingMessage('阅读返回位置尚未确认，暂停换节并等待原章节');sleep(500);return true;
  }
  var tab=readingTab(v);
  if(pending.tab&&tab!==pending.tab){
    if(!pending.tabAttempts){
      var entry=v.n.filter(function(n){
        try{return n.node&&String(n.node.id())===PKG+':id/tv_title'&&n.t===pending.tab&&n.y>H*.15&&n.y<H*.30;}
        catch(ignore){return false;}
      })[0];
      if(entry){
        var point=liveNodePoint(entry.node,true);
        if(point&&nativeVideoClick(entry.node)){pending.tabAttempts=1;pending.tabAt=Date.now();pending.missingAt=0;sleep(300);return true;}
      }
    }
    readingMessage('原阅读任务分页尚未确认，停留等待核对');sleep(500);return true;
  }
  var task=taskSections(v).filter(function(t){return t.kind==='reading'&&t.key===pending.key;})[0];
  if(task&&task.done){
    log('已确认原阅读任务点完成，继续处理本节后续任务');
    STATE.readingVisit=null;STATE.docAwaitKey='';STATE.doc=false;return false;
  }
  if(Date.now()<pending.nextAt){sleep(300);return true;}
  if(!task){
    if(!pending.missingAt)pending.missingAt=Date.now();
    if(Date.now()-pending.missingAt<3000){sleep(250);return true;}
  }else pending.missingAt=0;
  var history=STATE.readingAttempts[pending.historyKey];
  if(pending.stage==='hold'){
    readingMessage('阅读任务仍未确认完成，已停止重复打开；请核对平台要求');sleep(600);return true;
  }
  if(history.refreshes<1&&refreshReadingChapter(v))return true;
  if(task&&history.opens<2){
    STATE.readingVisit=null;STATE.docAwaitKey='';
    log('刷新后阅读任务仍未完成，有限重试原阅读入口');
    openReadingTask(task,v);return true;
  }
  pending.stage='hold';
  readingMessage(task?'阅读任务仍未完成，达到重试上限，保留任务等待核对':'未找到原阅读任务点，不能按已完成跳过');
  sleep(600);return true;
}
function verifyChapterTop(v){
  var signature=quizViewportSignature(v);
  if(signature===STATE.taskTopSignature){STATE.taskTopReady=true;STATE.taskTopSignature='';STATE.taskTopSteps=0;return true;}
  STATE.taskTopSignature=signature;STATE.taskTopSteps=(STATE.taskTopSteps||0)+1;
  if(STATE.taskTopSteps>16){readingMessage('章节顶部复核达到上限，停止重复回滑；未确认本节全部任务前不换节');sleep(500);return false;}
  swipeChapterTasks(true);sleep(180);return false;
}
function chapter(v){
  // 页尾按钮可能先于任务内容出现，加载状态未确认时不能按“无任务”换节。
  if(/加载中|正在加载|正在获取|刷新中/.test(v.s)){sleep(250);return;}
  if(STATE.finished){
    STATE.video=false;STATE.finished=false;STATE.videoExitAt=0;
    STATE.taskTopReady=false;STATE.taskTopSignature='';
    if(STATE.activeVideoKey){STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};STATE.videoFinishedKeys[STATE.activeVideoKey]=true;}
  }
  // 本节全部任务处理后统一刷新，单个视频结束不提前离开章节。
  STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
  if(STATE.readingVisit&&checkReadingTask(v))return;
  if(!STATE.taskTopReady&&STATE.taskTopSignature&&!verifyChapterTop(v))return;
  var tasks=taskSections(v).sort(function(a,b){return a.y-b.y;}),todo=null;
  if(tasks.length)STATE.hadCurrentTask=true;
  for(var i=0;i<tasks.length;i++){
    if(tasks[i].done||STATE.videoFinishedKeys[tasks[i].key])continue;
    todo=tasks[i];break;
  }
  if(todo){
    if(STATE.lastTaskFound!==todo.key){STATE.lastTaskFound=todo.key;log('按从上到下顺序进入本节未完成任务点：'+todo.kind+'，进入处理');}
    STATE.hadCurrentTask=true;STATE.completionRefreshed=false;
    if(todo.kind==='discussion'){
      if(STATE.discussionDone[todo.key]){
        if(Date.now()-STATE.lastLog>8000){STATE.lastLog=Date.now();log('讨论已发表，等待任务点完成，不重复回答');}
        sleep(700);return;
      }
      STATE.discussionTaskKey=todo.key;STATE.afterSubmit=false;
      var topicEntry=todo.nodes.filter(function(n){return n.t.length>15&&!/^(任务点|已完成|讨论|评论)/.test(n.t);})[0];
      if(press(topicEntry)){log('打开讨论任务');sleep(650);}else sleep(700);
      return;
    }
    if(todo.kind==='video'){
      if(Date.now()-STATE.lastOpen>1200&&openVideo({n:todo.nodes,s:todo.text})){
        STATE.activeVideoKey=todo.key;
        var videoHeading=readChapterHeading(v);STATE.activeVideoChapter=videoHeading?videoHeading.t.replace(/\s+/g,''):'';
        STATE.videoExitAt=0;STATE.afterSubmit=false;sleep(200);
      }
      else sleep(700);
      return;
    }
    if(todo.kind==='quiz'){
      STATE.afterSubmit=false;
      var entry=todo.nodes.filter(function(n){return /^(开始测验|开始作业|开始答题|进入测验|继续答题|由此作答)/.test(n.t);})[0];
      if(press(entry)||tap(W*.30,todo.y+H*.07))sleep(650);
      return;
    }
    openReadingTask(todo,v);
    return;
  }
  if(STATE.quizPending){
    var retry=find(v,/开始测验|开始答题|继续答题|由此作答/);
    if(retry&&press(retry)){sleep(650);return;}
    if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();log('测验尚未确认提交，暂停进入下一节');}
    sleep(700);return;
  }
  // 从章节顶部依次处理任务，包含讨论；页尾才允许下一节。
  var nextButton=chapterNextButton(v);
  if(nextButton){
    // 可见任务优先；仅在换节前从顶部复查一次，避免进入任务前反复回顶。
    if(!STATE.taskTopReady&&!verifyChapterTop(v))return;
    if(STATE.hadCurrentTask&&!STATE.completionRefreshed){
      if(refreshVideoChapter(v)){STATE.completionRefreshed=true;log('本节全部任务已处理，刷新后复核完成状态再换节');}
      else {log('未找到原章节入口，保留页面等待刷新核对');sleep(700);}
      return;
    }
    if(next(v))log('本节全部任务已复核，进入下一节');return;
  }
  swipeChapterTasks(false);sleep(180);
}
function document(v){
  var pending=STATE.readingVisit;
  if(!pending){STATE.doc=false;return;}
  var heading=readChapterHeading(v),onChapter=isChapterContent(v);
  var activity=readingActivity();
  // 实测书籍先经过 PathRequestActivity 加载，再进入 PdzActivity；不能在中间页立即返回。
  if(/\.PathRequestActivity$/.test(activity)||/^(?:加载中|正在加载|正在打开文档)/.test(v.s)){
    if(Date.now()-pending.at>15000)readingMessage('阅读仍在加载，停止追加操作；请核对网络或文档下载状态');
    sleep(350);return;
  }
  // OCR 或 WebView 树可能短暂保留原章节文字；实际 Activity 已切换则先按读物返回。
  if(pending.originActivity&&activity&&activity!==pending.originActivity)onChapter=false;
  if(onChapter){
    if(!heading||heading.t.replace(/\s+/g,'')!==pending.chapter){readingMessage('阅读页面返回到其他章节，停止自动返回并等待核对');sleep(500);return;}
    if(pending.stage==='opening'&&Date.now()-pending.at<3000){sleep(200);return;}
    STATE.doc=false;pending.stage='checking';pending.nextAt=Date.now()+800;
    if(!pending.backSent)log('阅读入口未确认跳转，先核对原任务状态，不重复点击返回');
    return;
  }
  if(Date.now()-pending.at<700){sleep(180);return;}
  if(!pending.backSent){
    safeBack();pending.backSent=true;pending.stage='returning';pending.backAt=Date.now();STATE.docAwaitAt=Date.now();
    log('已进入阅读并返回一次，等待原章节及任务完成证据');sleep(350);return;
  }
  if(Date.now()-pending.backAt>8000)readingMessage('阅读返回未确认，停止重复后退，等待手动核对');
  sleep(350);
}
function nativeField(v,name){
  return v.n.filter(function(n){
    try{return n.node&&String(n.node.id())===PKG+':id/'+name;}catch(e){return false;}
  })[0];
}
function discussionPage(v){
  return !!(nativeField(v,'tvTitle')&&
    (nativeField(v,'etReplyText')||nativeField(v,'tvReplyContent')));
}
function refreshDiscussionChapter(v){
  var heading=readChapterHeading(v);
  var match=heading&&heading.t.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(!match)return false;
  STATE.discussionRefresh={number:match[1],title:match[2].replace(/\s+/g,''),tries:0};
  CHAPTER.startReturn(STATE.discussionRefresh);
  safeBack();sleep(500);log('讨论已发表，重新进入本节刷新任务点状态');return true;
}
function reopenDiscussionChapter(v){
  var target=STATE.discussionRefresh;
  if(!target)return false;
  var result=CHAPTER.returnToChapter(target);
  if(result.type==='entered'){
    STATE.discussionRefresh=null;STATE.taskTopReady=false;STATE.taskTopSignature='';
    log('已重新打开讨论所在章节，核对任务点后进入下一节');sleep(600);return true;
  }
  if(result.type==='hold'&&Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();log('返回讨论章节 '+target.number+'：'+result.reason+'；点击开始学习可重试');}
  sleep(result.type==='hold'?700:180);return true;
}
function discussion(v){
  // 讨论由你自己发表；脚本只等待，返回章节后按任务点状态继续。
  if(Date.now()-STATE.lastLog>15000){STATE.lastLog=Date.now();log('当前是讨论页面，请自行发表；返回章节后脚本继续');}
  STATE.discussionTopic=null;
  sleep(1500);
}
while(true){
  try{
    // Missing connection must not enter selectors that may invoke the host's permission setup flow.
    if(!auto.service){
      CHAPTER.suspendEvents();
      if(!STATE.accessibilityPaused){STATE.accessibilityPaused=true;STATE.accessibilityPausedAt=Date.now();log('无障碍服务暂未连接，暂停操作；请自行确认权限，连接恢复后继续');}
      sleep(1000);continue;
    }
    if(STATE.accessibilityPaused){
      if(!STATE.pausedOutside){
        CHAPTER.resumePending(Date.now()-STATE.accessibilityPausedAt);
        resumeVideoNetworkAfterPause(Date.now()-STATE.accessibilityPausedAt);
      }
      STATE.accessibilityPaused=false;STATE.lastAnswerView=null;STATE.chapterWatch=null;
      log('无障碍服务已恢复，重新识别当前页面后继续');
    }
    var pkg=foregroundPackage();
    if(pkg!==PKG){
      CHAPTER.suspendEvents();
      if(!STATE.pausedOutside){
        STATE.pausedOutside=true;
        STATE.pausedAt=Date.now();
        STATE.outsideStartedAt=STATE.pausedAt;
        log(pkg?'学习通已切到后台，暂停点击；回到学习通后自动继续':'暂无法确认前台应用，暂停点击；等待无障碍记录恢复后重新识别');
      }
      if(Date.now()-STATE.pausedAt>15000){
        STATE.pausedAt=Date.now();
        log(pkg?'脚本仍在运行，等待学习通回到前台；当前应用 '+pkg:'脚本仍在运行，前台应用暂未确认，保持暂停并等待重新识别');
      }
      sleep(1200);
      continue;
    }
    if(STATE.pausedOutside){
      CHAPTER.resumePending(Date.now()-(STATE.outsideStartedAt||Date.now()));
      resumeVideoNetworkAfterPause(Date.now()-(STATE.outsideStartedAt||Date.now()));
      STATE.pausedOutside=false;
      STATE.lastAnswerView=null;
      W=Math.min(device.width,device.height);H=Math.max(device.width,device.height);
      STATE.chapterWatch=null;
      log('已回到学习通，重新识别当前页面后继续处理');
    }
    // 模态弹窗会隐藏播放器节点，先处理网络失败，避免落入 OCR 或目录导航。
    if(handleVideoNetworkRecovery())continue;
    if(handleVideoLoadFailure())continue;
    if(CHAPTER.guardArrival()||CHAPTER.browsingDirectory()){sleep(120);continue;}
    // Return navigation owns the directory until the original chapter title is verified.
    // Do not run full-screen OCR or automatic unfinished-chapter selection in this interval.
    if(STATE.videoChapterRefresh){reopenVideoChapter(null);continue;}
    if(STATE.discussionRefresh){reopenDiscussionChapter(null);continue;}
    if(STATE.readingRefresh){reopenReadingChapter();continue;}
    // 阅读离开/返回由同一次访问负责，不让读物内容触发题目或目录操作。
    if(STATE.doc){document(view());continue;}
    // 已进入或尝试过的阅读任务拥有当前流程，先核对原任务，避免触发目录扫描或通用卡住恢复。
    if(STATE.readingVisit){
      var readingPage=view();
      if(!checkReadingTask(readingPage))chapter(readingPage);
      continue;
    }
    if(STATE.finished&&STATE.videoExitAt){
      // 播放器关闭时无障碍树和窗口方向可能尚未更新，以实际截图确认返回。
      var exitImage=picture(),exitPortrait=false;
      if(exitImage){try{exitPortrait=exitImage.getHeight()>exitImage.getWidth();}finally{try{exitImage.recycle();}catch(ignore){}}}
      if(exitPortrait){
        var exitPage=view();
        if(exitPage.n.some(function(n){return /^章节$/.test(n.t);})){
          chapter(exitPage);continue;
        }
        // 已离开播放器，不再连续调用返回。
        STATE.video=false;STATE.finished=false;STATE.videoExitAt=0;
      }
    }
    // 返回章节后优先按章节处理，避免残留播放器节点导致连续后退。
    var chapterHeading=nativeVideoNode('tv_chapter_name');
    if(!chapterHeading&&(land()||nativeVideoNode('cvPlayer')||nativeVideoNode('rvSpeed'))){player(videoView());continue;}
    // Native directory rows avoid OCR and screenshot work during a fling.
    if(!STATE.afterSubmit&&!STATE.quizPending&&!STATE.videoChapterRefresh&&!STATE.discussionRefresh&&scanUnfinishedChapters(null)){sleep(120);continue;}
    var v=view();
    if(land()||nativeVideoNode('land_start')){player(v);continue;}
    if(reopenVideoChapter(v))continue;
    if(reopenDiscussionChapter(v))continue;
    if(STATE.discussionTopic&&!discussionPage(v)&&isChapterContent(v)){
      STATE.discussionTopic=null;STATE.taskTopReady=false;STATE.taskTopSignature='';
    }
    if(discussionPage(v)||STATE.discussionTopic){discussion(v);continue;}
    updateQuizContext(v);

    if(unansweredWarning(v)&&/确定|取消|确认|提交/.test(v.s)){
      if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();log('学习通提示漏答，停留检查，不继续确认提交');}
      sleep(1000);continue;
    }
    if(submissionFailed(v)){
      STATE.quizPending=true;
      if(Date.now()-STATE.lastLog>15000){
        STATE.lastLog=Date.now();
        log('学习通提示未及格或提交失败，等待核对答案，暂停翻页和重复提交');
      }
      sleep(1200);
      continue;
    }
    if(STATE.awaitingSubmitResult&&submissionSucceeded(v)){
      STATE.awaitingSubmitResult=false;STATE.quizPending=false;
      STATE.afterSubmit=true;STATE.taskTopReady=false;STATE.taskTopSignature='';
      log('已确认提交结果，继续本节剩余任务点');
    }
    if(STATE.afterSubmit||(!STATE.quizPending&&submissionSucceeded(v))){
      STATE.afterSubmit=true;continueAfterSubmit(v);continue;
    }
    if(/应用推荐|运行中脚本|ChaoxingVideoAssistant-v[\d.]+/.test(v.s)){
      log('检测到屏幕弹窗，等待题目恢复');
      sleep(1500);
      continue;
    }
    if(/非WiFi|非 WIFI|消耗流量/.test(v.s)&&
       /继续/.test(v.s)){
      var yes=find(v,/^继续$/);
      if(!press(yes))tap(W*.69,H*.57);
      sleep(1600);
      continue;
    }
    if(/开始考试|正式考试|考试倒计时/.test(v.s)){
      toast('正式考试已暂停');
      sleep(10000);
      continue;
    }
    if(land()){
      player(v);
      continue;
    }
    if(STATE.doc){
      document(v);
      continue;
    }
    if(/当前章节还有任务点未完成|是否去完成/.test(v.s)){
      var go=find(v,/^(去完成|前往完成|继续学习|留在本章|取消)$/);
      if(go)press(go);else safeBack();
      STATE.taskTopReady=false;STATE.taskTopSignature='';
      log('本节仍有未完成任务，返回本节继续处理');
      sleep(1500);
      continue;
    }
    // 作业页可能同时含“章节”，有可见题目时优先进入答题流程。
    if(questions(v).length){
      quiz(v);
      continue;
    }
    if(/答题卡/.test(v.s)){
      quiz(v);
      continue;
    }
    if(/请输入答案|请输入内容|点击输入/.test(v.s)&&
       /保存/.test(v.s)){
      quiz(v);
      continue;
    }
    // 测验底部可能在屏幕上半部，先核对全部题目再提交。
    if(quizSubmitButton(v)){
      quiz(v);
      continue;
    }
    if(STATE.quizPending&&STATE.quizSeek){quiz(v);continue;}
    if(/章节/.test(v.s)){
      if(recoverChapterStall(v))continue;
      chapter(v);
      continue;
    }
    if(/单选|多选|判断|简答|问答/.test(v.s)){
      quiz(v);
      continue;
    }
    if(STATE.video){
      STATE.video=false;
      STATE.finished=false;
    }
    sleep(1800);
  }catch(e){
    if(String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0){CHAPTER.suspendEvents();sleep(350);continue;}
    if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0){
      CHAPTER.suspendEvents();
      sleep(350);
      continue;
    }
    log('运行错误：'+e);
    sleep(2500);
  }
}









