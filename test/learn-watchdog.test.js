// 回归测试：接口可配置、结果页学习正确答案、卡住看门狗、漏答弹窗恢复、提醒节流。
// 运行：node test/learn-watchdog.test.js
var fs=require('fs'),path=require('path'),assert=require('assert');
var file=fs.readdirSync(path.join(__dirname,'..')).filter(function(f){return /^ChaoxingVideoAssistant-v6\.\d+\.js$/.test(f);}).sort().pop();
var src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
var cut=src.indexOf('enableBackgroundKeepAlive();\ninitFloatingControlPanel();');
assert(cut>0,'未找到主循环入口');
var body=src.slice(0,cut)+'\nglobalThis.__t={STATE:STATE,CFG:CFG,LLM:LLM,ask:ask,cxLog:cxLog,LOCAL_QB:LOCAL_QB,WATCHDOG:WATCHDOG,'+
  'rememberAsked:rememberAsked,learnFromResultPage:learnFromResultPage,handleQuizNotPassed:handleQuizNotPassed,'+
  'watchdogTick:watchdogTick,recoverUnansweredDialog:recoverUnansweredDialog,cleanLlmUrl:cleanLlmUrl};\n})();';

var now=1e12;Date.now=function(){return now;};
var W=1080,H=2400,PKG='com.chaoxing.mobile';
var store={deepseekKey:'sk-test',llmUrl:'https://relay.example.com/v1/chat/completions',llmModel:'my-model'};
var sim={calls:[],clicks:[],backs:0,vibrates:0,reply:'B'};
var empty={find:function(){return [];},findOnce:function(){return null;},editable:function(){return this;}};
var stubs={
  storages:{create:function(){return {get:function(k,d){return k in store?store[k]:d;},put:function(k,v){store[k]=v;}};}},
  device:{width:W,height:H,vibrate:function(){sim.vibrates++;}},events:{on:function(){}},toast:function(){},threads:{start:function(){}},
  images:{requestScreenCapture:function(){return false;}},auto:{service:{}},
  sleep:function(ms){now+=ms;},currentPackage:function(){return PKG;},
  back:function(){sim.backs++;return true;},
  textMatches:function(){return empty;},descMatches:function(){return empty;},selector:function(){return empty;},id:function(){return empty;},className:function(){return empty;},
  click:function(x,y){sim.clicks.push([Math.round(x),Math.round(y)]);return true;},
  http:{postJson:function(url,payload){
    sim.calls.push({url:url,model:payload.model});
    return {statusCode:200,body:{string:function(){return JSON.stringify({choices:[{message:{content:'{"answer":["'+sim.reply+'"],"confidence":"high"}'}}]});},close:function(){}}};}}};
Object.keys(stubs).forEach(function(k){globalThis[k]=stubs[k];});
var realLog=console.log;console.log=function(){};
(0,eval)(body);
var t=globalThis.__t;
function page(texts){
  var n=texts.map(function(s,i){return {t:s,x:W*0.5,y:H*(0.15+i*0.05)};});
  return {n:n,s:texts.join('|')};}

// 1. 接口地址和模型名来自设置；非法地址回退到默认值。
t.STATE.quizContext='3.1';
var q1={kind:'single',q:'1. [单选题] 细胞内合成蛋白质的主要场所是哪一种细胞器',options:[{l:'A',t:'线粒体'},{l:'B',t:'高尔基体'},{l:'C',t:'核糖体'},{l:'D',t:'溶酶体'}]};
assert.deepStrictEqual(t.ask(q1).answer,['B']);
assert.deepStrictEqual(sim.calls[0],{url:'https://relay.example.com/v1/chat/completions',model:'my-model'});
assert.strictEqual(t.cleanLlmUrl('不是网址'),'https://api.deepseek.com/chat/completions');
assert.strictEqual(t.cleanLlmUrl(' https://a.b/c '),'https://a.b/c');

