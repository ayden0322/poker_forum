# 擬真火特效製作管線

火焰用 WebGL noise shader 算出「擬真流體火」，**預先算成去背循環影片**(VP9 alpha WebM)，
正式站用 `<video autoplay loop muted playsinline>` 疊頭像(無 WebGL context 上限、可循環、輕量)。

## 重生 fire.webm
1. `python3 firecap.py`（用 shader 逐幀截圖 72 幀去背 PNG 到 frames/）
2. `ffmpeg -y -framerate 24 -i frames/f%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -an fire.webm`
3. `cp fire.webm ../../apps/web/public/cosmetics/fire.webm`

shader 原始碼在 firecap.html(FRAG)。app 端 AvatarWithFrame 以 `video:fire` 觸發。
(ShaderEffect.tsx 是即時 WebGL 版，保留備用；正式用預算影片。)
