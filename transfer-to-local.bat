@echo off
chcp 65001 >nul
setlocal
rem ===== 可以改这里：代码放在哪个文件夹 =====
set "TARGET=D:\chaoxing"
rem ==========================================
set "BRANCH=claude/confident-gates-ayw6m6"
set "REPO=https://github.com/2053406215/chaoxing.git"
set "SESSION=session_01W8LRvoboWzxsZVsqgGQQKF"

echo.
echo 代码文件夹: %TARGET%
echo.

for %%I in ("%TARGET%") do set "DRIVE=%%~dI"
if not exist "%DRIVE%\" goto nodrive

where git >nul 2>nul
if errorlevel 1 goto nogit

where claude >nul 2>nul
if errorlevel 1 goto noclaude

if exist "%TARGET%\.git" goto update

echo [1/2] 正在下载代码...
git clone -b %BRANCH% %REPO% "%TARGET%"
if errorlevel 1 goto clonefail
cd /d "%TARGET%"
goto teleport

:update
echo [1/2] 代码已存在，正在更新...
cd /d "%TARGET%"
git fetch origin %BRANCH%
if errorlevel 1 goto clonefail
git checkout %BRANCH%
git pull --ff-only origin %BRANCH%

:teleport
echo.
echo [2/2] 正在把云端会话接到这台电脑...
echo 第一次使用会要求登录，请登录网页上用的同一个账号。
echo.
claude --teleport %SESSION%
if errorlevel 1 goto telefail
goto end

:telefail
echo.
echo 按会话编号接入没有成功，改为从列表里选择会话...
claude --teleport
goto end

:nodrive
echo [错误] 找不到 %DRIVE% 盘。请用记事本打开这个文件，把第 5 行的 TARGET 改成存在的位置。
goto end

:nogit
echo [错误] 没有找到 git。请先安装 Git for Windows: https://git-scm.com/downloads/win
echo 装完后重新双击这个文件。
goto end

:noclaude
echo [错误] 没有找到 claude。请先打开 PowerShell 运行下面这一行安装:
echo     irm https://claude.ai/install.ps1 ^| iex
echo 装完后重新双击这个文件。
goto end

:clonefail
echo [错误] 下载或更新代码失败，请检查网络后重试。
goto end

:end
echo.
pause
