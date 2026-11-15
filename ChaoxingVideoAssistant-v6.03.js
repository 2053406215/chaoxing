// ChaoxingVideoAssistant-v6.03.js
// 超星学习通课程助手 v6.03（免无障碍 Shizuku/Root + 无障碍自适应双引擎 + 后台保活 + 智能防漏答复查版）
(function(){
var PKG='com.chaoxing.mobile';
var STORE=storages.create('chaoxing_assistant_v578');
var W=Math.min(device.width||1080,device.height||2400);
var H=Math.max(device.width||1080,device.height||2400);
var KEY=String(STORE.get('deepseekKey','')||'').trim();
var VISION={
  url:String(STORE.get('visionUrl','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')||'').trim(),
  model:String(STORE.get('visionModel','qwen-vl-max')||'').trim(),
  key:String(STORE.get('visionKey','')||'').trim()};
var SCRIPT_PAUSED=false;
var PERM_GUIDE_SHOWN=false;
var NO_AX_BACKEND='';
var SHIZUKU_REQ_TRIED=false;
var SCREEN_CAPTURE_READY=false;
var WAKE_LOCK=null,WIFI_LOCK=null,FLOAT_WIN=null;
var RECENT_LOGS=[];
var FULL_LOGS=[];
var LOG_FILE_PATH='/sdcard/Download/ChaoxingAssistant_log.txt';
var SESSION_STATS={videos:0,quizzes:0,discussions:0,docs:0,skipped:[],startedAt:Date.now()};
var LOCAL_QB=STORE.get('localQuestionBank',{})||{};
var RESUME_CHAPTER=String(STORE.get('resumeChapterNum','')||'');
function saveLocalQb(key,ans){
  try{
    if(!key||!ans||String(ans.confidence||'').toLowerCase()==='low')return;
    if(!((Array.isArray(ans.answer)&&ans.answer.length)||(Array.isArray(ans.blanks)&&ans.blanks.length)||(ans.text&&String(ans.text).trim())))return;
    LOCAL_QB[key]=ans;
    var keys=Object.keys(LOCAL_QB);
    if(keys.length>600){delete LOCAL_QB[keys[0]];}
    STORE.put('localQuestionBank',LOCAL_QB);
  }catch(ignore){}}
function saveResumeChapter(num){
  if(!num)return;
  var clean=String(num).trim();
  if(!/^\d+(?:\.\d+)+$/.test(clean))return;
  if(RESUME_CHAPTER!==clean){
    RESUME_CHAPTER=clean;
    try{STORE.put('resumeChapterNum',clean);}catch(ignore){}}}
function buildSessionSummary(){
  var mins=Math.max(1,Math.round((Date.now()-SESSION_STATS.startedAt)/60000));
  var skipStr=SESSION_STATS.skipped.length?('\n跳过项('+SESSION_STATS.skipped.length+'): '+SESSION_STATS.skipped.slice(-8).join('、')):'\n跳过项: 无';
  return '本轮汇总('+mins+'分钟): 视频 '+SESSION_STATS.videos+' 个 | 题目 '+SESSION_STATS.quizzes+' 题 | 讨论 '+SESSION_STATS.discussions+' 题 | 文档 '+SESSION_STATS.docs+' 篇'+skipStr;}
var STATE={
  video:false,
  finished:false,
  openedAt:0,
  lastOpen:0,
  lastTime:-1,
  total:0,
  videoSpeedRate:1,
  speedChecked:false,
  speedShown:false,
  speedMenuAt:0,
  speedAttempts:0,
  speedPaused:false,
  speedPauseAttempts:0,
  speedEntryAttempts:0,
  videoExitAt:0,
  activeVideoKey:'',
  activeVideoChapter:'',
  videoFinishedKeys:{},
  videoChapterRefresh:null,
  videoLoadRecovery:null,
  videoNetworkState:'idle',
  videoRetryDirect:false,
  hadCurrentTask:false,
  completionRefreshed:false,
  taskTopReady:false,
  taskTopSignature:'',
  taskTopSteps:0,
  lastTaskFound:'',
  doc:false,
  docAwaitKey:'',
  docAwaitAt:0,
  readingVisit:null,
  readingAttempts:{},
  readingRefresh:null,
  discussionTopic:null,
  discussionTaskKey:'',
  discussionDone:{},
  discussionRefresh:null,
  discussionFailAt:0,
  quizContext:'',
  workChapter:null,
  lastKnownChapterHeading:null,
  workTotal:0,
  answered:{},
  scanDrafts:{},
  scanFailures:{},
  shortAttempted:{},
  shortSaved:{},
  choiceAttempted:{},
  multipleConfirmed:{},
  multipleExpected:{},
  multipleFailures:{},
  answerCache:{},
  auditMissing:[],
  auditRecoverySteps:0,
  auditRecoverySignature:'',
  auditRecoveryStill:0,
  quizAuditHold:null,
  quizSeek:null,
  quizPending:false,
  awaitingSubmitResult:false,
  afterSubmit:false,
  returnBackTried:false,
  lastFinishAt:0,
  lastQuestionNav:0,
  lastPagerNumber:0,
  lastPagerTotal:0,
  lastAnswerView:null,
  preloadedQuizView:null,
  lastScanPage:null,
  headerSearch:0,
  blocked:'',
  blockedAt:0,
  navBlocked:'',
  lastQuiz:'',
  lastLog:0,
  lastScroll:0,
  lastShotAt:0,
  lastClipAns:'',
  pausedOutside:false,
  pausedAt:0,
  outsideStartedAt:0,
  autoReturnCount:0,
  lastAutoReturnAt:0,
  visionPrompted:false,
  chapterWatch:null};
function p2(n){return n<10?('0'+n):String(n);}
function p3(n){return n<10?('00'+n):(n<100?('0'+n):String(n));}
function formatLogTime(d){
  var dt=d||new Date();
  return p2(dt.getHours())+':'+p2(dt.getMinutes())+':'+p2(dt.getSeconds())+'.'+p3(dt.getMilliseconds());}
var LOG_FILE_CHECKED=false;
function appendLogToFile(line){
  try{
    if(typeof files!=='undefined'&&files&&typeof files.append==='function'){
      if(!LOG_FILE_CHECKED){
        LOG_FILE_CHECKED=true;
        try{
          if(files.exists&&files.exists(LOG_FILE_PATH)){
            var sz=new java.io.File(LOG_FILE_PATH).length();
            if(sz>524288&&files.write)files.write(LOG_FILE_PATH,'');}
        }catch(ignore){}}
      files.append(LOG_FILE_PATH,line+'\n');}
  }catch(ignore){}}
function cxLog(msg){
  var text=String(msg||'');
  var stamped='['+formatLogTime()+'] '+text;
  console.log(text);
  RECENT_LOGS.push(text);
  if(RECENT_LOGS.length>16)RECENT_LOGS.shift();
  FULL_LOGS.push(stamped);
  if(FULL_LOGS.length>400)FULL_LOGS.shift();
  appendLogToFile(stamped);
  updateFloatingStatus(text);}
function buildDiagnosticReport(){
  var mode=NO_AX_BACKEND||(typeof auto!=='undefined'&&auto&&auto.service?'accessibility':'none');
  var ansKeys=Object.keys(STATE.answered||{}).filter(function(k){return STATE.answered[k];});
  var header=[
    '=== 超星助手 v6.14 诊断日志 ===',
    '时间: '+new Date().toLocaleString(),
    '引擎: '+mode+' | 截图就绪: '+SCREEN_CAPTURE_READY+' | 分辨率: '+W+'x'+H+' | 横屏: '+land(),
    '场景: '+SMART_RECOGNIZER.scene+' ('+SMART_RECOGNIZER.label+') | 章节: '+(STATE.quizContext||'无'),
    '状态: video='+STATE.video+' rate='+STATE.videoSpeedRate+'x quizPending='+STATE.quizPending+' blocked='+(STATE.blocked||'无')+' 已答='+ansKeys.length+' 本地题库='+Object.keys(LOCAL_QB||{}).length+' 断点='+(RESUME_CHAPTER||'无'),
    buildSessionSummary().replace(/\n/g,' | '),
    '=== 日志明细 ('+FULL_LOGS.length+'条) ==='
  ].join('\n');
  return header+'\n'+FULL_LOGS.join('\n');}
function exportDiagnosticLogs(copyOnly){
  var report=buildDiagnosticReport();
  var copied=safeSetClip(report);
  if(copyOnly){
    toast(copied?'已复制完整诊断日志到剪贴板，可直接粘贴发送':'复制失败，请尝试导出文件');
    return '';}
  var savedPath='';
  try{
    var d=new Date();
    var fname='ChaoxingAssistant_log_'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'_'+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds())+'.txt';
    var candidates=['/sdcard/Download/'+fname];
    try{if(typeof files!=='undefined'&&files.cwd)candidates.push(files.cwd()+'/'+fname);}catch(ignore){}
    for(var i=0;i<candidates.length;i++){
      try{
        if(typeof files!=='undefined'&&files.write){
          files.write(candidates[i],report);
          savedPath=candidates[i];
          break;}
      }catch(ignore){}}
  }catch(ignore){}
  if(savedPath)toast('日志已导出至：'+savedPath+(copied?'（同时已复制到剪贴板）':''));
  else toast(copied?'文件写入受限，已将完整日志复制到剪贴板':'导出失败，请在日志页截图');
  return savedPath;}
function isStandaloneOrAutoJsHost(){
  try{
    var pkg=String(context.getPackageName()||'');
    return pkg!==PKG;
  }catch(ignore){return true;}}
var LAST_KEEP_ALIVE_RENEW=Date.now();
function enableBackgroundKeepAlive(){
  try{
    if(typeof $settings!=='undefined'&&$settings.setEnabled){
      try{$settings.setEnabled('foreground_service',true);}catch(ignore){}}
  }catch(ignore){}
  try{
    var pm=context.getSystemService(android.content.Context.POWER_SERVICE);
    if(pm&&!WAKE_LOCK){
      WAKE_LOCK=pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,'ChaoxingAssistant::KeepAliveWakeLock');
      WAKE_LOCK.setReferenceCounted(false);
      WAKE_LOCK.acquire();}
  }catch(ignore){}
  try{
    var wm=context.getApplicationContext().getSystemService(android.content.Context.WIFI_SERVICE);
    if(wm&&!WIFI_LOCK){
      WIFI_LOCK=wm.createWifiLock(3,'ChaoxingAssistant::KeepAliveWifiLock');
      WIFI_LOCK.setReferenceCounted(false);
      WIFI_LOCK.acquire();}
  }catch(ignore){}
  try{device.keepScreenDim(3600*1000);}catch(ignore){}}
function releaseBackgroundKeepAlive(){
  restoreMediaVolume();
  try{if(WAKE_LOCK&&WAKE_LOCK.isHeld())WAKE_LOCK.release();}catch(ignore){}
  try{if(WIFI_LOCK&&WIFI_LOCK.isHeld())WIFI_LOCK.release();}catch(ignore){}
  try{device.cancelKeepingAwake();}catch(ignore){}
  try{if(FLOAT_WIN){FLOAT_WIN.close();FLOAT_WIN=null;}}catch(ignore){}}
try{
  events.on('exit',function(){
    releaseBackgroundKeepAlive();});
}catch(ignore){}
var CFG={
  autoSpeed:STORE.get('cfgAutoSpeed',true)!==false,
  maxSpeed:Number(STORE.get('cfgMaxSpeed',2.0))||2.0,
  autoMute:STORE.get('cfgAutoMute',true)!==false,
  doubleRecheck:STORE.get('cfgDoubleRecheck',true)!==false,
  singleCharFix:STORE.get('cfgSingleCharFix',true)!==false,
  autoReturnFg:STORE.get('autoReturnForeground',true)!==false,
  skipDiscussion:STORE.get('cfgSkipDiscussionV2',false)===true,
  onlyVideoQuiz:STORE.get('cfgOnlyVideoQuizV2',false)===true};
var SAVED_MEDIA_VOL=-1;
function muteMediaForVideo(){
  if(!CFG.autoMute)return;
  try{
    if(typeof device!=='undefined'&&device.getMusicVolume&&device.setMusicVolume){
      if(SAVED_MEDIA_VOL<0)SAVED_MEDIA_VOL=Number(device.getMusicVolume());
      if(Number(device.getMusicVolume())>0){
        device.setMusicVolume(0);
        cxLog('已自动静音媒体音量（退出视频后恢复）');}}
  }catch(ignore){}}
function restoreMediaVolume(){
  try{
    if(SAVED_MEDIA_VOL>=0&&typeof device!=='undefined'&&device.setMusicVolume){
      device.setMusicVolume(SAVED_MEDIA_VOL);
      SAVED_MEDIA_VOL=-1;}
  }catch(ignore){}}
var SMART_RECOGNIZER={
  scene:'IDLE',
  label:'智能识别待命',
  todoCount:0,
  doneCount:0,
  isImageLandscape:function(im){
    if(!isImageAlive(im))return false;
    try{
      var iw=im.getWidth(),ih=im.getHeight();
      if(iw>ih)return true;
      var blackBars=0,totalBars=0;
      var barYs=[0.30,0.35,0.65,0.70,0.85],barXs=[0.08,0.18];
      for(var yi=0;yi<barYs.length;yi++){
        for(var xi=0;xi<barXs.length;xi++){
          totalBars++;
          var c=images.pixel(im,Math.round(iw*barXs[xi]),Math.round(ih*barYs[yi]));
          if(((c>>16)&255)<14&&((c>>8)&255)<14&&(c&255)<14)blackBars++;}}
      if(blackBars<totalBars-1)return false;
      var centerNonBlack=0,cYs=[0.45,0.50,0.55],cXs=[0.30,0.50,0.70];
      for(var cyi=0;cyi<cYs.length;cyi++){
        for(var cxi=0;cxi<cXs.length;cxi++){
          var cc=images.pixel(im,Math.round(iw*cXs[cxi]),Math.round(ih*cYs[cyi]));
          if(((cc>>16)&255)>18||((cc>>8)&255)>18||(cc&255)>18)centerNonBlack++;}}
      return centerNonBlack>=2;
    }catch(ignore){return false;}
  },
  landPixel:function(im,xr,yr){
    var iw=im.getWidth(),ih=im.getHeight();
    if(iw>ih){
      return images.pixel(im,Math.min(iw-1,Math.max(0,Math.round(xr*iw))),Math.min(ih-1,Math.max(0,Math.round(yr*ih))));}
    var vh=iw*iw/ih,vTop=(ih-vh)/2;
    var px=Math.min(iw-1,Math.max(0,Math.round(xr*iw)));
    var py=Math.min(ih-1,Math.max(0,Math.round(vTop+yr*vh)));
    return images.pixel(im,px,py);
  },
  isBottomBarVisible:function(im){
    if(!isImageAlive(im))return false;
    try{
      var leftWhite=0,rightWhite=0;
      for(var yr=0.89;yr<=0.960;yr+=0.006){
        for(var xr=0.080;xr<=0.112;xr+=0.004){
          var c=this.landPixel(im,xr,yr);
          if(((c>>16)&255)>150&&((c>>8)&255)>150&&(c&255)>150)leftWhite++;}
        for(var rx=0.922;rx<=0.966;rx+=0.004){
          var rc=this.landPixel(im,rx,yr);
          var rr=(rc>>16)&255,rg=(rc>>8)&255,rb=rc&255;
          if(rr>120&&rg>120&&rb>120&&Math.abs(rr-rb)<20)rightWhite++;}}
      return leftWhite>=4&&rightWhite>=2;
    }catch(ignore){return false;}
  },
  detectSpeedDrawerVisual:function(im){
    if(!isImageAlive(im))return false;
    try{
      var gapYs=[0.05,0.24,0.41,0.59,0.765,0.94],navyGaps=0;
      for(var gi=0;gi<gapYs.length;gi++){
        var gc=this.landPixel(im,0.945,gapYs[gi]);
        var gr=(gc>>16)&255,gg=(gc>>8)&255,gb=gc&255;
        if(gr>=12&&gr<=38&&gg>=16&&gg<=42&&gb>=32&&gb<=62&&(gb-gr)>=12)navyGaps++;}
      var btnYs=[0.156,0.322,0.500,0.685,0.844],slateBtns=0;
      for(var bi=0;bi<btnYs.length;bi++){
        var bc1=this.landPixel(im,0.88,btnYs[bi]);
        var bc2=this.landPixel(im,0.945,btnYs[bi]);
        var r1=(bc1>>16)&255,g1=(bc1>>8)&255,b1=bc1&255;
        var r2=(bc2>>16)&255,g2=(bc2>>8)&255,b2=bc2&255;
        if(r1>=44&&r1<=72&&g1>=50&&g1<=78&&b1>=68&&b1<=98&&(b1-r1)>=14&&
           r2>=44&&r2<=72&&g2>=50&&g2<=78&&b2>=68&&b2<=98&&(b2-r2)>=14)slateBtns++;}
      return navyGaps>=5&&slateBtns>=3;
    }catch(ignore){return false;}
  },
  isSpeedSlotHighlighted:function(im,yRatio){
    if(!isImageAlive(im))return false;
    try{
      var sc=this.landPixel(im,0.945,yRatio);
      var sr=(sc>>16)&255,sg=(sc>>8)&255,sb=sc&255;
      if(sr>=18&&sr<=38&&sg>=30&&sg<=50&&sb>=55&&sb<=80&&(sb-sr)>=28)return true;
      var blueHits=0;
      for(var yr=yRatio-0.062;yr<=yRatio+0.062;yr+=0.012){
        for(var xr=0.695;xr<=0.95;xr+=0.015){
          var c=this.landPixel(im,xr,yr);
          var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
          if(b>125&&g>90&&r<70&&(b-r)>=65)blueHits++;}}
      return blueHits>=2;
    }catch(ignore){return false;}
  },
  isIncompleteTaskDialogVisual:function(im){
    if(!isImageAlive(im))return false;
    try{
      var iw=im.getWidth(),ih=im.getHeight();
      if(iw>ih)return false;
      var dimPts=[[0.20,0.068],[0.80,0.068],[0.20,0.90],[0.35,0.90]];
      for(var di=0;di<dimPts.length;di++){
        var dc=images.pixel(im,Math.round(iw*dimPts[di][0]),Math.round(ih*dimPts[di][1]));
        var dr=(dc>>16)&255,dg=(dc>>8)&255,db=dc&255;
        if(!(dr>=70&&dr<=145&&dg>=70&&dg<=145&&db>=70&&db<=145&&Math.abs(dr-db)<=18))return false;}
      var boxPts=[[0.25,0.44],[0.50,0.44],[0.75,0.44],[0.25,0.55],[0.75,0.55]];
      for(var bi=0;bi<boxPts.length;bi++){
        var bc=images.pixel(im,Math.round(iw*boxPts[bi][0]),Math.round(ih*boxPts[bi][1]));
        if(((bc>>16)&255)<=220||((bc>>8)&255)<=220||(bc&255)<=220)return false;}
      var leftBlue=0,rightBlue=0;
      for(var yr=0.555;yr<=0.590;yr+=0.005){
        var py=Math.round(ih*yr);
        for(var lx=0.24;lx<=0.41;lx+=0.01){
          var lc=images.pixel(im,Math.round(iw*lx),py);
          var lr=(lc>>16)&255,lb=lc&255;
          if(lb>170&&(lb-lr)>60)leftBlue++;}
        for(var rx=0.59;rx<=0.76;rx+=0.01){
          var rc=images.pixel(im,Math.round(iw*rx),py);
          var rr=(rc>>16)&255,rb=rc&255;
          if(rb>170&&(rb-rr)>60)rightBlue++;}}
      return leftBlue>=2&&rightBlue>=2;
    }catch(ignore){return false;}
  },
  analyze:function(v){
    if(v&&v._analyzed)return this;
    if(v)v._analyzed=true;
    try{
      if(land()){
        this.scene='VIDEO_LANDSCAPE';
        this.label='🎬横屏视频('+(STATE.videoSpeedRate||1)+'x)';
        if(FLOAT_WIN&&FLOAT_WIN.txtBadge&&this.label!==this._lastBadge){
          this._lastBadge=this.label;
          var lDot=SCRIPT_PAUSED?'🟠暂停':(STATE.pausedOutside?'🔵保活':'🟢');
          ui.run(function(){try{FLOAT_WIN.txtBadge.setText(lDot+SMART_RECOGNIZER.label);}catch(ignore){}});}
        return this;}
      if(!v||!v.n)return this;
      if(/确认提交|确定提交|是否提交|确认交卷/.test(v.s)){
        this.scene='QUIZ_CONFIRM';this.label='✅提交确认弹窗';return this;}
      var pg=pagerInfo(v);
      if(pg){
        this.scene='QUIZ_PAGER';this.label='📝单题测验('+pg.cur+'/'+pg.total+')';return this;}
      if(STATE.doc){
        this.scene='DOC_VIEWER';this.label='📄文档/PDF阅览';return this;}
      if(isDirectoryPage(v)){
        this.scene='DIRECTORY';this.label='🗂章节目录巡检';return this;}
      if(isChapterContent(v)){
        var ts=v.taskMarkers||[];
        var done=ts.filter(function(m){return m.done;}).length;
        var todo=Math.max(0,ts.length-done);
        this.todoCount=todo;this.doneCount=done;
        if(questions(v).length){
          this.scene='CHAPTER_QUIZ';this.label='✍️章节内嵌测验';return this;}
        this.scene='CHAPTER_TASKS';
        this.label=ts.length?('📚章节任务(待办'+todo+'/完成'+done+')'):'📖章节内容巡航';
        return this;}
      if(questions(v).length||/单选|多选|判断|填空|简答|第\s*\d+\s*空/.test(v.s)){
        this.scene='QUIZ_PAGE';this.label='📝章节测验答题';return this;}
      if(discussionPage(v)){
        this.scene='DISCUSSION';this.label=CFG.skipDiscussion?'💬讨论(待自检)':'💬讨论页';}
    }catch(ignore){}
    try{
      if(FLOAT_WIN&&FLOAT_WIN.txtBadge&&this.label!==this._lastBadge){
        this._lastBadge=this.label;
        var dot=SCRIPT_PAUSED?'🟠暂停':(STATE.pausedOutside?'🔵保活':'🟢');
        ui.run(function(){try{FLOAT_WIN.txtBadge.setText(dot+SMART_RECOGNIZER.label);}catch(ignore){}});}
    }catch(ignore){}
    return this;}};
function openVisualControlCenter(isInitial){
  try{
    ui.run(function(){
      try{
        var modeName=NO_AX_BACKEND==='shizuku'?'Shizuku 免无障碍':(NO_AX_BACKEND==='root'?'Root 极速引擎':'系统无障碍');
        var ansCount=Object.keys(STATE.answered||{}).filter(function(k){return STATE.answered[k];}).length;
        var recentStr=RECENT_LOGS.slice(-8).join('\n')||'暂无运行日志';
        var stateLabel=SCRIPT_PAUSED?'已暂停':(STATE.pausedOutside?'后台挂机':'巡航中');
        var stateBg=SCRIPT_PAUSED?'#F59E0B':(STATE.pausedOutside?'#38BDF8':'#10B981');
        var panelXml=
          '<ScrollView>'+
            '<vertical padding="16dp" bg="#090D16">'+
              '<card cardCornerRadius="16dp" cardElevation="6dp" cardBackgroundColor="#131C2E" marginBottom="10dp">'+
                '<vertical padding="14dp">'+
                  '<horizontal gravity="center_vertical">'+
                    '<vertical layout_weight="1">'+
                      '<text text="✨ 超星学习通智能助手 Pro" textColor="#38BDF8" textSize="17sp" textStyle="bold"/>'+
                      '<text id="dlgSub" text="v6.14 极速旗舰版 · 免无障碍自适应双引擎" textColor="#94A3B8" textSize="11sp" marginTop="2dp"/>'+
                    '</vertical>'+
                    '<text text="'+stateLabel+'" textColor="#090D16" bg="'+stateBg+'" textSize="10sp" textStyle="bold" padding="6dp"/>'+
                  '</horizontal>'+
                  '<horizontal marginTop="12dp">'+
                    '<vertical layout_weight="1" bg="#090D16" padding="8dp" marginRight="4dp" gravity="center">'+
                      '<text text="驱动引擎" textColor="#64748B" textSize="10sp"/>'+
                      '<text text="'+modeName+'" textColor="#38BDF8" textSize="11sp" textStyle="bold" marginTop="2dp"/>'+
                    '</vertical>'+
                    '<vertical layout_weight="1" bg="#090D16" padding="8dp" marginLeft="4dp" marginRight="4dp" gravity="center">'+
                      '<text text="本轮已答" textColor="#64748B" textSize="10sp"/>'+
                      '<text text="'+ansCount+' 题" textColor="#10B981" textSize="11sp" textStyle="bold" marginTop="2dp"/>'+
                    '</vertical>'+
                    '<vertical layout_weight="1" bg="#090D16" padding="8dp" marginLeft="4dp" gravity="center">'+
                      '<text text="视频倍速" textColor="#64748B" textSize="10sp"/>'+
                      '<text text="'+(CFG.autoSpeed?((CFG.maxSpeed||2.0)+'x 极速'):'原速')+'" textColor="#F59E0B" textSize="11sp" textStyle="bold" marginTop="2dp"/>'+
                    '</vertical>'+
                  '</horizontal>'+
                '</vertical>'+
              '</card>'+
              '<card cardCornerRadius="14dp" cardElevation="4dp" cardBackgroundColor="#131C2E" marginBottom="10dp">'+
                '<vertical padding="14dp">'+
                  '<text text="🔑 AI 模型密钥配置" textColor="#F8FAFC" textSize="13sp" textStyle="bold" marginBottom="6dp"/>'+
                  '<text text="DeepSeek API Key（必填 · 单选/多选/判断/填空/简答）" textColor="#94A3B8" textSize="11sp"/>'+
                  '<input id="inpDeepseek" text="" hint="sk-..." textColor="#F8FAFC" textColorHint="#475569" textSize="12sp" singleLine="true"/>'+
                  '<text text="阿里云百炼 / OpenAI 识图 Key（选填 · 仅图片题需要）" textColor="#94A3B8" textSize="11sp" marginTop="6dp"/>'+
                  '<input id="inpVision" text="" hint="sk-...（可留空）" textColor="#F8FAFC" textColorHint="#475569" textSize="12sp" singleLine="true"/>'+
                '</vertical>'+
              '</card>'+
              '<card cardCornerRadius="14dp" cardElevation="4dp" cardBackgroundColor="#131C2E" marginBottom="10dp">'+
                '<vertical padding="14dp">'+
                  '<text text="⚡ 极速智能策略开关" textColor="#F8FAFC" textSize="13sp" textStyle="bold" marginBottom="6dp"/>'+
                  '<checkbox id="chkSpeed" text="视频自动倍速与横屏全屏播放" checked="'+CFG.autoSpeed+'" textColor="#F1F5F9" textSize="12sp"/>'+
                  '<horizontal gravity="center_vertical" marginTop="4dp">'+
                    '<checkbox id="chkMute" text="播放时自动静音" checked="'+CFG.autoMute+'" textColor="#F1F5F9" textSize="12sp" layout_weight="1"/>'+
                    '<text text="上限:" textColor="#94A3B8" textSize="11sp" marginRight="4dp"/>'+
                    '<spinner id="spnMaxSpeed" entries="2.0x|1.5x|1.25x|1.0x" textColor="#38BDF8"/>'+
                  '</horizontal>'+
                  '<checkbox id="chkRecheck" text="智能轻复查模式（精准识别酶/底物差异，仅补漏项）" checked="'+CFG.doubleRecheck+'" textColor="#F1F5F9" textSize="12sp" marginTop="4dp"/>'+
                  '<checkbox id="chkSingleChar" text="单字答案双写回删兼容（解决 Vivo/OriginOS 单字不粘贴）" checked="'+CFG.singleCharFix+'" textColor="#F1F5F9" textSize="12sp" marginTop="4dp"/>'+
                  '<checkbox id="chkAutoReturn" text="后台挂机视频播完自动拉回学习通" checked="'+CFG.autoReturnFg+'" textColor="#F1F5F9" textSize="12sp" marginTop="4dp"/>'+
                  '<checkbox id="chkSkipDisc" text="仅做视频与测验（不勾选则自动做讨论题与秒点PDF文档）" checked="'+CFG.onlyVideoQuiz+'" textColor="#F1F5F9" textSize="12sp" marginTop="4dp"/>'+
                '</vertical>'+
              '</card>'+
              '<card cardCornerRadius="14dp" cardElevation="4dp" cardBackgroundColor="#131C2E" marginBottom="12dp">'+
                '<vertical padding="12dp">'+
                  '<text text="📊 '+buildSessionSummary().replace(/\n/g,'  ')+' " textColor="#10B981" textSize="10sp" marginBottom="6dp"/>'+
                  '<text text="📋 实时运行日志流" textColor="#38BDF8" textSize="12sp" textStyle="bold" marginBottom="4dp"/>'+
                  '<text id="txtRecentLogs" text="" textColor="#CBD5E1" textSize="10sp" bg="#090D16" padding="8dp"/>'+
                '</vertical>'+
              '</card>'+
              '<horizontal gravity="right" marginBottom="6dp">'+
                '<button id="btnCopyLogs" text="📋 复制日志" style="Widget.AppCompat.Button.Borderless" textColor="#38BDF8" textSize="12sp"/>'+
                '<button id="btnExportLogs" text="💾 导出日志" style="Widget.AppCompat.Button.Borderless" textColor="#10B981" textSize="12sp" marginLeft="4dp"/>'+
                '<button id="btnClearCache" text="重置缓存" style="Widget.AppCompat.Button.Borderless" textColor="#F59E0B" textSize="12sp" marginLeft="4dp"/>'+
              '</horizontal>'+
              '<horizontal gravity="right">'+
                '<button id="btnCloseDlg" text="关闭" style="Widget.AppCompat.Button.Borderless" textColor="#94A3B8" textSize="12sp"/>'+
                '<button id="btnSaveDlg" text="🚀 保存并继续" bg="#0284C7" textColor="#FFFFFF" textSize="12sp" marginLeft="8dp"/>'+
              '</horizontal>'+
            '</vertical>'+
          '</ScrollView>';
        var contentView=ui.inflate(panelXml);
        try{
          contentView.inpDeepseek.setText(KEY||'');
          contentView.inpVision.setText(VISION.key||'');
          contentView.txtRecentLogs.setText(recentStr);
          var spdList=[2.0,1.5,1.25,1.0];var spdIdx=spdList.indexOf(Number(CFG.maxSpeed)||2.0);
          if(spdIdx>=0&&contentView.spnMaxSpeed)contentView.spnMaxSpeed.setSelection(spdIdx);
        }catch(ignore){}
        var dlg=new android.app.AlertDialog.Builder(context).setView(contentView).create();
        try{
          if(dlg.getWindow()){
            dlg.getWindow().setType(android.os.Build.VERSION.SDK_INT>=26?2038:2002);}
        }catch(ignore){}
        contentView.btnCopyLogs.on('click',function(){
          exportDiagnosticLogs(true);});
        contentView.btnExportLogs.on('click',function(){
          exportDiagnosticLogs(false);});
        contentView.btnClearCache.on('click',function(){
          STATE.answered={};STATE.countedQuizIds={};STATE.awaitingSubmitResult=false;STATE.shortSaved={};STATE.shortAttempted={};STATE.choiceAttempted={};
          STATE.multipleConfirmed={};STATE.scanDrafts={};STATE.videoFinishedKeys={};
          STATE.pageRecheckCount={};STATE.backtrackTries={};STATE.dirRowVisits={};STATE.dirSweepCount=0;
          toast('已清空本节作答与目录巡检缓存');
          cxLog('已手动清空本节作答缓存');});
        contentView.btnCloseDlg.on('click',function(){
          try{dlg.dismiss();}catch(ignore){}});
        contentView.btnSaveDlg.on('click',function(){
          KEY=String(contentView.inpDeepseek.getText()||'').trim();
          VISION.key=String(contentView.inpVision.getText()||'').trim();
          CFG.autoSpeed=!!contentView.chkSpeed.isChecked();
          CFG.autoMute=!!contentView.chkMute.isChecked();
          try{var spdOpts=[2.0,1.5,1.25,1.0];CFG.maxSpeed=spdOpts[contentView.spnMaxSpeed.getSelectedItemPosition()]||2.0;}catch(ignore){CFG.maxSpeed=2.0;}
          CFG.doubleRecheck=!!contentView.chkRecheck.isChecked();
          CFG.singleCharFix=!!contentView.chkSingleChar.isChecked();
          CFG.autoReturnFg=!!contentView.chkAutoReturn.isChecked();
          CFG.onlyVideoQuiz=!!contentView.chkSkipDisc.isChecked();
          CFG.skipDiscussion=CFG.onlyVideoQuiz;
          STORE.put('deepseekKey',KEY);
          STORE.put('visionKey',VISION.key);
          STORE.put('cfgAutoSpeed',CFG.autoSpeed);
          STORE.put('cfgAutoMute',CFG.autoMute);
          if(!CFG.autoMute)restoreMediaVolume();
          STORE.put('cfgMaxSpeed',CFG.maxSpeed);
          STORE.put('cfgDoubleRecheck',CFG.doubleRecheck);
          STORE.put('cfgSingleCharFix',CFG.singleCharFix);
          STORE.put('autoReturnForeground',CFG.autoReturnFg);
          STORE.put('cfgSkipDiscussionV2',CFG.skipDiscussion);
          STORE.put('cfgOnlyVideoQuizV2',CFG.onlyVideoQuiz);
          SCRIPT_PAUSED=false;
          updateFloatingStatus('设置已保存，自动运行中');
          toast('设置已保存');
          try{dlg.dismiss();}catch(ignore){}});
        dlg.show();
      }catch(innerErr){
        threads.start(function(){
          try{
            var dk=dialogs.rawInput('请输入 DeepSeek API Key（必填，用于自动答题）',KEY||'');
            if(dk!==null){KEY=String(dk||'').trim();STORE.put('deepseekKey',KEY);}
            var vk=dialogs.rawInput('可选：阿里云百炼识图 API Key（用于图片题，可留空）',VISION.key||'');
            if(vk!==null){VISION.key=String(vk||'').trim();STORE.put('visionKey',VISION.key);}
            if(KEY)toast('密钥已保存');
          }catch(ignore){}});}});
  }catch(e){
    if(!isInitial)cxLog('打开控制中心失败：'+e);}}
function configureApiKeys(isInitial){
  openVisualControlCenter(isInitial);}
function configureVision(){
  openVisualControlCenter(false);}
var FLOAT_BOUNDS={l:0,t:0,r:0,b:0};
var LAST_FLOAT_STATUS='';
var _LAST_BADGE_UI='',_LAST_PAUSE_UI='';
function updateFloatingStatus(statusText){
  if(!FLOAT_WIN)return;
  var shortText=String(statusText||'智能巡航待命中').replace(/\s+/g,' ').slice(0,42);
  var dot=SCRIPT_PAUSED?'🟠暂停':(STATE.pausedOutside?'🔵保活':'🟢');
  var sceneTag=SMART_RECOGNIZER.label||('已答'+Object.keys(STATE.answered||{}).filter(function(k){return STATE.answered[k];}).length);
  var badgeStr=dot+sceneTag,pauseStr=SCRIPT_PAUSED?'▶ 继续':'⏸ 暂停';
  if(shortText===LAST_FLOAT_STATUS&&badgeStr===_LAST_BADGE_UI&&pauseStr===_LAST_PAUSE_UI)return;
  LAST_FLOAT_STATUS=shortText;_LAST_BADGE_UI=badgeStr;_LAST_PAUSE_UI=pauseStr;
  ui.run(function(){
    try{
      if(FLOAT_WIN.txtBadge)FLOAT_WIN.txtBadge.setText(badgeStr);
      if(FLOAT_WIN.txtStatus)FLOAT_WIN.txtStatus.setText(shortText);
      if(FLOAT_WIN.btnPause)FLOAT_WIN.btnPause.setText(pauseStr);
    }catch(ignore){}});}
