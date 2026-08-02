from playwright.sync_api import sync_playwright
import os
D="/private/tmp/claude-501/-Users-ayden-huang/e0065e99-0c10-42e0-95a3-13a468344287/scratchpad"
os.makedirs(f"{D}/frames", exist_ok=True)
for f in os.listdir(f"{D}/frames"):
    os.remove(f"{D}/frames/{f}")
N = 72; dt = 3.0 / N
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 440, "height": 440}, device_scale_factor=1)
    pg.goto(f"file://{D}/firecap.html"); pg.wait_for_timeout(400)
    for i in range(N):
        pg.evaluate(f"window.drawT({i*dt})"); pg.wait_for_timeout(15)
        pg.locator("#c").screenshot(path=f"{D}/frames/f{i:03d}.png", omit_background=True)
    print("captured", N)
    b.close()
