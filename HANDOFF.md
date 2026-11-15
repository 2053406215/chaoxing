# 交接说明（给接手的本地会话）

这份文件用于把云端会话的工作交接到本地会话。如果你是通过 `claude --teleport` 接过来的，对话记录里已有同样的信息；如果是全新的本地会话，请先读完这份文件。

## 这是什么

超星学习通（`com.chaoxing.mobile`）的 AutoJs6 自动化脚本，单文件、ES5 写法、整体包在一个立即执行函数里，末尾是 `while(true)` 主循环。

- 当前要测的文件：`ChaoxingVideoAssistant-v6.05.js`
- 分支：`claude/confident-gates-ayw6m6`（在这个分支上提交并推送；用户没有要求时不要创建 PR）
- `ChaoxingVideoAssistant-v5.78.js` 是旧版本，不用管
- 用户用中文交流，请用中文回复

## 现在要做的事

用户已在 MuMu 模拟器里打开学习通，要求做**真机验证**。到目前为止，所有改动只在 node 模拟测试里验证过，**从未在真机或模拟器上跑过**。

1. 用 adb 连接模拟器。MuMu 12 默认 `127.0.0.1:16384`，adb 在 MuMu 安装目录的 `shell` 文件夹里。
2. 先跑一遍测试确认基线：对 `test/` 下每个 `*.test.js` 执行 `node <文件>`，应全部输出 ok。
3. 把脚本 push 到模拟器，在 AutoJs6 里运行。AutoJs6 的安装、无障碍、悬浮窗、截图授权需要用户在模拟器里操作，缺哪项就告诉用户。
4. 用截图和 `uiautomator dump` 对照脚本的页面识别逻辑，按下面的清单逐项核对。
5. 取回 `/sdcard/Download/ChaoxingAssistant_log.txt` 分析卡住的位置，修复后补回归测试，提交并推送。

## 待真机核对的清单

这些功能的页面假设都是从代码或截图推断的，最需要对照真实页面：

| 功能 | 相关函数 | 要核对什么 |
|---|---|---|
| 多门课程排队 | `isCourseListPage` `courseCards` `pickNextCourse` `handleCourseQueue` | 能否认出“课程”列表页；卡片按行距分组是否正确（阈值 `W*0.143`）；巡检完按返回键是否回到列表 |
| “任务”标签 | `isCourseTaskTab` | 进课后落在“任务”标签时是否切到“章节” |
| 未及格重做 | `handleQuizNotPassed` `submissionFailed` | 未及格后页面是否原地可改并带“未达到及格线”字样；3.5 秒的等待是否够页面刷新 |
| 结果页学习答案 | `learnFromResultPage` | 结果页是否有“正确答案：X”，题号行的格式是否匹配 `QUESTION_HEAD_RE` |
| 讨论发表核对 | `discussion` | 发送后回复是否出现在当前屏幕；输入框是否清空 |
| 漏答弹窗 | `recoverUnansweredDialog` | 弹窗上取消按钮的文字；填空/简答题重走时是否重复填写 |
| Root 引擎 | `probeRootShell` `detectShellBackend` | MuMu 开启 Root 后能否启用；`shell(cmd,true)` 的返回格式 |
| 看门狗 | `watchdogTick` | 4 分钟阈值是否会误伤正常的长时间等待 |
| 通知 | `notifyUser` | AutoJs6 的 `notice` 调用方式是否正确 |
| 测验任务点跳过 | `chapter()` 中的 `quizIdleTries` | 这一项没有自动化测试 |

## 各版本改了什么

**v6.03 修复（9 处逻辑错误）**：末题回退补答死循环；目录巡检永不结束；同屏两个视频误判播完；选项补全张冠李戴；主循环空转；进度静止检测空档；视频完成数重复累计；回前台分辨率兜底；讨论发送按钮点击兜底。

**v6.03 后续 5 项**：Root 引擎真正启用；未及格自动重做（清答案缓存，次数上限）；讨论先记“待核对”再确认；测验任务点找不到题目时有次数上限；版本号统一为 `APP_VERSION`。

**v6.04**：结果页学习正确答案写入本地题库；卡住 4 分钟自动恢复加提醒；“还有未答题”弹窗自动取消并补答；答题接口地址、模型名、重做次数可在面板配置。

**v6.05**：多门课程排队（面板里开启，默认关闭）；课程“任务”标签不再被误认为章节目录。

## 测试怎么写

`test/` 下的测试都是同一个套路：读取脚本源码，在主循环入口 `enableBackgroundKeepAlive();\ninitFloatingControlPanel();` 之前截断，追加一行把内部函数导出到 `globalThis.__t`，再用桩替换 Auto.js 的全局对象（`storages`、`device`、`click`、`http` 等），并接管 `Date.now` 和 `sleep`。新增测试照这个写即可。

- `test/quiz-pager.test.js`：翻页测验回退补答、选项补全
- `test/redo-root-discussion.test.js`：Root 探测、未及格重做、讨论核对
- `test/learn-watchdog.test.js`：接口配置、结果页学习、看门狗、漏答弹窗、提醒节流
- `test/course-queue.test.js`：多门课程排队（坐标取自用户的真机截图）
- `test/chapter-core.test.js`：属于 v5.78，与 v6.05 无关

## 已知的遗留问题

- 任务点的 key 由附近的识别文字拼成，可能不稳定或撞车。
- `pagerInfo` 的兜底正则可能把分数误认成页码。
- `STATE.videoLoadRecovery` 从未被赋值，相关分支是死代码。
- 课程排队的完成记录只在本次运行有效，脚本重启后会重新过一遍所有课程。
- lint 里已有的 `shizuku`、`notice` 未定义和重复 `var` 声明都是运行环境全局或历史写法，不影响运行。

## 提交约定

- 提交信息用中文，不要写模型名称。
- 改了脚本内容后如果要再发给用户，顺延版本号并同步改文件名、文件头注释和 `APP_VERSION`（测试会检查版本号与文件名一致）。
