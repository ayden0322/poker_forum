/**
 * P幣競猜總開關（fail-closed，沿用 economy.flags 模式）。
 *
 * 只有環境變數明確為 'true' 才啟用；沒設 / 設錯 / 空字串 一律「關」。
 * 擋兩個入口：(1) 下注/查詢 API（controller 層）(2) 賠率管線 cron（不燒 API 額度）。
 * schema 可照常上 prod，行為預設關閉，go-live 只翻一個環境變數。
 *
 * 本地測試：.env 設 PREDICTION_ENABLED=true
 * 正式環境：不設（即關），確定 go-live 再設 true。
 */
export function isPredictionEnabled(): boolean {
  return process.env.PREDICTION_ENABLED === 'true';
}
