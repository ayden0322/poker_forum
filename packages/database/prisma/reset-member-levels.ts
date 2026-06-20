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
 *  - 注意：本腳本會把「所有」會員 level 依經驗重算。若未來已有「真正的邀請制
 *    名人堂(Lv5)」會員，請勿無腦重跑（會把他們降級）。go-live 當下尚無邀請會員，故安全。
 *
 * 跑法（在 packages/database 目錄）：
 *   dry-run： pnpm tsx prisma/reset-member-levels.ts
 *   實際寫入：pnpm tsx prisma/reset-member-levels.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  console.log(`\n=== 會員 Level 重算（依經驗值）${apply ? '【實際寫入 --apply】' : '【DRY-RUN，不寫入】'} ===\n`);

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
  for (const u of users) {
    const exp = expByUser.get(u.id) ?? 0;
    const newLevel = levelForExp(exp, gated);
    if (newLevel !== u.level) changes.push({ id: u.id, nickname: u.nickname, from: u.level, to: newLevel, exp });
  }

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

  // 4) 實際寫入（分批 update）
  console.log('\n[APPLY] 開始寫入...');
  let done = 0;
  for (const c of changes) {
    await prisma.user.update({ where: { id: c.id }, data: { level: c.to } });
    done++;
  }
  console.log(`[APPLY] 完成，更新 ${done} 筆。\n`);
}

main()
  .catch((e) => {
    console.error('重設失敗：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
