#!/usr/bin/env node
/**
 * GSNS Game Rankings Updater
 *
 * 데이터 소스:
 *   - SteamSpy API  : steamspy.com/api.php  (CCU + 누적 소유자 수)
 *   - 비Steam 게임  : 공개 플레이어 수 기반 추정값 (Riot, Epic, Nintendo 등)
 *
 * 실행: node scripts/update-rankings.js
 * 출력: data/rankings.json  (매주 월요일 GitHub Actions 자동 갱신)
 */

const https = require('https');
const fs    = require('fs');

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

// ── Steam App ID → 게임 이름 매핑 ─────────────────────────────────────────
const APP_IDS = {
  578080:  'PUBG: Battlegrounds',
  216150:  'MapleStory',
  1599340: 'Lost Ark',
  1840820: 'Dungeon & Fighter',
  2357570: 'Overwatch 2',
  1283830: 'Genshin Impact',
  1938090: 'Call of Duty',
  1245620: 'Elden Ring',
  730:     'Counter-Strike 2',
  570:     'Dota 2',
  39210:   'Final Fantasy XIV',
  1172470: 'Apex Legends',
  2344520: 'Diablo IV',
  1091500: 'Cyberpunk 2077',
  582660:  'Black Desert',
  3669060: 'Blade & Soul',
  306130:  'Elder Scrolls Online',
  1063730: 'New World',
  1284210: 'Guild Wars 2',
  1086940: "Baldur's Gate 3",
  1716740: 'Starfield',
  1240440: 'Halo Infinite',
  105600:  'Terraria',
  892970:  'Valheim',
  1343400: 'RuneScape',
  292030:  'The Witcher 3',
  238960:  'Path of Exile',
  1623730: 'Palworld',
  1471860: 'Honkai: Star Rail',
  582010:  'Monster Hunter: World',
  601150:  'Devil May Cry 5',
  814380:  'Sekiro',
  1593500: 'God of War',
  1174180: 'Red Dead Redemption 2',
  812140:  "Assassin's Creed Odyssey",
  289070:  'Civilization VI',
  1466860: 'Age of Empires IV',
  394360:  'Hearts of Iron IV',
  268500:  'XCOM 2',
  1085660: 'Destiny 2',
  359550:  'Rainbow Six Siege',
  1517290: 'Battlefield 2042',
  489830:  'The Elder Scrolls V: Skyrim',
  252950:  'Rocket League',
  2701460: 'NBA 2K25',
  2392210: 'F1 24',
  227300:  'Euro Truck Simulator 2',
  1248130: 'Farming Simulator 22',
  1250410: 'Microsoft Flight Simulator',
  255710:  'Cities: Skylines',
  413150:  'Stardew Valley',
  1222670: 'The Sims 4',
  870780:  'Control',
  1262420: 'Need for Speed Heat',
  1142710: 'Total War: Warhammer III',
  231200:  'Ragnarok Online',
  945360:  'Among Us',
  2669320: 'EA Sports FC 25',
  374320:  'Dark Souls III',
  230410:  'Warframe',
  548430:  'Deep Rock Galactic',
  367520:  'Hollow Knight',
  1196590: 'Resident Evil Village',
  1172620: 'Sea of Thieves',
  275850:  "No Man's Sky",
  264710:  'Subnautica',
  703080:  'Planet Zoo',
  2582560: 'Madden NFL 25',
  2147660: 'Wuthering Waves',
  271590:  'GTA 5',
  1049590: 'Eternal Return',
  2677660: 'Delta Force',
  1517290: 'Battlefield 2042',
  440:     'Team Fortress 2',
};

