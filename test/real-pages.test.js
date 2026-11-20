// 回归测试：MuMu 模拟器（1080x1920，学习通 7.0.6，AutoJs6 6.8.0）上 uiautomator 取到的真实页面。
// 覆盖真机验证时发现的问题：课程卡片按行距分组会合并成一张、没有搜索框时标签行低于 0.09H、
// 目录行的无障碍描述带“任务点已完成”导致目录被当成章节内容页、没装 OCR 插件时每轮都报错。
// 运行：node test/real-pages.test.js
var fs=require('fs'),path=require('path'),assert=require('assert');
var file=fs.readdirSync(path.join(__dirname,'..')).filter(function(f){return /^ChaoxingVideoAssistant-v6\.\d+\.js$/.test(f);}).sort().pop();
var src=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n');
var cut=src.indexOf('enableBackgroundKeepAlive();\ninitFloatingControlPanel();');
assert(cut>0,'未找到主循环入口');
var body=src.slice(0,cut)+'\nglobalThis.__t={STATE:STATE,CFG:CFG,courseCards:courseCards,handleCourseQueue:handleCourseQueue,'+
  'isDirectoryPage:isDirectoryPage,isCourseTaskTab:isCourseTaskTab,isCourseListPage:isCourseListPage,isChapterContent:isChapterContent,'+
  'findDirectoryChapterRows:findDirectoryChapterRows,readCourseTitle:readCourseTitle,scanUnfinishedChapters:scanUnfinishedChapters,'+
  'ocrDetect:ocrDetect,keyWarning:keyWarning,muteMediaForVideo:muteMediaForVideo,restoreMediaVolume:restoreMediaVolume,DEFAULT_LLM_URL:DEFAULT_LLM_URL,RECENT_LOGS:RECENT_LOGS};\n})();';

var now=1e12;Date.now=function(){return now;};
var W=1080,H=1920,PKG='com.chaoxing.mobile';
var store={deepseekKey:'sk-test'};
var sim={clicks:[],backs:0,ocrCalls:0};
var empty={find:function(){return [];},findOnce:function(){return null;},editable:function(){return this;}};
var stubs={
  storages:{create:function(){return {get:function(k,d){return k in store?store[k]:d;},put:function(k,v){store[k]=v;}};}},
  device:{width:W,height:H,vibrate:function(){}},events:{on:function(){}},toast:function(){},threads:{start:function(){}},
  images:{requestScreenCapture:function(){return false;}},auto:{service:{}},
  sleep:function(ms){now+=ms;},currentPackage:function(){return PKG;},
  back:function(){sim.backs++;return true;},swipe:function(){return true;},
  textMatches:function(){return empty;},descMatches:function(){return empty;},selector:function(){return empty;},id:function(){return empty;},className:function(){return empty;},
  click:function(x,y){sim.clicks.push([Math.round(x),Math.round(y)]);return true;},
  ocr:{detect:function(){sim.ocrCalls++;throw new Error('java.lang.IllegalStateException: 没有可用的 OCR 插件符合请求: ML Kit OCR (engine=mlkit-ocr). 请在插件中心安装, 启用或授权匹配的插件.');}}};
Object.keys(stubs).forEach(function(k){globalThis[k]=stubs[k];});
var realLog=console.log;console.log=function(){};
(0,eval)(body);
var t=globalThis.__t;
// 每项：[文字, x, y, 资源 id(可省)]
function page(items){
  var n=items.map(function(it){
    var rid=it[3];
    return {t:it[0],x:it[1],y:it[2],node:rid?{id:function(){return PKG+':id/'+rid;}}:null};});
  return {n:n,s:n.map(function(x){return x.t;}).join('|')};}
function lastClick(){return sim.clicks[sim.clicks.length-1];}

var courseList=page([['返回按钮',36,84,'toolbar_left_action'],['课程',540,84,'toolbar_tv_title'],['添加按钮',1037,84],['搜索',563,172,'tv_hint'],['全部学期',106,245],
  ['高级统计',206,348,'tv_name'],['吴春眉',181,388,'tv_subtitle'],
  ['大学生心理健康教育（中南大学版）',386,506,'tv_name'],['叶湘虹 唐海波',218,546,'tv_subtitle'],['中南大学',540,604,'tv_schools'],['开课时间：2026-09-28 17:00 至 2026-12-20 23:59',540,661,'tv_clazz_time'],
  ['形势与政策（2025级2026-2027学年）',402,777,'tv_name'],['袁新秀',181,817,'tv_subtitle'],
  ['医学机能技能学（第12期）',328,935,'tv_name'],['胡志苹',181,975,'tv_subtitle'],
  ['流行病学',206,1093,'tv_name'],['董明华、吴清锋、刘明斌、李思思、明心海、郭逸星',411,1133,'tv_subtitle'],['2026-2027学年度第一学期',540,1191,'tv_schools'],
  ['马克思主义基本原理-2026-2027学年第一学期',448,1298,'tv_name'],['邹杞珍',181,1338,'tv_subtitle'],
  ['《英语》3（2025级 本科）',327,1456,'tv_name'],['朱秀芳',181,1496,'tv_subtitle'],
  ['生理学（第14期）',268,1614,'tv_name'],['温二生',181,1654,'tv_subtitle'],
  ['医学分析与检测技能学',296,1772,'tv_name'],['许春鹃',181,1812,'tv_subtitle']]);
