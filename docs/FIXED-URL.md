# 固定 HTTPS 網址

使用 ngrok 帳號綁定的固定開發網域，讓手機與電腦換網路後仍使用同一個 HTTPS 網址。這是把目前電腦上的夜泊服務提供給外部連線；電腦、網際網路與啟動視窗仍需保持運作，關機後不會繼續代管。

## 啟動

1. 先登入 [ngrok Domains](https://dashboard.ngrok.com/domains)，複製帳號專屬的免費開發網域。將完整 HTTPS 網址填入專案 `.env` 的 `PUBLIC_URL`，例如 `PUBLIC_URL=https://你的開發網域.ngrok-free.dev`。請勿使用含隨機前綴與 IP 數字的臨時網域；把臨時網址寫入設定並不能將它變成固定網域。
2. 雙擊專案中的 `start-fixed-url.cmd`，或執行 `npm.cmd run public`。
3. 啟動器會在本機 `127.0.0.1:3001` 啟動夜泊，再由 ngrok 提供 HTTPS 網址。
4. 第一次成功綁定網址後，會將網址保存到 `data/fixed-url.json`；下次用同一網址啟動，若回傳不同網址會停止，不會自動換網址。
5. 手機使用 Wi-Fi 或行動網路皆可開啟該 HTTPS 網址。首次可能出現 ngrok 的網站提示，確認網址後點 Visit Site。
6. 停止時在啟動視窗按 `Ctrl+C`。不需要再同時執行 `start.cmd` 或 `start-iphone.cmd`。

如果連線未成功，啟動器會明確顯示「尚未取得固定網址」，不會把本機位址當作固定網域。校園網路若阻擋 ngrok，可換另一個允許該連線的網路後重試。

## 帳號與資料

- 使用同一個 `data/night-harbor.sqlite`，不會另建一套帳號，也不會將 SQLite 檔案上傳到 ngrok。
- 原本用區網網址登入的 Cookie 不會跨網域共用。第一次改用固定網址時，重新登入原帳號即可讀到資料，不需要重新註冊。
- 固定網址的服務會設定 Secure、HttpOnly、SameSite=Strict 登入 Cookie。
- ngrok 接收外部 HTTPS 請求並轉送到本機服務，外部使用者仍需登入，才能讀取帳號資料。
- 啟動時關閉 ngrok 的 HTTP request inspection，避免在本機檢視器保留登入密碼及個人請求內容。
- 原本的本機及區網啟動器仍可使用；固定網址啟動器使用獨立本機連接埠，不更改它們的 Cookie 設定。

## ngrok 設定

需要已安裝的 ngrok v3，以及可用的 ngrok 帳號驗證。啟動器先找 `NGROK_BIN` 指定路徑、使用者下載資料夾中的 ngrok，再找 PATH 上的程式；會跳過無法執行的 Windows Store 捷徑。

選用環境變數：

- `NGROK_BIN`：ngrok 執行檔完整路徑。
- `NGROK_CONFIG`：已有 ngrok 帳號設定檔的路徑，未指定時讀取使用者的預設設定。
- `PUBLIC_PORT`：本機轉送連接埠，預設 3001。
- `PUBLIC_URL`：已有的固定 HTTPS 網域，設定後明確指定它，不另外產生新網址。

ngrok 驗證由原本的使用者設定檔讀取，啟動器不複製或印出驗證金鑰。`data/fixed-url.json` 只保存公開網址，不包含密碼或 API 金鑰。專案的 `data/ngrok-night-harbor.yml` 只保存端點設定，與原帳號設定合併使用，並關閉 HTTP request inspection。

免費方案的固定開發網域不能自由命名，並有流量／請求額度；若額度用完，需等額度恢復或自行選擇付費方案。此啟動器不會購買方案或自動升級。

參考：[ngrok 免費方案與固定開發網域](https://ngrok.com/docs/pricing-limits/free-plan-limits)。如果希望電腦關機後仍可連線，需另外部署到具備持久儲存空間的伺服器，不能只靠本機通道。
