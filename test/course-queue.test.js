// 回归测试：多门课程排队。页面坐标取自真机截图（900x2000），按比例换算。
// 运行：node test/course-queue.test.js
var fs=require('fs'),path=require('path'),assert=require('assert');
var file=fs.readdirSync(path.join(__dirname,'..')).filter(function(f){return /^ChaoxingVideoAssistant-v6\.\d+\.js$/.test(f);}).sort().pop();
var src=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n');
var cut=src.indexOf('enableBackgroundKeepAlive();\ninitFloatingControlPanel();');
assert(cut>0,'未找到主循环入口');
var body=src.slice(0,cut)+'\nglobalThis.__t={STATE:STATE,CFG:CFG,courseCards:courseCards,handleCourseQueue:handleCourseQueue,'+
  'isDirectoryPage:isDirectoryPage,isCourseTaskTab:isCourseTaskTab,isCourseListPage:isCourseListPage,'+
  'scanUnfinishedChapters:scanUnfinishedChapters,courseQueue:courseQueue};\n})();';

var now=1e12;Date.now=function(){return now;};
var W=1080,H=2400,K=1.2,PKG='com.chaoxing.mobile';
var store={deepseekKey:'sk-test',cfgMultiCourse:true};
var sim={clicks:[],backs:0,swipes:[],vibrates:0};
var empty={find:function(){return [];},findOnce:function(){return null;},editable:function(){return this;}};
var stubs={
  storages:{create:function(){return {get:function(k,d){return k in store?store[k]:d;},put:function(k,v){store[k]=v;}};}},
  device:{width:W,height:H,vibrate:function(){sim.vibrates++;}},events:{on:function(){}},toast:function(){},threads:{start:function(){}},
  images:{requestScreenCapture:function(){return false;}},auto:{service:{}},
  sleep:function(ms){now+=ms;},currentPackage:function(){return PKG;},
  back:function(){sim.backs++;return true;},
  swipe:function(x1,y1,x2,y2){sim.swipes.push(y2<y1?'down':'up');return true;},
  textMatches:function(){return empty;},descMatches:function(){return empty;},selector:function(){return empty;},id:function(){return empty;},className:function(){return empty;},
  click:function(x,y){sim.clicks.push([Math.round(x),Math.round(y)]);return true;}};
Object.keys(stubs).forEach(function(k){globalThis[k]=stubs[k];});
var realLog=console.log;console.log=function(){};
(0,eval)(body);
var t=globalThis.__t;
function page(items){
  var n=items.map(function(it){return {t:it[0],x:it[1]*K,y:it[2]*K};});
  return {n:n,s:n.map(function(x){return x.t;}).join('|')};}
function lastClick(){return sim.clicks[sim.clicks.length-1];}

var listTop=page([['课程',450,150],['全部学期',150,267],
  ['高级统计',293,415],['吴春眉',257,470],
  ['大学生心理健康教育（中南大',478,638],['学版）',260,686],['叶湘虹 唐海波',311,743],['中南大学',133,810],['开课时间：2026-09-28 17:00至2026-12-20 23:59',424,902],
  ['形势与政策（2025级',400,1068],['2026-2027学年）',370,1117],['袁新秀',257,1173],
  ['医学机能技能学（第12期）',445,1340],['胡志苹',257,1395],
  ['流行病学',293,1563],['智慧课程',488,1565],['董明华、吴清锋、刘明斌、李思思、…',485,1618],['2026-2027学年度第一学期',255,1686],
  ['马克思主义基本原',380,1850],['理-2026-2027学年第一学期',477,1900],['邹杞珍',257,1957]]);
var listScrolled=page([['课程',450,150],
  ['流行病学',293,260],['智慧课程',488,262],['董明华、吴清锋、刘明斌、李思思、…',485,316],['2026-2027学年度第一学期',255,383],
  ['马克思主义',125,572],['基本原理',125,592],['马克思主义基本原',380,548],['理-2026-2027学年第一学期',477,598],['邹杞珍',257,655],
  ['《英语》3（2025级 本科）',435,820],['朱秀芳',257,877],
  ['生理学（第14期）',360,1043],['温二生',257,1099]]);
var taskTab=page([['高级统计',450,150],['客服',832,152],['任务',155,267],['章节',450,267],['更多',745,267],['讨论',203,403],['作业/考试',260,573]]);
var directory=page([['高级统计',450,150],['客服',832,152],['任务',155,267],['章节',450,267],['更多',745,267],
  ['说明：章节中阅读文档、专题、图书、笔记将计算阅读',433,370],['时长，阅读中若出现长时间暂停或离开页面行为，将不',433,416],['计入有效阅读时长',433,463],
  ['2',62,631],['常见研究设计类型与高级统计方法',397,631],['2.1',157,759],['大纲要求',283,759],['2.2',160,889],['预习资料',287,889],
  ['2.2.1',173,1020],['教案',276,1020],['2.3',160,1151],['课前思考题',306,1151],['2.4',160,1281],['课件',251,1281],['2.7',160,1673],['课后习题',287,1673]]);

