/**
 * 會員經濟系統總開關（fail-closed）。
 *
 * 只有環境變數明確為 'true' 才啟用；沒設 / 設錯 / 空字串 一律「關」。
 * 用途：在所有「會行為發幣/發經驗」的單一入口（TasksService.recordEvent）擋住，
 *      讓 schema 照常上 prod、但行為在 prod 預設關閉，go-live 只需翻一個環境變數。
 *
 * 本地測試：.env 設 MEMBER_ECONOMY_ENABLED=true
 * 正式環境：不設（即關），確定要上線再到 Zeabur 設 true 並 redeploy。
 */
export function isMemberEconomyEnabled(): boolean {
  return process.env.MEMBER_ECONOMY_ENABLED === 'true';
}
