@echo off
rem Agentia runs this script from the project root before "agentia cicd work submit" and
rem "agentia cicd work test". A non-zero exit stops the submit and is passed through:
rem 0 passed, 1 blocking findings, 2 usage or config error, 3 environment error.
call agentia guardian gate
exit /b %ERRORLEVEL%
