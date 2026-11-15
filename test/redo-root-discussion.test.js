// v6.03 回归测试：Root 引擎探测、未及格重做、讨论发表核对。
// 运行：node test/redo-root-discussion.test.js
var fs=require('fs'),path=require('path'),assert=require('assert');
var src=fs.readFileSync(path.join(__dirname,'..','ChaoxingVideoAssistant-v6.03.js'),'utf8');
var cut=src.indexOf('enableBackgroundKeepAlive();\ninitFloatingControlPanel();');
assert(cut>0,'未找到主循环入口');
var body=src.slice(0,cut)+'\nglobalThis.__t={STATE:STATE,ask:ask,questions:questions,discussion:discussion,'+
  'handleQuizNotPassed:handleQuizNotPassed,quizAbandoned:quizAbandoned,getExecutionMode:getExecutionMode,'+
  'runShellCmd:runShellCmd,ROOT_PROBE:ROOT_PROBE,LOCAL_QB:LOCAL_QB,APP_VERSION:APP_VERSION,MAX_QUIZ_REDO:MAX_QUIZ_REDO};\n})();';

var now=1e12;Date.now=function(){return now;};
var W=1080,H=2400,PKG='com.chaoxing.mobile';
var store={deepseekKey:'sk-test'};
var sim={payloads:[],clicks:[],backs:0,shell:[],shellResult:{code:1,result:''},editorText:''};
var empty={find:function(){return [];},findOnce:function(){return null;},editable:function(){return this;}};
function editorNode(){
  return {text:function(){return sim.editorText;},className:function(){return 'android.widget.EditText';},
    click:function(){return true;},setText:function(){return true;},
    bounds:function(){return {centerX:function(){return W*0.5;},centerY:function(){return H*0.9;}};}};}
var stubs={
  storages:{create:function(){return {get:function(k,d){return k in store?store[k]:d;},put:function(k,v){store[k]=v;}};}},
  device:{width:W,height:H},events:{on:function(){}},toast:function(){},threads:{start:function(){}},
  images:{requestScreenCapture:function(){return false;}},auto:{service:{}},
  sleep:function(ms){now+=ms;},currentPackage:function(){return PKG;},
  back:function(){sim.backs++;return true;},
  textMatches:function(){return empty;},descMatches:function(){return empty;},selector:function(){return empty;},id:function(){return empty;},
  className:function(){return {find:function(){return [];},findOnce:function(){return sim.editorText?editorNode():null;}};},
  click:function(x,y){sim.clicks.push([Math.round(x),Math.round(y)]);return true;},
  shell:function(cmd,root){sim.shell.push([cmd,root]);return sim.shellResult;},
  http:{postJson:function(url,payload){
    sim.payloads.push(payload);
    return {statusCode:200,body:{string:function(){return JSON.stringify({choices:[{message:{content:'{"answer":["B"],"confidence":"high"}'}}]});},close:function(){}}};}}};
Object.keys(stubs).forEach(function(k){globalThis[k]=stubs[k];});
var realLog=console.log;console.log=function(){};
(0,eval)(body);
var t=globalThis.__t;
function page(texts){
  var n=texts.map(function(s,i){return {t:s,x:W*0.5,y:H*(0.2+i*0.08)};});
  return {n:n,s:texts.join('|')};}

// 1. 版本号只有一个来源，且与文件名一致。
assert.strictEqual(t.APP_VERSION,'6.03');
assert(!/v6\.14/.test(src),'不应再残留 v6.14 字样');

// 2. Root 引擎：无障碍和 Shizuku 都不可用时，su 可用则启用 root；不可用则 60 秒内不重复探测。
globalThis.auto={service:null};
assert.strictEqual(t.getExecutionMode(),'','未授权 Root 时不应启用任何免无障碍引擎');
assert.strictEqual(t.getExecutionMode(),'');
assert.strictEqual(sim.shell.length,1,'探测失败后 60 秒内不应重复调用 su');
now+=61000;
sim.shellResult={code:0,result:'uid=0(root) gid=0(root)'};
assert.strictEqual(t.getExecutionMode(),'root','su 返回 uid=0 时应启用 Root 引擎');
t.runShellCmd('input keyevent 4');
assert.deepStrictEqual(sim.shell[sim.shell.length-1],['input keyevent 4',true],'Root 引擎的命令应通过 su 执行');
globalThis.auto={service:{}};
assert.strictEqual(t.getExecutionMode(),'accessibility','无障碍可用时仍优先使用无障碍');