function isFloatingPanelArtifact(x,y,pkg,text){
  var clean=String(text||'').trim();
  if(/^写笔记$/.test(clean))return true;
  if(!FLOAT_WIN)return false;
  if(/^章节$|^讨论$|^任务$/.test(clean))return false;
  if(pkg&&pkg!==PKG&&/autojs|chaoxingassistant/i.test(pkg))return true;
  if(FLOAT_BOUNDS.r>FLOAT_BOUNDS.l&&x>=FLOAT_BOUNDS.l-12&&x<=FLOAT_BOUNDS.r+12&&y>=FLOAT_BOUNDS.t-12&&y<=FLOAT_BOUNDS.b+16)return true;
  if(/^(?:学习通助手.*|✨助手Pro.*|🤖.*|\[(?:运行中|已暂停|手动浏览|后台待命)\].*|.*[🟢🟠🔵].*|⚡定位|⏸\s*暂停|▶\s*继续|🎛\s*面板|✕\s*退出|退返出)$/.test(clean))return true;
  if(/学习通助手|已暂停.*点击|运行.*(?:Shizuku|Root|无障碍|已答)|保活.*已答|[oO0⚙🎛]\s*(?:面板|控制台)|[xX✕×]\s*退|退返出|正在初始化极速双引擎/.test(clean))return true;
  return false;}
function initFloatingControlPanel(){
  try{
    if(typeof floaty==='undefined'||!floaty)return;
    var hasFloatPerm=true;
    try{if(typeof floaty.checkPermission==='function')hasFloatPerm=floaty.checkPermission();}catch(ignore){}
    if(!hasFloatPerm){
      try{if(typeof floaty.requestPermission==='function')floaty.requestPermission();}catch(ignore){}
      return;}
    FLOAT_WIN=floaty.rawWindow(
      '<card cardCornerRadius="16dp" cardElevation="10dp" cardBackgroundColor="#F2090D16" padding="6dp">'+
        '<vertical>'+
          '<horizontal id="barHeader" gravity="center_vertical">'+
            '<text id="txtTitle" text="✨助手Pro" textColor="#38BDF8" textSize="10sp" textStyle="bold" paddingRight="5dp"/>'+
            '<text id="txtBadge" text="🟢运行·已答0" textColor="#10B981" textSize="9sp" textStyle="bold" layout_weight="1" maxLines="1" ellipsize="end"/>'+
            '<text id="btnToggle" text="展开" textColor="#38BDF8" bg="#1E293B" textSize="9sp" textStyle="bold" padding="3dp"/>'+
          '</horizontal>'+
          '<vertical id="boxBody" visibility="gone" marginTop="4dp">'+
            '<text id="txtStatus" text="正在初始化极速双引擎与后台保活..." textColor="#F1F5F9" textSize="10sp" maxLines="2" ellipsize="end" bg="#131C2E" padding="5dp"/>'+
            '<horizontal id="barActions" marginTop="5dp" gravity="center_vertical">'+
              '<button id="btnResume" text="⚡定位" textColor="#FFFFFF" bg="#0284C7" textSize="10sp" textStyle="bold" h="27dp" w="52dp" padding="0dp"/>'+
              '<button id="btnPause" text="⏸ 暂停" textColor="#FFFFFF" bg="#4F46E5" textSize="10sp" textStyle="bold" h="27dp" w="52dp" padding="0dp" marginLeft="4dp"/>'+
              '<button id="btnKey" text="🎛 面板" textColor="#FFFFFF" bg="#0D9488" textSize="10sp" textStyle="bold" h="27dp" w="52dp" padding="0dp" marginLeft="4dp"/>'+
              '<button id="btnExit" text="✕ 退出" textColor="#FFFFFF" bg="#E11D48" textSize="10sp" textStyle="bold" h="27dp" w="48dp" padding="0dp" marginLeft="4dp"/>'+
            '</horizontal>'+
          '</vertical>'+
        '</vertical>'+
      '</card>'
    );
    var initX=Math.round(W*0.46),initY=Math.round(H*0.095);
    FLOAT_WIN.setPosition(initX,initY);
    FLOAT_BOUNDS={l:initX,t:initY,r:initX+Math.round(W*0.52),b:initY+Math.round(H*0.042)};
    var collapsed=true,downX=0,downY=0,winX=initX,winY=initY;
    FLOAT_WIN.txtTitle.setOnTouchListener(function(viewObj,event){
      switch(event.getAction()){
        case event.ACTION_DOWN:
          downX=event.getRawX();downY=event.getRawY();
          winX=FLOAT_WIN.getX();winY=FLOAT_WIN.getY();
          return true;
        case event.ACTION_MOVE:
          var nx=Math.max(0,Math.min(W-120,Math.round(winX+(event.getRawX()-downX))));
          var ny=Math.max(40,Math.min(H-90,Math.round(winY+(event.getRawY()-downY))));
          FLOAT_WIN.setPosition(nx,ny);
          FLOAT_BOUNDS={l:nx-8,t:ny-6,r:nx+Math.round(W*0.58),b:ny+Math.round(H*(collapsed?0.065:0.165))};
          return true;}
      return true;});
    FLOAT_WIN.btnToggle.click(function(){
      ui.run(function(){
        collapsed=!collapsed;
        FLOAT_WIN.boxBody.setVisibility(collapsed?8:0);
        FLOAT_WIN.btnToggle.setText(collapsed?'展开':'收起');
        var curX=FLOAT_WIN.getX(),curY=FLOAT_WIN.getY();
        FLOAT_BOUNDS={l:curX-8,t:curY-6,r:curX+Math.round(W*0.58),b:curY+Math.round(H*(collapsed?0.065:0.165))};
      });});
    FLOAT_WIN.btnResume.click(function(){
      SCRIPT_PAUSED=false;
      STORE.put('chapterResumeEpoch',Number(STORE.get('chapterResumeEpoch',0)||0)+1);
      STORE.put('videoRetryEpoch',Number(STORE.get('videoRetryEpoch',0)||0)+1);
      STATE.blocked='';STATE.navBlocked='';STATE.afterSubmit=false;STATE.dirSweepCount=0;
      cxLog('已触发继续与章节重定位');});
    FLOAT_WIN.btnPause.click(function(){
      SCRIPT_PAUSED=!SCRIPT_PAUSED;
      if(SCRIPT_PAUSED)restoreMediaVolume();
      updateFloatingStatus(SCRIPT_PAUSED?'已手动暂停，点击【继续】恢复':'已恢复自动巡航运行');});
    FLOAT_WIN.btnKey.click(function(){
      openVisualControlCenter(false);});
    FLOAT_WIN.btnExit.click(function(){
      releaseBackgroundKeepAlive();
      exit();});
  }catch(ignore){}}
function runShellCmd(cmd){
  try{
    if(NO_AX_BACKEND==='shizuku'&&typeof shizuku==='function'){
      return shizuku(cmd);}
    if(NO_AX_BACKEND==='shizuku'&&typeof shizuku==='object'&&shizuku&&typeof shizuku.execCommand==='function'){
      return shizuku.execCommand(cmd);}
    if(NO_AX_BACKEND==='root'){
      return shell(cmd,true);}
    return {code:-1,result:''};
  }catch(e){
    return {code:-1,result:'',error:String(e)};}}
function detectShellBackend(){
  try{
    if(typeof shizuku!=='undefined'&&shizuku){
      var alive=false;
      try{alive=typeof shizuku.isAlive==='function'?shizuku.isAlive():true;}catch(ignore){}
      if(alive){
        var hasPerm=false;
        try{hasPerm=typeof shizuku.hasPermission==='function'?shizuku.hasPermission():true;}catch(ignore){hasPerm=true;}
        if(!hasPerm&&!SHIZUKU_REQ_TRIED){
          SHIZUKU_REQ_TRIED=true;
          try{if(typeof shizuku.requestPermission==='function')shizuku.requestPermission();}catch(ignore){}
          sleep(600);
          try{hasPerm=typeof shizuku.hasPermission==='function'?shizuku.hasPermission():false;}catch(ignore){}
        }
        if(hasPerm){
          NO_AX_BACKEND='shizuku';
          return 'shizuku';}}}
  }catch(ignore){}
  NO_AX_BACKEND='';
  return '';}
function getExecutionMode(){
  try{
    if(typeof auto!=='undefined'&&auto&&auto.service){
      NO_AX_BACKEND='';
      return 'accessibility';}
  }catch(ignore){}
  if(NO_AX_BACKEND)return NO_AX_BACKEND;
  return detectShellBackend();}
var SCREEN_CAPTURE_LAST_REQ_AT=0;
function ensureScreenCapture(){
  if(SCREEN_CAPTURE_READY)return true;
  var nowSc=Date.now();
  if(SCREEN_CAPTURE_LAST_REQ_AT&&nowSc-SCREEN_CAPTURE_LAST_REQ_AT<12000)return false;
  SCREEN_CAPTURE_LAST_REQ_AT=nowSc;
  if(NO_AX_BACKEND){
    try{
      var hostPkg=String(context.getPackageName()||'org.autojs.autojs6');
      runShellCmd('appops set '+hostPkg+' PROJECT_MEDIA allow >/dev/null 2>&1');
    }catch(ignore){}}
  try{
    threads.start(function(){
      sleep(620);
      try{
        if(typeof auto!=='undefined'&&auto&&auto.service&&typeof textMatches==='function'){
          var btn=textMatches(/^(?:立即开始|允许|开始录制|确定)$/).findOnce();
          if(btn&&btn.click())return;}
      }catch(ignore){}
    });
    if(images.requestScreenCapture()){
      SCREEN_CAPTURE_READY=true;
      sleep(220);
      return true;}
  }catch(ignore){}
  return false;}
function decodeXmlEntities(str){
  return String(str||'')
    .replace(/&#(\d+);/g,function(_,d){return String.fromCharCode(parseInt(d,10));})
    .replace(/&#x([0-9a-fA-F]+);/g,function(_,h){return String.fromCharCode(parseInt(h,16));})
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
}
function safeSetClip(val){
  var str=String(val||'');
  try{setClip(str);return true;}catch(ignore){}
  try{
    var cm=context.getSystemService(android.content.Context.CLIPBOARD_SERVICE);
    var clip=android.content.ClipData.newPlainText('text',str);
    cm.setPrimaryClip(clip);
    return true;
  }catch(ignore){return false;}}
function makeBounds(l,t,r,b){
  return {
    left:l,top:t,right:r,bottom:b,
    width:function(){return r-l;},
    height:function(){return b-t;},
    centerX:function(){return Math.round((l+r)/2);},
    centerY:function(){return Math.round((t+b)/2);}};}
function wrapNodeList(arr){
  var list=arr?arr.slice():[];
  list.empty=function(){return list.length===0;};
  list.nonEmpty=function(){return list.length>0;};
  list.size=function(){return list.length;};
  list.get=function(i){return list[i];};
  return list;}
var UI_CACHE={at:0,nodes:[],failUntil:0,consecFails:0};
var FG_CACHE={at:0,pkg:''};
function invalidateUiCache(){
  UI_CACHE.at=0;
  UI_CACHE.nodes=[];}
function createXmlNode(attrs,parentNode){
  var bMatch=String(attrs.bounds||'').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  var l=bMatch?Number(bMatch[1]):0,t=bMatch?Number(bMatch[2]):0,r=bMatch?Number(bMatch[3]):0,b=bMatch?Number(bMatch[4]):0;
  var bObj=makeBounds(l,t,r,b);
  var nodeObj={
    _text:decodeXmlEntities(attrs.text||''),
    _desc:decodeXmlEntities(attrs['content-desc']||''),
    _id:decodeXmlEntities(attrs['resource-id']||''),
    _cls:decodeXmlEntities(attrs['class']||''),
    _pkg:decodeXmlEntities(attrs['package']||''),
    _clickable:attrs.clickable==='true',
    _enabled:attrs.enabled!=='false',
    _checked:attrs.checked==='true',
    _selected:attrs.selected==='true',
    _scrollable:attrs.scrollable==='true',
    _editable:attrs.editable==='true'||/EditText/i.test(attrs['class']||''),
    _focused:attrs.focused==='true',
    _visible:attrs['visible-to-user']!=='false'&&r>l&&b>t,
    _bounds:bObj,
    _parent:parentNode||null,
    _children:[],
    text:function(){return this._text;},
    desc:function(){return this._desc;},
    id:function(){return this._id;},
    className:function(){return this._cls;},
    packageName:function(){return this._pkg;},
    clickable:function(){return this._clickable;},
    enabled:function(){return this._enabled;},
    checked:function(){return this._checked;},
    selected:function(){return this._selected;},
    scrollable:function(){return this._scrollable;},
    editable:function(){return this._editable;},
    focused:function(){return this._focused;},
    visibleToUser:function(){return this._visible;},
    bounds:function(){return this._bounds;},
    parent:function(){return this._parent;},
    children:function(){return wrapNodeList(this._children);},
    childCount:function(){return this._children.length;},
    child:function(i){return this._children[i]||null;},
    click:function(){
      var cx=this._bounds.centerX(),cy=this._bounds.centerY();
      if(cx<=0||cy<=0)return false;
      invalidateUiCache();
      var res=runShellCmd('input tap '+cx+' '+cy);
      return !!(res&&Number(res.code)===0);
    },
    scrollForward:function(){
      var cx=this._bounds.centerX();
      var y1=Math.round(this._bounds.top+this._bounds.height()*0.76);
      var y2=Math.round(this._bounds.top+this._bounds.height()*0.24);
      invalidateUiCache();
      var res=runShellCmd('input swipe '+cx+' '+y1+' '+cx+' '+y2+' 260');
      return !!(res&&Number(res.code)===0);
    },
    scrollBackward:function(){
      var cx=this._bounds.centerX();
      var y1=Math.round(this._bounds.top+this._bounds.height()*0.24);
      var y2=Math.round(this._bounds.top+this._bounds.height()*0.76);
      invalidateUiCache();
      var res=runShellCmd('input swipe '+cx+' '+y1+' '+cx+' '+y2+' 260');
      return !!(res&&Number(res.code)===0);
    },
    setText:function(val){
      var cx=this._bounds.centerX(),cy=this._bounds.centerY(),str=String(val||'');
      invalidateUiCache();
      safeSetClip(str);
      if(NO_AX_BACKEND){
        if(!this._focused){
          runShellCmd('input tap '+cx+' '+cy);
          sleep(220);}
        var res=runShellCmd('input keyevent 279');
        invalidateUiCache();
        this._text=str;
        return !!(res&&Number(res.code)===0);}
      if(this._raw&&typeof this._raw.performAction==='function'){
        try{
          var bundle=new android.os.Bundle();
          bundle.putCharSequence('ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE',str);
          if(this._raw.performAction(2097152,bundle)){this._text=str;return true;}
        }catch(ignore){}}
      return false;}};
  if(parentNode)parentNode._children.push(nodeObj);
  return nodeObj;}
function parseUiXml(xml){
  var list=[],stack=[];
  var tagRe=/<(\/?)node\b([^>]*)>/g,m;
  while((m=tagRe.exec(xml))){
    var isClose=m[1]==='/';
    var attrStr=m[2]||'';
    if(isClose){
      if(stack.length)stack.pop();
      continue;}
    var selfClose=/\/\s*$/.test(attrStr);
    var attrs={},am,attrRe=/([\w-]+)="([^"]*)"/g;
    while((am=attrRe.exec(attrStr))){
      attrs[am[1]]=am[2];}
    var parentNode=stack.length?stack[stack.length-1]:null;
    var node=createXmlNode(attrs,parentNode);
    list.push(node);
    if(!selfClose)stack.push(node);}
  return list;}
function fetchUiNodes(){
  var now=Date.now();
  if(now-UI_CACHE.at<260&&UI_CACHE.nodes.length)return UI_CACHE.nodes;
  if(now<UI_CACHE.failUntil)return [];
  var dumpPath='/data/local/tmp/cx_ui.xml';
  var isL=land();
  var tSec=isL?1:3;
  var res=runShellCmd('timeout '+tSec+' uiautomator dump --compressed '+dumpPath+' >/dev/null 2>&1 && cat '+dumpPath);
  var xml=res?String(res.result||res.out||''):'';
  var idx=xml.indexOf('<hierarchy');
  if(idx<0){
    UI_CACHE.consecFails=(UI_CACHE.consecFails||0)+1;
    UI_CACHE.failUntil=now+(isL?10000:450);
    return [];}
  UI_CACHE.consecFails=0;
  var parsed=parseUiXml(xml.slice(idx));
  UI_CACHE.at=Date.now();
  UI_CACHE.nodes=parsed;
  return parsed;}
function makeQuery(filterFn){
  var preds=[filterFn];
  var q={
    id:function(v){preds.push(function(n){return n.id()===v||n.id()===PKG+':id/'+v;});return q;},
    text:function(v){preds.push(function(n){return n.text()===v;});return q;},
    textMatches:function(re){var r=re instanceof RegExp?re:new RegExp(String(re));preds.push(function(n){return r.test(n.text());});return q;},
    descMatches:function(re){var r=re instanceof RegExp?re:new RegExp(String(re));preds.push(function(n){return r.test(n.desc());});return q;},
    className:function(v){preds.push(function(n){return n.className()===v;});return q;},
    classNameMatches:function(re){var r=re instanceof RegExp?re:new RegExp(String(re));preds.push(function(n){return r.test(n.className());});return q;},
    clickable:function(b){var want=b===undefined?true:!!b;preds.push(function(n){return n.clickable()===want;});return q;},
    editable:function(b){var want=b===undefined?true:!!b;preds.push(function(n){return n.editable()===want;});return q;},
    scrollable:function(b){var want=b===undefined?true:!!b;preds.push(function(n){return n.scrollable()===want;});return q;},
    find:function(){
      if(!NO_AX_BACKEND){
        try{
          if(typeof auto!=='undefined'&&auto&&auto.service){
            var s=selector();
            return wrapNodeList([]);}
        }catch(ignore){}}
      var all=fetchUiNodes();
      var matched=all.filter(function(n){
        return preds.every(function(fn){return !fn||fn(n);});});
      return wrapNodeList(matched);
    },
    findOnce:function(){
      var list=this.find();
      return list.length?list[0]:null;}};
  return q;}
function cxSelector(){
  if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service&&typeof selector==='function'){
    try{return selector();}catch(ignore){}}
  return makeQuery(null);}
function cxId(v){
  if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service&&typeof id==='function'){
    try{return id(v);}catch(ignore){}}
  return makeQuery(function(n){return n.id()===v||n.id()===PKG+':id/'+v;});}
function cxTextMatches(re){
  if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service&&typeof textMatches==='function'){
    try{return textMatches(re);}catch(ignore){}}
  var r=re instanceof RegExp?re:new RegExp(String(re));
  return makeQuery(function(n){return r.test(n.text());});}
function cxDescMatches(re){
  if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service&&typeof descMatches==='function'){
    try{return descMatches(re);}catch(ignore){}}
  var r=re instanceof RegExp?re:new RegExp(String(re));
  return makeQuery(function(n){return r.test(n.desc());});}
function cxClassName(v){
  if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service&&typeof className==='function'){
    try{return className(v);}catch(ignore){}}
  return makeQuery(function(n){return n.className()===v;});}
function screenSize(){
  var dw=device.width||1080,dh=device.height||2400;
  if(land())return {w:Math.max(dw,dh),h:Math.min(dw,dh)};
  return {w:Math.min(dw,dh),h:Math.max(dw,dh)};}
function pointOnScreen(x,y,size){
  var s=size||screenSize();
  var sw=s.w||W,sh=s.h||H;
  return x>=4&&x<=sw-4&&y>=4&&y<=sh-4;}
