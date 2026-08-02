from playwright.sync_api import sync_playwright
import os
D = "/private/tmp/claude-501/-Users-ayden-huang/e0065e99-0c10-42e0-95a3-13a468344287/scratchpad"
FX = [("thunder", 0), ("radiance", 1), ("orbit", 2), ("sakura", 3)]
N = 72; dt = 3.0 / N
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 440, "height": 440}, device_scale_factor=1)
    pg.goto(f"file://{D}/fxcap.html"); pg.wait_for_timeout(400)
    print("title(should be blank if no shader err):", pg.title())
    for name, fx in FX:
        fd = f"{D}/fr_{name}"; os.makedirs(fd, exist_ok=True)
        for f in os.listdir(fd):
            os.remove(f"{fd}/{f}")
        for i in range(N):
            pg.evaluate(f"window.drawT({fx},{i*dt})"); pg.wait_for_timeout(12)
            pg.locator("#c").screenshot(path=f"{fd}/f{i:03d}.png", omit_background=True)
        print("captured", name)
    b.close()
