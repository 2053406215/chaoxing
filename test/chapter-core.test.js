// 章节定位核心（__starChapterCore）回归测试：node test/chapter-core.test.js
var fs=require('fs'),path=require('path'),assert=require('assert');
var src=fs.readFileSync(path.join(__dirname,'..','ChaoxingVideoAssistant-v5.78.js'),'utf8');
var core=new Function(src.slice(0,src.indexOf('var __starChapterAndroid'))+'\nreturn __starChapterCore;')();

// 模拟一个课程目录：rows 为全部章节，每屏显示 per 行。
function Dir(list,per){this.list=list;this.per=per||5;this.top=0;}
Dir.prototype.snap=function(withRange){
  var rows=this.list.slice(this.top,this.top+this.per).map(function(r,i){
    return {id:core.identity(r.n,r.t),title:r.t,number:r.n,status:r.s,rect:[0,i*100,100,i*100+90],fullyVisible:true};
  });
  return {course:'C',rows:rows,atStart:this.top===0,atEnd:this.top+this.per>=this.list.length,
    from:withRange?this.top:null,to:withRange?this.top+rows.length-1:null};
};
Dir.prototype.move=function(dir,step){
  var max=Math.max(0,this.list.length-this.per);
  this.top=Math.max(0,Math.min(max,this.top+(dir==='forward'?1:-1)*(step||this.per)));
};
// 驱动导航直到得到 open/complete/hold；step=每次滚动行数（整页=无重叠）。
function drive(nav,dir,opt){
  opt=opt||{};var now=opt.now||0;
  for(var i=0;i<400;i++){
    now+=300;var r=nav.observe(dir.snap(opt.range),now);
    if(r.type==='scroll'){dir.move(r.direction,r.overlap?Math.max(1,dir.per-2):opt.step);nav.motion(now);continue;}
    if(r.type==='wait')continue;
    r.now=now;return r;
  }
  throw Error('导航未收敛');
}
function course(n,doneUntil){
  var l=[];for(var i=1;i<=n;i++)l.push({n:'1.'+i,t:'第'+i+'节',s:i<=doneUntil?'complete':'incomplete'});return l;
}
function enter(nav,r,now){
  var flight=nav.begin(r.ticket,lastSnap,now);assert(flight,'begin 应成功');
  var h={number:flight.number,title:flight.title};
  nav.arrive(h,now+10);nav.arrive(h,now+20);
  var a=nav.arrive(h,now+400);assert.strictEqual(a.type,'entered');return now+400;
}
var lastSnap,tests=[];
function test(name,fn){tests.push([name,fn]);}

test('整页滚动（无重叠、无索引）也能找到后面的未完成章节',function(){
  var dir=new Dir(course(30,17),5),nav=new core.Navigator();nav.reset('C');
  dir.top=10;
  var r=drive(nav,dir,{step:5});
  assert.strictEqual(r.type,'open',JSON.stringify(r));
  assert.strictEqual(r.target.number,'1.18');
});

test('连续学完多节后，滚动次数不会累计到上限',function(){
  var list=course(40,0),dir=new Dir(list,5),nav=new core.Navigator();nav.reset('C');
  var now=0;
  for(var k=0;k<40;k++){
    var r=drive(nav,dir,{range:true,step:3,now:now});
    assert.strictEqual(r.type,'open','第'+(k+1)+'节：'+JSON.stringify(r));
    assert.strictEqual(r.target.number,'1.'+(k+1));
    lastSnap=dir.snap(true);now=enter(nav,r,r.now);
    list[k].s='complete';
    // 用户返回目录时停在顶部附近
    dir.top=Math.max(0,k-6);
  }
});

test('目录短暂为空的“等待”计时不会跨章节残留',function(){
  var list=course(6,0),dir=new Dir(list,5),nav=new core.Navigator();nav.reset('C');
  var empty={course:'C',rows:[],atStart:true,atEnd:true,from:null,to:null};
  assert.strictEqual(nav.observe(empty,0).type,'wait');
  var r=drive(nav,dir,{range:true,now:100});lastSnap=dir.snap(true);
  var now=enter(nav,r,r.now);list[0].s='complete';
  // 一分钟后回到目录，首帧仍在加载
  var w=nav.observe(empty,now+60000);
  assert.strictEqual(w.type,'wait',JSON.stringify(w));
});

test('标题以数字开头时仍能解析章节号',function(){
  var src2=src.slice(0,src.indexOf('// chaoxing helper v'));
  var android=new Function('engines','id','textMatches','events','auto','Packages','JavaAdapter','images','swipe',src2+'\nreturn __starChapterAndroid;')({myEngine:function(){return {id:1};}});
  assert.deepStrictEqual(android.heading('1.2 5G技术概述'),{number:'1.2',title:'5G技术概述'});
  assert.deepStrictEqual(android.heading('2.10 绪论'),{number:'2.10',title:'绪论'});
  assert.deepStrictEqual(android.heading('3.1.2、3D 建模'),{number:'3.1.2',title:'3D 建模'});
  assert.deepStrictEqual(android.heading('课程介绍'),{number:'',title:'课程介绍'});
});

test('保存的进度章节已不在目录中时，重新从头定位而不是一直向下滚',function(){
  var dir=new Dir(course(20,4),5),nav=new core.Navigator();
  nav.reset('C',{id:core.identity('1.3','已改名'),number:'1.3',title:'已改名'});
  dir.top=8;
  var r=drive(nav,dir,{range:true,step:3});
  assert.strictEqual(r.type,'open',JSON.stringify(r));
  assert.strictEqual(r.target.number,'1.5');
});

var failed=0;
tests.forEach(function(t){try{t[1]();console.log('ok   '+t[0]);}catch(e){failed++;console.log('FAIL '+t[0]+'\n     '+e.message);}});
process.exit(failed?1:0);