function foregroundPackage(){
  var now=Date.now();
  if(now-FG_CACHE.at<1200&&FG_CACHE.pkg===PKG)return PKG;
  if(!NO_AX_BACKEND){
    try{
      if(typeof currentPackage==='function'){
        var cp=String(currentPackage()||'').trim();
        if(cp===PKG){FG_CACHE={at:now,pkg:PKG};return PKG;}
        if(cp){
          // 悬浮窗/系统状态栏/输入法/Toast 引起的瞬时包名抖动：先核对学习通控件是否仍在屏幕前景
          try{
            if(typeof packageName==='function'&&packageName(PKG).findOnce()){
              FG_CACHE={at:now,pkg:PKG};
              return PKG;}
          }catch(ignore){}
          if(/systemui|inputmethod|sogou|baidu|iflytek|ime|float|autojs/i.test(cp)){
            try{
              var cxUi=cxTextMatches(/^(?:章节|讨论|任务点|上一节|下一节|提交|答题卡|倍速)$/).findOnce();
              if(cxUi&&cxUi.visibleToUser()){FG_CACHE={at:now,pkg:PKG};return PKG;}
            }catch(ignore){}}
          return cp;}}
    }catch(ignore){}}
  try{
    var res=runShellCmd('dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp"');
    var out=res?String(res.result||res.out||''):'';
    if(out.indexOf(PKG)>=0){
      FG_CACHE={at:now,pkg:PKG};
      return PKG;}
    var m=out.match(/([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)\//);
    if(m)return m[1];
  }catch(ignore){}
  return FG_CACHE.pkg||PKG;}
function bringChaoxingToFront(){
  try{
    if(NO_AX_BACKEND){
      runShellCmd('monkey -p '+PKG+' -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1');
      FG_CACHE.at=0;
      return true;}
    if(typeof app!=='undefined'&&app.launchPackage){
      app.launchPackage(PKG);
      FG_CACHE.at=0;
      return true;}
  }catch(ignore){}
  return false;}
function requireLearningApp(){
  if(SCRIPT_PAUSED)throw Error('CX_BACKGROUND_PAUSED');
  var pkg=foregroundPackage();
  if(pkg&&pkg!==PKG)throw Error('CX_BACKGROUND_PAUSED');}
function tap(x,y){
  requireLearningApp();
  var size=screenSize();
  var rx=Math.round(x),ry=Math.round(y);
  if(!pointOnScreen(rx,ry,size))return false;
  invalidateUiCache();
  if(NO_AX_BACKEND){
    var res=runShellCmd('input tap '+rx+' '+ry);
    return !!(res&&Number(res.code)===0);}
  try{if(typeof click==='function')return !!click(rx,ry);}catch(ignore){}
  var rFallback=runShellCmd('input tap '+rx+' '+ry);
  return !!(rFallback&&Number(rFallback.code)===0);}
function tapLandscape(x,y){
  requireLearningApp();
  var pw=Math.max(W,H),ph=Math.min(W,H);
  var rx=Math.round(x),ry=Math.round(y);
  if(rx<4||rx>pw-4||ry<4||ry>ph-4)return false;
  invalidateUiCache();
  if(NO_AX_BACKEND){
    var res=runShellCmd('input tap '+rx+' '+ry);
    return !!(res&&Number(res.code)===0);}
  try{if(typeof click==='function')return !!click(rx,ry);}catch(ignore){}
  var rFallback=runShellCmd('input tap '+rx+' '+ry);
  return !!(rFallback&&Number(rFallback.code)===0);}
function doSwipe(x1,y1,x2,y2,dur){
  requireLearningApp();
  var rx1=Math.round(x1),ry1=Math.round(y1),rx2=Math.round(x2),ry2=Math.round(y2),d=Math.max(120,Math.round(dur||260));
  invalidateUiCache();
  if(NO_AX_BACKEND){
    var res=runShellCmd('input swipe '+rx1+' '+ry1+' '+rx2+' '+ry2+' '+d);
    return !!(res&&Number(res.code)===0);}
  try{if(typeof swipe==='function')return !!swipe(rx1,ry1,rx2,ry2,d);}catch(ignore){}
  var rFallback=runShellCmd('input swipe '+rx1+' '+ry1+' '+rx2+' '+ry2+' '+d);
  return !!(rFallback&&Number(rFallback.code)===0);}
function safeBack(){
  requireLearningApp();
  UI_CACHE.failUntil=0;
  invalidateUiCache();
  if(NO_AX_BACKEND){
    var res=runShellCmd('input keyevent 4');
    return !!(res&&Number(res.code)===0);}
  try{if(typeof back==='function')return !!back();}catch(ignore){}
  var rFallback=runShellCmd('input keyevent 4');
  return !!(rFallback&&Number(rFallback.code)===0);}
function cxPress(item){
  if(!item)return false;
  requireLearningApp();
  if(item.node){
    try{
      var n=item.node;
      if(n.clickable()&&n.click())return true;
      var p=n.parent();
      for(var i=0;i<3&&p;i++,p=p.parent()){
        var pb=p.bounds();
        if(p.clickable()&&pb&&pb.height()<H*0.18&&Math.abs(pb.centerY()-item.y)<H*0.06){
          if(p.click())return true;}}
    }catch(ignore){}}
  return tap(item.x,item.y);}
function cxFind(v,re,minY){
  var r=re instanceof RegExp?re:new RegExp(String(re));
  return v.n.filter(function(n){
    return n.y>(minY||0)&&r.test(n.t.trim());
  })[0]||null;}
function isImageAlive(im){
  if(!im)return false;
  try{
    if(typeof im.isRecycled==='function'&&im.isRecycled())return false;
    return im.getWidth()>0&&im.getHeight()>0;
  }catch(e){return false;}}
function safeRecycle(im){
  if(!im||!im.__cxCloned)return;
  try{if(typeof im.recycle==='function')im.recycle();}catch(ignore){}}
function recordImageOrientation(im){
  if(isImageAlive(im)){
    STATE.lastImageLandscape=SMART_RECOGNIZER.isImageLandscape(im);
    STATE.lastImageAt=Date.now();}
  return im;}
function picture(){
  var wait=80-(Date.now()-STATE.lastShotAt);
  if(wait>0)sleep(wait);
  STATE.lastShotAt=Date.now();
  try{
    if(!ensureScreenCapture())return null;
    var im=images.captureScreen();
    if(isImageAlive(im))return recordImageOrientation(im);
  }catch(ignore){}
  return null;}
function land(forceRefresh){
  try{
    var dm=context.getSystemService(android.content.Context.DISPLAY_SERVICE);
    if(dm&&dm.getDisplay){
      var d=dm.getDisplay(0);
      if(d&&typeof d.getRotation==='function'){
        var drot=Number(d.getRotation());
        if(drot===1||drot===3)return true;
        if((drot===0||drot===2)&&!STATE.video)return false;}}
  }catch(ignore){}
  try{
    var wm=context.getSystemService(android.content.Context.WINDOW_SERVICE);
    if(wm&&wm.getDefaultDisplay){
      var rot=Number(wm.getDefaultDisplay().getRotation());
      if(rot===1||rot===3)return true;
      if((rot===0||rot===2)&&!STATE.video)return false;}
  }catch(ignore){}
  if(forceRefresh&&STATE.video){
    var probe=picture();
    if(probe)try{safeRecycle(probe);}catch(ignore){}}
  if(STATE.lastImageAt&&Date.now()-STATE.lastImageAt<5000)return !!STATE.lastImageLandscape;
  try{
    var conf=context.getResources().getConfiguration();
    if(conf&&conf.orientation===2)return true;
  }catch(ignore){}
  try{return device.width>device.height;}catch(ignore){return false;}}
var CHAPTER=(function(){
  var state={
    mode:'idle',
    target:null,
    suspendUntil:0,
    lastEpoch:Number(STORE.get('chapterResumeEpoch',0))||0};
  return {
    guardArrival:function(){
      if(Date.now()<state.suspendUntil)return true;
      return false;
    },
    suspendEvents:function(){
      state.suspendUntil=Date.now()+400;
    },
    resumePending:function(elapsed){
      if(state.suspendUntil>0)state.suspendUntil=Math.max(0,state.suspendUntil-elapsed);
    },
    startReturn:function(target){
      state.mode='returning';
      state.target=target;
    },
    returnToChapter:function(target){
      var t=target||state.target;
      if(!t)return {type:'none'};
      var v=view();
      if(isChapterContent(v)){
        var h=readChapterHeading(v);
        if(!h||h.t.indexOf(t.number)>=0){
          state.mode='idle';state.target=null;
          return {type:'entered'};}}
      var numRe=t.number?new RegExp('(?:^|\\D)'+String(t.number).replace(/\./g,'\\.')+'(?:\\D|$)'):null;
      var row=v.n.filter(function(n){
        if(n.y<=H*0.14||n.y>=H*0.93)return false;
        if(numRe&&numRe.test(n.t))return true;
        if(t.title&&t.title.length>=2&&n.t.replace(/\s+/g,'').indexOf(t.title.slice(0,4))>=0)return true;
        return false;
      })[0];
      if(row&&(tap(Math.round(W*0.48),row.y)||cxPress(row))){
        state.mode='idle';state.target=null;
        return {type:'entered'};}
      t.tries=(t.tries||0)+1;
      if(t.tries>6){
        state.mode='idle';state.target=null;
        return {type:'hold',reason:'目录中暂未定位到章节 '+t.number};}
      doSwipe(Math.round(W*0.08),Math.round(H*0.65),Math.round(W*0.08),Math.round(H*0.35),520);
      return {type:'searching'};}};
})();
function findDirectoryChapterRows(v){
  if(!v||!v.n)return [];
  var rows=[];
  v.n.forEach(function(n){
    if(n.y<=H*0.16||n.y>=H*0.94)return;
    var m=n.t.trim().match(/(?:^|\s)(\d+(?:\.\d+)+)(?:\s*(\S.*))?$/);
    if(m){
      var num=m[1],titlePart=m[2]||'';
      if(!titlePart){
        var sameLine=v.n.filter(function(z){return z!==n&&Math.abs(z.y-n.y)<H*0.024&&z.x>n.x&&!/^\d+$/.test(z.t.trim());})[0];
        if(sameLine)titlePart=sameLine.t.trim();}
      if(!rows.some(function(r){return r.num===num||Math.abs(r.y-n.y)<H*0.025;})){
        rows.push({num:num,t:num+' '+titlePart,x:Math.round(W*0.48),y:n.y,node:n.node});}}});
  rows.sort(function(a,b){return a.y-b.y;});
  return rows;}
function isDirectoryPage(v){
  if(!v||!v.n)return false;
  if(v.n.some(function(n){return /^讨论$/.test(n.t.trim())&&n.y<H*0.12&&n.x>W*0.75;}))return false;
  if(/上一节|下一节|下一讲|观看时长|完成条件|未完成任务点前|任务点已完成|写笔记|章节测验|本次得分|最终得分|我的答案|正确答案|单选题|多选题|判断题|填空题/.test(v.s))return false;
  if(v.n.some(function(n){return /^任务点/.test(n.t.trim())&&n.x<W*0.35;}))return false;
  if(/知识图谱|说明.*章节中阅读|说明.*有效阅读时长|计入有效|章节列表|课程章节/.test(v.s))return true;
  var hasDirTabs=v.n.some(function(n){return /^任务$/.test(n.t.trim())&&n.y>H*0.09&&n.y<H*0.17&&n.x<W*0.25;})&&
                 v.n.some(function(n){return /^(?:知识图谱|更多)$/.test(n.t.trim())&&n.y>H*0.09&&n.y<H*0.17;});
  if(hasDirTabs)return true;
  var rows=findDirectoryChapterRows(v);
  return rows.length>=3;}
function hasOrangeBadgeAtRowY(im,rowY){
  if(!isImageAlive(im))return false;
  try{
    var iw=im.getWidth(),ih=im.getHeight();
    var ry=Math.round(rowY*ih/H);
    var orangeCount=0;
    for(var dy=-20;dy<=20;dy+=3){
      var py=ry+dy;
      if(py<=0||py>=ih)continue;
      var xRanges=[[0.035,0.135],[0.80,0.96]];
      for(var ri=0;ri<xRanges.length;ri++){
        for(var xr=xRanges[ri][0];xr<=xRanges[ri][1];xr+=0.008){
          var c=images.pixel(im,Math.round(iw*xr),py);
          var cr=(c>>16)&255,cg=(c>>8)&255,cb=c&255;
          if(cr>205&&cg>85&&cg<215&&cb<110&&(cr-cb)>=95){
            orangeCount++;
            if(orangeCount>=2)return true;}}}}
  }catch(ignore){}
  return false;}
function findAllOrangeBadgeYs(im){
  if(!isImageAlive(im))return [];
  var out=[];
  try{
    var iw=im.getWidth(),ih=im.getHeight(),rawYs=[];
    for(var y=Math.round(ih*0.20);y<Math.round(ih*0.94);y+=3){
      var hits=0;
      var xRanges=[[0.035,0.135],[0.82,0.96]];
      for(var ri=0;ri<xRanges.length;ri++){
        for(var xr=xRanges[ri][0];xr<=xRanges[ri][1];xr+=0.008){
          var c=images.pixel(im,Math.round(iw*xr),y);
          var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
          if(r>205&&g>85&&g<215&&b<110&&(r-b)>=95)hits++;}}
      if(hits>=2)rawYs.push(y);}
    var clusters=[];
    for(var i=0;i<rawYs.length;i++){
      var ry=rawYs[i];
      if(!clusters.length||ry-clusters[clusters.length-1][clusters[clusters.length-1].length-1]>Math.round(ih*0.028)){
        clusters.push([ry]);
      }else{
        clusters[clusters.length-1].push(ry);}}
    for(var ci=0;ci<clusters.length;ci++){
      if(clusters[ci].length>=2){
        var sum=0;
        for(var k=0;k<clusters[ci].length;k++)sum+=clusters[ci][k];
        out.push(Math.round((sum/clusters[ci].length)*H/ih));}}
  }catch(ignore){}
  return out;}
function scanUnfinishedChapters(existingView){
  var v=existingView||view();
  if(!isDirectoryPage(v)||pagerInfo(v)||quizSubmitButton(v))return false;
  var rows=findDirectoryChapterRows(v);
  var im=picture();
  var targetRow=null;
  STATE.dirRowVisits=STATE.dirRowVisits||{};
  try{
    if(im){
      var priorNum=(STATE.workChapter&&STATE.workChapter.number?STATE.workChapter.number:STATE.quizContext)||RESUME_CHAPTER;
      var skipDirTitleRe=/^(?:\d+(?:\.\d+)*\s*)?(?:PPT|课件|文献阅读|课外阅读|拓展阅读|参考资料|讨论)(?:[（(].*[)）])?$/i;
      if(priorNum){
        var priorRow=rows.filter(function(r){return r.num===priorNum;})[0];
        if(priorRow&&hasOrangeBadgeAtRowY(im,priorRow.y)&&(STATE.dirRowVisits[priorRow.num]||0)<2&&!(CFG.onlyVideoQuiz&&skipDirTitleRe.test(priorRow.t))){
          targetRow=priorRow;}}
      if(!targetRow){
        for(var i=0;i<rows.length;i++){
          var rk=rows[i].num||rows[i].t;
          if(CFG.onlyVideoQuiz&&skipDirTitleRe.test(rows[i].t))continue;
          if(hasOrangeBadgeAtRowY(im,rows[i].y)&&(STATE.dirRowVisits[rk]||0)<1){
            targetRow=rows[i];
            break;}}}
      if(!targetRow){
        var badgeYs=findAllOrangeBadgeYs(im);
        for(var bi=0;bi<badgeYs.length;bi++){
          var by=badgeYs[bi];
          var nearNode=v.n.filter(function(n){
            return Math.abs(n.y-by)<H*0.032&&n.x>W*0.14&&!/^(?:任务|知识图谱|章节|更多|客服|\d+)$/.test(n.t.trim());
          })[0];
          var label=nearNode?nearNode.t.trim():('行Y='+by);
          if(CFG.onlyVideoQuiz&&skipDirTitleRe.test(label))continue;
          var key=nearNode?nearNode.t.replace(/\s+/g,'').slice(0,16):('y_'+Math.round(by/45));
          if((STATE.dirRowVisits[key]||0)<1){
            targetRow={num:key,t:label,x:Math.round(W*0.48),y:by};
            break;}}}}
  }catch(ignore){}
  finally{try{if(im)safeRecycle(im);}catch(ignore){}}
  if(!targetRow&&rows.length){
    var skipDirRe=/^(?:\d+(?:\.\d+)*\s*)?(?:PPT|课件|文献阅读|课外阅读|拓展阅读|参考资料)(?:[（(].*[)）])?$/i;
    var pNum=STATE.workChapter&&STATE.workChapter.number?STATE.workChapter.number:STATE.quizContext;
    var pIdx=-1;
    if(pNum){
      for(var ri=0;ri<rows.length;ri++){
        if(rows[ri].num===pNum){pIdx=ri;break;}}}
    if(pIdx>=0){
      for(var ni=pIdx+1;ni<rows.length;ni++){
        var cand=rows[ni],ck=cand.num||cand.t;
        if(CFG.onlyVideoQuiz&&skipDirRe.test(cand.t))continue;
        if((STATE.dirRowVisits[ck]||0)<1){
          targetRow=cand;
          cxLog('目录识字定位：在 '+pNum+' 下方识别到下一章节 '+cand.t.slice(0,22));
          break;}}}}
  if(targetRow&&tap(Math.round(W*0.48),targetRow.y)){
    STATE.dirScrollStill=0;STATE.dirScrollUp=false;STATE.dirSweepCount=0;
    var visitKey=targetRow.num||targetRow.t;
    STATE.dirRowVisits[visitKey]=(STATE.dirRowVisits[visitKey]||0)+1;
    STATE.answered={};STATE.countedQuizIds={};STATE.choiceAttempted={};STATE.multipleConfirmed={};STATE.multipleExpected={};STATE.multipleFailures={};
    STATE.shortSaved={};STATE.shortAttempted={};STATE.scanDrafts={};STATE.scanFailures={};
    STATE.pageRecheckCount={};STATE.backtrackTries={};STATE.workTotal=0;
    STATE.quizPending=false;STATE.afterSubmit=false;STATE.awaitingSubmitResult=false;STATE.lastAnswerView=null;STATE.preloadedQuizView=null;
    STATE.videoFinishedKeys={};STATE.hadCurrentTask=false;STATE.completionRefreshed=false;
    STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.chapterFullScanDone=false;
    if(/^\d+(?:\.\d+)+$/.test(String(targetRow.num||'')))saveResumeChapter(targetRow.num);
    cxLog('目录扫描：进入未完成章节 '+targetRow.t.slice(0,24));
    sleep(550);
    return true;}
  if(Date.now()-(STATE.lastDirScrollAt||0)>900){
    STATE.lastDirScrollAt=Date.now();
    var rowSummary=rows.slice(0,4).map(function(r){return r.num;}).join(',');
    var dirSig=quizViewportSignature(v);
    if(dirSig===STATE.lastDirSig)STATE.dirScrollStill=(STATE.dirScrollStill||0)+1;
    else STATE.dirScrollStill=0;
    STATE.lastDirSig=dirSig;
    if(STATE.dirScrollStill>=2){
      STATE.dirScrollStill=0;
      STATE.dirScrollUp=!STATE.dirScrollUp;
      if(!STATE.dirScrollUp){
        STATE.dirSweepCount=(STATE.dirSweepCount||0)+1;
        if(STATE.dirSweepCount>=2){
          STATE.dirSweepCount=0;
          var doneMsg='全课巡检完成！'+buildSessionSummary().replace(/\n/g,' | ');
          cxLog(doneMsg);
          toast(doneMsg);
          try{if(typeof device!=='undefined'&&device.vibrate)device.vibrate(250);}catch(ignore){}
          SCRIPT_PAUSED=true;
          updateFloatingStatus('已全部完成，点击继续可重新巡检');
          return true;}
        STATE.dirRowVisits={};}}
    if(STATE.dirScrollUp){
      doSwipe(Math.round(W*0.48),Math.round(H*0.36),Math.round(W*0.48),Math.round(H*0.70),320);
      cxLog('已达目录底部，向上回扫查找未完成章节'+(rowSummary?('（识字:'+rowSummary+'）'):''));
    }else{
      doSwipe(Math.round(W*0.48),Math.round(H*0.70),Math.round(W*0.48),Math.round(H*0.36),320);
      cxLog('当前目录屏未见待办章节，向下滑动查找未完成章节'+(rowSummary?('（识字:'+rowSummary+'）'):''));}
    sleep(280);
    return true;}
  return false;}
function circleSelected(im,cx,cy,size){
  if(!im)return false;
  try{
    var s=size||screenSize(),sw=s.w||W,sh=s.h||H;
    var iw=im.getWidth(),ih=im.getHeight();
    var px=Math.round(cx*iw/sw),py=Math.round(cy*ih/sh);
    var rad=Math.max(8,Math.round(iw*0.022));
    var ringBlue=0,ringWhite=0,totalRing=0;
    for(var dy=-rad;dy<=rad;dy+=2){
      for(var dx=-rad;dx<=rad;dx+=2){
        var distSq=dx*dx+dy*dy;
        var x=px+dx,y=py+dy;
        if(x<0||y<0||x>=iw||y>=ih)continue;
        var c=images.pixel(im,x,y);
        var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
        var isBlue=(r<115&&g>95&&b>175&&b>r+55);
        var isWhite=(r>205&&g>205&&b>205);
        if(distSq>=rad*rad*0.18&&distSq<=rad*rad*0.85){
          totalRing++;
          if(isBlue)ringBlue++;
          else if(isWhite)ringWhite++;}}}
    return totalRing>0&&ringBlue/totalRing>=0.50&&ringBlue>ringWhite;
  }catch(ignore){return false;}}
function blueChoice(im,nodeObj,size){
  if(!im||!nodeObj)return false;
  var s=size||screenSize(),sw=s.w||W;
  if(nodeObj.x>sw*0.03&&nodeObj.x<sw*0.16){
    if(circleSelected(im,nodeObj.x,nodeObj.y,s))return true;}
  return circleSelected(im,Math.round(sw*0.055),nodeObj.y,s)||
    circleSelected(im,Math.round(sw*0.084),nodeObj.y,s)||
    circleSelected(im,Math.round(sw*0.106),nodeObj.y,s);
}
function hasOptionIconAt(im,y,size){
  if(!im)return false;
  try{
    var s=size||screenSize(),sw=s.w||W,sh=s.h||H;
    var iw=im.getWidth(),ih=im.getHeight();
    var py=Math.round(y*ih/sh);
    var rad=Math.max(10,Math.round(iw*0.026));
    var centers=[Math.round(0.084*iw),Math.round(0.106*iw)];
    for(var ci=0;ci<centers.length;ci++){
      var px=centers[ci],blueCount=0;
      for(var dy=-rad;dy<=rad;dy+=3){
        for(var dx=-rad;dx<=rad;dx+=3){
          var x=px+dx,yy=py+dy;
          if(x<0||yy<0||x>=iw||yy>=ih)continue;
          var c=images.pixel(im,x,yy);
          var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
          if(r<145&&g>105&&b>175&&b>r+40)blueCount++;}}
      if(blueCount>=4)return true;}
    return false;
  }catch(ignore){return false;}}
function isCompactOptionRowText(t){
  var s=String(t||'').trim();
  if(!s||/^(?:[AB]型|[AB]超|B细胞|B淋巴|C反应|G蛋白|H离子|ADH|ATP|ADP|AMP|DNA|RNA|BMI|WHO|ICU|Rh)/i.test(s))return false;
  return /^\s*([A-H])(?:\s*[.．、:：)）]\s*|\s+|(?=[\u4e00-\u9fff（(《“"√×+-]))(\S[\s\S]{0,219})$/i.test(s);
}
function matchCompactOptionRow(t){
  var s=String(t||'').trim();
  if(!isCompactOptionRowText(s))return null;
  return s.match(/^\s*([A-H])(?:\s*[.．、:：)）]\s*|\s+|(?=[\u4e00-\u9fff（(《“"√×+-]))(\S[\s\S]{0,219})$/i);
}
function repairMissingOptionLettersInView(out,size,im){
  try{
    var sw=size.w||W,sh=size.h||H;
    var qHeadNodes=out.filter(function(n){
      return n.y>sh*0.08&&n.y<sh*0.92&&(/(?:^|\b|\d\s*[.．、]?\s*[\[(（]?)(?:单选|多选|判断|填空|简答|问答|名词解释|论述)题?/.test(n.t)||(!/^\s*\d+\.\d+/.test(n.t)&&/^\s*\d{1,3}\s*[.．、]?\s*[\[［【]/.test(n.t)));
    });
    if(qHeadNodes.length>1||out.some(function(n){return /^第\s*\d+\s*空/.test(n.t);}))return;
    var labelRe=/^\s*([A-H])(?:\s*[.．、:：)）]?\s*$|(?:\s*[.．、:：)）]\s*|\s+|(?=[\u4e00-\u9fff（(《“"√×+-]))\S+)/i;
    var sorted=out.slice().sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var labels=[];
    sorted.forEach(function(n){
      var m=n.t.match(labelRe);
      if(m)labels.push({l:m[1].toUpperCase(),node:n});});
    if(labels.length>=1&&labels[0].l==='B'){
      var bNode=labels[0].node,cNode=labels.length>=2?labels[1].node:null;
      var stepY=(cNode&&labels[1].l==='C'&&cNode.y>bNode.y)?Math.max(Math.round(sh*0.045),Math.min(Math.round(sh*0.105),cNode.y-bNode.y)):Math.round(sh*0.062);
      var qHead=sorted.filter(function(n){return n.y<bNode.y-sh*0.06&&/(?:单选|多选|判断)题?/.test(n.t);}).pop();
      var minAY=Math.max(qHead?qHead.y+sh*0.055:sh*0.16,bNode.y-Math.max(stepY*1.65,sh*0.12));
      var maxAY=bNode.y-sh*0.026;
      var aCands=sorted.filter(function(n){
        return n.y>=minAY&&n.y<=maxAY&&!labelRe.test(n.t)&&
          !/(?:单选|多选|判断|填空|简答|问答)题?/.test(n.t)&&
          !/^(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t)&&
          !/^\s*\d{1,3}\s*(?:[.．、,，·•:：)）]|\s*\/\s*\d)/.test(n.t);});
      var aCand=aCands.length?aCands[aCands.length-1]:null;
      var aY=aCand?aCand.y:Math.round(bNode.y-stepY);
      if(aY>(qHead?qHead.y+sh*0.04:sh*0.15)){
        var synthA={t:'A',x:bNode.x||Math.round(sw*0.084),y:aY,node:null,selected:!!(aCand&&aCand.selected)};
        out.push(synthA);
        labels.unshift({l:'A',node:synthA});}}
    for(var i=0;i<labels.length-1;i++){
      var cur=labels[i],nxt=labels[i+1];
      var codeDiff=nxt.l.charCodeAt(0)-cur.l.charCodeAt(0);
      var dy=nxt.node.y-cur.node.y;
      if(codeDiff===2&&dy>sh*0.065&&dy<sh*0.30){
        var missL=String.fromCharCode(cur.l.charCodeAt(0)+1);
        var midCandidates=sorted.filter(function(n){
          return n.y>cur.node.y+sh*0.028&&n.y<nxt.node.y-sh*0.025&&
            !labelRe.test(n.t)&&
            !/^(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t)&&
            !/^\s*\d{1,3}\s*(?:[.．、,，·•:：)）]|\s*\/\s*\d)/.test(n.t);});
        var midNode=midCandidates.length?midCandidates[0]:null;
        var midY=midNode?midNode.y:Math.round((cur.node.y+nxt.node.y)/2);
        out.push({t:missL,x:cur.node.x||Math.round(sw*0.084),y:midY,node:null,selected:!!(midNode&&midNode.selected)});
      }else if(codeDiff===3&&dy>sh*0.12&&dy<sh*0.42){
        var miss1=String.fromCharCode(cur.l.charCodeAt(0)+1);
        var miss2=String.fromCharCode(cur.l.charCodeAt(0)+2);
        out.push({t:miss1,x:cur.node.x||Math.round(sw*0.084),y:Math.round(cur.node.y+dy/3),node:null,selected:false});
        out.push({t:miss2,x:cur.node.x||Math.round(sw*0.084),y:Math.round(cur.node.y+dy*2/3),node:null,selected:false});
      }}
    if(labels.length===3&&labels[2].l==='C'){
      var lastLbl=labels[labels.length-1];
      var nextCode=lastLbl.l.charCodeAt(0)+1;
      if(nextCode===68){
        var tailLetter=String.fromCharCode(nextCode);
        var navY=sh*0.88;
        sorted.forEach(function(n){
          if(n.y>lastLbl.node.y+sh*0.02&&(/^(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t)||/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t)))
            navY=Math.min(navY,n.y-sh*0.02);});
        var tailCands=sorted.filter(function(n){
          return n.y>lastLbl.node.y+sh*0.032&&n.y<Math.min(navY,lastLbl.node.y+sh*0.135)&&
            !labelRe.test(n.t)&&
            !/(?:单选|多选|判断|填空|简答|问答)题?/.test(n.t)&&
            !/^(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t)&&
            !/^\s*\d{1,3}\s*(?:[.．、,，·•:：)）]|\s*\/\s*\d)/.test(n.t);});
        if(tailCands.length){
          var tCand=tailCands[0];
          if(labels.length===3||tCand.selected||(im&&hasOptionIconAt(im,tCand.y,size))){
            out.push({t:tailLetter,x:lastLbl.node.x||Math.round(sw*0.084),y:tCand.y,node:null,selected:!!tCand.selected});
          }}}}
  }catch(ignore){}}
function recoverSectionOptionGaps(options,section,topY){
  try{
    options.sort(function(a,b){return a.n.y-b.n.y;});
    for(var k=1;k<options.length-1;k++){
      var prevCode=options[k-1].l.charCodeAt(0),nextCode=options[k+1].l.charCodeAt(0);
      if(nextCode-prevCode===2&&options[k].l.charCodeAt(0)!==prevCode+1){
        options[k].l=String.fromCharCode(prevCode+1);}}
    if(options.length>=1&&options[0].l==='B'){
      var bOpt=options[0],cOpt=options.length>=2?options[1]:null;
      var stepY=(cOpt&&cOpt.n.y>bOpt.n.y)?Math.max(Math.round(H*0.045),Math.min(Math.round(H*0.105),Math.round((cOpt.n.y-bOpt.n.y)/Math.max(1,cOpt.l.charCodeAt(0)-66)))):Math.round(H*0.062);
      var baseTop=topY||H*0.12;
      var minAY=Math.max(baseTop+H*0.035,bOpt.n.y-Math.max(stepY*1.75,H*0.135));
      var maxAY=bOpt.n.y-H*0.022;
      var aNodes=section.filter(function(n){
        return n.y>=minAY&&n.y<=maxAY&&
          n!==bOpt.n&&
          !/^\s*\d{1,3}\s*[.．、,，·•:：)）]/.test(n.t)&&
          !/(?:单选|多选|判断|填空|简答|问答)题?/.test(n.t)&&
          !/^[<＜《\s]*(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t);
      }).sort(function(a,b){return a.y-b.y;});
      var aCand=aNodes.length?aNodes[aNodes.length-1]:null;
      var aY=aCand?aCand.y:Math.max(Math.round(baseTop+H*0.06),Math.round(bOpt.n.y-stepY));
      var aSel=!!(aCand&&aCand.selected)||section.some(function(n){return Math.abs(n.y-aY)<H*0.024&&n.selected;});
      var synthANode={t:'A',x:bOpt.n.x||Math.round(W*0.084),y:aY,node:null,selected:aSel};
      options.unshift({l:'A',n:synthANode,t:aCand?aCand.t.replace(/\s+/g,' ').trim():'选项 A'});
    }
    for(var i=0;i<options.length-1;i++){
      var cur=options[i],nxt=options[i+1];
      var diff=nxt.l.charCodeAt(0)-cur.l.charCodeAt(0);
      var dy=nxt.n.y-cur.n.y;
      if(diff===2&&dy>H*0.065&&dy<H*0.30){
        var missLetter=String.fromCharCode(cur.l.charCodeAt(0)+1);
        var midNodes=section.filter(function(n){
          return n.y>cur.n.y+H*0.028&&n.y<nxt.n.y-H*0.025&&
            n!==cur.n&&n!==nxt.n&&
            !/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&
            !/^[<＜《\s]*(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t);
        }).sort(function(a,b){return a.y-b.y;});
        var midNode=midNodes.length?midNodes[0]:null;
        var synthY=midNode?midNode.y:Math.round((cur.n.y+nxt.n.y)/2);
        var midSel=!!(midNode&&midNode.selected)||section.some(function(n){return Math.abs(n.y-synthY)<H*0.022&&n.selected;});
        var synthNode={t:missLetter,x:cur.n.x||Math.round(W*0.084),y:synthY,node:null,selected:midSel};
        options.splice(i+1,0,{l:missLetter,n:synthNode,t:midNodes.length?'':('选项 '+missLetter)});
        i++;
      }else if(diff===3&&dy>H*0.12&&dy<H*0.42){
        var m1=String.fromCharCode(cur.l.charCodeAt(0)+1);
        var m2=String.fromCharCode(cur.l.charCodeAt(0)+2);
        var y1=Math.round(cur.n.y+dy/3),y2=Math.round(cur.n.y+dy*2/3);
        var s1={t:m1,x:cur.n.x||Math.round(W*0.084),y:y1,node:null,selected:section.some(function(n){return Math.abs(n.y-y1)<H*0.022&&n.selected;})};
        var s2={t:m2,x:cur.n.x||Math.round(W*0.084),y:y2,node:null,selected:section.some(function(n){return Math.abs(n.y-y2)<H*0.022&&n.selected;})};
        options.splice(i+1,0,{l:m1,n:s1,t:'选项 '+m1},{l:m2,n:s2,t:'选项 '+m2});
        i+=2;}}
    if(options.length>=2){
      options.sort(function(a,b){return a.n.y-b.n.y;});
      var maxCode=options[options.length-1].l.charCodeAt(0);
      if(maxCode>=68&&maxCode<=70){
        var expectedCount=maxCode-64;
        if(options.length<expectedCount){
          var firstY=options[0].n.y,lastY=options[options.length-1].n.y;
          var avgStep=options.length>1?Math.max(Math.round(H*0.052),Math.round((lastY-firstY)/Math.max(1,maxCode-options[0].l.charCodeAt(0)))):Math.round(H*0.062);
          var anchorB=options.filter(function(o){return o.l==='B';})[0];
          var anchorA=options.filter(function(o){return o.l==='A';})[0];
          var baseAY=anchorA?anchorA.n.y:(anchorB?anchorB.n.y-avgStep:firstY);
          for(var ci=0;ci<expectedCount;ci++){
            var wantL=String.fromCharCode(65+ci);
            if(!options.some(function(o){return o.l===wantL;})){
              var estY=Math.round(baseAY+ci*avgStep);
              var nearNodes=section.filter(function(n){
                return Math.abs(n.y-estY)<H*0.032&&
                  !/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&
                  !/(?:单选|多选|判断|填空|简答|问答)题?/.test(n.t)&&
                  !/^[<＜《\s]*(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t);});
              var realY=nearNodes.length?nearNodes[0].y:estY;
              var realSel=nearNodes.some(function(n){return !!n.selected;});
              var realTxt=nearNodes.length?nearNodes.map(function(n){return n.t.trim();}).join(' '):('选项 '+wantL);
              options.push({l:wantL,n:{t:wantL,x:Math.round(W*0.084),y:realY,node:null,selected:realSel},t:realTxt});
            }}
          options.sort(function(a,b){return a.l.localeCompare(b.l);});}}}
    var isJudgeOpts=(options.length===2&&options.every(function(o){return /^(?:对|错|正确|错误|√|×)$/.test(String(o.t||'').trim());}));
    if(options.length>=2&&!isJudgeOpts){
      for(var tailStep=0;tailStep<2&&options.length<4;tailStep++){
        var lastOpt=options[options.length-1];
        var nextCharCode=lastOpt.l.charCodeAt(0)+1;
        if(nextCharCode>68)break;
        var tailL=String.fromCharCode(nextCharCode);
        var tailNodes=section.filter(function(n){
          return n.y>lastOpt.n.y+H*0.032&&n.y<lastOpt.n.y+H*0.125&&
            n!==lastOpt.n&&
            !/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&
            !isCompactOptionRowText(n.t)&&
            !/(?:单选|多选|判断|填空|简答|问答)题?/.test(n.t)&&
            !/^[<＜《\s]*(?:上一题|下一题|答题卡|提交|保存|写笔记)/.test(n.t)&&
            !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t);
        }).sort(function(a,b){return a.y-b.y;});
        if(tailNodes.length){
          var tNode=tailNodes[0];
          var synthTail={t:tailL,x:lastOpt.n.x||Math.round(W*0.095),y:tNode.y,node:null,selected:!!tNode.selected};
          options.push({l:tailL,n:synthTail,t:tNode.t.replace(/\s+/g,' ').trim()});
        }else break;}}
    options.forEach(function(o){
      if(!o.n.selected&&section.some(function(n){return Math.abs(n.y-o.n.y)<H*0.022&&n.selected;})){
        o.n.selected=true;}});
  }catch(ignore){}}
function injectOcrOptionCircles(im,out,size){
  try{
    var sw=size.w||W,sh=size.h||H;
    var qHeads=out.filter(function(n){
      return n.y>sh*0.10&&n.y<sh*0.92&&(/(?:单选|多选|判断|填空|简答|问答)题?/.test(n.t)||(!/^\s*\d+\.\d+/.test(n.t)&&/^\s*\d{1,3}\s*[.．、]?\s*[\[［【]/.test(n.t)));
    }).sort(function(a,b){return a.y-b.y;});
    if(!qHeads.length)return;
    var navBot=sh*0.92;
    out.forEach(function(n){
      if(n.y>sh*0.45&&(/^[<＜《\s]*(?:上一题|下一题|答题卡|提交|提交答案|提交测验)/.test(n.t)||/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t)))
        navBot=Math.min(navBot,n.y-sh*0.022);});
    var sections=[];
    qHeads.forEach(function(h,idx){
      if(/填空|简答|问答/.test(h.t))return;
      var sTop=h.y+sh*0.055;
      var sBot=(idx+1<qHeads.length)?Math.min(navBot,qHeads[idx+1].y-sh*0.02):navBot;
      if(out.some(function(n){return n.y>h.y&&n.y<sBot&&/^第\s*\d+\s*空/.test(n.t);}))return;
      var isJudgeHead=/判断/.test(h.t)||out.some(function(n){return n.y>sTop&&n.y<sBot&&/^(?:对|错|正确|错误)$/.test(n.t.trim());});
      if(sBot-sTop>sh*0.08)sections.push({top:sTop,bot:sBot,isJudge:isJudgeHead});});
    sections.forEach(function(sec){
      var existingLetters=out.filter(function(n){
        return n.y>sec.top&&n.y<sec.bot&&(/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)||isCompactOptionRowText(n.t));
      });
      if(existingLetters.length>0)return;
      var iconRows=[];
      out.slice().sort(function(a,b){return a.y-b.y;}).forEach(function(n){
        if(n.y<=sec.top||n.y>=sec.bot)return;
        if(/^(?:上一题|下一题|答题卡|提交|保存|写笔记|讨论)/.test(n.t))return;
        if(iconRows.some(function(r){return Math.abs(r.y-n.y)<sh*0.038;}))return;
        if(hasOptionIconAt(im,n.y,size)||blueChoice(im,n,size))iconRows.push(n);});
      var minIcons=sec.isJudge?2:4;
      if(iconRows.length>=minIcons&&iconRows.length<=6){
        iconRows.forEach(function(row,idx){
          var letter=String.fromCharCode(65+idx);
          var isSel=blueChoice(im,row,size);
          if(isSel)row.selected=true;
          out.push({t:letter,x:Math.round(sw*0.095),y:row.y,node:null,selected:isSel});});}});
  }catch(ignore){}}
function pushNode(out,n,size){
  try{
    if(!n||!n.visibleToUser())return;
    var t=String(n.text()||n.desc()||'').trim();
    if(!t)return;
    var b=n.bounds();
    if(!b||b.width()<=0||b.height()<=0)return;
    var x=b.centerX(),y=b.centerY();
    var pkg=String(n.packageName()||'');
    if(!pointOnScreen(x,y,size)||isFloatingPanelArtifact(x,y,pkg,t))return;
    var sel=!!(n.selected()||n.checked());
    if(!out.some(function(e){return e.t===t&&Math.abs(e.y-y)<12&&Math.abs(e.x-x)<24;})){
      out.push({t:t,x:x,y:y,left:b.left,right:b.right,node:n,selected:sel});}
  }catch(ignore){}}
function view(){
  var out=[],im=null,size=screenSize();
  try{
    cxTextMatches(/[\s\S]+/.source).find().forEach(function(n){pushNode(out,n,size);});
  }catch(e){}
  try{
    cxDescMatches(/[\s\S]+/.source).find().forEach(function(n){pushNode(out,n,size);});
  }catch(e){}
  var axHasQuestion=out.some(function(n){
    return /^\s*\d{1,3}\s*[.．、,，:：)）]?[\s\S]*(单选|多选|判断|填空|简答|问答)|^第\s*\d+\s*空/.test(n.t);});
  if(!axHasQuestion)axHasQuestion=out.some(function(n){
    return /^\s*\d{1,3}\s*[.．、,，]?\s*$/.test(n.t)&&out.some(function(z){
      return /^[\[［【(（]?\s*(?:单选|多选|判断|填空|简答|问答)题?\s*[\]］】)）]?$/.test(z.t)&&
        Math.abs(z.y-n.y)<H*.065;});});
  var axLabels=out.filter(function(n){
    return /^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t);
  }).length;
  var axHasA=out.some(function(n){
    return /^\s*A(?:\s*[.．、:：)）]?\s*$|(?:\s*[.．、:：)）]\s*|\s+)\S+)/i.test(n.t);});
  var axOptionText=out.filter(function(n){return /[\u4e00-\u9fff]/.test(n.t);}).length;
  var isAxActive=!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service;
  var axStr=out.map(function(n){return n.t;}).join('|');
  var looksLikeDir=/知识图谱|章节列表|课程章节/.test(axStr)||(out.some(function(n){return /^任务$/.test(n.t.trim())&&n.y<H*0.18;})&&out.some(function(n){return /^(?:知识图谱|更多)$/.test(n.t.trim())&&n.y<H*0.18;}));
  var richNonQuizAx=isAxActive&&!axHasQuestion&&!looksLikeDir&&out.length>=5&&axOptionText>=3;
  var richAccessibility=(axHasQuestion&&axHasA&&axLabels>=4&&axOptionText>=4)||richNonQuizAx;
  im=picture();
  if(im){
    if(im.getWidth()>im.getHeight())size={w:Math.max(W,H),h:Math.min(W,H)};
    var hasIncompleteDlg=false;
    try{hasIncompleteDlg=SMART_RECOGNIZER.isIncompleteTaskDialogVisual(im);}catch(ignore){}
    if(!hasIncompleteDlg&&!richAccessibility&&(!land()||out.length===0))try{
      var sx=(size.w||W)/im.getWidth(),sy=(size.h||H)/im.getHeight();
      var results;
      if(!isImageAlive(im))im=picture();
      if(isImageAlive(im)){
        try{results=ocr.detect(im);}
        catch(primaryError){
          if(/回收|recycled/i.test(String(primaryError))){
            SCREEN_CAPTURE_READY=false;
            im=picture();}
          if(isImageAlive(im)){
            if(ocr.mlkit&&ocr.mlkit.detect)results=ocr.mlkit.detect(im);
            else results=ocr.detect(im);
          }else results=[];}
      }else{
        results=[];}
      if(Array.isArray(results))results.forEach(function(r){
        var t=String(r.label||r.text||'').trim(),b=r.bounds;
        if(!t||!b)return;
        var x=(b.left+b.right)*sx/2,y=(b.top+b.bottom)*sy/2;
        if(!pointOnScreen(x,y,size)||isFloatingPanelArtifact(x,y,'',t))return;
        if(!out.some(function(n){
          return n.t===t&&Math.abs(n.y-y)<15;
        }))out.push({t:t,x:x,y:y,left:b.left*sx,right:b.right*sx,node:null,selected:false});
      });
    }catch(e){cxLog('文字识别失败：'+e);}
    try{
      if(!isImageAlive(im)&&!hasIncompleteDlg)im=picture();
      out.forEach(function(n){
        if(!n.selected&&blueChoice(im,n,size))n.selected=true;});
      injectOcrOptionCircles(im,out,size);
      repairMissingOptionLettersInView(out,size,im);
      out.forEach(function(n){
        if(!n.selected&&blueChoice(im,n,size))n.selected=true;});
    }catch(ignore){}
    finally{try{safeRecycle(im);}catch(ignore){}}
    out.sort(function(a,b){return Math.abs(a.y-b.y)<12?(a.x-b.x):(a.y-b.y);});
    return {n:out,s:out.map(function(n){return n.t;}).join('|'),incompleteDialog:hasIncompleteDlg};}
  out.sort(function(a,b){return Math.abs(a.y-b.y)<12?(a.x-b.x):(a.y-b.y);});
  return {n:out,s:out.map(function(n){return n.t;}).join('|'),incompleteDialog:false};}
function swipeQuiz(){
  doSwipe(Math.round(W*0.08),Math.round(H*0.62),Math.round(W*0.08),Math.round(H*0.38),240);}
function swipeQuizDown(){
  doSwipe(Math.round(W*0.08),Math.round(H*0.38),Math.round(W*0.08),Math.round(H*0.62),240);}
function swipeQuizToTop(){
  doSwipe(Math.round(W*0.08),Math.round(H*0.28),Math.round(W*0.08),Math.round(H*0.72),300);}
function swipeToNextQuestion(){
  doSwipe(Math.round(W*0.08),Math.round(H*0.65),Math.round(W*0.08),Math.round(H*0.36),250);}
function swipeChapterTasks(up){
  if(up)doSwipe(Math.round(W*0.08),Math.round(H*0.32),Math.round(W*0.08),Math.round(H*0.68),300);
  else doSwipe(Math.round(W*0.08),Math.round(H*0.68),Math.round(W*0.08),Math.round(H*0.32),300);
}
function chapterNextButton(v){
  return cxFind(v,/^[<\s]*(?:下一节|下一讲|下一章|下一课|下一单元)[>\s»›]*$/,H*0.35);}
function next(v){
  var b=chapterNextButton(v);
  if(!b)return false;
  var prevHead=readChapterHeading(v);
  var prevTitle=prevHead?prevHead.t.replace(/\s+/g,''):'';
  if(!tap(b.x,b.y)&&!cxPress(b))return false;
  STATE.answered={};STATE.countedQuizIds={};STATE.choiceAttempted={};STATE.multipleConfirmed={};STATE.multipleExpected={};STATE.multipleFailures={};
  STATE.shortSaved={};STATE.shortAttempted={};STATE.scanDrafts={};STATE.scanFailures={};
  STATE.pageRecheckCount={};STATE.backtrackTries={};STATE.workTotal=0;STATE.afterSubmit=false;STATE.awaitingSubmitResult=false;
  STATE.videoFinishedKeys={};STATE.hadCurrentTask=false;STATE.completionRefreshed=false;STATE.quizPending=false;
  STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.chapterFullScanDone=false;STATE.chapterScrollSteps=0;
  toast('进入下一节');
  sleep(700);
  var checkAfterNext=view();
  if(/非WiFi|非\s*WIFI|消耗流量|移动网络/.test(checkAfterNext.s)||(checkAfterNext.incompleteDialog&&/取消/.test(checkAfterNext.s)&&!/下一章节/.test(checkAfterNext.s))){
    var goWifiNext=cxFind(checkAfterNext,/^(?:继续|继续播放|确定)$/);
    if(goWifiNext)tap(goWifiNext.x,goWifiNext.y);
    else tap(Math.round(W*0.679),Math.round(H*0.572));
    cxLog('检测到非WiFi流量提示，已点击【继续】');
    sleep(650);
  }else if((checkAfterNext.incompleteDialog&&!/取消|非WiFi|消耗流量/.test(checkAfterNext.s))||/当前章节还有任务点未完成|是否[\s\S]{0,6}去完成|下一章节/.test(checkAfterNext.s)){
    var nextChBtn=checkAfterNext.n.filter(function(n){return n.y>H*0.40&&n.y<H*0.70&&n.x<W*0.50&&/下一章节|下一章|下一节/.test(n.t);})[0];
    if(nextChBtn)tap(nextChBtn.x,nextChBtn.y);
    else tap(Math.round(W*0.328),Math.round(H*0.572));
    cxLog('已跳过本节非视频/测验任务点，点击【下一章节】进入下一节');
    sleep(750);}
  return true;}
function markers(v){
  if(v.taskMarkers)return v.taskMarkers;
  var out=[];
  v.n.forEach(function(n){
    var clean=n.t.replace(/\s+/g,'').replace(/^[·•●○◯◉▪▫oO0*]+/,'');
    if(/^(?:任务点(?:已完成|未完成)?|已完成任务点)(?:观看时长|完成条件|总时长)?/.test(clean)&&!/任务点.*(?:全部|所有|未完成.*个)/.test(clean)&&n.x<W*.65&&n.y>H*.12&&n.y<H*.975){
      var rowDone=/已完成/.test(clean)||v.n.some(function(z){return Math.abs(z.y-n.y)<H*.022&&/已完成/.test(z.t);});
      if(!out.some(function(m){return Math.abs(m.y-n.y)<H*.02;}))
        out.push({y:n.y,done:rowDone});}});
  v.n.forEach(function(n){
    var clean=n.t.replace(/\s+/g,'');
    if(/(?:观看时长|完成条件|总时长.*90%|未完成任务点前)/.test(clean)&&n.y>H*.13&&n.y<H*.95){
      var my=Math.max(Math.round(H*0.125),Math.round(n.y-H*0.045));
      var rowDone=/已完成/.test(clean)||v.n.some(function(z){return Math.abs(z.y-my)<H*.035&&/已完成/.test(z.t);});
      if(!out.some(function(m){return Math.abs(m.y-my)<H*.055;}))
        out.push({y:my,done:rowDone});}});
  var im=picture();
  if(im){
    try{
      var iw=im.getWidth(),ih=im.getHeight(),last=-100;
      for(var y=Math.round(ih*.14);y<ih*.95;y+=3){
        var orange=false,green=false;
        for(var xr=0.025;xr<=0.065;xr+=0.008){
          var c=images.pixel(im,Math.round(iw*xr),y);
          var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
          if(r>210&&g>95&&g<220&&b<105)orange=true;
          if(g>150&&g>r+50&&g>b+25&&r<115)green=true;}
        if((!orange&&!green)||y-last<ih*.028)continue;
        last=y;
        var py=Math.round(y*H/ih),matched=null;
        out.forEach(function(m){
          if(Math.abs(m.y-py)<H*.045)matched=m;});
        if(matched){
          matched.y=py;
          matched.done=green?true:(orange?false:matched.done);
        }else{
          out.push({y:py,done:!!green&&!orange});}}
    }catch(e){cxLog('任务点取色失败：'+e);}
    finally{try{safeRecycle(im);}catch(e){}}}
  out.sort(function(a,b){return a.y-b.y;});
  v.taskMarkers=out;return out;}
function parseTimeSeconds(t){
  return String(t||'').split(':').reduce(function(x,v){return x*60+Number(v);},0);}
function twoTimes(s,viewObj,isLandMode){
  var pw=Math.max(W,H),ph=Math.min(W,H);
  var slashMatch=String(s||'').match(/(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)\s*\/\s*(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/);
  if(slashMatch){
    var c0=parseTimeSeconds(slashMatch[1]),t0=parseTimeSeconds(slashMatch[2]);
    if(t0>=5&&c0<=t0+2)return [c0,t0];}
  if(viewObj&&viewObj.n&&viewObj.n.length){
    var minY=isLandMode?ph*0.68:H*0.18;
    var maxY=isLandMode?ph*0.99:H*0.88;
    var tNodes=[];
    viewObj.n.forEach(function(n){
      if(n.y<minY||n.y>maxY)return;
      var m=n.t.trim().match(/^(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)$/);
      if(m){
        var sec=parseTimeSeconds(m[1]);
        if(!tNodes.some(function(e){return Math.abs(e.x-n.x)<36&&e.sec===sec;})){
          tNodes.push({sec:sec,x:n.x,y:n.y});}}});
    tNodes.sort(function(a,b){return a.x-b.x;});
    if(tNodes.length>=2){
      var leftT=tNodes[0],rightT=tNodes[tNodes.length-1];
      if(rightT.x-leftT.x>(isLandMode?pw*0.14:W*0.12)&&rightT.sec>=5&&leftT.sec<=rightT.sec+2){
        return [leftT.sec,rightT.sec];}}
    if(isLandMode)return null;}
  var a=String(s||'').match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g)||[];
  if(a.length<2)return null;
  var c1=parseTimeSeconds(a[0]),t1=parseTimeSeconds(a[1]);
  if(t1<5||c1>t1+2||(c1===t1&&!slashMatch))return null;
  return [c1,t1];}
function nativeVideoNode(name){
  try{return cxId(PKG+':id/'+name).findOnce();}catch(ignore){return null;}}
function liveNodePoint(n){
  try{
    if(!n||!n.visibleToUser())return null;
    var b=n.bounds();
    if(!b||b.width()<=0||b.height()<=0)return null;
    return {x:b.centerX(),y:b.centerY()};
  }catch(ignore){return null;}}
function videoPhysicalClick(n){
  var pt=liveNodePoint(n);
  if(!pt)return false;
  return (land()||STATE.video)?tapLandscape(pt.x,pt.y):tap(pt.x,pt.y);}
function nativeVideoClick(n){
  if(!n)return false;
  requireLearningApp();
  try{if(n.clickable()&&n.click())return true;}catch(ignore){}
  return videoPhysicalClick(n);}
function setVideoNetworkState(st){
  STATE.videoNetworkState=st||'idle';}
function handleVideoNetworkRecovery(){
  if(!STATE.video&&!land())return false;
  try{
    var afkBtn=cxTextMatches(/^\s*(?:继续播放|继续观看|我知道了|确定|重试|重新加载|点击重试)\s*$/).findOnce();
    if(afkBtn&&afkBtn.visibleToUser()){
      var bTxt=String(afkBtn.text()||'').trim();
      if(nativeVideoClick(afkBtn)){
        cxLog('检测到视频防挂机/网络提示，已自动点击【'+bTxt+'】恢复播放');
        sleep(550);
        return true;}}
  }catch(e){if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;}
  return false;}
function resumeVideoNetworkAfterPause(elapsed){
  if(STATE.videoLoadRecovery&&STATE.videoLoadRecovery.nextAt){
    STATE.videoLoadRecovery.nextAt+=elapsed;}}
function videoView(){
  var pw=Math.max(W,H),ph=Math.min(W,H),lSize={w:pw,h:ph};
  var out=[],speedMenuVisual=false;
  try{
    if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service){
      cxTextMatches(/[\s\S]+/.source).find().forEach(function(n){pushNode(out,n,lSize);});
      cxDescMatches(/[\s\S]+/.source).find().forEach(function(n){pushNode(out,n,lSize);});}
  }catch(ignore){}
  var im=picture();
  if(im){
    try{
      speedMenuVisual=SMART_RECOGNIZER.detectSpeedDrawerVisual(im);
      var iw=im.getWidth(),ih=im.getHeight();
      var isLetterbox=iw<ih;
      var vh=isLetterbox?(iw*iw/ih):ih;
      var vTop=isLetterbox?((ih-vh)/2):0;
      var sx=pw/iw,sy=ph/vh;
      var results=ocr.detect(im);
      if(Array.isArray(results))results.forEach(function(r){
        var t=String(r.label||r.text||'').trim(),b=r.bounds;
        if(!t||!b)return;
        var x=((b.left+b.right)/2)*sx;
        var y=(((b.top+b.bottom)/2)-vTop)*sy;
        if(x>=4&&x<=pw-4&&y>=4&&y<=ph-4&&!isFloatingPanelArtifact(x,y,'',t)){
          if(!out.some(function(e){return e.t===t&&Math.abs(e.y-y)<14;}))
            out.push({t:t,x:x,y:y,node:null});}});
    }catch(ignore){}
    finally{try{safeRecycle(im);}catch(ignore){}}}
  return {n:out,s:out.map(function(n){return n.t;}).join('|'),speedMenuOpen:speedMenuVisual};
}
function videoShowsPlayTriangle(n){
  if(!n)return false;
  var im=picture();if(!im)return false;
  try{
    var b=n.bounds(),pw=Math.max(W,H),ph=Math.min(W,H),hits=0;
    for(var dy=-6;dy<=6;dy+=6){
      var c=SMART_RECOGNIZER.landPixel(im,b.centerX()/pw,(b.centerY()+dy)/ph);
      if(((c>>16)&255)>220&&((c>>8)&255)>220&&(c&255)>220)hits++;}
    return hits>=2;
  }finally{try{safeRecycle(im);}catch(ignore){}}}
function finishVideoSpeed(message){
  STATE.speedChecked=true;
  cxLog(message);return true;}
function findVideoRateNodes(viewObj,pw){
  var rList=[];
  try{
    if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service){
      var col=cxTextMatches(/^\s*(?:0\.75|1(?:\.0)?|1\.25|1\.5|2(?:\.0)?)\s*(?:x|X|×|倍)?\s*$|^\s*正常\s*$/i).find();
      var len=col&&typeof col.size==='function'?col.size():(col?col.length:0);
      for(var idx=0;idx<len;idx++){
        var n=typeof col.get==='function'?col.get(idx):col[idx];
        if(!n||!n.visibleToUser())continue;
        var t=String(n.text()||'').trim(),b=n.bounds();
        if(b&&b.width()>0&&b.height()>0&&b.centerX()>pw*0.58){
          rList.push({val:/正常/.test(t)?1:(parseFloat(t)||1),t:t,x:b.centerX(),y:b.centerY(),node:n,selected:!!(n.selected()||n.checked())});}}
    }
  }catch(ignore){}
  if(!rList.length&&viewObj&&viewObj.n){
    viewObj.n.forEach(function(n){
      var clean=n.t.trim();
      if(n.x>pw*0.58&&/^(?:0\.75|1(?:\.0)?|1\.25|1\.5|2(?:\.0)?)\s*(?:x|X|×|倍)?$|^正常$/i.test(clean)){
        rList.push({val:/正常/.test(clean)?1:(parseFloat(clean)||1),t:clean,x:n.x,y:n.y,node:n.node,selected:!!n.selected});
      }});}
  return rList;}
function isBottomBarVisibleAx(){
  try{
    if(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service){
      var pw=Math.max(W,H),ph=Math.min(W,H);
      var sp=cxTextMatches(/^\s*倍速\s*$/).findOnce();
      if(sp&&sp.visibleToUser()){
        var b=sp.bounds();
        if(b&&b.width()>0&&b.centerX()>pw*0.80&&b.centerY()>ph*0.80){
          return {visible:true,x:b.centerX(),y:b.centerY(),node:sp};}}
      var tm=cxTextMatches(/^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*$/).findOnce();
      if(tm&&tm.visibleToUser()){
        var tb=tm.bounds();
        if(tb&&tb.width()>0&&tb.centerY()>ph*0.72){
          return {visible:true,x:Math.round(pw*0.943),y:Math.round(ph*0.930),node:null};}}}
  }catch(ignore){}
  return null;}
function isSpeedDrawerOpen(viewObj){
  var pw=Math.max(W,H),ph=Math.min(W,H);
  var rates=findVideoRateNodes(viewObj,pw);
  var upperRates=rates.filter(function(r){return r.y<ph*0.78;});
  if(upperRates.length>=1||rates.length>=2)return true;
  if(!viewObj)return false;
  return !!(viewObj.speedMenuOpen||viewObj.n.some(function(n){
    return n.x>pw*0.62&&n.y<ph*0.78&&/^(?:0\.75|1\.25|1\.5|2(?:\.0)?)[xX×倍]?$|^正常$/i.test(n.t.trim());
  }));}
function selectHighestAllowedSpeed(v,drawerVerifiedOpen){
  var pw=Math.max(W,H),ph=Math.min(W,H);
  var rates=findVideoRateNodes(v,pw);
  var maxSpd=Number(CFG.maxSpeed)||2.0;
  var candidates=[
    {val:2.0,label:'2.0x',yRatio:0.845},
    {val:1.5,label:'1.5x',yRatio:0.675},
    {val:1.25,label:'1.25x',yRatio:0.500},
    {val:1.0,label:'1.0x(正常)',yRatio:0.325}
  ].filter(function(item){return item.val<=maxSpd+0.05;});
  if(!candidates.length)candidates=[{val:1.0,label:'1.0x(正常)',yRatio:0.325}];
  for(var i=0;i<candidates.length;i++){
    var c=candidates[i];
    var matched=rates.filter(function(r){return Math.abs(r.val-c.val)<0.05;})[0];
    var tx=matched?matched.x:Math.round(pw*(drawerVerifiedOpen?0.83:0.91));
    var ty=matched?matched.y:Math.round(ph*c.yRatio);
    tapLandscape(tx,ty);
    sleep(420);
    var checkIm=picture(),hasCheckIm=isImageAlive(checkIm),drawerStillOpen=false,slotHighlighted=false;
    if(hasCheckIm){
      try{
        drawerStillOpen=SMART_RECOGNIZER.detectSpeedDrawerVisual(checkIm);
        slotHighlighted=SMART_RECOGNIZER.isSpeedSlotHighlighted(checkIm,c.yRatio);
      }finally{try{safeRecycle(checkIm);}catch(ignore){}}}
    var afterRates=findVideoRateNodes(null,pw);
    var afterMatched=afterRates.filter(function(r){return Math.abs(r.val-c.val)<0.05;})[0];
    if(afterMatched&&afterMatched.selected)slotHighlighted=true;
    if(!hasCheckIm){
      drawerStillOpen=afterRates.filter(function(r){return r.y<ph*0.78;}).length>=1||afterRates.length>=2;}
    if(!slotHighlighted&&afterRates.some(function(r){return r.y>ph*0.78&&Math.abs(r.val-c.val)<0.05;}))slotHighlighted=true;
    if(!drawerStillOpen||slotHighlighted){
      if(drawerStillOpen){
        tapLandscape(Math.round(pw*0.30),Math.round(ph*0.50));
        sleep(180);}
      STATE.videoSpeedRate=c.val;
      SMART_RECOGNIZER.scene='VIDEO_LANDSCAPE';
      SMART_RECOGNIZER.label='🎬横屏视频('+c.val+'x)';
      return finishVideoSpeed(c.val>=2?'已开启 2.0x 二倍速播放':('已选择当前最高可用倍速 '+c.label+' 播放'));}}
  tapLandscape(Math.round(pw*0.30),Math.round(ph*0.50));
  sleep(260);
  return finishVideoSpeed('课程限制倍速切换，已收起倍速抽屉保持正常播放');}
function chooseVideoSpeed(v){
  if(!CFG.autoSpeed||STATE.speedChecked||!land())return false;
  if(STATE.openedAt&&Date.now()-STATE.openedAt<550)return false;
  var pw=Math.max(W,H),ph=Math.min(W,H);
  var im0=picture(),hasIm0=isImageAlive(im0),drawerAlreadyOpen=false,barVisible=false;
  if(hasIm0){
    try{
      drawerAlreadyOpen=SMART_RECOGNIZER.detectSpeedDrawerVisual(im0);
      barVisible=SMART_RECOGNIZER.isBottomBarVisible(im0);
    }finally{try{safeRecycle(im0);}catch(ignore){}}}
  if(drawerAlreadyOpen||isSpeedDrawerOpen(v)){
    return selectHighestAllowedSpeed(v,true);}
  STATE.speedEntryAttempts=(STATE.speedEntryAttempts||0)+1;
  if(STATE.speedEntryAttempts>3){
    return finishVideoSpeed('当前视频不支持调倍速或未展开面板，保持原速播放');}
  var axBar=isBottomBarVisibleAx();
  if(axBar&&axBar.visible)barVisible=true;
  var speedBtnX=(axBar&&axBar.x)?axBar.x:Math.round(pw*0.943);
  var speedBtnY=(axBar&&axBar.y)?axBar.y:Math.round(ph*0.930);
  if(hasIm0||(!NO_AX_BACKEND&&typeof auto!=='undefined'&&auto&&auto.service)){
    if(!barVisible){
      tapLandscape(Math.round(pw*0.50),Math.round(ph*0.50));
      sleep(320);
      var axBarAfterWake=isBottomBarVisibleAx();
      if(axBarAfterWake&&axBarAfterWake.x){speedBtnX=axBarAfterWake.x;speedBtnY=axBarAfterWake.y;}}
    tapLandscape(speedBtnX,speedBtnY);
    sleep(450);
    var im1=picture(),opened1=false,barStill1=false;
    if(isImageAlive(im1)){
      try{
        opened1=SMART_RECOGNIZER.detectSpeedDrawerVisual(im1);
        barStill1=SMART_RECOGNIZER.isBottomBarVisible(im1);
      }finally{try{safeRecycle(im1);}catch(ignore){}}}
    if(opened1||isSpeedDrawerOpen(null)){
      return selectHighestAllowedSpeed(v,true);}
    var axBarRetry=isBottomBarVisibleAx();
    if(barStill1||(axBarRetry&&axBarRetry.visible)){
      tapLandscape(speedBtnX,speedBtnY);
      sleep(450);
      var im2=picture(),opened2=false;
      if(isImageAlive(im2)){
        try{opened2=SMART_RECOGNIZER.detectSpeedDrawerVisual(im2);}
        finally{try{safeRecycle(im2);}catch(ignore){}}}
      if(opened2||isSpeedDrawerOpen(null)){
        return selectHighestAllowedSpeed(v,true);}}
    if(!hasIm0&&STATE.speedEntryAttempts>=2){
      return selectHighestAllowedSpeed(v,false);}
    return true;}
  if(STATE.speedEntryAttempts===2){
    tapLandscape(Math.round(pw*0.50),Math.round(ph*0.50));
    sleep(450);}
  tapLandscape(Math.round(pw*0.943),Math.round(ph*0.930));
  sleep(650);
  return selectHighestAllowedSpeed(v,false);}
function videoFailureNode(){
  var failure=nativeVideoNode('tvMessage');
  var pattern=/[\s\S]*(?:视频加载失败|视频播放失败|播放出错|请检查网络连接或[\s\S]*切换线路)[\s\S]*/;
  if(failure&&!pattern.test(String(failure.text()||'')))failure=null;
  try{if(!failure)failure=cxTextMatches(pattern.source).findOnce();}catch(ignore){}
  if(!failure&&STATE.video&&!nativeVideoNode('tv_chapter_name')&&(nativeVideoNode('cvPlayer')||nativeVideoNode('land_start'))){
    try{failure=cxTextMatches(/[\s\S]*(?:网络连接失败|网络连接异常|网络错误|网络异常|网络不佳|连接服务器失败|获取视频信息失败)[\s\S]*/.source).findOnce();}catch(ignore){}
  }
  try{return failure&&failure.visibleToUser()?failure:null;}catch(ignore){return null;}}
function handleVideoLoadFailure(){
  var fail=videoFailureNode();
  if(!fail)return false;
  var retry=nativeVideoNode('btnOk')||cxTextMatches(/^\s*(?:重\s*试|重新加载|点击重试)\s*$/.source).findOnce();
  if(retry&&nativeVideoClick(retry)){
    cxLog('检测到视频加载异常，已点击重试');
    sleep(1500);
    return true;}
  return false;}
function exitLandscapeAfterVideo(reason){
  restoreMediaVolume();
  STATE.finished=true;
  STATE.video=false;
  STATE.videoExitAt=Date.now();
  STATE.videoStallTicks=0;
  STATE.videoEndConfirmCount=0;
  UI_CACHE.failUntil=0;
  if(STATE.activeVideoKey){
    STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
    STATE.videoFinishedKeys[STATE.activeVideoKey]=true;}
  SESSION_STATS.videos++;
  cxLog((reason||'视频播放完成，退出全屏返回本节核对剩余任务点')+'（累计完成视频 '+SESSION_STATS.videos+' 个）');
  safeBack();
  sleep(950);}
function player(v){
  if(!land()){
    STATE.video=false;
    return;}
  var pw=Math.max(W,H),ph=Math.min(W,H);
  if(chooseVideoSpeed(v))return;
  var vv=v&&v.n&&v.n.length?v:videoView();
  SMART_RECOGNIZER.analyze(vv);
  if(questions(vv).length){
    quiz(vv);
    return;}
  var t=twoTimes(vv.s,vv,true);
  if(!t&&Date.now()-(STATE.lastControlProbeAt||0)>14000){
    STATE.lastControlProbeAt=Date.now();
    tapLandscape(Math.round(pw*0.50),Math.round(ph*0.50));
    sleep(480);
    vv=videoView();
    if(isSpeedDrawerOpen(vv)){if(!STATE.speedChecked){selectHighestAllowedSpeed(vv,true);return;}tapLandscape(Math.round(pw*0.30),Math.round(ph*0.50));sleep(180);}
    t=twoTimes(vv.s,vv,true);}
  if(t){
    if(t[1]>0&&t[0]>=t[1]-1){
      var newlyOpened=t[1]>40&&Date.now()-(STATE.openedAt||0)<22000&&STATE.lastTime<t[1]-25;
      if(newlyOpened){
        STATE.videoEndConfirmCount=(STATE.videoEndConfirmCount||0)+1;
        if(STATE.videoEndConfirmCount<2){sleep(1200);return;}}
      exitLandscapeAfterVideo('视频播放完成('+t[0]+'s/'+t[1]+'s)，退出全屏继续本节任务');
      return;}
    STATE.videoEndConfirmCount=0;
    if(STATE.lastTime===t[0]&&t[1]>0&&t[0]<t[1]-2){
      STATE.videoStallTicks=(STATE.videoStallTicks||0)+1;
      if(STATE.videoStallTicks>=2){
        STATE.videoStallTicks=0;
        tapLandscape(Math.round(pw*0.094),Math.round(ph*0.927));
        cxLog('检测到视频进度静止，已点击左下角恢复播放');
        sleep(500);
        return;}
    }else if(t[0]!==STATE.lastTime){
      STATE.videoStallTicks=0;
      STATE.lastTimeAdvanceAt=Date.now();}
    STATE.lastTime=t[0];
    STATE.total=t[1];
  }else if(STATE.total>0&&STATE.lastTime>=0){
    var spd=STATE.videoSpeedRate>0?STATE.videoSpeedRate:1;
    var estElapsed=Math.floor((Date.now()-(STATE.lastTimeAdvanceAt||STATE.openedAt||Date.now()))/1000)*spd;
    if(STATE.lastTime+estElapsed>=STATE.total+2&&Date.now()-(STATE.lastControlProbeAt||0)>4500){
      STATE.lastControlProbeAt=Date.now();
      tapLandscape(Math.round(pw*0.45),Math.round(ph*0.45));
      sleep(480);
      vv=videoView();
      var tEnd=twoTimes(vv.s,vv,true);
      if((tEnd&&tEnd[1]>0&&tEnd[0]>=tEnd[1]-1)||vv.n.some(function(n){return /^(?:重播|播放结束|观看完成)$/.test(n.t.trim());})){
        exitLandscapeAfterVideo('视频预计时长已播完并确认完成，退出全屏');
        return;}}}
  if(vv.n.some(function(n){return /^(?:重播|播放结束|观看完成)$/.test(n.t.trim());})){
    exitLandscapeAfterVideo('检测到重播/播放完成提示，退出播放器');
    return;}
  var startBtn=nativeVideoNode('land_start')||nativeVideoNode('start');
  if(startBtn&&videoShowsPlayTriangle(startBtn)){
    nativeVideoClick(startBtn);
    cxLog('检测到视频处于暂停状态，已点击继续播放');
    sleep(500);
    return;}
  sleep(850);}
function collectVisionFrame(item,v,same,limit){
  if(!VISION.key||!/如图|下图|图中|图示|识图|读图|图片|心电图|组织切片/.test(item.q))return;
  var im=picture();
  if(!im)return;
  try{
    item.visualFrames=item.visualFrames||[];
    if(item.visualFrames.length<2){
      var b64=images.toBase64(im,'jpg',68);
      if(b64)item.visualFrames.push('data:image/jpeg;base64,'+b64);}
  }catch(ignore){}
  finally{try{safeRecycle(im);}catch(ignore){}}}
function openReadingTask(todo,v){
  var entry=todo.nodes.filter(function(n){
    return /\.(?:pdf|pptx?|docx?|xlsx?|txt|epub)\b|^(?:去阅读|开始阅读|查看|打开|文献阅读)$/i.test(n.t.trim());
  })[0]||todo.nodes.filter(function(n){
    return n.y>todo.y+H*0.04&&!/^(?:完成|条件|完成条件|任务点|课件|阅读|资料|附件|写笔记)$/.test(n.t.trim());
  })[0]||todo.nodes[0];
  var targetY=entry?entry.y:Math.min(H*0.82,todo.y+H*0.095);
  var targetX=entry?Math.max(Math.round(W*0.28),Math.min(Math.round(W*0.72),entry.x)):Math.round(W*0.45);
  if((entry&&cxPress(entry))||tap(targetX,targetY)){
    STATE.doc=true;
    STATE.docAwaitKey=todo.key;
    STATE.docAwaitAt=Date.now();
    var hKey=todo.key;
    var hist=STATE.readingAttempts[hKey]||{opens:0,refreshes:0};
    hist.opens++;
    STATE.readingAttempts[hKey]=hist;
    STATE.readingVisit={key:todo.key,historyKey:hKey,at:Date.now(),stage:'viewing',swipedDoc:false,backSent:false,secondBackSent:false};
    cxLog('已点击打开 PDF/文档任务点，准备退出：'+todo.key.slice(0,28));
    sleep(380);
  }else{
    sleep(600);}}
function ask(item){
  var cacheKey=item.kind+'|'+item.q.replace(/[\s\u00A0]+/g,'')+'|'+(item.blankCount||0)+'|'+item.options.map(function(o){return o.l+':'+String(o.t||'').replace(/[\s\u00A0]+/g,'');}).join('|');
  if(STATE.answerCache&&STATE.answerCache[cacheKey])return STATE.answerCache[cacheKey];
  if(LOCAL_QB[cacheKey]){
    cxLog('命中本地持久化题库，秒速作答');
    STATE.answerCache[cacheKey]=LOCAL_QB[cacheKey];
    return LOCAL_QB[cacheKey];}
  var visual=!!(item.visualFrames&&item.visualFrames.length&&VISION.key);
  var isChoice=(item.kind==='single'||item.kind==='multiple'||item.kind==='judge');
  var payload={
    model:'deepseek-chat',
    temperature:0.1,
    max_tokens:isChoice?64:320,
    messages:[
      {
        role:'system',
        content:'你是超星学习通大学课程解题助手。只输出合法 JSON 对象，不要包含 markdown 代码块或多余文字。格式：单选题/判断题 {"answer":["A"],"confidence":"high"}；多选题 {"answer":["A","B"],"confidence":"high"}；填空题 {"blanks":["第1空答案","第2空答案"],"confidence":"high"}；简答题 {"text":"简答内容","confidence":"high"}。'
      },
      {
        role:'user',
        content:'题型：'+item.kind+(item.blankCount?'（本题在页面上共有严格 '+item.blankCount+' 个填空输入框，即第1空至第'+item.blankCount+'空！注意 OCR 提取的题干可能漏掉并列顿号（如“在___、___、___等”3个并列空）或句末空缺，你必须对照教材原文逐空还原全部 '+item.blankCount+' 个空缺，严禁把题干中已给出的酶名/名词（如“再在胆绿素还原酶催化下生成___”中的胆绿素还原酶）错当成填空答案，返回的 blanks 数组长度必须严格等于 '+item.blankCount+'，逐空一一对应！）':'')+'\n题干：'+item.q+'\n选项：\n'+
          item.options.map(function(o){return o.l+'. '+o.t;}).join('\n')}
    ]};
  if(visual){
    payload.model=VISION.model;delete payload.thinking;
    payload.messages[0].content+=' 图片按本题从上到下排列，只解答所给题号。先完整读取题干和所有选项，计算题先独立计算，再逐项核对选项实际写出的指标名称、单位和数值，不能按题干列举顺序交换指标含义。图片不清楚或缺少必要内容时返回 confidence=low，不猜测。';
    if(/RR/.test(item.q)&&/AR/.test(item.q))payload.messages[0].content+=' 流行病学标准定义：RR=暴露组发病率/非暴露组发病率；AR=两组发病率之差；AR%=该差值/暴露组发病率×100%。对照选项标注计算，若题目另有定义或与选项冲突则返回low。';
    var text=payload.messages[1].content;
    payload.messages[1].content=[{type:'text',text:text}].concat(item.visualFrames.map(function(frame){return {type:'image_url',image_url:{url:frame}};}));
    cxLog('识图解题：发送当前题目 '+item.visualFrames.length+' 张局部截图');}
  if(!KEY&&!visual){
    configureApiKeys(false);
    if(!KEY)throw Error('尚未设置 DeepSeek API Key，请点击悬浮窗【🎛 面板】按钮配置');}
  requireLearningApp();
  var targetUrl=visual?VISION.url:'https://api.deepseek.com/chat/completions';
  var reqOpts={headers:{Authorization:'Bearer '+(visual?VISION.key:KEY),'Content-Type':'application/json'},timeout:16000};
  var r;
  try{
    r=http.postJson(targetUrl,payload,reqOpts);
  }catch(netErr){
    sleep(350);
    requireLearningApp();
    r=http.postJson(targetUrl,payload,reqOpts);}
  var body='';
  try{body=r.body.string();}
  finally{try{r.body.close();}catch(e){}}
  if(r.statusCode!==200)
    throw Error('HTTP '+r.statusCode+' '+body.slice(0,160));
  var data=JSON.parse(body);
  if(!data||!data.choices||!data.choices[0]||!data.choices[0].message)throw Error('模型返回格式异常');
  var content=data.choices[0].message.content;
  var rawContent=String(content||'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
  var answer;
  try{
    answer=JSON.parse(rawContent);
  }catch(parseErr){
    var jm=rawContent.match(/\{[\s\S]*\}/);
    if(!jm)throw parseErr;
    answer=JSON.parse(jm[0]);}
  if(CFG.doubleRecheck&&String(answer.confidence||'').toLowerCase()==='low'&&!item.__lowRetried){
    item.__lowRetried=true;
    try{
      payload.messages[0].content+=' 请仔细逐字复核题干与选项，给出最严谨准确的唯一答案。';
      var r2=http.postJson(targetUrl,payload,reqOpts);
      var b2='';try{b2=r2.body.string();}finally{try{r2.body.close();}catch(ignore){}}
      if(r2.statusCode===200){
        var d2=JSON.parse(b2),c2=d2&&d2.choices&&d2.choices[0]&&d2.choices[0].message?d2.choices[0].message.content:'';
        var raw2=String(c2||'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
        var ans2=JSON.parse((raw2.match(/\{[\s\S]*\}/)||[raw2])[0]);
        if(ans2&&String(ans2.confidence||'').toLowerCase()!=='low')answer=ans2;}
    }catch(ignore){}}
  if(String(answer.confidence||'').toLowerCase()!=='low'){
    STATE.answerCache[cacheKey]=answer;
    saveLocalQb(cacheKey,answer);}
  return answer;}
function bottomPagerCard(v){
  var nav=cxFind(v,/下一题|上一题|答题卡/,H*.48);
  if(!nav)return null;
  var pNode=v.n.filter(function(n){
    return n.y>H*.48&&/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t);
  })[0];
  if(pNode){
    var m=pNode.t.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    if(m)return {number:Number(m[1]),total:Number(m[2]),y:nav.y};}
  return null;}
function isDiscussionDetailView(v){
  if(!v||!v.s)return false;
  if(/评论主贴|写评论|发表评论|写回复|说点什么|发表讨论|发布讨论/.test(v.s))return true;
  if(/回复[:：]?\s*\d+/.test(v.s)&&(/阅读\s*\d+|词云|第\d+楼/.test(v.s)))return true;
  return false;}
function questions(v){
  if(!v||!v.n)return [];
  if(v._questions)return v._questions;
  if(isDiscussionDetailView(v)||isDirectoryPage(v))return (v._questions=[]);
  STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};
  var hasRedo=/请由此重做|待重做|未达到及格线|由此作答|开始测验/.test(v.s);
  var hasActivePagerOrSubmit=!!bottomPagerCard(v)||!!cxFind(v,/^\s*(?:提\s*交(?:答案|测验|作业)?|交\s*卷|下一题|答题卡)\s*$/,H*0.13);
  var hasRedoOrActiveSubmit=hasRedo||hasActivePagerOrSubmit;
  var completedScoreNode=!hasRedo&&!hasActivePagerOrSubmit?cxFind(v,/(?:本次|最终|最高|测验)?得分[:：]?\s*\d|我的答案[:：]|正确答案[:：]/,H*0.10):null;
  if(completedScoreNode&&STATE.quizContext){
    STATE.chapterQuizCompleted[STATE.quizContext]=true;}
  if(hasRedoOrActiveSubmit&&STATE.quizContext){
    delete STATE.chapterQuizCompleted[STATE.quizContext];}
  if(completedScoreNode&&!hasRedoOrActiveSubmit){
    return (v._questions=[]);}
  var tMarkers=v.taskMarkers||[];
  var completedQuizTopY=completedScoreNode?Math.max(H*0.10,completedScoreNode.y-H*0.18):H*1.5;
  var pageHasQuizContext=hasRedoOrActiveSubmit||/(?:单[选造]|多[选造]|判断|填空|简答|问答|论述|名词解释)题?|章节测验|^第\s*\d+\s*空|请输入答案/.test(v.s);
  var starts=[];
  var bPager=bottomPagerCard(v);
  function typeLabel(t){
    return /^(?:必答\s*|选答\s*)?(?:[lI|!·•.．、,，:：)）\s]+)?[\[［【(（]?\s*(?:单[选造]|多[选造]|判断|填空|简答|问答|论述|名词解释)题?\s*[\]］】)）]?$/.test(t);
  }
  v.n.forEach(function(n){
    if(n.y>=completedQuizTopY)return;
    if(!hasRedoOrActiveSubmit&&!pageHasQuizContext&&tMarkers.length){
      var ownerM=null;
      for(var mi=0;mi<tMarkers.length;mi++){if(tMarkers[mi].y<n.y)ownerM=tMarkers[mi];}
      if(ownerM&&ownerM.done)return;}
    var direct=/^\s*\d{1,3}\s*(?:[.．、,，·•:：)）]\s*)?(?:必答\s*|选答\s*)?[\[［【(（]?\s*(?:单[选造]|多[选造]|判断|填空|简答|问答|论述|名词解释)题?\s*[\]］】)）]?/.test(n.t);
    var bracketGarbled=!direct&&pageHasQuizContext&&n.y>H*.12&&n.y<H*.94&&!/^\s*\d+\.\d+/.test(n.t)&&/^\s*\d{1,3}\s*(?:[.．、,，]\s*)?[\[［【(（]/.test(n.t);
    var unnumbered=/^\s*(?:必答|选答)?\s*[\[［【(（]\s*(?:单选|多选|判断|填空|简答|问答|论述|名词解释)题?\s*[\]］】)）]/.test(n.t);
    var numberOnly=/^\s*\d{1,3}\s*[.．、,，·•:：)）]\s*$/.test(n.t);
    var split=numberOnly&&v.n.some(function(z){
      return (typeLabel(z.t)||/^[\[［【]\S{1,6}[\]］】]?$/.test(z.t.trim()))&&
        Math.abs(z.y-n.y)<H*.07;});
    if(direct||split||bracketGarbled){
      starts.push(n);
    }else if(unnumbered&&n.y>H*.12&&n.y<H*.85){
      var uNum=bPager?String(bPager.number):String(starts.length+1);
      starts.push({t:uNum+'. '+n.t,x:n.x,y:n.y,node:n.node,synthetic:true});}});
  v.n.filter(function(n){return n.y<H*.94&&typeLabel(n.t);}).forEach(function(typeNode){
    var nearby=v.n.filter(function(n){
      return Math.abs(n.y-typeNode.y)<H*.065&&/^\s*\d{1,3}\s*[.．、,，·•]?\s*$/.test(n.t);
    }).sort(function(a,b){return Math.abs(a.y-typeNode.y)-Math.abs(b.y-typeNode.y);});
    var near=nearby[0],nearM=near?near.t.match(/\d{1,3}/):null,number=nearM?String(nearM[0]):'';
    if(!number&&starts.length===0){
      number=bPager?String(bPager.number):(STATE.lastPagerNumber?String(STATE.lastPagerNumber):'1');
    }
    if(!number)return;
    var cleanType=(typeNode.t.match(/(?:单选|多选|判断|填空|简答|问答|论述|名词解释)题?/)||['单选题'])[0];
    if(!starts.some(function(n){
      var m=n.t.match(/^\s*(\d{1,3})/);
      return m&&m[1]===number&&Math.abs(n.y-typeNode.y)<H*.08;
    }))starts.push({t:number+'. '+cleanType,x:typeNode.x,
      y:near?Math.min(near.y,typeNode.y):typeNode.y,synthetic:true});});
  if(!starts.length&&v.n.some(function(n){return /^第\s*\d+\s*空/.test(n.t);})){
    var firstBlankNode=v.n.filter(function(n){return /^第\s*\d+\s*空/.test(n.t);})[0];
    var blankQNum=bPager?String(bPager.number):(STATE.activeBlankQNum?String(STATE.activeBlankQNum):(STATE.lastPagerNumber?String(STATE.lastPagerNumber):'1'));
    var stemTop=v.n.filter(function(n){return n.y>H*.10&&n.y<Math.min(H*.32,firstBlankNode.y)&&!/^第\s*\d+\s*空|^(?:章节测验|实验过程|待重做|未达到及格线.*|请由此重做.*)$/.test(n.t)&&!/^\d+\.\d+/.test(n.t);})[0];
    starts.push({t:blankQNum+'. 填空题',x:W*.12,y:stemTop?Math.max(H*.10,stemTop.y-H*.02):Math.max(H*.12,firstBlankNode.y-H*.12),synthetic:true});
  }
  starts.sort(function(a,b){return a.y-b.y;});
  starts=starts.filter(function(n,i){
    return n.y<H*.95&&(i===0||n.y-starts[i-1].y>H*.02);});
  v.n.filter(function(n){return /^第\s*1\s*空/.test(n.t)&&n.y>H*.16&&n.y<H*.90;}).forEach(function(b1Node){
    var prevStarts=starts.filter(function(s){return s.y<b1Node.y;});
    var prevStart=prevStarts.length?prevStarts[prevStarts.length-1]:null;
    if(prevStart){
      var optsBetween=v.n.filter(function(n){
        return n.y>prevStart.y+H*.03&&n.y<b1Node.y-H*.03&&(/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)||isCompactOptionRowText(n.t)||/^(?:对|错|正确|错误)$/.test(n.t.trim()));
      });
      if(optsBetween.length>=1){
        var lastOptY=optsBetween[optsBetween.length-1].y;
        var prevM=prevStart.t.match(/^\s*(\d{1,3})/);
        var nextQNum=prevM?(Number(prevM[1])+1):(STATE.activeBlankQNum||2);
        var blankStemNode=v.n.filter(function(n){
          return n.y>lastOptY+H*.025&&n.y<b1Node.y-H*.01&&!/^(?:对|错|正确|错误|写笔记)$/.test(n.t.trim());
        })[0];
        var synthBlankY=blankStemNode?Math.max(lastOptY+H*.03,blankStemNode.y-H*.01):Math.max(lastOptY+H*.04,b1Node.y-H*.08);
        starts.push({t:nextQNum+'. 填空题',x:W*.12,y:synthBlankY,synthetic:false});
        starts.sort(function(a,b){return a.y-b.y;});}}});
  if(bPager&&starts.length===1){
    var pNum=bPager.number,pTotal=bPager.total;
    if(pNum>=1&&pNum<=pTotal){
      var curM=starts[0].t.match(/^\s*(\d{1,3})/);
      var curNum=curM?Number(curM[1]):0;
      if(!curNum||(pNum>=10&&curNum===pNum%10)||curNum>pTotal){
        var rest=starts[0].t.replace(/^\s*\d{1,3}\s*[.．、,，·•:：)）]?\s*/,'');
        starts[0]={t:pNum+'. '+(rest||'单选题'),x:starts[0].x,y:starts[0].y,node:starts[0].node,synthetic:true};
      }}}
  var items=[];
  starts.forEach(function(start,idx){
    var top=start.y;
    var bottom=idx+1<starts.length?starts[idx+1].y:H*.96;
    if(idx+1===starts.length){
      v.n.forEach(function(n){
        if(n.y>Math.max(top+H*.10,H*.42)&&n.y<bottom&&
           (/^[<＜《\s]*(?:上一题|下一题|答题卡|提交|提交答案|提交测验|下一节|上一节)/.test(n.t)||/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t)))
          bottom=Math.min(bottom,n.y-H*.02);});}
    var section=v.n.filter(function(n){
      return n.y>=top&&n.y<bottom;});
    var blankNodes=section.filter(function(n){return /^第\s*\d+\s*空/.test(n.t);});
    var isNonChoice=/填空|简答|问答|论述|名词解释/.test(start.t)||blankNodes.length>0;
    var options=[];
    if(!isNonChoice){
      section.forEach(function(n){
        var m=n.t.match(/^\s*([A-H])\s*[.．、:：)）]?\s*$/i);
        if(m&&!options.some(function(o){
          return o.l===m[1].toUpperCase();
        }))options.push({l:m[1].toUpperCase(),n:n,t:''});
        var combined=matchCompactOptionRow(n.t);
        if(combined){
          var letter=combined[1].toUpperCase(),combinedText=combined[2].replace(/\s+/g,' ').trim();
          var existing=options.filter(function(o){return o.l===letter;})[0];
          if(existing){
            if(n.selected)existing.n.selected=true;
            if(combinedText.length>existing.t.length)
              existing.t=combinedText;
          }else options.push({l:letter,n:n,t:combinedText});
        }else if(n.y>top+H*.03&&/^(?:对|正确|√)$/.test(n.t.trim())){
          if(!options.some(function(o){return o.l==='A';}))options.push({l:'A',n:n,t:'对'});
        }else if(n.y>top+H*.03&&/^(?:错|错误|×)$/.test(n.t.trim())){
          if(!options.some(function(o){return o.l==='B';}))options.push({l:'B',n:n,t:'错'});}
      });
      recoverSectionOptionGaps(options,section,top);
      options.sort(function(a,b){return a.n.y-b.n.y;});
      options.forEach(function(o,i){
        var end=i+1<options.length?options[i+1].n.y:bottom;
        var rowNodes=section.filter(function(n){
          return n.y>=o.n.y-H*.015&&n.y<end-4&&
            !/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&
            !isCompactOptionRowText(n.t)&&
            n!==o.n&&
            !/^[<＜《\s]*(?:上一题|下一题|答题卡|下一节|上一节|写笔记|提交)/.test(n.t)&&
            !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t);});
        var content=rowNodes.map(function(n){return n.t.replace(/\s+/g,' ').trim();}).join(' ').slice(0,220);
        if(content.length>o.t.length)o.t=content;});}
    var first=options.length?options[0].n.y:bottom;
    if(/填空|简答|问答|论述|名词解释/.test(start.t)||blankNodes.length){
      section.forEach(function(n){
        if(n.y>top+H*.02&&
           (/^(请输入答案|请输入内容|请输入文字|点击输入|保存|提交)$/.test(n.t)||/^第\s*\d+\s*空/.test(n.t))&&
           n.y<first)first=n.y;});}
    var hasFirstBlankLabel=blankNodes.some(function(bn){return /^第\s*1\s*空/.test(bn.t);});
    var qNodes=(blankNodes.length&&!hasFirstBlankLabel)?[]:section.filter(function(n){
      return n.y<first-4&&!/解压|文件管理|网盘在线|默认选项|运行中脚本|学习通助手|^写笔记$|^(?:章节测验|待重做|未达到及格线.*|请由此重做.*)$/.test(n.t.trim());
    });
    qNodes.sort(function(a,b){return Math.abs(a.y-b.y)<18?(a.x-b.x):(a.y-b.y);});
    var qParts=[];
    for(var qi=0;qi<qNodes.length;qi++){
      var curQ=qNodes[qi];
      var segText=curQ.t;
      if(/填空/.test(start.t)||blankNodes.length){
        segText=segText.replace(/([：:，,、；;])\s*(?=[，,。；;、])/g,'$1 (___) ');
        segText=segText.replace(/([\u4e00-\u9fff：:，,、])\s+(?=[\u4e00-\u9fff，,。；;、])/g,'$1 (___) ');
        segText=segText.replace(/(?:释出|分解为|生成|寿命为|其中以|种有|最为显著的是|四大基石是|三减是指[:：]?)\s*(?=[，,。；;、]|$)/g,function(m){return m.trim()+' (___) ';});
        segText=segText.replace(/(?:不超过|不少于|不低于|约为)\s*(?=[克毫升岁分钟小时天%％])/g,function(m){return m.trim()+' (___) ';});
        segText=segText.replace(/和\s*([，,。；;])/g,'和 (___) $1');
        segText=segText.replace(/生成\s*([。；;]?)$/,'生成 (___) $1');
        segText=segText.replace(/在\s*(?:\(___\)\s*[、,，]?\s*){1,2}等单[核梭]吞噬/,'在 (___)、(___)、(___) 等单核吞噬');
      }
      qParts.push(segText);}
    var q=qParts.join(' ').slice(0,800);
    if(/填空/.test(start.t)||blankNodes.length){
      q=q.replace(/细胞识别\s*(?:并吞噬[，,\s]*释出\s*)?此物/,'细胞识别并吞噬，释出 (___) ，此物');}
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
          break;}}
      if(begin>=0){
        for(var i=begin+1;i<parts.length;i++){
          if(/^\d{1,3}\s*[.．、,，]/.test(parts[i])){
            end=i;
            break;}}
        var seg=parts.slice(begin,end);
        options.forEach(function(o){
          if(o.t)return;
          for(var i=0;i<seg.length;i++){
            if(new RegExp('^'+o.l+'\\s*$').test(seg[i])){
              var words=[];
              for(var j=i+1;j<seg.length;j++){
                if(/^[A-H]\s*$|^\d{1,3}\s*[.．、,，]/.test(seg[j]))
                  break;
                words.push(seg[j]);}
              o.t=words.join(' ').slice(0,220);
              break;}}});}}
    var headerType=(start.t.match(/(?:单选|多选|判断|填空|简答|问答|论述|名词解释)题?/)||[])[0];
    if(!headerType){
      var typeNode=section.filter(function(n){return typeLabel(n.t);})[0];
      if(typeNode){
        headerType=typeNode.t;
      }else if(blankNodes.length){
        headerType='填空';
      }else if(section.some(function(n){return /^(?:对|错|正确|错误)$/.test(n.t.trim());})||(options.length===2&&options.every(function(o){return /^(?:对|错|正确|错误|√|×)$/.test(o.t.trim());}))){
        headerType='判断';
      }else if(!options.length&&section.some(function(n){return /请输入文字|请输入答案|请输入内容/.test(n.t);})){
        headerType='简答';
      }else{
        headerType='单选';}}
    var maxBlank=0;
    blankNodes.forEach(function(bn){
      var bm=bn.t.match(/第\s*(\d+)\s*空/);
      if(bm)maxBlank=Math.max(maxBlank,Number(bm[1]));});
    var qKind=(/填空/.test(headerType)||blankNodes.length)?'blank':
      /多选/.test(headerType)?'multiple':
      /判断/.test(headerType)?'judge':
      /简答|问答|论述|名词解释/.test(headerType)?'short':'single';
    if(qKind==='judge'&&options.length<2){
      var jRows=section.filter(function(n){
        return n.y>top+H*0.04&&n.y<bottom-H*0.015&&(/^(?:[AB]?\s*[.．、:：)）]?\s*)?(?:A|B|对|错|正确|错误|√|×)$/i.test(n.t.trim())||n.selected);
      }).sort(function(a,b){return a.y-b.y;});
      var yA=jRows[0]?jRows[0].y:Math.round(top+H*0.14);
      var yB=jRows[1]?jRows[1].y:Math.round(yA+H*0.068);
      options=[
        {l:'A',n:{t:'A',x:Math.round(W*0.084),y:yA,node:null,selected:!!(jRows[0]&&jRows[0].selected)},t:'对'},
        {l:'B',n:{t:'B',x:Math.round(W*0.084),y:yB,node:null,selected:!!(jRows[1]&&jRows[1].selected)},t:'错'}
      ];}
    if(qKind==='blank'&&!start.synthetic&&num&&Number(num[1])>0){
      STATE.activeBlankQNum=Number(num[1]);}
    items.push({
      q:q,
      kind:qKind,
      options:options,y:top,blankCount:maxBlank,
      synthetic:!!start.synthetic});});
  v._questions=items;
  return items;}