// ── 비Steam 게임 기준 점수 (동시접속자 환산 추정값) ────────────────────────
// 참고: CS2 평균 CCU ~600,000 / Dota 2 ~650,000 기준으로 스케일 맞춤
const BASE_SCORES = {
  'League of Legends': 1200000,  // Riot 공식: 월 34M 활성 → CCU 환산 ~1.2M
  'Valorant':           500000,  // Riot: 월 18M → CCU ~500K
  'Fortnite':           900000,  // Epic: 피크 CCU ~900K+
  'World of Warcraft':  120000,  // Blizzard 구독자 기반 ~120K CCU
  'Minecraft':          800000,  // MS: 월 172M (전 플랫폼) → PC CCU ~800K
  'Free Fire':          600000,  // Garena: 일 100M (Mobile 포함) → PC 환산
  'FC Online':          180000,  // Nexon KR 동시접속 추정
  'Lineage':             80000,  // NCSOFT 추정
  'Sudden Attack':       40000,  // Nexon KR 추정
  'StarCraft II':       100000,  // Blizzard 추정
  'Clash of Clans':     400000,  // Supercell 모바일 CCU 추정
  'Animal Crossing':    160000,  // Nintendo Switch 추정
  'Escape from Tarkov':  80000,  // BSG 추정
  'Roblox':            1500000,  // 크로스플랫폼 ~5M CCU, PC 환산 ~1.5M
  'Aion 2':             60000,   // NCSoft KR 추정 (2025.11 출시)
  'GTA 5':             120000,   // Rockstar 추정 (GTA Online 활성)
  'Eternal Return':     30000,   // Nimble Neuron 추정
};

// ── 대륙별 인기도 가중치 ───────────────────────────────────────────────────
const REGION_BOOST = {
  asia: {
    'League of Legends':   2.2,
    'PUBG: Battlegrounds': 2.2,
    'Genshin Impact':      2.8,
    'Honkai: Star Rail':   2.8,
    'FC Online':           6.0,
    'Lost Ark':            3.5,
    'MapleStory':          4.5,
    'Valorant':            1.6,
    'Dungeon & Fighter':   4.5,
    'Lineage':             5.5,
    'Overwatch 2':         1.9,
    'Sudden Attack':       7.0,
    'Free Fire':           2.8,
    'Ragnarok Online':     3.5,
    'StarCraft II':        2.2,
    'Blade & Soul':        3.5,
    'Black Desert':        2.5,
    'Wuthering Waves':     2.8,
    'Aion 2':              5.0,
    'Eternal Return':      3.0,
    'Delta Force':         2.2,
    'Roblox':              1.5,
  },
  na: {
    'Call of Duty':        2.2,
    'Fortnite':            2.2,
    'Halo Infinite':       2.8,
    'Madden NFL 25':       6.0,
    'NBA 2K25':            2.8,
    'World of Warcraft':   1.9,
    'Diablo IV':           1.9,
    'Starfield':           1.6,
    "Baldur's Gate 3":     1.5,
    'Destiny 2':           2.0,
    'Escape from Tarkov':  1.4,
  },
  europe: {
    'Counter-Strike 2':        2.8,
    'Euro Truck Simulator 2':  4.5,
    'Hearts of Iron IV':       3.5,
    'Total War: Warhammer III':2.8,
    'The Witcher 3':           2.2,
    'Cyberpunk 2077':          2.0,
    'F1 24':                   2.8,
    'EA Sports FC 25':         2.2,
    'Farming Simulator 22':    2.8,
    'Escape from Tarkov':      2.2,
    "Baldur's Gate 3":         1.5,
  },
  global: {},
};

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[GSNS] 게임 순위 업데이트 시작...');

  const steamData = await get('https://steamspy.com/api.php?request=top100in2weeks');

  const scores      = { ...BASE_SCORES };
  const playerCounts = {};

  if (steamData && typeof steamData === 'object') {
    for (const [appid, info] of Object.entries(steamData)) {
      const name = APP_IDS[parseInt(appid)];
      if (!name) continue;

      // CCU(동시접속자) + owners 중앙값(누적) 으로 점수 산출
      const ccu    = parseInt(info.ccu)        || 0;
      const owners = parseOwners(info.owners || '') / 50; // 누적 소유자를 50으로 나눠 CCU 스케일에 맞춤
      const score  = ccu + owners;

      if (score > 0) {
        scores[name]        = score;
        playerCounts[name]  = ccu;
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
