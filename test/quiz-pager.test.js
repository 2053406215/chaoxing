// v6.03 逐题翻页测验回归测试：node test/quiz-pager.test.js
// 用桩替换 Auto.js 运行时，模拟一份 5 题的翻页测验，驱动脚本内部的 quiz()。
var fs=require('fs'),path=require('path'),assert=require('assert');
var src=fs.readFileSync(path.join(__dirname,'..','ChaoxingVideoAssistant-v6.03.js'),'utf8');
var cut=src.indexOf('enableBackgroundKeepAlive();\ninitFloatingControlPanel();');
assert(cut>0,'未找到主循环入口');
var body=src.slice(0,cut)+'\nglobalThis.__t={quiz:quiz,STATE:STATE,view:view,fill:fillOptionLetters};\n})();';

var now=1e12;Date.now=function(){return now;};
var W=1080,H=2400,N=5,PKG='com.chaoxing.mobile',ROWS=[0.35,0.43,0.51,0.59];
var sim={q:N,sel:{2:'B',3:'C',4:'A',5:'D'},trail:[N],submitted:false,asked:0};
function node(t,x,y,selected){
  return {text:function(){return t;},desc:function(){return '';},id:function(){return '';},
    className:function(){return 'android.widget.TextView';},packageName:function(){return PKG;},
    visibleToUser:function(){return true;},selected:function(){return !!selected;},checked:function(){return false;},
    clickable:function(){return false;},click:function(){return false;},parent:function(){return null;},
    bounds:function(){return {left:x-20,right:x+20,top:y-20,bottom:y+20,width:function(){return 40;},height:function(){return 40;},
      centerX:function(){return x;},centerY:function(){return y;}};}};}
function screen(){
  var q=sim.q,out=[node(q+'. [单选题] 这是用于回归测试的第'+q+'题题干内容',W*0.5,H*0.2)];
  'ABCD'.split('').forEach(function(l,i){
    out.push(node(l,W*0.084,H*ROWS[i],sim.sel[q]===l));
    out.push(node('第'+q+'题的选项'+l+'内容',W*0.5,H*ROWS[i]));});
  out.push(node('上一题',W*0.16,H*0.9),node(q+' / '+N,W*0.5,H*0.9),node(q<N?'下一题':'提交',W*0.84,H*0.9));
  return out;}
var empty={find:function(){return [];},findOnce:function(){return null;},editable:function(){return this;}};
var stubs={
  storages:{create:function(){return {get:function(k,d){return k==='deepseekKey'?'sk-test':d;},put:function(){}};}},
  device:{width:W,height:H},events:{on:function(){}},toast:function(){},threads:{start:function(){}},
  images:{requestScreenCapture:function(){return false;}},auto:{service:{}},
  sleep:function(ms){now+=ms;},currentPackage:function(){return PKG;},
  textMatches:function(){return {find:screen,findOnce:function(){return null;}};},
  descMatches:function(){return empty;},selector:function(){return empty;},id:function(){return empty;},className:function(){return empty;},
  click:function(x,y){
    now+=50;
    if(y>H*0.85){
      if(x<W*0.3){if(sim.q>1){sim.q--;sim.trail.push(sim.q);}}
      else if(x>W*0.7){if(sim.q<N){sim.q++;sim.trail.push(sim.q);}else sim.submitted=true;}
    }else if(x<W*0.2){
      ROWS.forEach(function(r,i){if(Math.abs(y-H*r)<H*0.03)sim.sel[sim.q]='ABCD'.charAt(i);});}
    return true;},
  http:{postJson:function(){
    sim.asked++;
    return {statusCode:200,body:{string:function(){return JSON.stringify({choices:[{message:{content:'{"answer":["A"],"confidence":"high"}'}}]});},close:function(){}}};}}};
Object.keys(stubs).forEach(function(k){globalThis[k]=stubs[k];});
var realLog=console.log;console.log=function(){};
(0,eval)(body);
var t=globalThis.__t;

// 场景：脚本在测验中途启动，只记录了第 2-5 题，当前停在末题。应一路回退到第 1 题补答后再提交。
[2,3,4,5].forEach(function(n){t.STATE.answered[n+':single']=true;});
for(var i=0;i<40&&!sim.submitted;i++){
  var v=t.STATE.preloadedQuizView||t.view();
  t.STATE.preloadedQuizView=null;
  t.quiz(v);
  now+=300;}
assert.strictEqual(sim.trail.join('>'),'5>4>3>2>1>2>3>4>5','末题发现漏答后应直接回退到缺失题号，而不是在最后两题间往返');
assert.strictEqual(sim.sel[1],'A','第 1 题应被补答');
assert.strictEqual(sim.asked,1,'已有记录的题目不应重复请求');
assert.strictEqual(sim.submitted,true,'补答后应回到末题提交');

// 选项补全：缺失字母只能用占位文字，不能借用其他选项的内容。
assert.deepStrictEqual(t.fill([{l:'A',t:'甲'},{l:'C',t:'丙'},{l:'D',t:'丁'}]),
  [{l:'A',t:'甲'},{l:'B',t:'选项 B'},{l:'C',t:'丙'},{l:'D',t:'丁'}]);
assert.deepStrictEqual(t.fill([{l:'A',t:'甲'},{l:'B',t:'乙'},{l:'C',t:'丙'},{l:'E',t:'戊'}]),
  [{l:'A',t:'甲'},{l:'B',t:'乙'},{l:'C',t:'丙'},{l:'D',t:'选项 D'},{l:'E',t:'戊'}]);
realLog('quiz-pager: ok');