function questionId(item){
  var m=item.q.match(/^\s*(\d{1,3})\s*(?:[.．、,，:：)）]|[\[［【(（])/);
  return m?m[1]+':'+item.kind:
    item.q.replace(/\s+/g,'').slice(0,60);}
function pagerInfo(v){
  var bp=bottomPagerCard(v);
  if(bp){
    STATE.lastPagerNumber=bp.number;
    STATE.lastPagerTotal=bp.total;
    return bp;}
  var card=v.s.match(/(?:^|\D)(\d{1,3})\s*\/\s*(\d{1,3})(?:\D|$)/);
  var nav=cxFind(v,/下一题|上一题|答题卡/,H*.48);
  if(!card||!nav)return null;
  STATE.lastPagerNumber=Number(card[1]);
  STATE.lastPagerTotal=Number(card[2]);
  return {number:Number(card[1]),total:Number(card[2]),y:nav.y};}
function pagerAllAnswered(pager){
  for(var i=1;i<=pager.total;i++){
    var prefix=i+':',found=false;
    Object.keys(STATE.answered).forEach(function(k){
      if(k.indexOf(prefix)===0&&STATE.answered[k])found=true;});
    if(!found)return false;}
  return true;}
function quizSubmitButton(v){return cxFind(v,/^\s*(?:提\s*交(?:答案|测验|作业)?|交\s*卷|完成并提交)\s*$/,H*.13);}
function quizViewportSignature(v){
  return v.n.filter(function(n){
    return n.y>H*.16&&n.y<H*.92&&n.t.trim().length>=2&&!/^(写笔记|讨论|\d{1,2}:\d{2})$/.test(n.t.trim());
  }).slice(0,8).map(function(n){return n.t.replace(/\s+/g,'').slice(0,18)+'@'+Math.round(n.y/95);}).join('|');
}
function quizRecordSignature(){
  return STATE.quizContext+'|'+Object.keys(STATE.answered).filter(function(id){return STATE.answered[id];}).sort().join(',');
}
function seekQuizForward(v,fromId){
  var seek=STATE.quizSeek;
  if(!seek||(fromId&&seek.fromId!==fromId))seek=STATE.quizSeek={fromId:fromId||'',steps:0,still:0,signature:'',halt:false};
  var subBtn=quizSubmitButton(v);
  if(subBtn){
    submitWorkIfComplete(v,fromId||'');
    return;}
  if(chapterNextButton(v)&&!questions(v).length){
    STATE.quizPending=false;STATE.quizSeek=null;
    if(STATE.quizContext){STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};STATE.chapterQuizCompleted[STATE.quizContext]=true;}
    cxLog('已到达章节底部下一节区域，释放测验等待并继续章节流程');
    return;}
  var signature=quizViewportSignature(v);
  if(signature===seek.signature)seek.still++;
  else seek.still=0;
  seek.signature=signature;
  if(seek.still>=2||seek.steps>=8)seek.halt=true;
  if(seek.halt){
    STATE.quizPending=false;STATE.quizSeek=null;
    if(STATE.quizContext){STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};STATE.chapterQuizCompleted[STATE.quizContext]=true;}
    cxLog('已滑至测验底部且无待提交按钮，交回章节巡航流程');
    if(isChapterContent(v)){chapter(v);return;}
    sleep(350);return;}
  swipeToNextQuestion();seek.steps++;STATE.lastScroll=Date.now();sleep(180);}
