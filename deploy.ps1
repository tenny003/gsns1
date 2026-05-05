Set-Location "c:\Users\user\Desktop\GSNS"

# 변경사항 확인
$status = git status --porcelain 2>&1
if (-not $status) {
    Write-Host "✅ 변경사항 없음 - 배포 건너뜀"
    exit 0
}

Write-Host "🚀 배포 시작..."

# 변경된 파일 요약
$changedFiles = git diff --cached --name-only 2>&1
$untrackedFiles = git ls-files --others --exclude-standard 2>&1
$modifiedFiles = git diff --name-only 2>&1

# 커밋 메시지
$date = Get-Date -Format "yyyy-MM-dd HH:mm"
$msg = "auto-deploy: $date"

# ── 1. GitHub Push ──
Write-Host "📤 GitHub 푸시 중..."
git add .
git commit -m $msg
git push origin master
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ GitHub 푸시 실패"
    exit 1
}
Write-Host "✅ GitHub 푸시 완료"

# ── 2. Cloudflare Pages 배포 (gsns1) ──
Write-Host "☁️  Cloudflare Pages 배포 중..."
npx wrangler pages deploy . --project-name gsns1 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cloudflare 배포 실패"
    exit 1
}
Write-Host "✅ Cloudflare 배포 완료 → https://gsns1.pages.dev"
