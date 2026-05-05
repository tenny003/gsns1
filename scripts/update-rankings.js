#!/usr/bin/env node
/**
 * GSNS Game Rankings Updater
 *
 * 데이터 소스:
 *   - SteamSpy API  : steamspy.com/api.php  (CCU + 누적 소유자 수)
 *   - 비Steam 게임  : 공개 플레이어 수 기반 추정값 (Riot, Epic, Nintendo 등)
 *
 * 설정 파일: data/rankings-config.json  (appIds, baseScores, regionBoost)
 * 실행: node scripts/update-rankings.js
 * 출력: data/rankings.json  (매주 월요일 GitHub Actions 자동 갱신)
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── 설정 로드 ──────────────────────────────────────────────────────────────
const config     = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rankings-config.json'), 'utf-8'));
const APP_IDS    = Object.fromEntries(Object.entries(config.appIds).map(([k, v]) => [parseInt(k), v]));
const BASE_SCORES  = config.baseScores;
const REGION_BOOST = config.regionBoost;

// ── 유틸 ──────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { 'User-Agent': 'GSNS-Rankings/1.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(12000, () => { req.destroy(); resolve(null); });
  });
}

// owners 문자열 → 중앙값 숫자 파싱  "200,000 .. 500,000" → 350000
function parseOwners(str) {
  if (!str) return 0;
  const nums = str.replace(/,/g, '').match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  if (nums.length === 1) return parseInt(nums[0]);
  return (parseInt(nums[0]) + parseInt(nums[1])) / 2;
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('[GSNS] 게임 순위 업데이트 시작...');

  const steamData = await get('https://steamspy.com/api.php?request=top100in2weeks');

  const scores       = { ...BASE_SCORES };
  const playerCounts = {};

  if (steamData && typeof steamData === 'object') {
    for (const [appid, info] of Object.entries(steamData)) {
      const name = APP_IDS[parseInt(appid)];
      if (!name) continue;

      const ccu    = parseInt(info.ccu)        || 0;
      const owners = parseOwners(info.owners || '') / 50;
      const score  = ccu + owners;

      if (score > 0) {
        scores[name]       = score;
        playerCounts[name] = ccu;
      }
    }
    console.log(`[GSNS] SteamSpy: ${Object.keys(steamData).length}개 게임 처리 완료`);
  } else {
    console.warn('[GSNS] SteamSpy 응답 없음 → 기본 추정값 사용');
  }

  // 대륙별 순위 생성
  const rankings = {};
  for (const continent of ['asia', 'na', 'europe', 'global']) {
    const boost = REGION_BOOST[continent] || {};
    const rScores = {};
    for (const [game, score] of Object.entries(scores)) {
      rScores[game] = score * (boost[game] || 1.0);
    }
    rankings[continent] = Object.entries(rScores)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/rankings.json', JSON.stringify({
    updated:      new Date().toISOString(),
    source:       steamData ? 'SteamSpy CCU + 지역 가중치' : '지역 가중치 기본값',
    playerCounts,
    rankings,
  }, null, 2));

  const topAsia = rankings.asia.slice(0, 5).join(', ');
  console.log(`[GSNS] 아시아 TOP5: ${topAsia}`);
  console.log('[GSNS] ✓ data/rankings.json 저장 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