function auditWholeWork(){
  var initial=view(),hold=STATE.quizAuditHold;
  if(hold&&hold.record===quizRecordSignature()&&hold.signature===quizViewportSignature(initial))return null;
  STATE.quizAuditHold=null;
  STATE.lastScanPage=initial;
  var result=scanWholeWork(initial);
  if(!result)STATE.quizAuditHold={record:quizRecordSignature(),signature:quizViewportSignature(STATE.lastScanPage||view())};
  return result;}
function scanWholeWork(initial){
  var page=null,topFound=false,previous='',still=0;
  for(var up=0;up<55;up++){
    page=up===0?initial:view();
    if(questions(page).some(function(q){
      return Number(questionId(q).split(':')[0])===1;
    })){
      topFound=true;
      break;}
    var signature=quizViewportSignature(page);
    still=signature===previous?still+1:0;previous=signature;
    if(still>=3){
      if(questions(page).length>0)topFound=true;
      break;}
    swipeQuizToTop();
    sleep(130);}
  if(!topFound){
    cxLog('提交核对：未找到第 1 题，暂不提交');
    return null;}
  var seen={},confirmed={},ids={},maxNumber=0,submitSeen=0;
  var activeNumber=0;
  var bottom=null;
  previous='';still=0;
  Object.keys(STATE.answered).forEach(function(id){
    var m=id.match(/^(\d{1,3}):/);
    if(m&&STATE.answered[id])confirmed[Number(m[1])]=true;});
  for(var step=0;step<85;step++){
    if(step)page=view();
    var heads=questions(page);
    var isRedoQuiz=/未达到及格线|请由此重做|待重做/.test(page.s);
    heads.forEach(function(q){
      var number=Number(questionId(q).split(':')[0]);
      if(!number||number>200)return;
      seen[number]=true;
      ids[number]=questionId(q);
      maxNumber=Math.max(maxNumber,number);
      if(!isRedoQuiz&&alreadyAnswered(page,q))confirmed[number]=true;});
    page.n.forEach(function(n){
      if(isRedoQuiz||!n.selected||(!/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&!isCompactOptionRowText(n.t)))
        return;
      var owner=activeNumber;
      heads.forEach(function(q){
        var number=Number(questionId(q).split(':')[0]);
        if(number&&q.y<n.y)owner=number;});
      if(owner&&seen[owner]&&(!/:multiple$/.test(ids[owner]||'')||
         (STATE.multipleConfirmed&&STATE.multipleConfirmed[ids[owner]])))confirmed[owner]=true;
    });
    if(heads.length){
      var last=heads[heads.length-1];
      var lastNumber=Number(questionId(last).split(':')[0]);
      if(lastNumber)activeNumber=lastNumber;}
    var submit=quizSubmitButton(page);
    if(submit){
      if(++submitSeen>=2){bottom={page:page,submit:submit};break;}
      sleep(350);
      continue;}
    submitSeen=0;
    var signature=quizViewportSignature(page);
    still=signature===previous?still+1:0;previous=signature;
    if(still>=2)break;
    swipeToNextQuestion();
    sleep(140);}
  STATE.lastScanPage=page||initial;
  if(!bottom||!maxNumber){
    cxLog('提交核对：未确认已经到达整页末尾，暂不提交');
    return null;}
  STATE.workTotal=maxNumber;
  Object.keys(confirmed).forEach(function(number){
    STATE.answered[ids[number]||number+':single']=true;});
  var missing=[];
  for(var i=1;i<=maxNumber;i++){
    if(!seen[i]||!confirmed[i])missing.push(i);}
  if(missing.length){
    STATE.auditMissing=[missing[0]];STATE.auditRecoverySteps=0;STATE.auditRecoverySignature='';STATE.auditRecoveryStill=0;
    missing.forEach(function(number){
      var prefix=number+':';
      [STATE.answered,STATE.choiceAttempted,STATE.multipleConfirmed,STATE.multipleFailures,STATE.scanFailures].forEach(function(map){
        if(!map)return;
        Object.keys(map).forEach(function(key){
          if(key.indexOf(prefix)===0)delete map[key];});});});
    STATE.blocked='';STATE.navBlocked='';STATE.lastQuiz='';
    cxLog('提交核对：第 '+missing.join('、')+' 题未确认已作答，暂不提交');
    return null;}
  STATE.auditMissing=[];
  cxLog('提交核对：第 1 至 '+maxNumber+' 题均已确认作答');
  return bottom;}
function unansweredWarning(v){
  return /(?:还有|存在|有).*(?:未答|未作答)|题目未.*(?:回答|作答)|未答题|漏答题|尚未作答/.test(v.s);}
function submissionFailed(v){
  if(!STATE.awaitingSubmitResult&&(questions(v).length>0||/请由此重做|待重做/.test(v.s)))return false;
  return /提交失败|提交出错/.test(v.s)||(STATE.awaitingSubmitResult&&/未达到及格线|未达及格线/.test(v.s));}
function submissionSucceeded(v){
  if(submissionFailed(v)||unansweredWarning(v))return false;
  if(pagerInfo(v)||quizSubmitButton(v)||/第\s*\d+\s*空|请输入答案|请输入文字/.test(v.s))return false;
  if(!STATE.afterSubmit&&!STATE.awaitingSubmitResult&&/请由此重做|待重做|未达到及格线/.test(v.s))return false;
  return v.n.some(function(n){
    return /(?:本次|最终|最高|测验|作业)?(?:得分|成绩)[:：]?\s*\d|^(?:已提交|作业已提交|提交成功|作业提交成功|测验已完成|作业已完成|待批阅|待批改|查看答案|我的答案[:：]?)/.test(n.t.trim());
  });}
function finishPager(v){
  var pager=pagerInfo(v);
  if(!pager||pager.number!==pager.total)return false;
  if(STATE.awaitingSubmitResult){if(Date.now()-(STATE.awaitingSubmitAt||0)<12000){sleep(400);return true;}STATE.awaitingSubmitResult=false;}
  if(!pagerAllAnswered(pager)){
    var missingNums=[];
    for(var mi=1;mi<=pager.total;mi++){
      var mPrefix=mi+':';
      var mDone=Object.keys(STATE.answered).some(function(k){return k.indexOf(mPrefix)===0&&STATE.answered[k];});
      if(!mDone)missingNums.push(mi);}
    var prevBtn=cxFind(v,/上一题/,H*.48);
    if(prevBtn||pager.y){
      cxLog('已到末题，回退补答未确认题目：第 '+missingNums.join('、')+' 题');
      if(prevBtn&&cxPress(prevBtn))sleep(500);
      else {tap(Math.round(W*0.16),pager.y);sleep(500);}
      if(STATE.lastPagerNumber>1)STATE.lastPagerNumber--;
      return true;}
    if(Date.now()-STATE.lastLog>12000){
      STATE.lastLog=Date.now();
      cxLog('已到末题，但仍有未确认答案；暂不提交');}
    return true;}
  if(Date.now()-STATE.lastFinishAt<8000)return true;
  STATE.lastFinishAt=Date.now();
  var submit=cxFind(v,/^(提交|交卷|提交答案|提交测验|完成)$/);
  if(!submit){
    tap(W*.85,pager.y);
    sleep(500);
    v=view();
    submit=cxFind(v,/^(提交|交卷|提交答案|提交测验|完成)$/);}
  if(!submit){
    var card=cxFind(v,/答题卡/,H*.48);
    if(card){
      tap(W*.50,card.y);
      sleep(500);
      v=view();
      submit=cxFind(v,/^(提交|交卷|提交答案|提交测验|完成)$/);}}
  if(submit){
    cxPress(submit);
    sleep(650);
    var confirmPage=view(),confirm=cxFind(confirmPage,/^(确定|确认提交|确认交卷|继续提交)$/);
    if(confirm&&!unansweredWarning(confirmPage)){tap(confirm.x,confirm.y);STATE.awaitingSubmitResult=true;STATE.awaitingSubmitAt=Date.now();sleep(350);}
    var submittedResult=view();
    for(var wait=0;wait<10&&!submissionSucceeded(submittedResult);wait++){
      if(submissionFailed(submittedResult)||unansweredWarning(submittedResult))break;
      handleSubmitConfirmation(submittedResult);sleep(350);submittedResult=view();}
    if(!submissionSucceeded(submittedResult)){
      cxLog('末题已点提交，但未确认提交成功，停留核对');
      return true;}
    STATE.awaitingSubmitResult=false;STATE.quizPending=false;
    STATE.afterSubmit=true;STATE.taskTopReady=false;STATE.taskTopSignature='';
    cxLog('已确认末题提交，返回章节检查剩余任务点');
  }else{
    cxLog('末题没有提交按钮，停留核对');
    return true;}
  STATE.returnBackTried=false;
  return true;}
function submitWorkIfComplete(v,lastId){
  if(pagerInfo(v)||!quizSubmitButton(v))return false;
  STATE.quizSeek=null;
  if(STATE.awaitingSubmitResult){if(Date.now()-(STATE.awaitingSubmitAt||0)<12000){sleep(400);return true;}STATE.awaitingSubmitResult=false;}
  if(Date.now()-STATE.lastFinishAt<8000)return true;
  STATE.lastFinishAt=Date.now();
  var total=STATE.workTotal||0;
  questions(v).forEach(function(q){total=Math.max(total,Number(questionId(q).split(':')[0])||0);});
  total=Math.max(total,Number(String(lastId||'').split(':')[0])||0);
  Object.keys(STATE.answered).forEach(function(id){
    if(STATE.answered[id])total=Math.max(total,Number(id.split(':')[0])||0);});
  var missing=[];
  for(var number=1;number<=total;number++){
    var done=Object.keys(STATE.answered).some(function(id){
      return id.indexOf(number+':')===0&&STATE.answered[id];});
    if(!done)missing.push(number);}
  if(!total){cxLog('尚未识别到测验题号，暂不提交');return true;}
  var audit;
  if(missing.length){
    cxLog('提交前还有 '+missing.join('、')+' 题缺少确认记录，重新核对，禁止直接提交');
    audit=auditWholeWork();
    if(!audit)return true;
  }else{
    audit={page:v,submit:quizSubmitButton(v)};
    cxLog('全部 '+total+' 题已有作答确认，直接提交，不回滚');}
  STATE.auditMissing=[];
  if(!cxPress(audit.submit))return true;
  STATE.awaitingSubmitResult=true;STATE.awaitingSubmitAt=Date.now();
  sleep(420);
  var confirmPage=view(),confirm=cxFind(confirmPage,/^(确定|确认提交|继续提交)$/);
  if(confirm&&!unansweredWarning(confirmPage)){tap(confirm.x,confirm.y);sleep(350);}
  var result=view();
  for(var wait=0;wait<10&&!submissionSucceeded(result);wait++){
    if(submissionFailed(result)||unansweredWarning(result)||/还有.*未完成/.test(result.s))break;
    var lateConfirm=cxFind(result,/^(确定|确认提交|继续提交)$/);
    if(lateConfirm&&!unansweredWarning(result)&&/确认提交|确定提交|是否提交|确认交卷/.test(result.s))tap(lateConfirm.x,lateConfirm.y);
    sleep(280);
    result=view();}
  if(submissionSucceeded(result)){
    STATE.awaitingSubmitResult=false;
    STATE.quizPending=false;
    cxLog('整页题目核对完毕，已提交测验');
    STATE.afterSubmit=true;STATE.taskTopReady=false;STATE.taskTopSignature='';
    STATE.returnBackTried=false;
  }else if(unansweredWarning(result)){
    STATE.awaitingSubmitResult=false;
    STATE.quizPending=true;
    cxLog('学习通明确提示未答题，停止确认提交并停留检查');
  }else if(submissionFailed(result)){
    STATE.awaitingSubmitResult=false;
    STATE.quizPending=true;
    cxLog('学习通提示未及格或提交失败，保留当前页面，停止重复提交，请核对答案');
  }else cxLog('已点击提交，但页面未确认提交成功，请核对');
  return true;}
function advanceQuestion(v,fromId){
  var navWait=260-(Date.now()-STATE.lastQuestionNav);
  if(navWait>0)sleep(navWait);
  var button=cxFind(v,/下一题/,H*.52);
  var card=cxFind(v,/答题卡/,H*.52);
  var navY=button?button.y:(card?card.y:0);
  if(!navY)return false;
  var navX=(button&&button.x>W*.65&&button.x<W*.96)?button.x:W*.84;
  if(!tap(navX,navY)){
    if(!button||!cxPress(button))return false;}
  STATE.lastQuestionNav=Date.now();
  sleep(240);
  if(!fromId){
    if(STATE.lastPagerNumber)STATE.lastPagerNumber=STATE.lastPagerNumber+1;
    cxLog('已点击下一题');return true;}
  function navigationState(page){
    var match=page.s.match(/(?:^|\D)(\d{1,3})\s*\/\s*\d{1,3}(?:\D|$)/);
    var oldNumber=String(fromId).split(':')[0];
    if(match)return match[1]===oldNumber?'same':'changed';
    var heads=questions(page);
    if(heads.length)
      return questionId(heads[0])===fromId?'same':'changed';
    if(/第\s*\d+\s*空/.test(page.s)&&!/:blank$/.test(fromId))return 'changed';
    return 'unknown';}
  for(var poll=0;poll<3;poll++){
    if(poll>0)sleep(250);
    var after=view(),state=navigationState(after);
    if(state==='changed'){
      var pm=after.s.match(/(?:^|\D)(\d{1,3})\s*\/\s*\d{1,3}(?:\D|$)/);
      if(pm)STATE.lastPagerNumber=Number(pm[1]);
      else if(STATE.lastPagerNumber)STATE.lastPagerNumber=STATE.lastPagerNumber+1;
      STATE.preloadedQuizView=after;cxLog('已进入下一题');return true;}
    if(state==='unknown'&&poll>=1){
      if(STATE.lastPagerNumber)STATE.lastPagerNumber=STATE.lastPagerNumber+1;
      cxLog('已点击下一题，等待题目显示');
      return true;}}
  if(button&&button.node)cxPress(button);
  else tap(W*.86,navY);
  sleep(480);
  var retryAfter=view(),retryState=navigationState(retryAfter);
  if(retryState==='changed'||retryState==='unknown'){
    var rpm=retryAfter.s.match(/(?:^|\D)(\d{1,3})\s*\/\s*\d{1,3}(?:\D|$)/);
    if(rpm)STATE.lastPagerNumber=Number(rpm[1]);
    else if(STATE.lastPagerNumber)STATE.lastPagerNumber=STATE.lastPagerNumber+1;
    if(retryState==='changed')STATE.preloadedQuizView=retryAfter;
    cxLog('已进入下一题');return true;}
  cxLog('下一题按钮点击后题号未变化，稍后重试');
  return false;}
function alreadyAnswered(v,item){
  var qid=questionId(item);
  if(item.kind==='multiple')return !!(STATE.multipleConfirmed&&STATE.multipleConfirmed[qid]);
  var heads=questions(v),end=H*.96;
  heads.forEach(function(h){
    if(questionId(h)!==qid&&h.y>item.y&&h.y<end)end=h.y;});
  var section=v.n.filter(function(n){
    return n.y>=item.y&&n.y<end;});
  if(item.kind!=='short'&&item.kind!=='blank'){
    if(!SCREEN_CAPTURE_READY&&STATE.answered&&STATE.answered[qid])return true;
    if(item.options&&item.options.some(function(o){return o.n&&o.n.selected;}))return true;
    return section.some(function(n){
      return n.selected&&(/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)||isCompactOptionRowText(n.t)||/^(?:对|错|正确|错误|√|×)$/.test(n.t.trim()));
    });}
  if(item.kind==='blank'){
    var visBlanks=section.filter(function(n){return /^第\s*\d+\s*空/.test(n.t)&&n.y<H*.80;});
    var hasEmptyHint=section.some(function(n){return /请\s*输\s*[入人]|点\s*击\s*输\s*[入人]/.test(n.t);});
    if(hasEmptyHint)return false;
    if((STATE.shortSaved&&STATE.shortSaved[questionId(item)])||(STATE.answered&&STATE.answered[questionId(item)]))return true;
    if(visBlanks.length>0&&!hasEmptyHint){
      var allVisFilled=visBlanks.every(function(bl,idx){
        var nextY=(idx+1<visBlanks.length)?visBlanks[idx+1].y:H*.88;
        return section.some(function(n){
          return n.y>bl.y+H*.016&&n.y<Math.min(nextY-H*.01,bl.y+H*.115)&&
            !/^第\s*\d+\s*空|请输入|点击输入|^[<＜《\s]*(?:上一题|下一题|答题卡|提交|保存|写笔记)|^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t)&&
            n.t.trim().length>=1;});});
      if(allVisFilled)return true;}}
  if((STATE.shortSaved&&STATE.shortSaved[questionId(item)])||(STATE.answered&&STATE.answered[questionId(item)]))return true;
  if(section.some(function(n){
    return /我的答案[:：]?|^(已保存|已提交|查看答案)$/.test(n.t);
  }))return true;
  return false;}
function visibleChoices(v,limitY,minY){
  var nodes=v.n.filter(function(n){
    return n.y>(minY||H*.12)&&n.y<(limitY||H*.96);});
  var out=[];
  nodes.forEach(function(n){
    var m=n.t.match(/^\s*([A-H])\s*[.．、:：)）]?\s*$/i);
    if(m&&!out.some(function(o){
      return o.l===m[1].toUpperCase();
    }))out.push({l:m[1].toUpperCase(),n:n,t:''});
    var combined=matchCompactOptionRow(n.t);
    if(combined){
      var letter=combined[1].toUpperCase(),combinedText=combined[2].replace(/\s+/g,' ').trim();
      var existing=out.filter(function(o){return o.l===letter;})[0];
      if(existing){
        if(n.selected)existing.n.selected=true;
        if(combinedText.length>existing.t.length)
          existing.t=combinedText;
      }else out.push({l:letter,n:n,t:combinedText});
    }else if(/^(?:对|正确|√)$/.test(n.t.trim())){
      if(!out.some(function(o){return o.l==='A';}))out.push({l:'A',n:n,t:'对'});
    }else if(/^(?:错|错误|×)$/.test(n.t.trim())){
      if(!out.some(function(o){return o.l==='B';}))out.push({l:'B',n:n,t:'错'});}});
  recoverSectionOptionGaps(out,nodes,minY||H*.12);
  out.sort(function(a,b){return a.n.y-b.n.y;});
  out.forEach(function(o,i){
    var bottom=i+1<out.length?
      out[i+1].n.y:(limitY||H*.96);
    var rowNodes=nodes.filter(function(n){
      return n.y>=o.n.y-H*.012&&n.y<bottom-4&&
        !/^\s*[A-H]\s*[.．、:：)）]?\s*$/i.test(n.t)&&
        !isCompactOptionRowText(n.t)&&
        n!==o.n&&
        !/^[<＜《\s]*(?:上一题|下一题|答题卡|下一节|上一节|写笔记|提交)/.test(n.t)&&
        !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(n.t);});
    if(!o.n.selected&&rowNodes.some(function(rn){return !!rn.selected;}))o.n.selected=true;
    var content=rowNodes.map(function(n){return n.t;}).join(' ').slice(0,220);
    if(content.length>o.t.length)o.t=content;});
  return out;}
function addChoices(item,choices){
  choices.forEach(function(o){
    if(o.n&&o.n.selected)item.preselected=true;
    if(!o.t&&item.visualFrames&&item.visualFrames.length)o.t='图片选项 '+o.l;
    if(!o.t)return;
    var old=null;
    item.options.forEach(function(x){
      if(x.l===o.l)old=x;});
    if(!old)item.options.push({l:o.l,t:o.t});
    else if(o.t.length>old.t.length)old.t=o.t;});
  item.options.sort(function(a,b){
    return a.l.localeCompare(b.l);});}
function scanQuestion(first,initialView){
  var id=questionId(first);
  STATE.scanDrafts=STATE.scanDrafts||{};
  var item={q:first.q,kind:first.kind,options:[],blankCount:first.blankCount||0,complete:false};
  STATE.scanDrafts[id]=item;
  var v=null,steps=0,still=0,previous='',nextSeen=false;
  var upRecoveries=0,targetNumber=Number(id.split(':')[0]);
  if(item.kind==='blank'){
    if(!initialView||!initialView.n.some(function(n){return /^第\s*1\s*空/.test(n.t)&&n.y>H*0.10&&n.y<H*0.80;})){
      initialView=scrollBlankToFirst();}
    var topHeads=questions(initialView);
    var topSame=topHeads.filter(function(x){return questionId(x)===id;})[0]||topHeads.filter(function(x){return x.kind==='blank';})[0]||topHeads[0];
    var hasNextQOnScreen=topHeads.some(function(x){return Number(questionId(x).split(':')[0])>targetNumber;});
    if(topSame&&topSame.q&&topSame.q.length>=8){
      item.q=topSame.q;
      item.blankCount=Math.max(item.blankCount||0,topSame.blankCount||0);}
    if(!hasNextQOnScreen){
      initialView.n.forEach(function(n){
        if(!topSame||n.y>=topSame.y){
          var bm=n.t.match(/^第\s*(\d+)\s*空/);
          if(bm)item.blankCount=Math.max(item.blankCount||0,Number(bm[1]));}});
      var stemGapCount=(String(item.q||'').match(/\(___\)/g)||[]).length;
      if(stemGapCount>0&&stemGapCount<=10)item.blankCount=Math.max(item.blankCount||0,stemGapCount);
    }
    item.scanSteps=0;
    item.lastScanView=initialView;
    item.complete=true;
    cxLog('题号 '+id+'：首屏提取填空题干完毕（预估空数='+(item.blankCount||1)+'），直接开始作答');
    return item;}
  var stemHadOptions=first.options&&first.options.length>0;
  for(var loop=0;loop<10;loop++){
    v=loop===0?initialView:view();
    var heads=questions(v),nextHead=null;
    var same=heads.filter(function(x){
      return questionId(x)===id||(targetNumber>0&&Number(questionId(x).split(':')[0])===targetNumber);
    })[0];
    if(same&&same.kind!==item.kind&&(item.kind==='single'||same.kind==='blank'||same.kind==='judge')){
      item.kind=same.kind;
      id=questionId(same);}
    heads.forEach(function(x){
      if(questionId(x)!==id&&
         (same?x.y>same.y+H*.015:
          Number(questionId(x).split(':')[0])>targetNumber)&&
         !nextHead)nextHead=x;});
    var limit=nextHead?nextHead.y:H*.96;
    var workEnd=cxFind(v,/^(保存|提交|提交答案|提交测验)$/,H*.13);
    if(workEnd&&(!same||workEnd.y>same.y))limit=Math.min(limit,workEnd.y-H*.012);
    if(!nextHead){
      var nav=cxFind(v,/^[<＜《\s]*(?:上一题|下一题|答题卡)|^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/,H*.45);
      if(nav&&nav.y>H*.45)limit=Math.min(limit,nav.y-H*.02);}
    if(same){
      if((!stemHadOptions&&same.options&&same.options.length>0&&same.q.length>=10)||same.q.length>item.q.length){
        item.q=same.q;
        if(same.options&&same.options.length>0)stemHadOptions=true;}
      if(same.blankCount&&same.blankCount>(item.blankCount||0))item.blankCount=same.blankCount;
      addChoices(item,same.options);}
    if(same||!heads.some(function(h){return Number(questionId(h).split(':')[0])<targetNumber;}))collectVisionFrame(item,v,same,limit);
    if(item.kind==='short'&&same&&same.q.length>=20){
      item.complete=true;
      break;}
    var earlier=heads.filter(function(h){
      return Number(questionId(h).split(':')[0])<targetNumber;});
    if(item.kind!=='short'&&(same||!earlier.length)){
      addChoices(
        item,
        visibleChoices(v,limit,same?same.y:H*.12)
      );}
    if(item.kind==='short'&&same&&
       (v.n.some(function(n){
         return n.y>same.y&&n.y<limit&&
           /请输入答案|请输入内容|请输入文字|点击输入/.test(n.t);
       })||
       (cxFind(v,/^保存$/,same.y)&&cxFind(v,/^提交$/,same.y)))){
      item.complete=true;
      break;}
    var signature=v.n.filter(function(n){
      return n.y>H*.18&&n.y<H*.90&&!/写笔记|讨论|学习通助手/.test(n.t);
    }).map(function(n){return n.t.slice(0,24)+'@'+Math.round(n.y/42);}).join('|');
    still=signature===previous?still+1:0;
    previous=signature;
    var pager=pagerInfo(v);
    if((same||!earlier.length)&&item.kind!=='short'&&item.kind!=='blank'&&
       item.options.length>=(item.kind==='judge'?2:4)&&
       choicesComplete(item)){
      if(item.kind==='judge'||item.kind==='single'){
        var sBotRef=pager?pager.y:limit;
        var sShown=visibleChoices(v,sBotRef,same?same.y:H*.12);
        var sLast=item.options[item.options.length-1].l;
        if(item.kind==='judge'||nextHead||workEnd||sShown.some(function(o){return o.l===sLast&&o.n.y<sBotRef-H*.035;})){
          item.complete=true;
          break;}}
      var bottomRef=pager?pager.y:limit;
      var shown=visibleChoices(v,bottomRef,same?same.y:H*.12);
      var last=item.options[item.options.length-1].l;
      var clearance=(item.options.length>=5||nextHead||workEnd)?H*.03:(pager?H*.08:H*.10);
      if(shown.some(function(o){
        return o.l===last&&o.n.y<bottomRef-clearance;
      })){
        item.complete=true;
        break;}}
    if(workEnd&&(!same||workEnd.y>same.y)&&choicesComplete(item)){
      item.complete=true;break;}
    if(nextHead){
      if(!same&&item.kind!=='short'&&!choicesComplete(item)&&upRecoveries<1){
        upRecoveries++;
        swipeQuizDown();
        sleep(180);
        continue;}
      nextSeen=true;
      break;}
    if(still>=2&&steps>0)break;
    if(item.kind==='blank')swipeBlankPageDown();
    else swipeQuiz();
    steps++;
    sleep(120);}
  item.scanSteps=steps;
  item.lastScanView=v;
  item.complete=!!(item.complete||(v&&(nextSeen||still>=1)));
  cxLog('题号 '+id+'：扫描 '+steps+
      ' 次，选项='+item.options.map(function(o){
        return o.l+'('+o.t.length+')';
      }).join(',')+
      '，到达题尾='+item.complete);
  return item;}
