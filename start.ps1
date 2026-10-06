# 켜기 (윈도우 PowerShell)
#
#   .\start.ps1                 아두이노가 꽂혀 있으면 찾아서 센서를 읽는다. 없으면 단추로 흉내 낸다
#   .\start.ps1 --sim           보드 없이 가짜 관객으로
#   .\start.ps1 --display       조절판 없이 영상만 (전시용 화면)
#   .\start.ps1 --offline 40    장비 없이 40초를 out.mp4 로 적는다
#   .\start.ps1 --serial COM3   아두이노 자리를 직접 적는다. 끄려면 --serial off
#   .\start.ps1 --port 7001     포트를 바꾼다
#
# conda 환경(dockplay)으로 켠다.
Set-Location $PSScriptRoot
. .\scripts\conda.ps1
$Conda = Find-Conda
if (-not $Conda) { Write-Host "conda 가 없습니다. 먼저 설치해 주세요:  .\install.ps1" -ForegroundColor Red; exit 1 }
if (-not (Test-CondaEnv $Conda)) { Write-Host "conda 환경($EnvName)이 없습니다. 먼저 설치해 주세요:  .\install.ps1" -ForegroundColor Red; exit 1 }
# 작가가 web\media\ 에 넣어 둔 영상 목록을 다시 만든다.
& $Conda run --no-capture-output -n $EnvName python make_media.py
& $Conda run --no-capture-output -n $EnvName python serve.py @args