// 1. 页面识别。
assert.strictEqual(t.isCourseListPage(listTop),true);
assert.strictEqual(t.isCourseListPage(directory),false);
assert.strictEqual(t.isCourseTaskTab(taskTab),true);
assert.strictEqual(t.isDirectoryPage(taskTab),false,'“任务”标签不应被当成章节目录');
assert.strictEqual(t.isDirectoryPage(directory),true);
assert.strictEqual(t.isCourseTaskTab(directory),false);

// 2. 卡片分组：教师、学校、开课时间、封面文字都归入各自的课程卡片。
assert.deepStrictEqual(t.courseCards(listTop).map(function(c){return c.name;}),
  ['高级统计','大学生心理健康教育(中南大','形势与政策(2025级','医学机能技能学(第12期)','流行病学','马克思主义基本原']);
assert.deepStrictEqual(t.courseCards(listScrolled).map(function(c){return c.name;}),
  ['流行病学','马克思主义基本原','《英语》3(2025级本科)','生理学(第14期)']);

// 3. 从课程列表开始：进入第一门，落在“任务”标签时切到“章节”，认出课程名。
assert.strictEqual(t.CFG.multiCourse,true);
assert.strictEqual(t.handleCourseQueue(listTop),true);
assert.deepStrictEqual(lastClick(),[540,Math.round(415*K)],'应点击第一门课的卡片');
assert.strictEqual(t.handleCourseQueue(taskTab),true);
assert.deepStrictEqual(lastClick(),[Math.round(450*K),Math.round(267*K)],'应点击“章节”标签');
assert.strictEqual(t.handleCourseQueue(directory),false,'进入目录后交回正常巡检流程');
assert.strictEqual(t.courseQueue().current,'高级统计');

// 4. 一门巡检完：记为已完成并返回列表，下一次选第二门而不是重进第一门。
for(var i=0;i<40&&!sim.backs;i++){t.scanUnfinishedChapters(directory);now+=1000;}
assert.strictEqual(sim.backs,1,'目录巡检两轮没有待办后应返回课程列表');
assert.strictEqual(t.courseQueue().done['高级统计'],true);
assert.strictEqual(t.handleCourseQueue(listTop),true);
assert.deepStrictEqual(lastClick(),[540,Math.round(638*K)],'应进入第二门课');

// 5. 点到的卡片其实是已完成的课程（比如只露出教师那一行）：直接返回并记住，不重复巡检。
t.courseQueue().pending={name:'吴春眉',at:now};
sim.backs=0;
assert.strictEqual(t.handleCourseQueue(directory),true);
assert.strictEqual(sim.backs,1);
assert.strictEqual(t.courseQueue().skipText['吴春眉'],true);

// 6. 进入后迟迟没有章节目录的课程：25 秒后跳过。
t.courseQueue().pending={name:'大学生就业指导',at:now};
var blank=page([['大学生就业指导',450,150],['暂无内容',450,900]]);
sim.backs=0;
assert.strictEqual(t.handleCourseQueue(blank),true);
assert.strictEqual(sim.backs,0,'25 秒内先等待页面加载');
now+=26000;
assert.strictEqual(t.handleCourseQueue(blank),true);
assert.strictEqual(sim.backs,1);
assert.strictEqual(t.courseQueue().skipText['大学生就业指导'],true);

// 7. 全部做完：向下滚到底、回顶复查一遍、再到底后结束并提醒。
var q=t.courseQueue();
['大学生心理健康教育(中南大','形势与政策(2025级','医学机能技能学(第12期)','流行病学','马克思主义基本原'].forEach(function(n){q.done[n]=true;});
sim.swipes=[];sim.clicks=[];sim.vibrates=0;
for(var j=0;j<40&&t.STATE.courseQueue;j++){t.handleCourseQueue(listTop);now+=1000;}
assert.strictEqual(t.STATE.courseQueue,null,'所有课程都完成后应结束排队');
assert.strictEqual(sim.clicks.length,0,'已完成的课程不应再被点击');
assert(sim.swipes.indexOf('down')>=0&&sim.swipes.indexOf('up')>sim.swipes.indexOf('down'),'应先向下找，再回到顶部复查');
assert.strictEqual(sim.vibrates,1,'全部完成时应提醒一次');
realLog('course-queue: ok');