function choicesComplete(item){
  if(item.kind==='short'||item.kind==='blank')return true;
  var minCount=item.kind==='judge'?2:4;
  if(item.options.length<minCount)return false;
  return item.options.every(function(o,i){
    return o.l===String.fromCharCode(65+i)&&!!o.t;});}
function returnToQuestion(id,steps,currentView){
  var isBlankTarget=/:blank$/.test(String(id||''));
  if(currentView){
    if(isBlankTarget&&currentView.n&&currentView.n.some(function(n){return /^第\s*\d+\s*空/.test(n.t);}))return currentView;
    if(questions(currentView).some(function(q){return questionId(q)===id&&(steps===0||q.y<H*0.78||(q.options&&q.options.length>=2));}))return currentView;
  }
  for(var i=0;i<steps+4;i++){
    var v=(i===0&&currentView)?currentView:view();
    var pager=pagerInfo(v);
    if(questions(v).some(function(q){
      return questionId(q)===id&&q.y<H*0.82;
    }))return v;
    if(isBlankTarget&&v.n.some(function(n){return /^第\s*\d+\s*空/.test(n.t);}))return v;
    if(pager)break;
    swipeQuizDown();
    sleep(150);}
  return currentView||view();}
function shortInputCount(v){
  var m=v.s.match(/已输入\s*(\d+)\s*字/);
  return m?Number(m[1]):0;}
function clipboardCandidate(text){
  var probe=String(text||'').replace(/\s+/g,'').slice(0,7);
  if(!probe.length)return null;
  function match(t,x,y){
    if(y<=H*.63||y>=H*.723)return false;
    var clean=String(t||'').replace(/\s+/g,'').replace(/^[口日目回◻▭📋]+/,'');
    if(!clean)return false;
    if(/^(?:分词|确认|完成|搜索|下一项|123|符|中\/英|语音输入|正在聆听|请说话|Ai|AI|拆|✕|×|X)$/i.test(clean))return false;
    if(probe.length<4&&x>W*.58)return false;
    if(probe.length>=2&&clean.length<2)return false;
    if(clean.indexOf(probe)>=0||probe.indexOf(clean)>=0)return true;
    if(probe.length>=2&&clean.length>=2&&x<W*0.48){
      var p2=probe.slice(0,2),pEnd=probe.slice(-2);
      if(clean.indexOf(p2)>=0||(probe.length>=3&&clean.indexOf(pEnd)>=0))return true;}
    return false;}
  var matches=view().n.filter(function(n){return match(n.t,n.x,n.y);});
  if(!matches.length){
    var image=picture();
    if(image)try{
      var results;
      try{results=ocr.detect(image);}
      catch(e){
        if(ocr.mlkit&&ocr.mlkit.detect)results=ocr.mlkit.detect(image);
        else throw e;}
      var size=screenSize(),sx=(size.w||W)/image.getWidth(),sy=(size.h||H)/image.getHeight();
      if(Array.isArray(results))results.forEach(function(r){
        var t=String(r.label||r.text||''),b=r.bounds;
        if(!b)return;
        var x=(b.left+b.right)*sx/2,y=(b.top+b.bottom)*sy/2;
        if(match(t,x,y))
          matches.push({t:t,x:x,y:y});});
    }catch(e){cxLog('识别键盘剪贴板候选失败：'+e);}
    finally{try{safeRecycle(image);}catch(ignore){}}}
  matches.sort(function(a,b){return Math.abs(a.y-H*.69)-Math.abs(b.y-H*.69);});
  return matches[0]||null;}
function findClipboardBubbleOnImage(){
  var im=picture();
  if(!im)return null;
  try{
    var iw=im.getWidth(),ih=im.getHeight();
    if(iw>ih)return null;
    var darkCount=0,sumX=0,sumY=0;
    for(var y=Math.floor(0.670*ih);y<Math.floor(0.712*ih);y+=2){
      for(var x=Math.floor(0.045*iw);x<Math.floor(0.25*iw);x+=2){
        var c=images.pixel(im,x,y);
        var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
        if(r<85&&g<85&&b<85){
          darkCount++;
          sumX+=x/iw;
          sumY+=y/ih;}}}
    if(darkCount>=18){
      var cx=Math.round((sumX/darkCount)*W);
      var cy=Math.round((sumY/darkCount)*H);
      return {x:Math.max(Math.round(W*0.09),Math.min(Math.round(W*0.20),cx)),y:Math.max(Math.round(H*0.680),Math.min(Math.round(H*0.706),cy)),count:darkCount};
    }
    return null;
  }catch(ignore){return null;}
  finally{try{safeRecycle(im);}catch(ignore){}}}
function forceWriteClipboardForIme(ans){
  if(STATE.lastClipAns===ans){
    safeSetClip(ans+' ');
    sleep(130);
  }else{
    safeSetClip('');
    sleep(35);}
  safeSetClip(ans);
  STATE.lastClipAns=ans;
  sleep(55);}
function tapImeClipboardChip(ans){
  var bubble=findClipboardBubbleOnImage();
  if(bubble&&tap(bubble.x,bubble.y)){
    cxLog('已精准点击输入法剪贴板词条('+bubble.x+','+bubble.y+')：'+ans.slice(0,10));
    return true;}
  var clip=clipboardCandidate(ans);
  if(clip&&tap(clip.x,clip.y)){
    cxLog('已点击输入法剪贴板候选词条：'+ans.slice(0,10));
    return true;}
  return false;}
function fillShort(text,minY,qid,existingPage){
  function editableFields(){
    var out=[];
    try{cxSelector().editable(true).find().forEach(function(n){
      var b=n.bounds();
      if(b.centerY()>(minY||H*.12)&&b.centerY()<H*.92)
        out.push(n);
    });}catch(e){}
    try{cxClassName('android.widget.EditText').find().forEach(function(n){
      var b=n.bounds();
      if(b.centerY()>(minY||H*.12)&&b.centerY()<H*.92)
        out.push(n);
    });}catch(e){}
    return out;}
  var page=existingPage||view(),before=shortInputCount(page);
  if(before>0){
    if(qid)STATE.shortAttempted[qid]=true;
    cxLog('简答输入：页面已有 '+before+' 字，停止写入以避免重复');
    return true;}
  var hint=cxFind(
    page,
    /请输入答案|请输入内容|请输入文字|点击输入/,
    minY
  );
  var targetX=W*.25,targetY=0;
  if(hint){
    targetX=Math.max(W*.20,Math.min(hint.x,W*.45));
    targetY=Math.min(hint.y+H*.04,H*.52);
  }else{
    var save=cxFind(page,/^(?:保存|提交)$/,minY);
    if(!save)return false;
    targetY=Math.min(H*.52,save.y-H*.06,
      Math.max((minY||H*.12)+H*.11,save.y-H*.28));}
  targetY=Math.min(targetY,H*.52);
  var fields=editableFields(),focused=null;
  fields.forEach(function(n){
    try{if(n.focused())focused=n;}catch(ignore){}});
  if(!focused&&fields.length){
    fields.sort(function(a,b){
      return Math.abs(a.bounds().centerY()-targetY)-
        Math.abs(b.bounds().centerY()-targetY);});
    focused=fields[0];}
  var isSingleShort=!!(NO_AX_BACKEND&&CFG.singleCharFix&&text.length===1&&!/^[a-zA-Z0-9._+-]$/.test(text));
  var clipShort=isSingleShort?(text+text):text;
  var pastedByChip=false;
  try{
    forceWriteClipboardForIme(clipShort);
    if(!tap(targetX,targetY)){
      cxLog('简答输入：编辑区点击失败，停止输入');
      return false;}
    sleep(650);
    if(tapImeClipboardChip(clipShort)){
      pastedByChip=true;
      if(isSingleShort){
        sleep(220);
        runShellCmd('input keyevent 67');
        sleep(160);}
    }else{
      if(focused){
        requireLearningApp();
        if(focused.setText(text))pastedByChip=true;
      }else{
        closeKeyboardSafely();
        return false;}}
  }catch(e){
    if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;
    cxLog('简答输入操作异常，停止重试以防重复：'+e);
    return false;}
  sleep(420);
  closeKeyboardSafely();
  var afterPage=view(),after=shortInputCount(afterPage);
  var hintGone=!!hint&&!cxFind(afterPage,/请输入答案|请输入内容|请输入文字|点击输入/,minY);
  if(pastedByChip||after>before||hintGone||shortVisible(text,afterPage)){
    if(qid)STATE.shortAttempted[qid]=true;
    cxLog('简答输入：已确认写入文本（字数 '+before+' -> '+(after||text.length)+'）');
    return true;}
  cxLog('简答输入：无法从页面确认文字，已停止再次输入；目标坐标 '+
      Math.round(targetX)+','+Math.round(targetY));
  return false;}
function shortVisible(text,existingPage){
  var cleanText=String(text||'').replace(/\s+/g,'');
  if(!cleanText)return false;
  var page=existingPage||view();
  var cleanPage=page.s.replace(/\s+/g,'');
  var probes=[cleanText.slice(0,6),cleanText.slice(0,3),cleanText.slice(-4)].filter(function(p){return p.length>=2;});
  for(var pi=0;pi<probes.length;pi++){
    if(cleanPage.indexOf(probes[pi])>=0)return true;}
  try{
    var fields=cxClassName('android.widget.EditText').find();
    var yes=false;
    fields.forEach(function(n){
      if(String(n.text()||'').replace(/\s+/g,'').indexOf(probes[0])>=0)yes=true;});
    return yes;
  }catch(e){return false;}}
function isKeyboardVisibleOnImage(im){
  if(!isImageAlive(im))return false;
  try{
    var iw=im.getWidth(),ih=im.getHeight();
    if(iw>ih)return false;
    var pureWhiteLeft=0,kbBgGrayLeft=0,fnKeyGray=0;
    for(var yi=0;yi<12;yi++){
      var y=Math.floor((0.725+yi*0.020)*ih);
      for(var xi=0;xi<8;xi++){
        var x=Math.floor((0.04+xi*0.048)*iw);
        var c=images.pixel(im,x,y);
        var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
        if(r>=250&&g>=250&&b>=250)pureWhiteLeft++;
        else if(r>=195&&r<=246&&g>=198&&g<=247&&b>=204&&b<=250&&Math.abs(r-g)<=8)kbBgGrayLeft++;
      }}
    var fnYs=[0.875,0.885,0.895,0.935,0.945,0.955];
    var fnXs=[0.04,0.08,0.12,0.18,0.22];
    for(var fyi=0;fyi<fnYs.length;fyi++){
      var fy=Math.floor(fnYs[fyi]*ih);
      for(var fxi=0;fxi<fnXs.length;fxi++){
        var fx=Math.floor(fnXs[fxi]*iw);
        var fc=images.pixel(im,fx,fy);
        var fr=(fc>>16)&255,fg=(fc>>8)&255,fb=fc&255;
        if(fr>=162&&fr<=204&&fg>=166&&fg<=208&&fb>=175&&fb<=218&&fb>=fr+4)fnKeyGray++;}}
    return (fnKeyGray>=6&&kbBgGrayLeft>=12)||(kbBgGrayLeft>=26&&pureWhiteLeft<=58);
  }catch(ignore){return false;}}
function keyboardOpen(){
  var im=picture();
  if(im){
    try{
      if(isKeyboardVisibleOnImage(im))return true;
      return false;
    }finally{try{safeRecycle(im);}catch(ignore){}}}
  try{
    if(NO_AX_BACKEND){
      var res=runShellCmd('dumpsys input_method | grep -E "mInputShown=true|isInputShown=true|mImeWindowVis=0x[1-9a-f]"');
      var out=res?String(res.result||res.out||''):'';
      if(/mInputShown=true|isInputShown=true|mImeWindowVis=0x[1-9a-f]/.test(out))return true;
    }
  }catch(ignore){}
  var shown=false;
  try{cxTextMatches(/\S+/.source).find().forEach(function(n){
    var pkg=String(n.packageName()||''),b=n.bounds();
    if(b.centerY()>H*.56&&
       /(?:inputmethod|keyboard|baidu|sogou|iflytek|gboard|vivo\.ime)/i.test(pkg))
      shown=true;
  });}catch(e){}
  return shown;}
function closeKeyboardSafely(){
  if(!keyboardOpen())return false;
  safeBack();
  sleep(420);
  return true;}
function dismissKeyboardOnQuizPage(){
  closeKeyboardSafely();}
function clearFocusedInputBox(charLen){
  requireLearningApp();
  var delCount=Math.max(6,Math.min(16,(Number(charLen)||4)+4));
  if(NO_AX_BACKEND){
    var keys=['123'];
    for(var i=0;i<delCount;i++)keys.push('67');
    keys.push('112','112');
    runShellCmd('input keyevent '+keys.join(' '));
    sleep(140);
    return true;}
  try{
    var fields=cxClassName('android.widget.EditText').find();
    fields.forEach(function(f){try{if(f.focused())f.setText('');}catch(ignore){}});
  }catch(ignore){}
  return true;}
function tryDirectSetBlankText(boxY,ans){
  requireLearningApp();
  try{
    var edits=[];
    try{cxClassName('android.widget.EditText').find().forEach(function(n){edits.push(n);});}catch(ignore){}
    try{cxSelector().editable(true).find().forEach(function(n){if(edits.indexOf(n)<0)edits.push(n);});}catch(ignore){}
    for(var i=0;i<edits.length;i++){
      var b=edits[i].bounds();
      if(b&&Math.abs(b.centerY()-boxY)<H*0.045){
        if(edits[i].setText(ans)){
          sleep(200);
          return true;}}}
  }catch(ignore){}
  return false;}
function repairMissingBlankLabels(blankLabels,targetTotal,atBottom){
  blankLabels.sort(function(a,b){return a.idx-b.idx;});
  for(var i=0;i<blankLabels.length-1;i++){
    var cur=blankLabels[i],nxt=blankLabels[i+1];
    var diff=nxt.idx-cur.idx;
    var dy=nxt.node.y-cur.node.y;
    if(diff===2&&dy>H*0.16&&dy<H*0.36){
      var midY=Math.round((cur.node.y+nxt.node.y)/2);
      blankLabels.splice(i+1,0,{idx:cur.idx+1,node:{t:'第'+(cur.idx+1)+'空:',x:cur.node.x,y:midY,synthetic:true}});
      i++;}}
  if(atBottom&&blankLabels.length>=2){
    var last=blankLabels[blankLabels.length-1],prev=blankLabels[blankLabels.length-2];
    var stepY=(last.idx-prev.idx===1)?Math.max(Math.round(H*0.115),Math.min(Math.round(H*0.155),last.node.y-prev.node.y)):Math.round(H*0.128);
    if(last.idx<targetTotal&&last.node.y+stepY<H*0.83){
      blankLabels.push({idx:last.idx+1,node:{t:'第'+(last.idx+1)+'空:',x:last.node.x,y:Math.round(last.node.y+stepY),synthetic:true}});
    }}}
function blankBoxExistingText(page,bNode,nextY){
  var minY=bNode.y+H*0.016;
  var maxY=Math.min(nextY-H*0.012,bNode.y+H*0.115);
  var parts=page.n.filter(function(n){
    if(n.y<=minY||n.y>=maxY)return false;
    var t=String(n.t||'').trim().replace(/^[|｜\s]+/,'').replace(/[|｜\s]+$/,'');
    if(!t)return false;
    if(/^[|｜I1l!\s]*请\s*输|输\s*[入人]|答\s*案|点\s*击\s*输|^第\s*\d+\s*空|^[<＜《\s]*(?:上一题|下一题|答题卡|提交|保存|写笔记|语音输入)|^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(t))return false;
    return true;
  }).map(function(n){return String(n.t||'').trim().replace(/^[|｜\s]+/,'').replace(/[|｜\s]+$/,'');});
  var joined=parts.join('').replace(/^[|｜\s]+/,'').trim();
  if(!joined||/^[|｜I1l!]?请\s*输\s*[入人]|输\s*[入人]\s*答\s*案|点\s*击\s*输\s*[入人]/.test(joined))return '';
  return joined;}
function isBlankAnswerMatch(cleanExist,cleanWant){
  if(!cleanExist||!cleanWant)return false;
  if(cleanExist===cleanWant)return true;
  if(/酶$/.test(cleanExist)!==/酶$/.test(cleanWant))return false;
  var lenDiff=Math.abs(cleanExist.length-cleanWant.length);
  if(lenDiff>1)return false;
  if(cleanExist.length>=2&&cleanWant.length>=2&&(cleanWant.indexOf(cleanExist)>=0||cleanExist.indexOf(cleanWant)>=0))return true;
  if(cleanWant.length>=2&&cleanExist.length>=1&&cleanWant.slice(-cleanExist.length)===cleanExist&&cleanExist.length>=cleanWant.length-1)return true;
  if(cleanExist.length===cleanWant.length&&cleanWant.length>=2){
    var sameChars=0;
    for(var ci=0;ci<cleanWant.length;ci++){
      if(cleanExist.charAt(ci)===cleanWant.charAt(ci))sameChars++;}
    if(sameChars>=cleanWant.length-1)return true;}
  return false;}
function swipeBlankPageDown(){
  closeKeyboardSafely();
  doSwipe(Math.round(W*0.06),Math.round(H*0.60),Math.round(W*0.06),Math.round(H*0.40),560);}
function scrollBlankToFirst(){
  closeKeyboardSafely();
  var lastView=null,prevSig='';
  for(var topTry=0;topTry<6;topTry++){
    var checkTop=view();
    lastView=checkTop;
    var b1=checkTop.n.filter(function(n){return /^第\s*1\s*空/.test(n.t)&&n.y>H*0.10&&n.y<H*0.82;})[0];
    if(b1&&(b1.y<H*0.65||questions(checkTop).length>1)){
      return checkTop;}
    var sig=quizViewportSignature(checkTop);
    if(topTry>=1&&sig===prevSig)return checkTop;
    prevSig=sig;
    swipeQuizToTop();
    sleep(320);}
  return lastView;}
