# Issue tracker: GitHub

本 repo 的票（issue）與 PRD 都放在 GitHub issues（`ayden0322/poker_forum`）。一律用 `gh` CLI 操作。

## 慣例

- **開票**：`gh issue create --title "..." --body "..."`。多行 body 用 heredoc。
- **讀票**：`gh issue view <number> --comments`
- **列票**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，可加 `--label` / `--state` 過濾。
- **留言**：`gh issue comment <number> --body "..."`
- **標籤**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **關票**：`gh issue close <number> --comment "..."`

repo 由 `git remote -v` 推導，在 clone 目錄內執行 `gh` 會自動判斷。

## 本專案的額外規矩（Ayden）

- **票一律繁體中文**；程式碼與變數名用英文。
- **決策要寫進票裡**：為什麼選這條路、否決了什麼、red-team 攻出來還沒解的疑慮。圓桌吵完不落票，下個 session 等於沒吵過。
- **不要替已完成的工作補票**。只開前沿的票。
- **命脈標籤**：動到金流／點數發放／結算／權限／對帳的票加 `critical-path`，這類票開工要走 dual-dev 命脈雙寫。

## PR 當作需求入口

**否。** 這是私有專案，沒有外部 PR 需求流。

## skill 說「publish to the issue tracker」時

開一張 GitHub issue。

## skill 說「fetch the relevant ticket」時

執行 `gh issue view <number> --comments`。

## Wayfinding（給 /wayfinder 用）

- **地圖**：一張標 `wayfinder:map` 的 issue，body 放 Notes / 已定案 / 未知區。
- **子票**：以 GitHub sub-issue 連到地圖；未啟用 sub-issue 時，在地圖 body 放 task list，子票 body 開頭寫 `Part of #<map>`。
- **阻擋關係**：優先用 GitHub 原生 issue dependencies；不可用時在子票 body 開頭寫 `Blocked by: #<n>`。
- **認領**：`gh issue edit <n> --add-assignee @me`