// 2. 结果页学习：题干对得上才学，学到的答案覆盖模型答案且不会被未及格清除。
t.rememberAsked('1:single',q1);
var q2={kind:'judge',q:'2. [判断题] 核糖体由蛋白质和核糖核酸两类物质共同组成',options:[{l:'A',t:'对'},{l:'B',t:'错'}]};
sim.reply='B';t.ask(q2);t.rememberAsked('2:judge',q2);
assert.strictEqual(t.learnFromResultPage(page(['1. [单选题] 这是另外一道完全无关的题目内容文字','我的答案：B','正确答案：A'])),0,'题干对不上时不应学习');
assert.strictEqual(t.learnFromResultPage(page(['1. [单选题] 细胞内合成蛋白质的主要场所是哪一种细胞器','正确答案：C','正确答案：A'])),0,'一道题下出现两个正确答案时无法归属，应跳过');
var learned=t.learnFromResultPage(page([
  '本次得分 50',
  '1. [单选题] 细胞内合成蛋白质的主要场所是哪一种细胞器','A. 线粒体','C. 核糖体','我的答案：B 正确答案：C',
  '2. [判断题]','核糖体由蛋白质和核糖核酸两类物质共同组成','我的答案：错','正确答案：对']));
assert.strictEqual(learned,2);
assert.deepStrictEqual(t.ask(q1).answer,['C'],'之后同一题应直接用学到的正确答案');
assert.deepStrictEqual(t.ask(q2).answer,['A'],'判断题的“对”应换算成对应选项字母');
assert.strictEqual(sim.calls.length,2,'学到答案后不应再请求模型');
assert.strictEqual(store.localQuestionBank[q1.__cacheKey].verified,true);
t.STATE.awaitingSubmitResult=true;t.STATE.awaitingSubmitAt=now-5000;
t.handleQuizNotPassed(page(['未达到及格线，请由此重做']));
assert.deepStrictEqual(t.LOCAL_QB[q1.__cacheKey].answer,['C'],'未及格重做时不应清掉已核实的答案');

// 3. 看门狗：4 分钟没有进展才动作，最多恢复 2 次，考试页面和视频播放中不动作。
var chapterPage=page(['3.1 细胞器','任务点']);
function idle(seconds,v){var acted=0;for(var s=0;s<seconds;s+=10){now+=10000;if(t.watchdogTick(v))acted++;}return acted;}
sim.backs=0;
t.watchdogTick(chapterPage);
assert.strictEqual(idle(230,chapterPage),0,'未满 4 分钟不应动作');
assert.strictEqual(idle(20,chapterPage),1,'满 4 分钟应退回重新定位');
assert.strictEqual(sim.backs,1);
assert.strictEqual(idle(250,chapterPage),1);
assert.strictEqual(idle(500,chapterPage),0,'连续恢复 2 次无效后只提醒不再操作');
assert.strictEqual(sim.backs,2);
t.STATE.answered['9:single']=true;
assert.strictEqual(idle(230,chapterPage),0,'有新进展后重新计时');
sim.backs=0;
assert.strictEqual(idle(300,page(['正式考试','考试倒计时 30:00'])),0,'正式考试页面不自动操作');
t.STATE.answered['10:single']=true;t.STATE.video=true;
assert.strictEqual(idle(600,chapterPage),0,'视频播放期间由播放器自己判断卡顿');
t.STATE.video=false;t.CFG.watchdog=false;
assert.strictEqual(idle(600,chapterPage),0,'关闭开关后不动作');
assert.strictEqual(sim.backs,0);

// 4. 漏答弹窗：点取消并清空作答记录以便从头核对，每章最多 2 次。
var warn=page(['还有2道题未作答，确认提交吗？','取消','确定']);
sim.clicks=[];
t.STATE.answered={'1:single':true};
assert.strictEqual(t.recoverUnansweredDialog(warn),true);
assert.deepStrictEqual(sim.clicks[0],[Math.round(W*0.5),Math.round(H*0.2)],'应点击“取消”而不是“确定”');
assert.deepStrictEqual(t.STATE.answered,{});
assert.strictEqual(t.recoverUnansweredDialog(warn),true);
assert.strictEqual(t.recoverUnansweredDialog(warn),false,'超过次数后交回人工处理');
assert.strictEqual(t.recoverUnansweredDialog(page(['还有2道题未作答'])),false,'找不到取消按钮时不动作');

// 5. 提醒节流：同类提醒 5 分钟内只震动一次，普通日志不提醒。
now+=600000;sim.vibrates=0;
t.cxLog('题号 3:single 答案不确定，请手动检查');
t.cxLog('题号 4:single 答案不确定，请手动检查');
t.cxLog('已进入下一节');
assert.strictEqual(sim.vibrates,1);
now+=301000;
t.cxLog('题号 5:single 答案不确定，请手动检查');
assert.strictEqual(sim.vibrates,2);
realLog('learn-watchdog: ok');