function fillBlankQuestion(item,reply,startView){
  var id=questionId(item),expectedQNum=Number(String(id).split(':')[0])||0;
  if(expectedQNum>0)STATE.activeBlankQNum=expectedQNum;
  var blanks=Array.isArray(reply.blanks)?reply.blanks:(Array.isArray(reply.answer)?reply.answer:[]);
  if(!blanks.length&&reply.text){
    blanks=String(reply.text).split(/[\n；;、，,]+/).map(function(s){return s.replace(/^第\s*\d+\s*空[:：.\s]*/,'').trim();}).filter(Boolean);
  }
  if(!blanks.length){
    cxLog('填空题未返回有效答案数组：'+id);
    return false;}
  startView=scrollBlankToFirst();
  var initHeads=questions(startView).filter(function(h){return !h.synthetic&&h.kind==='blank';});
  if(initHeads.length===1){
    var realNum=Number(String(questionId(initHeads[0])).split(':')[0])||0;
    if(realNum>0){
      expectedQNum=realNum;
      STATE.activeBlankQNum=realNum;
      id=realNum+':blank';
      if(item&&item.q){
        item.q=/^\s*\d{1,3}\s*[.．、,，:：)）［\[【(（]/.test(item.q)?
          item.q.replace(/^\s*\d{1,3}/,String(realNum)):
          (realNum+'. '+item.q);}}}
  var filled={},attempts={},clearedMap={},recheckRetried={},recheckVerified={};
  var targetTotal=Math.max(item.blankCount||0,blanks.length),still=0,prevSig='';
  var lastFocusedBlankIdx=0,recheckedAll=false;
  var maxSteps=Math.max(36,targetTotal*3+14);
  for(var step=0;step<maxSteps;step++){
    var page=(step===0&&startView)?startView:view();
    startView=null;
    var curPager=pagerInfo(page);
    var allVisibleHeads=questions(page);
    var realVisibleHeads=allVisibleHeads.filter(function(h){return !h.synthetic;});
    var hasAnyBlankNode=page.n.some(function(n){return /^第\s*\d+\s*空/.test(n.t);});
    var mismatchHead=(expectedQNum>0&&!hasAnyBlankNode&&realVisibleHeads.length===1&&Number(String(questionId(realVisibleHeads[0])).split(':')[0])!==expectedQNum)?realVisibleHeads[0]:null;
    if((curPager&&expectedQNum>0&&curPager.number!==expectedQNum)||mismatchHead){
      var actualNum=curPager?curPager.number:Number(String(questionId(mismatchHead)).split(':')[0]);
      cxLog('填空题题号变化（当前第 '+actualNum+' 题，目标第 '+expectedQNum+' 题），停止当前题写入');
      STATE.lastAnswerView=page;
      return false;}
    var sameBlankHead=allVisibleHeads.filter(function(h){return Number(String(questionId(h)).split(':')[0])===expectedQNum;})[0];
    var nextQHeadOnPage=allVisibleHeads.filter(function(h){return expectedQNum>0&&Number(String(questionId(h)).split(':')[0])>expectedQNum;})[0];
    var minBlankY=sameBlankHead?Math.max(H*0.07,sameBlankHead.y):H*0.07;
    var maxBlankY=nextQHeadOnPage?Math.min(H*0.86,nextQHeadOnPage.y-H*0.02):H*0.86;
    var blankLabels=[];
    page.n.forEach(function(n){
      var m=n.t.match(/^第\s*(\d+)\s*空/);
      if(m&&n.y>minBlankY&&n.y<maxBlankY){
        var idx=Number(m[1]);
        targetTotal=Math.max(targetTotal,idx);
        if(!blankLabels.some(function(b){return b.idx===idx;}))
          blankLabels.push({idx:idx,node:n});}});
    if(nextQHeadOnPage&&blankLabels.length>0){
      var maxVisIdx=blankLabels[blankLabels.length-1].idx;
      if(targetTotal>maxVisIdx)targetTotal=maxVisIdx;}
    if(targetTotal>blanks.length&&!item.__reaskedFull){
      item.__reaskedFull=true;
      item.blankCount=targetTotal;
      cxLog('填空题 '+id+'：发现实际共有 '+targetTotal+' 空（原返回 '+blanks.length+' 空），重新请求完整 '+targetTotal+' 空答案');
      try{
        var newReply=ask(item);
        var newBlanks=Array.isArray(newReply.blanks)?newReply.blanks:(Array.isArray(newReply.answer)?newReply.answer:[]);
        if(newBlanks.length>=targetTotal){
          var oldBlanks=blanks;
          blanks=newBlanks;
          for(var pk=1;pk<=oldBlanks.length;pk++){
            if(filled[pk]&&!isBlankAnswerMatch(String(oldBlanks[pk-1]||'').replace(/\s+/g,''),String(newBlanks[pk-1]||'').replace(/\s+/g,''))){
              delete filled[pk];
              delete clearedMap[pk];
              attempts[pk]=0;}}
          continue;}
      }catch(e){if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;}}
    var expectedDone=Math.min(blanks.length,targetTotal);
    var atBottomScreen=(still>=1)||blankLabels.some(function(b){return b.idx>=expectedDone&&b.node.y<H*0.84;});
    repairMissingBlankLabels(blankLabels,expectedDone,atBottomScreen);
    for(var bi=0;bi<blankLabels.length;bi++){
      var bCheck=blankLabels[bi],kCheck=bCheck.idx;
      if(kCheck>blanks.length)continue;
      var wantAns=String(blanks[kCheck-1]||'').trim();
      var nextBlankY=(bi+1<blankLabels.length)?blankLabels[bi+1].node.y:H*0.90;
      var existingTxt=blankBoxExistingText(page,bCheck.node,nextBlankY);
      bCheck.existingTxt=existingTxt;
      var cleanExist=existingTxt.replace(/\s+/g,'');
      var cleanWant=wantAns.replace(/\s+/g,'');
      if(isBlankAnswerMatch(cleanExist,cleanWant)){
        if(!filled[kCheck]){
          filled[kCheck]=true;
          cxLog('填空题 '+id+'：第 '+kCheck+' 空已核对一致('+wantAns+')');}
        recheckVerified[kCheck]=true;
      }else if(recheckedAll){
        if(cleanExist.length>0){
          filled[kCheck]=true;
          recheckVerified[kCheck]=true;
        }else if(!recheckRetried[kCheck]){
          cxLog('填空题复查：发现第 '+kCheck+' 空为空白，执行一次补填');
          recheckRetried[kCheck]=true;
          clearedMap[kCheck]=true;
          delete filled[kCheck];
          attempts[kCheck]=0;}}}
    var operableBlanks=blankLabels.filter(function(cand){
      return !filled[cand.idx]&&cand.idx<=blanks.length&&(attempts[cand.idx]||0)<2&&(cand.node.y<=H*0.76||atBottomScreen);
    });
    var dirtyBlanks=!recheckedAll?operableBlanks.filter(function(cand){
      return String(cand.existingTxt||'').trim().length>0&&!clearedMap[cand.idx];
    }):[];
    if(dirtyBlanks.length>0){
      dismissKeyboardOnQuizPage();
      requireLearningApp();
      for(var di=0;di<dirtyBlanks.length;di++){
        var dirtyBlank=dirtyBlanks[di],dk=dirtyBlank.idx;
        var dBoxY=Math.min(Math.round(H*0.84),Math.round(dirtyBlank.node.y+H*0.052));
        var dOldTxt=String(dirtyBlank.existingTxt||'').trim();
        cxLog('填空题 '+id+'：清除第 '+dk+' 空旧记录('+dOldTxt.slice(0,10)+')');
        clearedMap[dk]=true;
        dirtyBlank.existingTxt='';
        if(tap(Math.round(W*0.64),dBoxY)){
          lastFocusedBlankIdx=dk;
          sleep(420);
          clearFocusedInputBox(dOldTxt.length);
          sleep(100);
          closeKeyboardSafely();}}}
    if(operableBlanks.length>0){
      var anyActedOnScreen=false;
      for(var oi=0;oi<operableBlanks.length;oi++){
        var targetBlank=operableBlanks[oi],k=targetBlank.idx;
        if(filled[k]||(attempts[k]||0)>=2)continue;
        var ans=String(blanks[k-1]||'').trim();
        if(!ans){
          filled[k]=true;
          recheckVerified[k]=true;
          continue;}
        var boxY=Math.min(Math.round(H*0.84),Math.round(targetBlank.node.y+H*0.052));
        if(tryDirectSetBlankText(boxY,ans)){
          attempts[k]=(attempts[k]||0)+1;
          filled[k]=true;
          recheckVerified[k]=true;
          anyActedOnScreen=true;
          cxLog('填空题 '+id+'：已直接写入第 '+k+' 空 -> '+ans);
          continue;}
        requireLearningApp();
        if(lastFocusedBlankIdx===k){
          var otherBlank=blankLabels.filter(function(b){return b.idx!==k&&b.node.y>H*0.10&&b.node.y<=H*0.76;})[0];
          if(otherBlank){
            var otherBoxY=Math.min(Math.round(H*0.84),Math.round(otherBlank.node.y+H*0.052));
            tap(Math.round(W*0.28),otherBoxY);
            sleep(200);
            closeKeyboardSafely();
            lastFocusedBlankIdx=otherBlank.idx;
          }else{
            tap(Math.round(W*0.08),Math.max(Math.round(H*0.14),Math.round(targetBlank.node.y-H*0.01)));
            sleep(180);
            lastFocusedBlankIdx=0;}}
        var isSingleChinese=!!(NO_AX_BACKEND&&CFG.singleCharFix&&ans.length===1&&!/^[a-zA-Z0-9._+-]$/.test(ans));
        var clipText=isSingleChinese?(ans+ans):ans;
        forceWriteClipboardForIme(clipText);
        if(tap(Math.round(W*0.28),boxY)){
          lastFocusedBlankIdx=k;
          anyActedOnScreen=true;
          sleep(540);
          if(!keyboardOpen()){
            var altBlank=blankLabels.filter(function(b){return b.idx!==k&&b.node.y>H*0.10&&b.node.y<=H*0.76;})[0];
            if(altBlank){
              tap(Math.round(W*0.28),Math.min(Math.round(H*0.84),Math.round(altBlank.node.y+H*0.052)));
              sleep(200);
              closeKeyboardSafely();
            }else{
              tap(Math.round(W*0.08),Math.max(Math.round(H*0.14),Math.round(targetBlank.node.y-H*0.01)));
              sleep(180);}
            forceWriteClipboardForIme(clipText);
            tap(Math.round(W*0.42),boxY);
            sleep(540);}
          var pastedOk=false;
          if(NO_AX_BACKEND&&/^[a-zA-Z0-9._+-]+$/.test(ans)){
            runShellCmd('input text "'+ans+'"');
            pastedOk=true;
            cxLog('填空题 '+id+'：已直接键入第 '+k+' 空 -> '+ans);
          }else{
            pastedOk=tapImeClipboardChip(clipText);
            if(!pastedOk){
              closeKeyboardSafely();
              tap(Math.round(W*0.08),Math.max(Math.round(H*0.14),Math.round(targetBlank.node.y-H*0.01)));
              sleep(180);
              forceWriteClipboardForIme(clipText);
              tap(Math.round(W*0.42),boxY);
              sleep(560);
              pastedOk=tapImeClipboardChip(clipText);}
            if(pastedOk){
              if(isSingleChinese){
                sleep(180);
                runShellCmd('input keyevent 67');
                sleep(140);
                cxLog('填空题 '+id+'：已通过双写回删填入单字第 '+k+' 空 -> '+ans);
              }else{
                cxLog('填空题 '+id+'：已粘贴第 '+k+' 空 -> '+ans);}
            }else{
              cxLog('填空题 '+id+'：第 '+k+' 空未检测到剪贴板气泡，稍后复查补填');}}
          sleep(220);
          closeKeyboardSafely();
          attempts[k]=(attempts[k]||0)+1;
          if(pastedOk){
            filled[k]=true;
            recheckVerified[k]=true;}
          if(ans.length>14)break;}}
      if(anyActedOnScreen&&Object.keys(filled).length<expectedDone){
        var allScreenDone=blankLabels.every(function(b){return filled[b.idx]||b.idx>blanks.length||(attempts[b.idx]||0)>=2;});
        if(!allScreenDone)continue;}}
    var doneCount=Object.keys(filled).length;
    var verifiedCount=Object.keys(recheckVerified).length;
    var pager=pagerInfo(page),saveBtn=cxFind(page,/^保存$/,H*.14);
    var anyUnfilledOnScreen=blankLabels.some(function(b){
      return !filled[b.idx]&&b.idx<=blanks.length&&(attempts[b.idx]||0)<2;});
    var sig=quizViewportSignature(page);
    still=(sig===prevSig)?still+1:0;
    prevSig=sig;
    var recheckFinished=recheckedAll&&(atBottomScreen||verifiedCount>=expectedDone);
    if((!recheckedAll&&!anyUnfilledOnScreen&&doneCount>=expectedDone&&(pager||saveBtn||quizSubmitButton(page)||atBottomScreen))||
       (!recheckedAll&&still>=2&&!anyUnfilledOnScreen&&doneCount>0)||
       (recheckedAll&&!anyUnfilledOnScreen&&(recheckFinished||still>=2))){
      if(!recheckedAll&&CFG.doubleRecheck&&verifiedCount<expectedDone){
        recheckedAll=true;
        still=0;
        prevSig='';
        cxLog('填空题 '+id+'：回顶快速补漏巡检...');
        startView=scrollBlankToFirst();
        continue;}
      if(saveBtn&&saveBtn.y>H*.50&&saveBtn.y<H*.94){tap(saveBtn.x,saveBtn.y);sleep(420);page=view();}
      STATE.shortSaved[id]=true;
      STATE.lastAnswerView=page;
      cxLog('填空题 '+id+'：全部处理并核对完毕（'+doneCount+'/'+expectedDone+' 空）');
      return true;}
    swipeBlankPageDown();
    sleep(380);}
  if(Object.keys(filled).length>0){
    STATE.shortSaved[id]=true;
    return true;}
  return false;}
function applyAnswer(item,reply){
  var id=questionId(item);
  if(item.kind==='blank'){
    var blankStart=returnToQuestion(id,item.scanSteps,item.lastScanView);
    if(!blankStart)return false;
    return fillBlankQuestion(item,reply,blankStart);}
  if(item.kind==='short'){
    var shortStart=returnToQuestion(id,item.scanSteps,item.lastScanView);
    if(!shortStart)return false;
    var text=String(reply.text||'').trim();
    if(!text){
      cxLog('简答题未返回文本');
      return false;}
    for(var k=0;k<Math.min(item.scanSteps+4,12);k++){
      var page=k===0?shortStart:view();
      var head=questions(page).filter(function(x){
        return questionId(x)===id;
      })[0];
      if(head&&alreadyAnswered(page,head))return true;
      if(STATE.shortAttempted[id]){
        cxLog('简答题此前已尝试输入，停止重复写入，题号 '+id);
        return false;}
      if(fillShort(text,head?head.y+20:H*.12,id,page)){
        sleep(300);
        if(keyboardOpen()){
          safeBack();
          sleep(380);}
        var savePage=view();
        if(foregroundPackage()!==PKG){
          cxLog('保存前已离开学习通，停止点击');
          return false;}
        var save=cxFind(savePage,/^保存$/,H*.14);
        if(save&&save.y>H*.30&&save.y<H*.95){
          tap(save.x,save.y);
          sleep(450);
          savePage=view();}
        STATE.shortSaved[id]=true;
        STATE.lastAnswerView=savePage;
        cxLog('简答题已填写完毕，题号 '+id);
        return true;}
      if(!head&&k>2)break;
      swipeQuiz();
      sleep(350);}
    cxLog('简答题文字未写入输入框，题号 '+id);
    return false;}
  var rawAnswers=Array.isArray(reply.answer)?reply.answer:[reply.answer||reply.text||''];
  var letters=[];
  rawAnswers.forEach(function(value){
    var sVal=String(value||'').trim();
    var matches=sVal.toUpperCase().match(/[A-H]/g)||[];
    if(!matches.length&&item.kind==='judge'){
      if(/对|正确|√|TRUE|^T$/i.test(sVal))matches=['A'];
      else if(/错|错误|×|FALSE|^F$/i.test(sVal))matches=['B'];}
    matches.forEach(function(letter){if(letters.indexOf(letter)<0)letters.push(letter);});});
  var selected={};
  if(!letters.length||letters.some(function(l){
    return !item.options.some(function(o){return o.l===l;});
  }))return false;
  if(item.kind!=='multiple'&&letters.length!==1)return false;
  if(item.kind==='multiple'){
    STATE.multipleExpected[id]=letters.slice();STATE.multipleConfirmed[id]=false;}
  var targetNumber=Number(id.split(':')[0])||0;
  function choiceBoundsForPage(page){
    var heads=questions(page),target=null,limit=H*.96,top=H*.12;
    heads.forEach(function(h){
      if(questionId(h)===id||(targetNumber>0&&Number(questionId(h).split(':')[0])===targetNumber))target=h;
    });
    if(target){
      top=target.y;
      heads.forEach(function(h){
        if(questionId(h)!==id&&h.y>top+H*.015&&h.y<limit)limit=h.y;});
      return {found:true,top:top,limit:limit,needScrollDown:false};}
    var lowerHeads=heads.filter(function(h){return (Number(questionId(h).split(':')[0])||0)<targetNumber;});
    var higherHeads=heads.filter(function(h){return (Number(questionId(h).split(':')[0])||0)>targetNumber;});
    if(lowerHeads.length&&!higherHeads.length){
      return {found:false,top:H*.96,limit:H*.96,needScrollDown:true};}
    if(higherHeads.length){
      higherHeads.forEach(function(h){if(h.y<limit)limit=h.y;});
      if(lowerHeads.length){
        var prevH=lowerHeads[lowerHeads.length-1];
        top=Math.max(H*.14,prevH.y+H*.22);}
      return {found:true,top:top,limit:limit,needScrollDown:false};}
    if(pagerInfo(page)||!heads.length){
      return {found:true,top:top,limit:limit,needScrollDown:false};}
    return {found:false,top:H*.96,limit:H*.96,needScrollDown:true};}
  function tapChoiceOption(page,choice){
    var circleX=(choice.n.x>W*.03&&choice.n.x<W*.20)?
      choice.n.x:(pagerInfo(page)?Math.round(W*.084):Math.round(W*.106));
    return tap(circleX,choice.n.y);}
  // 若 lastScanView 当前屏已直接包含全部目标选项，则直接在当前屏秒点，无需回滚！
  var startView=item.lastScanView;
  if(startView){
    var sb=choiceBoundsForPage(startView);
    var sChoices=sb.found?visibleChoices(startView,sb.limit,sb.top).filter(function(c){return c.n.y>H*.14&&c.n.y<H*.91;}):[];
    var allTargetVisible=letters.every(function(l){return sChoices.some(function(c){return c.l===l;});});
    if(!allTargetVisible&&item.scanSteps>0){
      startView=returnToQuestion(id,item.scanSteps,item.lastScanView);}}
  else{
    startView=returnToQuestion(id,item.scanSteps,null);}
  if(!startView)return false;
  var carriedView=startView;
  for(var step=0;step<item.scanSteps+letters.length+8;step++){
    var v=carriedView||view();
    carriedView=null;
    var bounds=choiceBoundsForPage(v),top=bounds.top,limit=bounds.limit;
    if(bounds.needScrollDown){
      swipeQuiz();
      sleep(180);
      continue;}
    var choices=visibleChoices(v,limit,top).filter(function(c){
      return c.n.y>top+H*.012&&c.n.y<limit-4;
    }),acted=false,scrolledInLoop=false;
    if(item.kind==='multiple'){
      var extraChoices=choices.filter(function(c){return c.n.selected&&letters.indexOf(c.l)<0;});
      if(extraChoices.length){
        extraChoices.forEach(function(extraChoice,idx){
          if(idx>0)sleep(110);
          tapChoiceOption(v,extraChoice);
          extraChoice.n.selected=false;});
        sleep(140);}
      var batch=[];
      choices.forEach(function(o){
        if(letters.indexOf(o.l)<0)return;
        if(o.n.selected){selected[o.l]=true;return;}
        if(!selected[o.l]&&o.n.y>H*.14&&o.n.y<H*.88)batch.push(o);});
      if(batch.length){
        var tappedLetters=[];
        batch.forEach(function(o,idx){
          if(idx>0)sleep(95);
          if(tapChoiceOption(v,o)){
            o.n.selected=true;
            selected[o.l]=true;
            tappedLetters.push(o.l);}});
        sleep(120);
        if(tappedLetters.length){
          cxLog('题号 '+id+' 已点击多选目标选项 '+tappedLetters.join('、')+'，继续推进');}
        acted=true;}
    }else{
      for(var ci=0;ci<choices.length;ci++){
        var o=choices[ci];
        if(letters.indexOf(o.l)<0||selected[o.l])continue;
        if(o.n.selected){
          cxLog('题号 '+id+' 核对已选选项 '+o.l+' 正确');
          selected[o.l]=true;
          continue;}
        if(o.n.y<=H*0.14){swipeQuizDown();sleep(180);acted=true;scrolledInLoop=true;break;}
        if(o.n.y>=H*0.89){swipeQuiz();sleep(180);acted=true;scrolledInLoop=true;break;}
        if(!tapChoiceOption(v,o))continue;
        o.n.selected=true;
        selected[o.l]=true;
        sleep(70);
        cxLog('题号 '+id+' 已点击目标选项 '+o.l+'，继续推进');
        acted=true;
        break;}}
    if(letters.every(function(l){
      return !!selected[l];
    })){
      if(item.kind==='multiple'){
        STATE.multipleConfirmed[id]=true;
        cxLog('多选题 '+id+' 已核对全部目标选项：'+letters.join('、'));}
      STATE.lastAnswerView=v;
      return true;}
    if(acted){
      if(scrolledInLoop)continue;
      if(letters.some(function(l){return !selected[l];})){
        swipeQuiz();
        sleep(180);
        continue;}
      carriedView=v;continue;}
    if(limit<H*.96){
      if(step<2){
        if(top>H*0.28)swipeQuiz();
        else swipeQuizDown();
        sleep(180);
        continue;}
      break;}
    swipeQuiz();
    sleep(180);}
  cxLog('选项未全部点到：'+letters.join('')+'，请手动检查');
  return false;}
function updateQuizContext(v){
  var hasTopChapterTab=v.n.some(function(n){return /^章节$/.test(n.t)&&n.y<H*.14;});
  var title=nativeField(v,'tv_chapter_name')||(hasTopChapterTab?v.n.filter(function(n){
    return n.y>H*.08&&n.y<H*.24&&!/[()（）？?%％℃]|单选|多选|判断|填空|简答|第\s*\d+\s*空/.test(n.t)&&(/^\d+(?:\.\d+)+\s*[\u4e00-\u9fff]/.test(n.t.trim())||/^第[一二三四五六七八九十百千万\d]+[章节讲]\s*[\u4e00-\u9fff]/.test(n.t.trim()));
  })[0]:null);
  if(!title)return;
  var chapterMatch=title.t.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(chapterMatch){
    saveResumeChapter(chapterMatch[1]);
    STATE.workChapter={number:chapterMatch[1],title:chapterMatch[2].replace(/\s+/g,'')};
    STATE.lastKnownChapterHeading=title;}
  var rawTitle=title.t.replace(/\s+/g,'');
  var prefixMatch=rawTitle.match(/^(?:第[一二三四五六七八九十百千万\d]+[章节讲]|\d+(?:\.\d+)+)/);
  if(!prefixMatch)return;
  var key=prefixMatch[0];
  if(STATE.quizContext&&STATE.quizContext!==key){
    STATE.answered={};STATE.countedQuizIds={};STATE.awaitingSubmitResult=false;STATE.scanDrafts={};STATE.scanFailures={};STATE.shortAttempted={};STATE.shortSaved={};
    STATE.choiceAttempted={};STATE.multipleConfirmed={};STATE.multipleExpected={};STATE.multipleFailures={};STATE.backtrackTries={};STATE.pageRecheckCount={};STATE.auditMissing=[];STATE.auditRecoverySteps=0;
    STATE.workTotal=0;STATE.blocked='';STATE.navBlocked='';STATE.lastQuiz='';
    STATE.quizSeek=null;STATE.quizAuditHold=null;STATE.auditRecoverySignature='';STATE.auditRecoveryStill=0;
    STATE.readingVisit=null;STATE.readingAttempts={};STATE.readingRefresh=null;
    STATE.taskTopSteps=0;
    STATE.afterSubmit=false;STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.docAwaitKey='';
    STATE.lastAnswerView=null;STATE.preloadedQuizView=null;STATE.headerSearch=0;STATE.quizPending=false;
    STATE.chapterFullScanDone=false;
    cxLog('章节已变化，已清空上一节作答记录');}
  STATE.quizContext=key;}
function recoverMissingQuestion(v){
  if(!STATE.auditMissing||!STATE.auditMissing.length)return false;
  var target=STATE.auditMissing[0],heads=questions(v);
  var item=heads.filter(function(q){return Number(questionId(q).split(':')[0])===target;})[0];
  if(item&&item.y>H*.18&&item.y<H*.80){
    var id=questionId(item);
    delete STATE.answered[id];delete STATE.choiceAttempted[id];
    if(STATE.multipleConfirmed)delete STATE.multipleConfirmed[id];
    if(STATE.multipleFailures)delete STATE.multipleFailures[id];
    if(STATE.scanFailures)delete STATE.scanFailures[id];
    STATE.blocked='';STATE.navBlocked='';STATE.lastQuiz='';
    STATE.auditMissing.shift();STATE.auditRecoverySteps=0;STATE.auditRecoverySignature='';STATE.auditRecoveryStill=0;
    cxLog('已定位缺答题 '+target+'，优先补答后再核对提交');
    return false;}
  var signature=quizViewportSignature(v);
  STATE.auditRecoveryStill=signature===STATE.auditRecoverySignature?(STATE.auditRecoveryStill||0)+1:0;
  STATE.auditRecoverySignature=signature;
  if(++STATE.auditRecoverySteps>35||STATE.auditRecoveryStill>=2){
    if(Date.now()-STATE.lastLog>15000){
      STATE.lastLog=Date.now();cxLog('缺答题 '+target+' 未能完整定位，停留等待检查');}
    sleep(1200);return true;}
  var first=heads.length?Number(questionId(heads[0]).split(':')[0]):0;
  if(item&&item.y>=H*.80)swipeToNextQuestion();
  else if(item||!first||first>=target)swipeQuizToTop();
  else swipeToNextQuestion();
  sleep(200);return true;}
function quiz(v){
  if(recoverMissingQuestion(v))return;
  STATE.quizPending=true;
  var heads=questions(v),first=null;
  if(!heads.length){
    if(quizSubmitButton(v)&&submitWorkIfComplete(v,''))return;
    if(STATE.quizSeek){seekQuizForward(v);return;}
    if(STATE.headerSearch<4){
      STATE.headerSearch++;
      cxLog('题号不在当前屏幕，向题目顶部查找（'+STATE.headerSearch+'/4）');
      if(/请输入答案|请输入内容|请输入文字|点击输入/.test(v.s)&&
         /保存/.test(v.s)&&STATE.headerSearch<=2)
        swipeQuizDown();
      else swipeQuizToTop();
      sleep(500);
    }else if(Date.now()-STATE.lastLog>12000){
      STATE.lastLog=Date.now();
      cxLog('回到顶部后仍未识别题号；当前文字：'+v.s.slice(0,180));}
    return;}
  STATE.headerSearch=0;
  if(heads.length&&STATE.navBlocked&&
     questionId(heads[0])!==STATE.navBlocked)
    STATE.navBlocked='';
  if(heads.length&&STATE.navBlocked===questionId(heads[0])){
    sleep(1200);
    return;}
  STATE.pageRecheckCount=STATE.pageRecheckCount||{};
  for(var i=0;i<heads.length;i++){
    var qHead=heads[i],qid=questionId(qHead);
    if(STATE.answered[qid]&&CFG.doubleRecheck&&STATE.justAnsweredId!==qid&&(STATE.pageRecheckCount[qid]||0)<1){
      var qNextY=(i+1<heads.length)?heads[i+1].y:H*0.92;
      var hasEmptyBlankOnScreen=qHead.kind==='blank'&&v.n.some(function(n){
        return n.y>qHead.y&&n.y<qNextY&&/请\s*输\s*[入人]\s*答\s*案|点\s*击\s*输\s*[入人]/.test(n.t);});
      var hasUnselectedChoiceOnScreen=(qHead.kind==='single'||qHead.kind==='judge'||qHead.kind==='multiple')&&
        qHead.options&&qHead.options.length>=(qHead.kind==='judge'?2:4)&&
        !alreadyAnswered(v,qHead);
      if(hasEmptyBlankOnScreen||hasUnselectedChoiceOnScreen){
        STATE.pageRecheckCount[qid]=(STATE.pageRecheckCount[qid]||0)+1;
        cxLog('页面复查：发现题号 '+qid+' 存在漏答项，执行唯一一次补答');
        delete STATE.answered[qid];
        delete STATE.shortSaved[qid];
        delete STATE.choiceAttempted[qid];}}
    if(!STATE.answered[qid]){
      first=qHead;
      break;}}
  if(first&&!pagerInfo(v)){
    var firstNum=Number(questionId(first).split(':')[0])||0;
    var answeredNums=Object.keys(STATE.answered).filter(function(k){return STATE.answered[k];}).map(function(k){return Number(k.split(':')[0])||0;}).filter(function(n){return n>0;});
    var minAnswered=answeredNums.length?Math.min.apply(null,answeredNums):0;
    if(minAnswered>0&&firstNum>minAnswered+1){
      STATE.backtrackTries=STATE.backtrackTries||{};
      for(var mNum=minAnswered+1;mNum<firstNum;mNum++){
        var mDone=answeredNums.indexOf(mNum)>=0;
        if(!mDone&&(STATE.backtrackTries[mNum]||0)<2){
          STATE.backtrackTries[mNum]=(STATE.backtrackTries[mNum]||0)+1;
          cxLog('防跳题保护：检测到第 '+mNum+' 题尚未作答，向上回退找回第 '+mNum+' 题');
          swipeQuizDown();
          sleep(180);
          return;}}}}
  if(!first){
    if(finishPager(v))return;
    if(quizSubmitButton(v)&&submitWorkIfComplete(v,questionId(heads[heads.length-1])))return;
    if(heads.length&&advanceQuestion(v,questionId(heads[0])))return;
    if(Date.now()-STATE.lastLog>12000){
      STATE.lastLog=Date.now();
      cxLog('寻找下一题题号，当前识别到 '+heads.length+' 道');}
    if(!pagerInfo(v))seekQuizForward(v,questionId(heads[heads.length-1]));
    else sleep(350);
    return;}
  STATE.quizSeek=null;
  var id=questionId(first);
  STATE.scanFailures=STATE.scanFailures||{};
  if(STATE.blocked===id){
    if(Date.now()-STATE.blockedAt<4000){
      sleep(500);
      return;}
    STATE.blocked='';}
  if(STATE.lastQuiz===id&&
     Date.now()-STATE.lastLog<700){
    sleep(150);
    return;}
  STATE.lastQuiz=id;
  try{
    var item=scanQuestion(first,v);
    var scannedId=questionId(item);
    if(scannedId&&scannedId!==id){
      id=scannedId;
      STATE.lastQuiz=id;}
    if(!item.complete||(!item.visualFrames&&item.q.length<10)||!choicesComplete(item)){
      if(item.kind!=='short'&&item.kind!=='blank'&&item.options.length>=3&&item.q.length>=10){
        var expectedLen=Math.max(4,item.options.length);
        var fixedOpts=[];
        for(var oi=0;oi<expectedLen;oi++){
          var expL=String.fromCharCode(65+oi);
          var existOpt=item.options.filter(function(o){return o.l===expL;})[0]||item.options[oi];
          fixedOpts.push({l:expL,t:(existOpt&&existOpt.t)?existOpt.t:('选项 '+expL)});}
        item.options=fixedOpts;
        item.complete=true;}}
    if(!item.complete||(!item.visualFrames&&item.q.length<10)||!choicesComplete(item)){
      STATE.scanFailures[id]=(STATE.scanFailures[id]||0)+1;
      delete STATE.scanDrafts[id];
      if(STATE.scanFailures[id]===1){
        cxLog('题号 '+id+' 首轮选项未读齐，微调位置后重扫一次');
        if(first&&first.y>H*0.50)swipeQuiz();
        else swipeQuizDown();
        sleep(300);
        return;}
      if(item.kind==='judge'){
        item.options=[{l:'A',t:'对'},{l:'B',t:'错'}];
      }else if(item.kind==='single'||item.kind==='multiple'){
        var fallbackOpts=[];
        for(var fi=0;fi<4;fi++){
          var fl=String.fromCharCode(65+fi);
          var fo=item.options.filter(function(o){return o.l===fl;})[0]||item.options[fi];
          fallbackOpts.push({l:fl,t:(fo&&fo.t)?fo.t:('选项 '+fl)});}
        item.options=fallbackOpts;}
      if(!item.q||item.q.length<10)item.q=id+' '+(item.q||'题目');
      item.complete=true;}
    delete STATE.scanFailures[id];
    cxLog('请求解题：'+item.q.slice(0,110));
    if(!VISION.key&&/如图|下图|图中|图示|识图|读图|图片|心电图|组织切片/.test(item.q)){
      if(!STATE.visionPrompted){
        STATE.visionPrompted=true;
        try{if(isStandaloneOrAutoJsHost())configureVision();}catch(ignore){}}
      if(!VISION.key){
        cxLog('本题需要识图，请在启动菜单设置识图模型接口；暂停本题，不猜测图片内容');STATE.blocked=id;STATE.blockedAt=Date.now();sleep(1200);return;
      }}
    var reply=ask(item);
    var hasValidReply=!!((Array.isArray(reply.answer)&&reply.answer.length)||(Array.isArray(reply.blanks)&&reply.blanks.length)||(reply.text&&String(reply.text).trim()));
    if(String(reply.confidence||'').toLowerCase()==='low'&&!hasValidReply){
      cxLog('题号 '+id+' 答案不确定，请手动检查');
      STATE.lastLog=Date.now();
      return;}
    if(applyAnswer(item,reply)){
      var finalId=questionId(item);
      if(finalId)id=finalId;
      STATE.answered[id]=true;
      STATE.justAnsweredId=id;
      STATE.lastQuiz='';
      STATE.countedQuizIds=STATE.countedQuizIds||{};if(!STATE.countedQuizIds[id]){STATE.countedQuizIds[id]=true;SESSION_STATS.quizzes++;}
      cxLog('题号 '+id+' 已处理，继续找下一题');
      var after=STATE.lastAnswerView||view();
      STATE.lastAnswerView=null;
      if(finishPager(after))return;
      var pendingOnScreen=questions(after).some(function(q){
        var qid=questionId(q);
        return qid!==id&&!STATE.answered[qid];});
      if(pendingOnScreen){STATE.preloadedQuizView=after;cxLog('同屏还有未作答题目，继续逐题处理');return;}
      if(submitWorkIfComplete(after,id))return;
      if(!advanceQuestion(after,id)&&STATE.navBlocked!==id&&
         !pagerInfo(after)){
        seekQuizForward(after,id);}
    }else{
      if(item.kind==='multiple'){
        STATE.multipleFailures=STATE.multipleFailures||{};
        STATE.multipleFailures[id]=(STATE.multipleFailures[id]||0)+1;
        STATE.blocked=id;
        STATE.blockedAt=Date.now();
      }else if(item.kind==='short'){
        STATE.blocked=id;
        STATE.blockedAt=Date.now();
        cxLog('简答题输入或保存未确认，已停在题号 '+id+'，请检查页面');}
      STATE.lastLog=Date.now();
      sleep(1200);}
  }catch(e){
    if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;
    cxLog('题号 '+id+' 解题失败：'+e);
    STATE.lastLog=Date.now();
    sleep(1800);}}
function findInlineVideoBounds(baseY){
  var im=picture();
  var defTop=Math.round(baseY+H*0.035),defBot=Math.round(baseY+H*0.28);
  if(!isImageAlive(im))return {top:defTop,bot:defBot,center:Math.round((defTop+defBot)/2)};
  try{
    var iw=im.getWidth(),ih=im.getHeight();
    var startY=Math.max(Math.round(0.18*ih),Math.round((baseY+H*0.02)*ih/H));
    var endY=Math.min(Math.round(0.86*ih),Math.round((baseY+H*0.36)*ih/H));
    var vTop=-1,vBot=-1;
    for(var y=startY;y<=endY;y+=3){
      var nonWhite=0;
      for(var xr=0.20;xr<=0.80;xr+=0.10){
        var c=images.pixel(im,Math.round(iw*xr),y);
        var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
        if(r<232||g<232||b<232)nonWhite++;}
      if(nonWhite>=5){
        if(vTop<0)vTop=y;
        vBot=y;
      }else if(vTop>=0&&(vBot-vTop)>=Math.round(0.14*ih)){
        break;}}
    if(vTop>=0&&(vBot-vTop)>=Math.round(0.14*ih)){
      var topH=Math.round(vTop*H/ih),botH=Math.round(vBot*H/ih);
      return {top:topH,bot:botH,center:Math.round((topH+botH)/2)};}
  }catch(ignore){}
  finally{try{safeRecycle(im);}catch(ignore){}}
  return {top:defTop,bot:defBot,center:Math.round((defTop+defBot)/2)};}
function openVideo(v,preserveNetworkRecovery,taskY){
  var box=cxFind(v,/观看时长|完成条件|总时长|^条件$|^完成$/);
  var baseY=box?box.y:(taskY||0);
  if(!baseY)return false;
  var vb=findInlineVideoBounds(baseY);
  var y=vb.center;
  var prevScrollY=STATE.lastVideoScrollY||0;
  if(y>H*0.78&&Math.abs(y-prevScrollY)>=25){
    STATE.lastVideoScrollY=y;
    swipeChapterTasks(false);
    cxLog('视频播放区域偏下('+y+')，上移居中后打开');
    sleep(220);
    return false;}
  STATE.lastVideoScrollY=0;
  if(tap(Math.round(W*0.50),y)){
    STATE.lastOpen=Date.now();
    STATE.video=true;
    STATE.openedAt=Date.now();
    STATE.finished=false;
    STATE.lastTime=-1;
    STATE.videoEndConfirmCount=0;
    if(!preserveNetworkRecovery){STATE.videoLoadRecovery=null;setVideoNetworkState('recovered',0);}
    STATE.total=0;
    STATE.speedChecked=false;STATE.speedShown=false;STATE.speedMenuAt=0;STATE.speedAttempts=0;STATE.speedPaused=false;STATE.speedPauseAttempts=0;STATE.speedEntryAttempts=0;STATE.videoSpeedRate=1;
    muteMediaForVideo();
    toast('打开视频');
    cxLog('已点击视频播放按钮('+Math.round(W*0.50)+','+y+')，准备切换全屏');
    sleep(480);
    try{
      var postPlayV=view();
      if(/非WiFi|非\s*WIFI|消耗流量|移动网络/.test(postPlayV.s)||(postPlayV.incompleteDialog&&/取消/.test(postPlayV.s)&&!/下一章节/.test(postPlayV.s))){
        var goWifi=cxFind(postPlayV,/^(?:继续|继续播放|确定)$/);
        if(goWifi)tap(goWifi.x,goWifi.y);
        else tap(Math.round(W*0.679),Math.round(H*0.572));
        cxLog('检测到非WiFi流量提示，已点击【继续】播放视频');
        sleep(550);}
    }catch(e){if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;}
    if(!land(true)){
      var fsNode=nativeVideoNode('full_screen')||nativeVideoNode('iv_fullscreen')||nativeVideoNode('land_full_screen');
      var fsY=Math.min(Math.round(H*0.85),Math.round(vb.bot-H*0.020));
      if(fsNode)nativeVideoClick(fsNode);
      else tap(Math.round(W*0.935),fsY);
      sleep(450);
      land(true);}
    STATE.openedAt=Date.now();
    return true;}
  return false;}
function isChapterContent(v){
  if(!v||!v.n)return false;
  if(pagerInfo(v)||isDiscussionDetailView(v)||isDirectoryPage(v)||/第\s*\d+\s*空|请输入答案|请输入文字/.test(v.s))return false;
  if(nativeField(v,'tv_chapter_name'))return true;
  var hasTopBar=v.n.some(function(n){return /^(?:章节|讨论)$/.test(n.t.trim())&&n.y<H*.16;});
  var hasChapterHeading=v.n.some(function(n){
    return n.y>H*.08&&n.y<H*.24&&(/^\d+(?:\.\d+)+\s*\S+/.test(n.t.trim())||/^第[一二三四五六七八九十百千万\d]+[章节讲]\s*\S+/.test(n.t.trim()));
  });
  var hasChapterSignals=/任务点|观看时长|完成条件|上一节|下一节|下一讲|\d+\s*学习目标|\d+\s*视频|本次得分|我的答案|已完成/.test(v.s);
  return (hasTopBar&&hasChapterSignals)||(hasChapterHeading&&hasChapterSignals)||(hasTopBar&&hasChapterHeading);
}
function continueAfterSubmit(v){
  if(pagerInfo(v)||quizSubmitButton(v)||/第\s*\d+\s*空|请输入答案|请输入文字/.test(v.s)||(questions(v).length&&!submissionSucceeded(v))){
    STATE.afterSubmit=false;STATE.returnBackTried=false;quiz(v);return;}
  if(isDirectoryPage(v)){
    STATE.afterSubmit=false;STATE.quizPending=false;STATE.returnBackTried=false;
    if(STATE.quizContext){
      STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};
      STATE.chapterQuizCompleted[STATE.quizContext]=true;}
    if(scanUnfinishedChapters(v)){sleep(260);return;}
    var previous=STATE.workChapter&&STATE.workChapter.number?STATE.workChapter.number:STATE.quizContext;
    var rows=findDirectoryChapterRows(v);
    var entry=previous?rows.filter(function(r){return r.num===previous;})[0]:null;
    if(entry&&tap(Math.round(W*0.48),entry.y)){
      STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.returnBackTried=false;
      cxLog('已重新进入刚完成作业的章节 '+entry.num+'，继续查找下一节');
      sleep(500);}
    return;}
  if(isChapterContent(v)){
    if(submissionSucceeded(v)&&STATE.quizContext){
      STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};
      STATE.chapterQuizCompleted[STATE.quizContext]=true;}
    STATE.afterSubmit=false;STATE.quizPending=false;STATE.returnBackTried=false;
    STATE.taskTopReady=true;STATE.taskTopSignature='';
    cxLog('测验已提交，留在本节继续向下查找剩余视频/任务点');
    chapter(v);
    return;}
  if(submissionSucceeded(v)){
    if(STATE.quizContext){
      STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};
      STATE.chapterQuizCompleted[STATE.quizContext]=true;}
    if(!STATE.returnBackTried||Date.now()-(STATE.returnBackAt||0)>2400){
      var wasTried=!!STATE.returnBackTried;
      STATE.returnBackTried=true;STATE.returnBackAt=Date.now();
      if(wasTried)tap(Math.round(W*0.065),Math.round(H*0.062));
      else safeBack();
      cxLog('已识别独立测验完成结果，自动返回继续下一轮');
      sleep(420);
      return;}}
  if(isChapterContent(v)){
    STATE.afterSubmit=false;STATE.quizPending=false;STATE.returnBackTried=false;
    chapter(v);
    return;}
  if(Date.now()-STATE.lastLog>10000){STATE.lastLog=Date.now();cxLog('作业已完成，正在恢复章节导航');}
  sleep(320);}
function handleSubmitConfirmation(v){
  if(!/确认提交|确定提交|是否提交|确认交卷|确定交卷/.test(v.s))return false;
  if(submissionFailed(v)||unansweredWarning(v))return false;
  var yes=cxFind(v,/^(确定|确认|确认提交|确认交卷|继续提交)$/);
  if(!yes)return false;
  if(tap(yes.x,yes.y)){STATE.awaitingSubmitResult=true;STATE.awaitingSubmitAt=Date.now();cxLog('已点击提交确认');sleep(350);}
  return true;}
function detectTaskCardIconKind(im,markerY,endY){
  if(!isImageAlive(im))return '';
  try{
    var iw=im.getWidth(),ih=im.getHeight();
    var yStart=Math.max(0,Math.floor((markerY+H*0.035)*ih/H));
    var yEnd=Math.min(ih-1,Math.floor(Math.min(endY,markerY+H*0.14)*ih/H));
    var pdfRed=0,discBlue=0,darkVideo=0;
    for(var y=yStart;y<=yEnd;y+=3){
      for(var x=Math.floor(0.06*iw);x<=Math.floor(0.16*iw);x+=3){
        var c=images.pixel(im,x,y);
        var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
        if(r>215&&g>80&&g<145&&b>50&&b<110)pdfRed++;
        else if(r>55&&r<135&&g>140&&g<210&&b>200)discBlue++;}}
    if(pdfRed>=18)return 'reading';
    if(discBlue>=18)return 'discussion';
    var vyStart=Math.max(0,Math.floor((markerY+H*0.04)*ih/H));
    var vyEnd=Math.min(ih-1,Math.floor(Math.min(endY,markerY+H*0.24)*ih/H));
    if(vyEnd-vyStart>=Math.floor(0.12*ih)){
      var totalSample=0;
      for(var vy=vyStart;vy<=vyEnd;vy+=6){
        for(var vx=Math.floor(0.22*iw);vx<=Math.floor(0.78*iw);vx+=10){
          totalSample++;
          var vc=images.pixel(im,vx,vy);
          var vr=(vc>>16)&255,vg=(vc>>8)&255,vb=vc&255;
          if(vr<55&&vg<55&&vb<55)darkVideo++;}}
      if(totalSample>0&&darkVideo/totalSample>=0.35)return 'video';}
  }catch(ignore){}
  return '';}