// 没有搜索框的课程，标签行在 y=166（0.086H）；目录行带“任务点已完成”描述。
var dirNoSearch=page([['返回按钮',36,84],['高级统计',540,84,'toolbar_tv_title'],['客服',1032,84],
  ['任务',180,166],['章节',540,166],['更多',900,166],
  ['说明：章节中阅读文档、专题、图书、笔记将计算阅读时长，阅读中若出现长时间暂停或离开页面行为，将不计入有效阅读时长',540,261,'tv_tips'],
  ['任务点进度：',121,381],['14',203,381],['/ 14',240,381],['已完成任务点数14总任务点数14',540,378],['100%',993,381,'tv_job_percent'],
  ['1',43,488],['数据建立及统计分析概述',538,488],
  ['1.1',112,577],['教学大纲',244,577],['1.1教学大纲任务点已完成',540,579],
  ['1.2',112,668],['教案',218,668],['1.2教案任务点已完成',540,670],
  ['1.3',112,759],['课件',218,759],['1.3课件任务点已完成',540,761],
  ['2',43,851],['常见研究设计类型与高级统计方法',538,851],
  ['2.1',112,940],['大纲要求',244,940],['2.1大纲要求任务点已完成',540,942]]);
// 有搜索框的课程，标签行在 y=256；2.2、2.3 还有未完成任务点。
var dirPending=page([['返回按钮',36,84],['生理学（第14期）',540,84,'toolbar_tv_title'],['客服',1032,84],['搜索',563,172,'tv_hint'],
  ['任务',180,256],['章节',540,256],['更多',900,256],
  ['说明：章节中阅读文档、专题、图书、笔记将计算阅读时长，阅读中若出现长时间暂停或离开页面行为，将不计入有效阅读时长',540,351,'tv_tips'],
  ['任务点进度：',121,471],['17',203,471],['/ 196',246,471],['已完成任务点数17总任务点数196',540,468],['8%',993,471,'tv_job_percent'],
  ['2',43,1032],['绪论',538,1032],
  ['2.1',112,1121],['课程思政与导学',283,1121],['2.1课程思政与导学任务点已完成',540,1123],
  ['1',54,1211],['2.2',113,1212],['生命的基本特征',284,1212],['2.2生命的基本特征，章节任务点1个',540,1215],
  ['1',54,1304],['2.3',113,1305],['机体的内环境与稳态、稳态的调控',388,1305],['2.3机体的内环境与稳态、稳态的调控，章节任务点1个',540,1308],
  ['2.4',112,1398],['章节测试',244,1398],['2.4章节测试任务点已完成',540,1400]]);
var taskTabNoSearch=page([['返回按钮',36,84],['形势与政策（2025级2026-2027学年）',540,84,'toolbar_tv_title'],['客服',1032,84],
  ['任务',180,166],['章节',540,166],['更多',900,166],['讨论',142,261],['作业/考试',182,381],
  ['青年大学生在全面推进美丽中国建设中如何引领 绿色低碳新风尚？',584,501],['二维码签到',584,602],['结束时间：09-29 08:55',233,642],
  ['已经到底了',540,939],['下拉刷新可查看是否有新任务',540,984]]);
var chapterContent=page([['返回按钮',36,84],['章节',540,84,'toolbar_tv_title'],['讨论',1032,84],
  ['2.2 生命的基本特征',540,175,'tv_chapter_name'],['章节测验',121,253],['作业',471,343],['已完成',949,386],['本次得分: 100',149,420],
  ['1.[单选题] 最早阐述生理学理论的著作是',527,564],['A. 《心与血的运动》',527,681],['我的答案：D',510,1424]]);

// 1. 课程列表：九门课各自成卡，不会合并成一张。
assert.strictEqual(t.isCourseListPage(courseList),true);
assert.deepStrictEqual(t.courseCards(courseList).map(function(c){return c.name;}),
  ['高级统计','大学生心理健康教育(中南大学版)','形势与政策(2025级2026-2027学年)','医学机能技能学(第12期)','流行病学',
   '马克思主义基本原理-2026-2027学年第一学期','《英语》3(2025级本科)','生理学(第14期)','医学分析与检测技能学']);