// 3. 未及格重做：清缓存、清作答记录、带提示重新请求，超过上限后放弃。
t.STATE.quizContext='3.1';
var item={kind:'single',q:'这是一道用于回归测试的单选题题干',options:[{l:'A',t:'甲'},{l:'B',t:'乙'},{l:'C',t:'丙'},{l:'D',t:'丁'}]};
t.ask(item);t.ask(item);
assert.strictEqual(sim.payloads.length,1,'同一题第二次应命中缓存');
assert.strictEqual(Object.keys(t.LOCAL_QB).length,1);
var failed=page(['章节测验','未达到及格线，请由此重做','1. [单选题] 这是一道用于回归测试的单选题题干','提交']);
t.STATE.answered['1:single']=true;
t.STATE.awaitingSubmitResult=true;t.STATE.awaitingSubmitAt=now;
assert.strictEqual(t.handleQuizNotPassed(failed),true);
assert.strictEqual(t.STATE.awaitingSubmitResult,true,'刚点提交时页面可能还没刷新，应先等待而不是立刻判定未及格');
assert.strictEqual(t.STATE.answered['1:single'],true);
now+=4000;
assert.strictEqual(t.handleQuizNotPassed(failed),true);
assert.strictEqual(t.STATE.awaitingSubmitResult,false);
assert.deepStrictEqual(t.STATE.answered,{},'重做前应清空作答记录');
assert.strictEqual(t.STATE.quizRedoCount['3.1'],1);
assert.strictEqual(Object.keys(t.LOCAL_QB).length,0,'未及格测验的答案不应留在持久化题库里');
assert.strictEqual(Object.keys(store.localQuestionBank).length,0);
t.ask(item);
assert.strictEqual(sim.payloads.length,2,'重做时应重新请求而不是复用上次答案');
assert(/上次提交的答案是：B/.test(sim.payloads[1].messages[1].content),'重做请求应带上一次的答案作为提示');
assert.strictEqual(t.handleQuizNotPassed(page(['已提交','本次得分 100'])),false,'没有未及格字样时不处理');
for(var r=1;r<t.MAX_QUIZ_REDO;r++){
  t.STATE.awaitingSubmitResult=true;t.STATE.awaitingSubmitAt=now-5000;
  t.handleQuizNotPassed(failed);}
assert.strictEqual(t.quizAbandoned(),false);
t.STATE.awaitingSubmitResult=true;t.STATE.awaitingSubmitAt=now-5000;
t.handleQuizNotPassed(failed);
assert.strictEqual(t.quizAbandoned(),true,'超过重做上限后应放弃该测验');
assert.strictEqual(t.STATE.quizPending,false);
assert.deepStrictEqual(t.questions(failed),[],'已放弃的测验不应再被当作待答题目');
t.STATE.quizContext='3.2';
assert.strictEqual(t.quizAbandoned(),false,'放弃状态只针对当前章节');

// 4. 讨论发表核对：点了发送只记为待核对，核对到内容才算已发表。
var reply='这是一段用于回归测试的讨论回复内容，长度足够用于核对';
function pending(extra){
  var rec={status:'pending',text:reply,at:now,tries:1};
  Object.keys(extra||{}).forEach(function(k){rec[k]=extra[k];});
  store.discussionReplies={topicA:rec};
  t.STATE.discussionTopic={q:'讨论题目',key:'topicA'};
  sim.clicks=[];sim.backs=0;sim.editorText='';}
pending();
t.discussion(page(['讨论题目','别人的回复内容']));
assert.strictEqual(store.discussionReplies.topicA.status,'pending','未核对到回复且未超时，应继续等待');
assert.strictEqual(sim.backs,0);
t.discussion(page(['讨论题目',reply]));
assert.strictEqual(store.discussionReplies.topicA.status,'posted','页面上出现回复内容才记为已发表');
assert.strictEqual(sim.backs,1);

pending({at:now-13000});
sim.editorText=reply;
t.discussion(page(['讨论题目',reply]));
assert.strictEqual(store.discussionReplies.topicA.status,'pending','回复还停在输入框里不能算已发表');
assert.strictEqual(store.discussionReplies.topicA.tries,2,'发送未生效时应补点一次发送');
assert.strictEqual(sim.clicks.length,1);
now+=13000;
t.discussion(page(['讨论题目',reply]));
assert.strictEqual(store.discussionReplies.topicA.status,'unverified','补发一次后仍未生效，不再重复发送');

pending({at:now-13000});
t.discussion(page(['讨论题目','别人的回复内容']));
assert.strictEqual(store.discussionReplies.topicA.status,'unverified','超时仍核对不到内容时如实记为未核对');
assert.strictEqual(sim.clicks.length,0,'核对不到时不应重复发送');
realLog('redo-root-discussion: ok');
