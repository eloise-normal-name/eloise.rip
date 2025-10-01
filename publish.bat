@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Pelican publish script using subtree push to gh-pages
REM Requirements:
REM   - pelican installed (pip install pelican[markdown])
REM   - gh-pages branch created at least once (empty or existing)
REM   - output/ is in .gitignore (recommended)

REM Configuration
set CONTENT_DIR=content
set OUTPUT_DIR=output
set PUBLISH_CONF=publishconf.py
set BRANCH=gh-pages
set BUILD_CMD=pelican %CONTENT_DIR% -o %OUTPUT_DIR% -s %PUBLISH_CONF%

REM Check Pelican availability
where pelican >NUL 2>&1 || (
  echo [ERROR] pelican command not found. Activate your virtualenv or install pelican.
  exit /b 1
)

REM Build site
echo [INFO] Building site...
%BUILD_CMD%
IF ERRORLEVEL 1 (
  echo [ERROR] Pelican build failed.
  exit /b 2
)

REM Ensure gh-pages branch exists remotely
for /f "delims=" %%B in ('git ls-remote --heads origin %BRANCH%') do set BRANCH_EXISTS=1
if not defined BRANCH_EXISTS (
  echo [INFO] Remote branch %BRANCH% not found. Creating it (orphan)...
  git checkout --orphan %BRANCH% || exit /b 3
  del /f /q * >NUL 2>&1
  for /d %%D in (*) do rd /s /q "%%D" >NUL 2>&1
  echo Initial %BRANCH% branch > README.md
  git add README.md
  git commit -m "chore: init %BRANCH% branch" >NUL || exit /b 3
  git push origin %BRANCH% || exit /b 3
  git checkout - >NUL || git checkout main
)

REM Commit (if needed) and push subtree
echo [INFO] Publishing output/ to %BRANCH% via subtree push...
 git subtree push --prefix %OUTPUT_DIR% origin %BRANCH%
IF ERRORLEVEL 1 (
  echo [WARN] Subtree push failed. Attempting split fallback...
  for /f "delims=" %%H in ('git subtree split --prefix %OUTPUT_DIR%') do set TREE_HASH=%%H
  if not defined TREE_HASH (
    echo [ERROR] Could not split subtree for %OUTPUT_DIR%.
    exit /b 4
  )
  git push origin !TREE_HASH!:refs/heads/%BRANCH% || exit /b 4
)

echo [INFO] Deploy complete.
echo Site should be live (or updating) at GitHub Pages shortly.
endlocal