// 2. 章节目录：两种标签行高度都认得出，不会被当成章节内容页。
[dirNoSearch,dirPending].forEach(function(p,i){
  assert.strictEqual(t.isDirectoryPage(p),true,'第 '+(i+1)+' 个目录页应识别为目录');
  assert.strictEqual(t.isChapterContent(p),false,'第 '+(i+1)+' 个目录页不应识别为章节内容');
  assert.strictEqual(t.isCourseTaskTab(p),false);
  assert.strictEqual(t.isCourseListPage(p),false);});
assert.strictEqual(t.readCourseTitle(dirPending),'生理学（第14期）');

// 3. 目录行带完成状态：从无障碍描述读出哪几节未完成。
var rows=t.findDirectoryChapterRows(dirPending);
assert.deepStrictEqual(rows.filter(function(r){return r.pending;}).map(function(r){return r.num;}),['2.2','2.3']);
assert.deepStrictEqual(rows.filter(function(r){return r.done;}).map(function(r){return r.num;}),['2.1','2.4']);
assert.strictEqual(rows.filter(function(r){return r.num==='2.2';})[0].t,'2.2 生命的基本特征');

// 4. 没有截图权限也能按文字进入第一个未完成章节。
assert.strictEqual(t.scanUnfinishedChapters(dirPending),true);
assert.deepStrictEqual(lastClick(),[Math.round(W*0.48),1212],'应点进 2.2');
assert.strictEqual(t.scanUnfinishedChapters(dirPending),true);
assert.deepStrictEqual(lastClick(),[Math.round(W*0.48),1212],'上次所在的章节允许再进一次（与截图取色时的规则一致）');
assert.strictEqual(t.scanUnfinishedChapters(dirPending),true);
assert.deepStrictEqual(lastClick(),[Math.round(W*0.48),1305],'2.2 进过两次仍未完成，应改进 2.3');

// 5. 没有搜索框时的“任务”标签：能认出来并切到“章节”。
assert.strictEqual(t.isCourseTaskTab(taskTabNoSearch),true);
assert.strictEqual(t.isDirectoryPage(taskTabNoSearch),false);
assert.strictEqual(t.handleCourseQueue(taskTabNoSearch),true);
assert.deepStrictEqual(lastClick(),[540,166],'应点击“章节”标签');

// 6. 章节内容页仍按内容页处理。
assert.strictEqual(t.isDirectoryPage(chapterContent),false);
assert.strictEqual(t.isChapterContent(chapterContent),true);

// 7. 没装 OCR 插件：只报一次，之后 10 分钟内不再调用。
var before=t.RECENT_LOGS.length;
assert.deepStrictEqual(t.ocrDetect({}),[]);
assert.deepStrictEqual(t.ocrDetect({}),[]);
assert.strictEqual(sim.ocrCalls,1,'报错后应暂停调用 OCR');
assert.strictEqual(t.RECENT_LOGS.slice(before).filter(function(l){return /文字识别插件/.test(l);}).length,1,'只提示一次');
now+=601000;
t.ocrDetect({});
assert.strictEqual(sim.ocrCalls,2,'10 分钟后重试一次');
// 8. Key 栏误填成网址时提醒（模拟器上实际填进去过 https://filehelper.weixin.qq.com/）。
assert(t.keyWarning('https://filehelper.weixin.qq.com/',t.DEFAULT_LLM_URL),'网址应提醒');
assert(t.keyWarning('abc123',t.DEFAULT_LLM_URL),'官方接口下不是 sk- 开头应提醒');
assert.strictEqual(t.keyWarning('sk-0123456789abcdef0123',t.DEFAULT_LLM_URL),'');
assert.strictEqual(t.keyWarning('abc123def456ghi789','https://relay.example.com/v1/chat/completions'),'','中转接口的 Key 格式不限');
assert.strictEqual(t.keyWarning('',t.DEFAULT_LLM_URL),'');
// 9. 静音/恢复音量不能走 device.setMusicVolume：没有“修改系统设置”权限时它会打开系统设置页，
//    视频播完后学习通被挤到后台，脚本一直等在“后台保活”（模拟器上实际发生过）。
var volCalls=[];
globalThis.device.getMusicVolume=function(){return 7;};
globalThis.device.setMusicVolume=function(v){volCalls.push('device:'+v);};
globalThis.android={content:{Context:{AUDIO_SERVICE:'audio'}},provider:{Settings:{System:{canWrite:function(){return false;}}}}};
globalThis.context={getSystemService:function(){return null;}};
t.muteMediaForVideo();t.restoreMediaVolume();
assert.deepStrictEqual(volCalls,[],'没有 AudioManager 且没有写设置权限时不应调用 device.setMusicVolume');
var amVol=6;
globalThis.context={getSystemService:function(){return {getStreamVolume:function(){return amVol;},setStreamVolume:function(st,v){volCalls.push('am:'+st+':'+v);amVol=v;}};}};
t.muteMediaForVideo();t.restoreMediaVolume();
assert.deepStrictEqual(volCalls,['am:3:0','am:3:6'],'应通过 AudioManager 静音并恢复原音量');
realLog('real-pages: ok');