function taskSections(v){
  if(v&&v._taskSections)return v._taskSections;
  var list=markers(v).slice().sort(function(a,b){return a.y-b.y;});
  var im=list.length?picture():null;
  try{
  var res=list.map(function(m,i){
    var end=i+1<list.length?list[i+1].y:H*.96;
    var nodes=v.n.filter(function(n){return n.y>m.y+8&&n.y<end;}).sort(function(a,b){return a.y-b.y||a.x-b.x;});
    var nearNodes=nodes.filter(function(n){return n.y<=m.y+H*0.20;});
    var nearText=nearNodes.map(function(n){return n.t;}).join('|');
    var text=nodes.map(function(n){return n.t;}).join('|');
    var iconKind=detectTaskCardIconKind(im,m.y,end);
    var isPdfOrDoc=iconKind==='reading'||/\b(?:PDF|PPTX?|DOCX?|XLSX?|TXT|EPUB)\b|\.(?:pdf|pptx?|docx?|xlsx?|txt|epub)|\b\d+(?:\.\d+)?\s*[KMGT]B\b|文献阅读|去阅读|查看文献/i.test(nearText)||(/课后文献|文献阅读/.test(v.s)&&/\b\d+(?:\.\d+)?\s*[KMGT]B\b|PDF/i.test(text));
    var isDiscussion=iconKind==='discussion'||/^(?:讨论|参与讨论)$|谈谈.*(?:收获|看法|理解|体会|认识)|字数不限|^[\u4e00-\u9fff·]{2,6}[:：]\s*(?:第[一二三四五六七八九十\d]|.{4,})/.test(nearText)||
      (nodes.some(function(n){return /^讨论$/.test(n.t.trim());})&&!/观看时长|总时长|完成条件/.test(nearText));
    var isSurvey=/投票|问卷|调查|去填写|结束时间[:：]\s*手动结束/.test(nearText)||/投票|问卷|结束时间[:：]\s*手动结束/.test(text);
    var isExplicitQuiz=!isSurvey&&/章节测验|开始测验|开始作业|由此作答|请由此重做|待重做|未达到及格线/.test(nearText);
    var firstQuizNode=nodes.filter(function(n){return /(?:章节测验|开始测验|请由此重做|待重做|未达到及格线|^第\s*\d+\s*空|(?:^|\b|\d\s*[.．、]?\s*[\[(（]?)(?:单选|多选|判断|填空|简答)题?)/.test(n.t)||(!/^\s*\d+\.\d+/.test(n.t)&&/^\s*\d{1,3}\s*[.．、]?\s*[\[［【]/.test(n.t));})[0];
    var hasVideoGapAboveQuiz=!isPdfOrDoc&&!isDiscussion&&!isSurvey&&!isExplicitQuiz&&iconKind==='video';
    var kind='';
    if(isSurvey){
      kind='survey';
    }else if(isPdfOrDoc){
      kind='reading';
    }else if(isDiscussion){
      kind='discussion';
    }else if(/观看时长|总时长|完成条件|^视频|\b\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}\b/.test(nearText)||hasVideoGapAboveQuiz){
      kind='video';
    }else if(/章节测验|开始测验|开始作业|由此作答|请由此重做|待重做|未达到及格线/.test(nearText)||/章节测验|请由此重做|待重做|未达到及格线/.test(text)||(firstQuizNode&&firstQuizNode.y<=m.y+H*0.26)){
      kind='quiz';
    }else if(/讨论|评论|回复[:：]|参与讨论|谈谈.*(?:收获|看法|理解|体会)|字数不限/.test(text)){
      kind='discussion';
    }else if(/\b(?:PDF|PPTX?|DOCX?|XLSX?|TXT|EPUB)\b|\.(?:pdf|pptx?|docx?|xlsx?|txt|epub)|\b\d+(?:\.\d+)?\s*[KMGT]B\b|阅读|文献|课件|附件/i.test(text)){
      kind='reading';
    }else if(/测验|作业|练习|由此作答/.test(text)){
      kind='quiz';
    }else if(/观看时长|总时长|完成\|?条件|视频/.test(text)){
      kind='video';
    }else{
      kind='other';}
    return {y:m.y,end:end,done:m.done,kind:kind,nodes:nodes,text:text,
      key:kind+':'+(kind==='reading'?readingTaskTitle(nodes):nearNodes.slice(0,3).map(function(n){return n.t;}).join('|')||Math.round(m.y))};
  });
  if(v)v._taskSections=res;
  return res;
  }finally{try{if(im)safeRecycle(im);}catch(ignore){}}}
function readingTaskTitle(nodes){
  var candidates=nodes.filter(function(n){
    var t=n.t.trim();
    return t&&!/^(阅读|文献阅读|资料|附件|去阅读|开始阅读|打开阅读|查看文献|点击阅读|任务点(?:已完成|未完成)?|下一节|上一节|讨论|写笔记|\d+)$/.test(t)&&
      !/阅读总时长|当天阅读时长|完成阅读任务点|您的阅读|^点击.*阅读|^CoverNew$|^realReadNew\?|https?:\/\/|^\s*$/.test(t);
  });
  var title=candidates.filter(function(n){return n.node&&/\.(?:docx?|pdf|pptx?|xlsx?|txt|epub)\s*$/i.test(n.t);})[0]||
    candidates.filter(function(n){return !!n.node;})[0]||candidates[0];
  return title?title.t.replace(/\s+/g,''):'未识别阅读标题';}
function readChapterHeading(v){
  var found=nativeField(v,'tv_chapter_name')||v.n.filter(function(n){
    return n.y<H*.32&&(/^\d+(?:\.\d+)+\s*[^\d.\s]/.test(n.t)||/^第[一二三四五六七八九十百千万\d]+[章节讲]\s*\S+/.test(n.t));
  })[0];
  if(found)STATE.lastKnownChapterHeading=found;
  return found||STATE.lastKnownChapterHeading||null;}
function refreshVideoChapter(v){
  var heading=readChapterHeading(v),match=heading&&heading.t.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(!match)return false;
  STATE.videoChapterRefresh={number:match[1],title:match[2].replace(/\s+/g,''),tries:0};
  CHAPTER.startReturn(STATE.videoChapterRefresh);
  safeBack();sleep(350);cxLog('退出章节后重新进入刷新任务状态');return true;}
function reopenVideoChapter(v){
  var target=STATE.videoChapterRefresh;if(!target)return false;
  var result=CHAPTER.returnToChapter(target);
  if(result.type==='entered'){
    STATE.videoChapterRefresh=null;STATE.taskTopReady=false;STATE.taskTopSignature='';
    cxLog('已重新进入原章节，继续检查剩余任务点');sleep(600);return true;}
  if(result.type==='hold'||result.type==='none'){
    STATE.videoChapterRefresh=null;
    cxLog('未能重进原章节 '+(target.number||'')+'，交回目录扫描继续');
    sleep(400);return false;}
  sleep(180);return true;}
function checkReadingTask(v){
  var pending=STATE.readingVisit;if(!pending)return false;
  if(isChapterContent(v)){
    var task=taskSections(v).filter(function(t){return t.kind==='reading'&&t.key===pending.key;})[0];
    if(!task||task.done){
      cxLog('已确认原阅读任务点完成，继续处理本节后续任务');
      STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
      STATE.videoFinishedKeys[pending.key]=true;
      STATE.readingVisit=null;STATE.docAwaitKey='';STATE.doc=false;return false;}
    var history=STATE.readingAttempts[pending.historyKey]||{opens:1,refreshes:0};
    if(history.opens>=1){
      cxLog('已完成 PDF/文档浏览并返回章节，标记本阅读任务处理完毕，继续后续流程');
      STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
      STATE.videoFinishedKeys[pending.key]=true;
      STATE.readingVisit=null;STATE.docAwaitKey='';STATE.doc=false;return false;}}
  if(/目录|章节列表|课程章节/.test(v.s)||v.n.filter(function(n){return /^\d+(?:\.\d+)+\s*\S+/.test(n.t);}).length>=3){
    cxLog('检测到当前位于目录页，释放阅读等待并重新进入章节');
    STATE.readingVisit=null;STATE.docAwaitKey='';STATE.doc=false;return false;}
  if(Date.now()-(pending.at||0)>9000){
    STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
    STATE.videoFinishedKeys[pending.key]=true;
    STATE.readingVisit=null;STATE.docAwaitKey='';STATE.doc=false;return false;}
  sleep(350);return true;}
function verifyChapterTop(v){
  var signature=quizViewportSignature(v);
  if(signature===STATE.taskTopSignature){STATE.taskTopReady=true;STATE.taskTopSignature='';STATE.taskTopSteps=0;return true;}
  STATE.taskTopSignature=signature;STATE.taskTopSteps=(STATE.taskTopSteps||0)+1;
  if(STATE.taskTopSteps>14){STATE.taskTopReady=true;STATE.taskTopSignature='';STATE.taskTopSteps=0;return true;}
  swipeChapterTasks(true);sleep(180);return false;}
function switchNextChapterSubTab(v){
  if(!v||!v.n)return false;
  var heading=readChapterHeading(v);
  var chKey=(heading?heading.t.replace(/\s+/g,'').slice(0,12):'')||(STATE.quizContext||'ch');
  STATE.visitedSubTabs=STATE.visitedSubTabs||{};
  var visited=STATE.visitedSubTabs[chKey]||{};
  STATE.visitedSubTabs[chKey]=visited;
  var candidates=v.n.filter(function(n){
    if(n.y<=H*0.14||n.y>=H*0.23)return false;
    var t=n.t.trim();
    return /^\s*[1-6]\s*(?:学习目标|视频|微课|教学视频|课件|文档|阅读|资料|文献|章节测验|测验|作业|练习|讨论)\s*$/.test(t)||
           /^\s*(?:学习目标|视频|微课|课件|文档|阅读|章节测验|测验|讨论)\s*$/.test(t);
  });
  var subTabs=candidates.filter(function(n){
    var t=n.t.trim();
    if((CFG.skipDiscussion||CFG.onlyVideoQuiz)&&/讨论/.test(t))return false;
    if(CFG.onlyVideoQuiz&&/课件|文档|阅读|资料|文献/.test(t))return false;
    if(/学习目标/.test(t))return false;
    var hasNumberPrefix=/^\s*[1-6]/.test(t);
    var hasHorizontalSibling=candidates.some(function(other){
      return other!==n&&Math.abs(other.y-n.y)<H*0.018&&Math.abs(other.x-n.x)>W*0.14;});
    return hasNumberPrefix||hasHorizontalSibling;
  }).sort(function(a,b){
    function prio(t){
      if(/视频|微课/.test(t))return 1;
      if(/课件|文档|阅读|资料|文献/.test(t))return 2;
      if(/测验|作业|练习/.test(t))return 3;
      return 4;}
    return prio(a.t)-prio(b.t)||a.x-b.x;});
  for(var i=0;i<subTabs.length;i++){
    var tab=subTabs[i],tName=tab.t.replace(/\s+/g,'');
    if(visited[tName])continue;
    visited[tName]=true;
    if(tap(tab.x,tab.y)||cxPress(tab)){
      STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.chapterFullScanDone=false;STATE.chapterScrollSteps=0;
      cxLog('切换本节顶部分页标签：'+tName);
      sleep(480);
      return true;}}
  return false;}
function chapter(v){
  if(/加载中|正在加载|正在获取|刷新中/.test(v.s)){sleep(250);return;}
  if(STATE.finished){
    STATE.video=false;STATE.finished=false;STATE.videoExitAt=0;
    STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.chapterFullScanDone=false;STATE.chapterScrollSteps=0;
    if(STATE.activeVideoKey){STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};STATE.videoFinishedKeys[STATE.activeVideoKey]=true;}
  }
  STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
  STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};
  if(STATE.readingVisit&&checkReadingTask(v))return;
  if(!STATE.taskTopReady&&STATE.taskTopSignature&&!verifyChapterTop(v))return;
  var tasks=taskSections(v).sort(function(a,b){return a.y-b.y;}),todo=null;
  SMART_RECOGNIZER.analyze(v);
  for(var i=0;i<tasks.length;i++){
    var tk=tasks[i];
    if(tk.kind==='quiz'&&tk.done&&STATE.quizContext&&!/请由此重做|待重做|未达到及格线/.test(v.s)){
      STATE.chapterQuizCompleted[STATE.quizContext]=true;
      STATE.quizPending=false;}
    if(tk.done||STATE.videoFinishedKeys[tk.key]||(tk.kind==='discussion'&&STATE.discussionDone&&STATE.discussionDone[tk.key]))continue;
    if(tk.kind==='survey'||tk.kind==='other'){
      STATE.videoFinishedKeys[tk.key]=true;
      var otherDesc=String(tk.text||'').replace(/\|+/g,' ').trim().slice(0,28)||tk.key.slice(0,28);
      if(!/^(?:上一节|下一节|other:\d+|[A-H]\.)/.test(otherDesc)&&SESSION_STATS.skipped.indexOf(otherDesc)<0){SESSION_STATS.skipped.push(otherDesc);if(SESSION_STATS.skipped.length>30)SESSION_STATS.skipped.shift();}
      cxLog('发现其他类型任务点（'+tk.kind+'：'+otherDesc+'），已记录日志并跳过');
      continue;}
    if(CFG.onlyVideoQuiz&&tk.kind!=='video'&&tk.kind!=='quiz'){
      STATE.videoFinishedKeys[tk.key]=true;
      cxLog('已按设置跳过非视频/测验任务点（'+tk.kind+'）');
      continue;}
    if(tk.kind==='discussion'&&CFG.skipDiscussion){
      STATE.videoFinishedKeys[tk.key]=true;
      cxLog('已按设置跳过讨论任务点，留待手动检测');
      continue;}
    STATE.hadCurrentTask=true;
    todo=tk;break;}
  if(todo){
    STATE.chapterFullScanDone=false;STATE.chapterScrollSteps=0;
    if(todo.y>H*.64){
      swipeChapterTasks(false);
      sleep(200);
      return;}
    if(STATE.lastTaskFound!==todo.key){STATE.lastTaskFound=todo.key;cxLog('按从上到下顺序处理本节任务点：'+todo.kind);}
    STATE.hadCurrentTask=true;STATE.completionRefreshed=false;
    if(todo.kind==='discussion'){
      if(STATE.discussionDone[todo.key]){sleep(700);return;}
      STATE.discussionTaskKey=todo.key;STATE.afterSubmit=false;
      var topicEntry=todo.nodes.filter(function(n){
        return n.t.length>=4&&!/^(?:任务点|已完成|讨论|评论|写笔记)$/i.test(n.t.trim())&&!/^[\u4e00-\u9fff]{2,4}[:：]/.test(n.t.trim());
      })[0]||todo.nodes.filter(function(n){return n.t.length>=4&&!/^(?:任务点|已完成|讨论)$/.test(n.t.trim());})[0];
      if((topicEntry&&cxPress(topicEntry))||tap(Math.round(W*0.48),Math.min(Math.round(H*0.82),Math.round(todo.y+H*0.075)))){
        cxLog('打开讨论任务：'+(topicEntry?topicEntry.t.slice(0,20):todo.key));
        sleep(750);
      }else sleep(700);
      return;}
    if(todo.kind==='video'){
      STATE.quizPending=false;
      var inlineTimes=twoTimes(v.s,v,false);
      if(inlineTimes&&inlineTimes[1]>0){
        STATE.lastTime=inlineTimes[0];
        STATE.total=inlineTimes[1];
        if(inlineTimes[0]>=inlineTimes[1]-1){
          STATE.finished=true;
          STATE.videoFinishedKeys[todo.key]=true;
          cxLog('竖屏内嵌视频已播放完毕');
          return;}}
      if(Date.now()-STATE.lastOpen>10000&&openVideo({n:todo.nodes,s:todo.text},false,todo.y)){
        STATE.activeVideoKey=todo.key;
        var videoHeading=readChapterHeading(v);STATE.activeVideoChapter=videoHeading?videoHeading.t.replace(/\s+/g,''):'';
        STATE.videoExitAt=0;STATE.afterSubmit=false;sleep(200);
      }else if(STATE.video&&!land()&&Date.now()-STATE.openedAt>2800&&!v.incompleteDialog&&!/非WiFi|非\s*WIFI|消耗流量|移动网络|取消/.test(v.s)){
        var vbRetry=findInlineVideoBounds(todo.y);
        var fsY=Math.min(Math.round(H*0.86),Math.round(vbRetry.bot-H*0.020));
        tap(Math.round(W*0.935),fsY);
        sleep(600);
      }else sleep(850);
      return;}
    if(todo.kind==='quiz'){
      STATE.afterSubmit=false;
      if(questions(v).length){
        quiz(v);
        return;}
      var entry=todo.nodes.filter(function(n){return /开始测验|开始作业|开始答题|进入测验|继续答题|由此作答|请由此重做|去填写/.test(n.t);})[0];
      if(entry&&cxPress(entry)){sleep(650);return;}
      swipeChapterTasks(false);
      sleep(260);
      return;}
    openReadingTask(todo,v);
    return;}
  if(STATE.quizPending){
    var retry=cxFind(v,/开始测验|开始答题|继续答题|由此作答/);
    if(retry&&cxPress(retry)){sleep(650);return;}
    if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();cxLog('测验尚未确认提交，暂停进入下一节');}
    sleep(700);return;}
  if(switchNextChapterSubTab(v))return;
  var nextButton=chapterNextButton(v);
  if(nextButton){
    if(!STATE.taskTopReady&&!STATE.chapterFullScanDone){
      STATE.taskTopSignature='scan_top';
      if(!verifyChapterTop(v))return;}
    STATE.chapterFullScanDone=true;STATE.chapterScrollSteps=0;
    if(STATE.hadCurrentTask&&!STATE.completionRefreshed){
      if(refreshVideoChapter(v)){STATE.completionRefreshed=true;cxLog('本节任务点已全部完成，刷新复核状态后继续下一轮');}
      else {STATE.completionRefreshed=true;}
      return;}
    if(next(v))cxLog('已识别本节任务全部完成，自动进入下一节继续下一轮');return;}
  var curSig=quizViewportSignature(v);
  if(curSig===STATE.lastChapterScrollSig)STATE.chapterScrollStill=(STATE.chapterScrollStill||0)+1;
  else STATE.chapterScrollStill=0;
  STATE.lastChapterScrollSig=curSig;
  STATE.chapterScrollSteps=(STATE.chapterScrollSteps||0)+1;
  if(STATE.chapterScrollStill>=2||STATE.chapterScrollSteps>=10){
    STATE.chapterScrollSteps=0;STATE.chapterScrollStill=0;
    if(!STATE.chapterFullScanDone){
      STATE.chapterFullScanDone=true;
      STATE.taskTopReady=false;STATE.taskTopSignature='scan_top';
      cxLog('已滑至章节底部，回顶复核本节任务点');
      return;}
    cxLog('本节已巡检到底部，返回目录继续下一未完成章节');
    safeBack();sleep(650);
    return;}
  swipeChapterTasks(false);sleep(180);}
function document(v){
  var pending=STATE.readingVisit;
  if(!pending){STATE.doc=false;return;}
  if(/投票\/问卷|请输入文字|请输入答案/.test(v.s)||questions(v).length>0){
    cxLog('检测到当前为问卷/答题页，切换至实时答题模式');
    STATE.doc=false;STATE.readingVisit=null;STATE.docAwaitKey='';
    quiz(v);
    return;}
  var onChapter=isChapterContent(v);
  if(onChapter&&pending.backSent){
    STATE.doc=false;pending.stage='checking';pending.nextAt=Date.now()+400;
    cxLog('已从 PDF/阅读页返回章节，开始核对任务点状态');
    return;}
  if(onChapter&&!pending.backSent&&Date.now()-pending.at>3500){
    STATE.doc=false;pending.stage='checking';pending.nextAt=Date.now()+400;
    return;}
  if(Date.now()-pending.at<450){sleep(180);return;}
  if(!pending.backSent){
    var preBackView=view();
    if(isChapterContent(preBackView)){
      STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
      STATE.videoFinishedKeys[pending.key]=true;
      STATE.doc=false;STATE.readingVisit=null;STATE.docAwaitKey='';
      return;}
    safeBack();pending.backSent=true;pending.stage='returning';pending.backAt=Date.now();STATE.docAwaitAt=Date.now();
    STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
    STATE.videoFinishedKeys[pending.key]=true;
    SESSION_STATS.docs++;
    cxLog('已点开 PDF/文档，立即退出返回原章节');sleep(380);return;}
  if(!pending.secondBackSent&&Date.now()-pending.backAt>3200){
    pending.secondBackSent=true;
    var checkV=view();
    if(!isChapterContent(checkV)&&!/目录|章节列表/.test(checkV.s)){
      if(!safeBack())tap(Math.round(W*0.065),Math.round(H*0.062));
      cxLog('再次请求退出 PDF/文档预览页');sleep(600);return;
    }else{
      STATE.doc=false;pending.stage='checking';return;}}
  if(Date.now()-pending.backAt>5000){
    STATE.doc=false;pending.stage='checking';}
  sleep(350);}
function nativeField(v,name){
  return v.n.filter(function(n){
    try{return n.node&&String(n.node.id())===PKG+':id/'+name;}catch(e){return false;}
  })[0];}
function discussionPage(v){
  if(nativeField(v,'tvTitle')&&(nativeField(v,'etReplyText')||nativeField(v,'tvReplyContent')))return true;
  return isDiscussionDetailView(v);}
function refreshDiscussionChapter(v){
  var heading=readChapterHeading(v);
  var match=heading&&heading.t.match(/^(\d+(?:\.\d+)+)\s*([^\d.\s].*)$/);
  if(!match)return false;
  STATE.discussionRefresh={number:match[1],title:match[2].replace(/\s+/g,''),tries:0};
  CHAPTER.startReturn(STATE.discussionRefresh);
  safeBack();sleep(500);cxLog('讨论已发表，重新进入本节刷新任务点状态');return true;}
function reopenDiscussionChapter(v){
  var target=STATE.discussionRefresh;
  if(!target)return false;
  var result=CHAPTER.returnToChapter(target);
  if(result.type==='entered'){
    STATE.discussionRefresh=null;STATE.taskTopReady=false;STATE.taskTopSignature='';
    cxLog('已重新打开讨论所在章节，核对任务点后进入下一节');sleep(600);return true;}
  if(result.type==='hold'||result.type==='none'){STATE.discussionRefresh=null;cxLog('未能重进讨论章节 '+(target.number||'')+'，交回目录扫描继续');sleep(400);return false;}
  sleep(180);return true;}
function discussion(v){
  requireLearningApp();
  var title=nativeField(v,'tvTitle'),body=nativeField(v,'tvContent');
  if(!STATE.discussionTopic){
    if(title){
      var course=nativeField(v,'toolbar_tv_title');
      STATE.discussionTopic={q:title.t+'\n'+(body?body.t:''),key:((course?course.t:'')+'|'+title.t+'|'+(body?body.t:'')).replace(/\s+/g,'')};
    }else{
      var topCourse=v.n.filter(function(n){return n.y>H*0.04&&n.y<H*0.10&&n.x>W*0.25&&n.x<W*0.75;})[0];
      var wordCloudNode=cxFind(v,/词云|人点赞|第\d+楼/,H*0.24);
      var topicMaxY=wordCloudNode?wordCloudNode.y:H*0.38;
      var topicNodes=v.n.filter(function(n){
        return n.y>H*0.22&&n.y<topicMaxY&&!/^(?:搜索|词云|关注|全文|评论主贴)$/.test(n.t.trim())&&!/回复[:：]?\s*\d+|阅读\s*\d+/.test(n.t);
      });
      var peerNodes=v.n.filter(function(n){
        return n.y>=topicMaxY&&n.y<H*0.85&&n.t.length>=10&&!/第\d+楼|人点赞/.test(n.t);
      }).slice(0,5);
      var ocrTopicText=topicNodes.map(function(n){return n.t.trim();}).join(' ');
      if(!ocrTopicText||ocrTopicText.length<4)return;
      var peerContext=peerNodes.length?('（参考背景主题：'+peerNodes.map(function(n){return n.t.trim();}).join(' ').slice(0,180)+'）'):'';
      STATE.discussionTopic={
        q:ocrTopicText+peerContext,
        key:((topCourse?topCourse.t:'disc')+'|'+ocrTopicText).replace(/\s+/g,'').slice(0,80)
      };}}
  var topic=STATE.discussionTopic;
  var records=STORE.get('discussionReplies',{})||{},record=records[topic.key];
  function persist(value){records[topic.key]=value;STORE.put('discussionReplies',records);}
  function finish(){
    if(STATE.discussionTaskKey){if(!STATE.discussionDone[STATE.discussionTaskKey])SESSION_STATS.discussions++;STATE.discussionDone[STATE.discussionTaskKey]=true;STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};STATE.videoFinishedKeys[STATE.discussionTaskKey]=true;}
    STATE.discussionTopic=null;STATE.taskTopReady=false;STATE.taskTopSignature='';
    safeBack();sleep(650);cxLog('讨论发表已确认，返回章节核对任务点');
    var afterBack=view();
    if(!isChapterContent(afterBack))refreshDiscussionChapter(afterBack);}
  if(record){
    if(record.status==='posted'){cxLog('此讨论已有本脚本的发表记录，避免重复回答');finish();return;}
    var probe=String(record.text||'').replace(/\s+/g,'').slice(0,12);
    var found=probe.length>=4&&v.n.some(function(n){
      return n.t.replace(/\s+/g,'').indexOf(probe)>=0&&n!==nativeField(v,'etReplyText');});
    if(found||/发表成功|评论成功|回复成功/.test(v.s)){
      record.status='posted';persist(record);finish();return;}
    if(Date.now()-(record.at||0)>12000){
      record.status='posted';persist(record);finish();return;}
    if(Date.now()-STATE.lastLog>10000){STATE.lastLog=Date.now();cxLog('讨论已尝试发表，等待结果核对，不重复发送');}
    sleep(700);return;}
  var personal=/你所遇到|你的.{0,8}经历|你曾|分享.{0,8}(?:亲身|个人|经历)|自己.{0,8}经历/.test(topic.q);
  var instruction=personal?
    '用户允许创作个人经历类讨论。以普通大学生视角写一个平常合理的学习或生活困难示例，如时间安排、学习压力，并说明具体应对和收获。不要编夸张事件、重大疾病、身份成就或复杂家庭遭遇。':
    '根据给定话题表达独立见解与读后收获，语言自然流畅，不要照抄参考背景中的原话。';
  if(STATE.discussionFailAt&&Date.now()-STATE.discussionFailAt<10000){sleep(1200);return;}
  var reply;
  try{
    reply=ask({kind:'short',options:[],q:'讨论题。写一段120至200字的中文回答，回应提问，观点清楚。'+instruction+'\n'+topic.q});
  }catch(e){
    if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;
    STATE.discussionFailAt=Date.now();
    cxLog('讨论题请求解题失败，稍后重试：'+e);sleep(1200);return;}
  STATE.discussionFailAt=0;
  requireLearningApp();
  var answer=String(reply.text||'').trim();
  if(answer.length<15||String(reply.confidence||'').toLowerCase()==='low'){
    cxLog('讨论回答不完整或不确定，暂不发表');sleep(1500);return;}
  var fresh=view(),input=nativeField(fresh,'etReplyText')||nativeField(fresh,'tvReplyContent');
  if(input&&cxPress(input)){
    sleep(420);
    var editor=cxId(PKG+':id/etReplyText').findOnce()||cxClassName('android.widget.EditText').findOnce();
    if(editor&&String(editor.className())==='android.widget.EditText'){
      requireLearningApp();editor.setText(answer);sleep(400);
      var send=cxId(PKG+':id/btnSubmit').findOnce();
      if(send){
        requireLearningApp();
        var sentOk=false;
        try{sentOk=!!send.click();}catch(ignore){}
        if(!sentOk)sentOk=cxPress({node:send,x:send.bounds().centerX(),y:send.bounds().centerY()});
        if(sentOk){
          persist({status:'posted',text:answer,at:Date.now()});
          cxLog('讨论回答已填写，已点击一次发表');sleep(700);
          finish();
          return;}}}}
  var ocrInput=cxFind(fresh,/评论主贴|写评论|写回复|发表评论|说点什么|请输入/,H*0.72);
  var tapInX=ocrInput?ocrInput.x:Math.round(W*0.32);
  var tapInY=ocrInput?ocrInput.y:Math.round(H*0.955);
  forceWriteClipboardForIme(answer);
  if(tap(tapInX,tapInY)){
    sleep(450);
    var axEditor=cxClassName('android.widget.EditText').findOnce()||cxSelector().editable(true).findOnce();
    var wroteDisc=false;
    if(axEditor){
      try{requireLearningApp();if(axEditor.setText(answer))wroteDisc=true;}catch(e){if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0)throw e;}}
    if(!wroteDisc&&tapImeClipboardChip(answer))wroteDisc=true;
    if(wroteDisc){
      sleep(320);
      var sendPage=view();
      var sendBtn=cxId(PKG+':id/btnSubmit').findOnce()||cxFind(sendPage,/^(?:发布|发送|提交|完成|发表)$/,H*0.35);
      persist({status:'posted',text:answer,at:Date.now()});
      if(sendBtn&&typeof sendBtn.click==='function'){try{sendBtn.click();}catch(ignore){tap(sendBtn.x||Math.round(W*0.91),sendBtn.y||Math.round(H*0.62));}}
      else if(sendBtn)tap(sendBtn.x,sendBtn.y);
      else tap(Math.round(W*0.91),Math.round(H*0.62));
      sleep(550);
      closeKeyboardSafely();
      cxLog('已填写并发送讨论回复');
      finish();
      return;}
    closeKeyboardSafely();}}
enableBackgroundKeepAlive();
initFloatingControlPanel();
cxLog('课程助手 v6.14 独立应用版已启动（免无障碍/自适应双引擎 + 后台保活）');
while(true){
  try{
    if(Date.now()-LAST_KEEP_ALIVE_RENEW>1200000){LAST_KEEP_ALIVE_RENEW=Date.now();try{device.keepScreenDim(3600*1000);}catch(ignore){}}
    if(SCRIPT_PAUSED){sleep(600);continue;}
    if(!getExecutionMode()){
      updateFloatingStatus('请开启 Shizuku 或无障碍服务');
      if(!PERM_GUIDE_SHOWN){
        PERM_GUIDE_SHOWN=true;
        threads.start(function(){
          try{
            var idx=dialogs.select('选择运行模式（免无障碍 / 兼容模式）',[
              '1. 使用 Shizuku 免无障碍模式（推荐，需先启动 Shizuku）',
              '2. 开启无障碍兼容模式（前往系统无障碍设置）',
              '3. 稍后手动开启（保持悬浮窗待命）'
            ]);
            if(idx===0){
              SHIZUKU_REQ_TRIED=false;
              detectShellBackend();
            }else if(idx===1){
              try{app.startActivity({action:'android.settings.ACCESSIBILITY_SETTINGS'});}catch(ignore){}
            }
          }catch(ignore){}});}
      sleep(1500);
      continue;}
    var pkg=foregroundPackage();
    if(pkg!==PKG){
      CHAPTER.suspendEvents();
      var nowOut=Date.now();
      if(!STATE.pausedOutside){
        STATE.pausedOutside=true;
        STATE.pausedAt=nowOut;
        STATE.outsideStartedAt=nowOut;
        STATE.autoReturnCount=0;
        STATE.lastAutoReturnAt=0;
        if(STATE.video&&STATE.total>0&&STATE.lastTime>=0){
          var spd=STATE.videoSpeedRate>0?STATE.videoSpeedRate:1;
          var remSec=Math.max(5,Math.ceil((STATE.total-STATE.lastTime)/spd));
          cxLog('学习通已切入后台（当前应用 '+pkg+'），后台视频挂机计时中（'+spd+'x），预计剩余 '+remSec+' 秒后自动切回');
        }else{
          cxLog(pkg?'学习通已切到后台，后台保活待命；切回或到时将自动继续':'暂无法确认前台应用，暂停屏幕点击');}}
      if(STATE.video&&STATE.total>0&&STATE.lastTime>=0&&STORE.get('autoReturnForeground',true)){
        var spdNow=STATE.videoSpeedRate>0?STATE.videoSpeedRate:1;
        var elapsedOut=Math.floor((nowOut-(STATE.outsideStartedAt||nowOut))/1000)*spdNow;
        if(STATE.lastTime+elapsedOut>=STATE.total+2&&(STATE.autoReturnCount||0)<2&&nowOut-(STATE.lastAutoReturnAt||0)>15000){
          STATE.autoReturnCount=(STATE.autoReturnCount||0)+1;
          STATE.lastAutoReturnAt=nowOut;
          cxLog('后台视频预估播放完毕，自动切回学习通核对任务点（'+STATE.autoReturnCount+'/2）');
          if(bringChaoxingToFront()){sleep(900);continue;}}}
      if(nowOut-STATE.pausedAt>15000){
        STATE.pausedAt=nowOut;
        cxLog(pkg?'后台保活运行中，当前前台应用 '+pkg:'后台保活运行中，等待学习通窗口');}
      sleep(1200);
      continue;}
    if(STATE.pausedOutside){
      CHAPTER.resumePending(Date.now()-(STATE.outsideStartedAt||Date.now()));
      resumeVideoNetworkAfterPause(Date.now()-(STATE.outsideStartedAt||Date.now()));
      STATE.pausedOutside=false;
      STATE.lastAnswerView=null;STATE.preloadedQuizView=null;
      W=Math.min(device.width,device.height);H=Math.max(device.width,device.height);
      STATE.chapterWatch=null;
      cxLog('已回到学习通，重新识别当前页面后继续处理');}
    if(handleVideoNetworkRecovery())continue;
    if(handleVideoLoadFailure())continue;
    if(CHAPTER.guardArrival()){sleep(120);continue;}
    if(STATE.videoChapterRefresh){reopenVideoChapter(null);continue;}
    if(STATE.discussionRefresh){reopenDiscussionChapter(null);continue;}
    if(STATE.doc){document(view());continue;}
    if(STATE.readingVisit){
      var readingPage=view();
      if(!checkReadingTask(readingPage))chapter(readingPage);
      continue;}
    if(land()||nativeVideoNode('rvSpeed')){player(null);continue;}
    var v=STATE.preloadedQuizView||view();
    STATE.preloadedQuizView=null;
    SMART_RECOGNIZER.analyze(v);
    if(isDirectoryPage(v)&&!STATE.videoChapterRefresh&&!STATE.discussionRefresh){
      STATE.video=false;STATE.finished=false;STATE.videoExitAt=0;STATE.afterSubmit=false;STATE.quizPending=false;
      if(scanUnfinishedChapters(v)){sleep(200);continue;}}
    if(reopenVideoChapter(v))continue;
    if(reopenDiscussionChapter(v))continue;
    if(STATE.discussionTopic&&!discussionPage(v)&&isChapterContent(v)){
      STATE.discussionTopic=null;STATE.taskTopReady=false;STATE.taskTopSignature='';}
    if(discussionPage(v)||STATE.discussionTopic){
      if(CFG.skipDiscussion){
        STATE.discussionTopic=null;
        if(STATE.discussionTaskKey){
          STATE.videoFinishedKeys=STATE.videoFinishedKeys||{};
          STATE.videoFinishedKeys[STATE.discussionTaskKey]=true;
          STATE.discussionTaskKey='';
          safeBack();sleep(550);
        }else{
          if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();cxLog('当前为讨论页，已按设置留待手动检测');}
          sleep(1000);}
        continue;}
      discussion(v);continue;}
    updateQuizContext(v);
    if(unansweredWarning(v)&&/确定|取消|确认|提交/.test(v.s)){
      if(Date.now()-STATE.lastLog>12000){STATE.lastLog=Date.now();cxLog('学习通提示漏答，停留检查，不继续确认提交');}
      sleep(1000);continue;}
    if(handleSubmitConfirmation(v))continue;
    if(recoverMissingQuestion(v))continue;
    if(submissionFailed(v)){
      STATE.quizPending=true;
      if(Date.now()-STATE.lastLog>15000){
        STATE.lastLog=Date.now();
        cxLog('学习通提示未及格或提交失败，等待核对答案，暂停翻页和重复提交');}
      sleep(1200);
      continue;}
    if(STATE.awaitingSubmitResult&&submissionSucceeded(v)){
      STATE.awaitingSubmitResult=false;STATE.quizPending=false;
      STATE.afterSubmit=true;STATE.taskTopReady=false;STATE.taskTopSignature='';
      cxLog('已确认提交结果，继续本节剩余任务点');}
    if(isDirectoryPage(v)){
      STATE.afterSubmit=false;STATE.quizPending=false;
      if(scanUnfinishedChapters(v)){sleep(350);continue;}}
    if(STATE.afterSubmit||(submissionSucceeded(v)&&!isChapterContent(v)&&!v.n.some(function(n){return /^章节$/.test(n.t.trim())&&n.y<H*0.16;}))){
      STATE.afterSubmit=true;continueAfterSubmit(v);continue;}
    if(/应用推荐|运行中脚本|ChaoxingVideoAssistant-v[\d.]+/.test(v.s)){
      cxLog('检测到屏幕弹窗，等待题目恢复');
      sleep(1500);
      continue;}
    if(/未到开放时间|暂未开放|前置.*未完成|章节未解锁|需先完成上一/.test(v.s)){
      var lockTitle=readChapterHeading(v);
      var lockLabel='未解锁:'+(lockTitle?lockTitle.t.slice(0,14):'章节');
      if(SESSION_STATS.skipped.indexOf(lockLabel)<0){SESSION_STATS.skipped.push(lockLabel);if(SESSION_STATS.skipped.length>30)SESSION_STATS.skipped.shift();}
      var okLock=cxFind(v,/^(?:确定|我知道了|返回|取消)$/);
      if(okLock)cxPress(okLock);else safeBack();
      cxLog('检测到未解锁/未开放章节，已记录并跳过：'+lockLabel);
      sleep(500);
      continue;}
    if(/非WiFi|非\s*WIFI|消耗流量|移动网络/.test(v.s)||(v.incompleteDialog&&/取消/.test(v.s)&&!/下一章节/.test(v.s))){
      var yes=cxFind(v,/^(?:继续|继续播放|确定)$/);
      if(yes)tap(yes.x,yes.y);
      else tap(Math.round(W*0.679),Math.round(H*0.572));
      cxLog('检测到非WiFi流量提示，已点击【继续】');
      sleep(650);
      continue;}
    if(/开始考试|正式考试|考试倒计时/.test(v.s)){
      toast('正式考试已暂停');
      sleep(10000);
      continue;}
    if(land()){
      player(v);
      continue;}
    if(STATE.doc){
      document(v);
      continue;}
    if((v.incompleteDialog&&!/取消|非WiFi|消耗流量/.test(v.s))||(/当前章节还有任务点未完成|是否[\s\S]{0,6}去完成/.test(v.s)&&/下一章节/.test(v.s))){
      var nextChap=v.n.filter(function(n){return n.y>H*0.40&&n.y<H*0.70&&n.x<W*0.50&&/下一章节|下一章|下一节/.test(n.t);})[0];
      if(nextChap)tap(nextChap.x,nextChap.y);
      else tap(Math.round(W*0.328),Math.round(H*0.572));
      STATE.videoFinishedKeys={};STATE.hadCurrentTask=false;STATE.completionRefreshed=false;
      STATE.taskTopReady=false;STATE.taskTopSignature='';STATE.chapterFullScanDone=false;STATE.chapterScrollSteps=0;
      cxLog('已确认跳过非视频/测验任务点，点击【下一章节】进入下一节');
      sleep(850);
      continue;}
    var activeQs=questions(v);
    if(activeQs.length){
      quiz(v);
      continue;}
    if(isChapterContent(v)){
      var allChapTasks=taskSections(v);
      allChapTasks.forEach(function(t){
        if(t.kind==='quiz'&&t.done&&STATE.quizContext&&!/请由此重做|待重做|未达到及格线/.test(v.s)){
          STATE.chapterQuizCompleted=STATE.chapterQuizCompleted||{};
          STATE.chapterQuizCompleted[STATE.quizContext]=true;}});
      var pendingPriorTasks=allChapTasks.filter(function(t){
        if(t.kind==='survey'||t.kind==='other')return false;
        if(CFG.onlyVideoQuiz&&t.kind!=='video')return false;
        if(CFG.skipDiscussion&&t.kind==='discussion')return false;
        return !t.done&&!(STATE.videoFinishedKeys&&STATE.videoFinishedKeys[t.key])&&t.kind!=='quiz';
      });
      if(pendingPriorTasks.length){
        chapter(v);
        continue;}}
    if(/答题卡/.test(v.s)){
      quiz(v);
      continue;}
    if(/请输入答案|请输入内容|请输入文字|第\s*\d+\s*空/.test(v.s)&&
       (/保存|下一题|上一题|答题卡|第\s*\d+\s*空/.test(v.s))){
      quiz(v);
      continue;}
    if(quizSubmitButton(v)){
      if(STATE.workTotal||Object.keys(STATE.answered).length)submitWorkIfComplete(v,'');
      else quiz(v);
      continue;}
    if(STATE.quizPending&&STATE.quizSeek){quiz(v);continue;}
    if(isChapterContent(v)){
      chapter(v);
      continue;}
    if(/单选|多选|判断|填空|简答|问答|第\s*\d+\s*空/.test(v.s)){
      quiz(v);
      continue;}
    if(STATE.video){
      STATE.video=false;
      STATE.finished=false;}
    sleep(280);
  }catch(e){
    if(String(e).indexOf('CX_BACKGROUND_PAUSED')>=0||String(e).indexOf('CX_ACCESSIBILITY_PAUSED')>=0){
      sleep(800);
      continue;}
    cxLog('运行异常：'+e+(e&&e.stack?(' | '+String(e.stack).split('\n').slice(0,3).join(' <- ')):''));
    sleep(1000);}}
})();
