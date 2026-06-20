/**
 * Go-Live 一次性腳本：依「經驗值」重算所有會員 level。
 *
 * 為什麼需要：舊系統用「發文數」決定 level（曾有 Lv5「高手」/Lv6「大師」）。
 * 會員經濟改用「經驗值」驅動後，Lv5 被定義為「邀請制名人堂」（minExp=null，
 * 經驗不會自動升上去）。若不重設，舊發文數時代的 Lv5/Lv6 會被前後端誤判成
 * 邀請制名人堂、且永遠不被經驗重算。go-live 翻開關前必須先跑這支對齊。
 *
 * 安全：
 *  - 預設 dry-run，只印報告、不寫入；要實際寫入需加 --apply
 *  - 這是不可逆的全表 UPDATE（舊 level 值會被覆蓋）→ 跑 --apply 前務必先備份 users 表
 *  - **預設保護邀請制 Lv5**：不會動任何目前 level=5 的會員（與 runtime LevelService 一致，
 *    Lv5 為邀請制、不被經驗重算）。go-live 當下「所有 Lv5 都是舊發文數時代的遺留、應降回」，
 *    這種一次性場景才加 --reset-legacy-l5 連同 Lv5 一起重算。未來有真邀請會員後，永遠別加這個旗標。
 *
 * 跑法（在 packages/database 目錄）：
 *   dry-run（保護Lv5）：    pnpm tsx prisma/reset-member-levels.ts
 *   go-live 一次性重算Lv5： pnpm tsx prisma/reset-member-levels.ts --reset-legacy-l5
 *   實際寫入：              ↑ 任一再加 --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 邀請制等級（與 apps/api LevelService 的 INVITE_ONLY_LEVEL 一致） */
const INVITE_ONLY_LEVEL = 5;

// 與 apps/api LevelService 一致的經驗門檻（gated：有 minExp 的等級；Lv5 邀請制不在此列）
const DEFAULT_GATED_TIERS = [
  { level: 1, minExp: 0 },
  { level: 2, minExp: 1000 },
  { level: 3, minExp: 3000 },
  { level: 4, minExp: 10000 },
];

/** 依經驗值算等級：取符合的最高 gated 門檻（與 LevelService.levelForExp 同邏輯） */
function levelForExp(exp: number, gated: { level: number; minExp: number }[]): number {
  const sorted = [...gated].sort((a, b) => a.minExp - b.minExp);
  let level = sorted[0]?.level ?? 1;
  for (const t of sorted) if (exp >= t.minExp) level = t.level;
  return level;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const resetLegacyL5 = process.argv.includes('--reset-legacy-l5');
  console.log(`\n=== 會員 Level 重算（依經驗值）${apply ? '【實際寫入 --apply】' : '【DRY-RUN，不寫入】'} ===`);
  console.log(resetLegacyL5
    ? '⚠️  --reset-legacy-l5：連同目前 Lv5 一起重算（僅限 go-live 當下確認無真邀請會員時使用）\n'
    : '預設保護邀請制 Lv5：不會更動任何目前 level=5 的會員\n');

  // 1) 讀經驗門檻：優先用 DB 的 level_tiers（後台可能調過），否則用程式預設
  const tierRows = await prisma.levelTier.findMany();
  const gated = tierRows.length
    ? tierRows
        .filter((t): t is typeof t & { minExp: number } => t.minExp != null)
        .map((t) => ({ level: t.level, minExp: t.minExp }))
    : DEFAULT_GATED_TIERS;
  console.log('使用門檻：', gated.map((t) => `Lv${t.level}>=${t.minExp}`).join(' / '));

  // 2) 取每位會員的 EXP 餘額
  const expAccounts = await prisma.walletAccount.findMany({
    where: { currency: 'EXP' },
    select: { userId: true, balance: true },
  });
  const expByUser = new Map(expAccounts.map((a) => [a.userId, a.balance]));

  // 3) 逐一比對
  const users = await prisma.user.findMany({ select: { id: true, nickname: true, level: true } });
  const changes: { id: string; nickname: string; from: number; to: number; exp: number }[] = [];
  let protectedL5 = 0;
  for (const u of users) {
    // 預設保護邀請制 Lv5（除非明確 --reset-legacy-l5）
    if (u.level === INVITE_ONLY_LEVEL && !resetLegacyL5) { protectedL5++; continue; }
    const exp = expByUser.get(u.id) ?? 0;
    const newLevel = levelForExp(exp, gated);
    if (newLevel !== u.level) changes.push({ id: u.id, nickname: u.nickname, from: u.level, to: newLevel, exp });
  }
  if (protectedL5) console.log(`（已保護 ${protectedL5} 位 Lv5 邀請制會員，未重算）`);

  console.log(`\n會員總數：${users.length}，需變更：${changes.length}\n`);
  if (changes.length) {
    const byTransition = new Map<string, number>();
    for (const c of changes) {
      const k = `Lv${c.from} → Lv${c.to}`;
      byTransition.set(k, (byTransition.get(k) ?? 0) + 1);
    }
    console.log('變更分佈：');
    for (const [k, n] of [...byTransition.entries()].sort()) console.log(`  ${k}: ${n} 人`);
    console.log('\n前 20 筆明細：');
    for (const c of changes.slice(0, 20)) {
      console.log(`  ${c.nickname} (${c.id}): Lv${c.from} → Lv${c.to}  (exp=${c.exp})`);
    }
    if (changes.length > 20) console.log(`  ...還有 ${changes.length - 20} 筆`);
  }

  if (!apply) {
    console.log('\n[DRY-RUN] 未寫入任何資料。確認上面無誤、且已備份 users 表後，加 --apply 實際執行。\n');
    return;
  }

  // 4) 實際寫入：包進單一交易，中斷則整批 rollback，不會留半套
  console.log('\n[APPLY] 開始寫入（單一交易）...');
  if (changes.length) {
    await prisma.$transaction(
      changes.map((c) => prisma.user.update({ where: { id: c.id }, data: { level: c.to } })),
    );
  }
  console.log(`[APPLY] 完成，更新 ${changes.length} 筆。\n`);
}

main()
  .catch((e) => {
    console.error('重設失敗：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
