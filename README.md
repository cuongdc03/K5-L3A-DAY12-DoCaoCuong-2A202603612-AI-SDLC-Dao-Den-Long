# Đảo Đèn Lồng — v1.0.0 (Day 12 AI SDLC · Contract v1.3)

> **Video demo:** Xem tệp `demo.mp4` đính kèm tại **[GitHub Release v1.0.0](https://github.com/cuongdc03/K5-L3A-LAB-Day12-AI-SDLC/releases/tag/v1.0.0)** *(hoặc `docs/demo/demo.mp4`)*.

Game 3D góc nhìn thứ ba xây dựng bằng **TypeScript + Vite + Three.js** (giao diện 3D) và **Node.js** (chế độ headless 60 tick/giây tất định, soak test, benchmark WebGL 1280×720, và local leaderboard server) tuân thủ **Test Contract v1.3**. Trải qua **3 Đêm** (*Đảo Bến*, *Đảo Cau*, *Đảo Chuông*), người chơi điều khiển **Mây** gom đom đóm, thắp & châm dầu giữ tối thiểu `60%` số Đèn Lồng Lớn sáng tới **Bình Minh**, ngăn **Bóng Mực** hút dầu và **Gió Lạc** cướp đom đóm.

---

## Yêu cầu hệ thống
- **Hệ điều hành:** macOS hoặc Linux (x64 / arm64)
- **Runtime:** Node.js `>= 20` và npm `>= 10`
- **Trình duyệt (cho giao diện 3D & chế độ bench):** Google Chrome / Chromium (hỗ trợ WebGL2)

---

## Cài đặt & Chạy (tối đa 3 lệnh)

```bash
npm ci
npm run build
npm run start
```

Lệnh `npm run start` (tức `node scripts/run.mjs`) khởi động máy chủ cục bộ phục vụ bản build `dist/web/` kèm API lưu Bảng xếp hạng xuống đĩa (`~/.dao-den-long/leaderboard.json`) và tự mở trình duyệt tại `http://127.0.0.1:4173`.

---

## Điều khiển (mặc định — đổi phím được trong Cài đặt)

| Hành động | Phím mặc định | Ghi chú |
|---|---|---|
| Di chuyển (4 hướng) | `W` `A` `S` `D` (hoặc phím mũi tên) | `6.0 m/s` (`7.2 m/s` khi có Bùa Gió) |
| Nhảy | `Space` | `7.0 m/s`, trọng lực `-20 m/s²` |
| Lướt (Dash) | `Shift` | `14 m/s` trong `0.2 s`, hồi `1.5 s` (miễn hồi khi có Bùa Gió) |
| Tương tác / Nạp & Châm dầu | `E` (hoặc `Enter`) | `10` đom đóm thắp mới, `5` thắp lại, `+10 fuel` mỗi đom đóm châm |
| Tỏa Sáng (Pulse) | `Q` (hoặc `K`) | Tốn `3` đom đóm, bán kính 3D `5 m`, choáng `2 s` & đẩy `4 m` |
| Xoay camera 3D | Kéo chuột phải hoặc `Z` / `C` | Chỉnh độ nhạy trong Cài đặt |
| Tạm dừng | `Esc` (hoặc `P`) | Dừng toàn bộ logic & đồng hồ |

**Dễ tiếp cận (Accessibility):** Trong *Cài đặt & Phím* hỗ trợ đổi toàn bộ 9 phím (có báo trùng phím & nút *Khôi phục mặc định*), **Bảng màu dễ phân biệt** (mù màu), **Giảm chuyển động** (tắt rung & chớp), **Chữ lớn (×1.25)** trên nền cỡ chữ tối thiểu `18px`, cùng phụ đề & mũi tên chỉ hướng ở mép màn hình.

---

## Cách tính điểm & Luật chơi (`game.contract.json` v1.3)

Toàn bộ thông số đọc trực tiếp từ [`game.contract.json`](game.contract.json):
- **Nạp / châm dầu 1 đom đóm:** `+5` điểm
- **Thắp sáng lần đầu (`10` đom đóm):** `+100` điểm · **Thắp lại (`5` đom đóm):** `+40` điểm
- **Tỏa Sáng trúng 1 Bóng Mực:** `+5` điểm (`+15` nếu ngay trước đó đang hút dầu `drain`)
- **Thắng Bình Minh (hết giờ với `≥ ceil(0.6 × tổng đèn)` sáng — `3/5`, `4/6`, `5/7`):** cộng mỗi đèn đang sáng `+(50 + floor(fuel))` + mỗi Ngọn Lửa còn lại `+50`
- **Sức chứa tăng dần:** `min(20, 10 + 2 × successful_lights)` mỗi Đêm

---

## Kiểm thử, Headless, Bench, Soak & Bảng xếp hạng

```bash
# 1. Toàn bộ kiểm chứng (typecheck + build + unit/regression tests + soak + leaderboard + determinism)
npm run verify

# 2. Chế độ Headless (Contract v1.3, Đêm 1 / 2 / 3)
node dist/headless.mjs --seed 2026 --night 3 --ticks 18000 --snapshot-every 600 --out tmp/night3.jsonl

# 3. Chế độ Benchmark 1280×720 (200 Shades + 100 Motes, tắt vsync qua Chrome flags)
node scripts/bench.mjs --seed 42 --duration 30 --out bench.json

# 4. Soak Test 10 Đêm liên tiếp
node --no-expose-wasm --jitless dist/soak.mjs --seed 7 --nights 10 --out soak.json

# 5. Xuất Bảng xếp hạng cục bộ ra JSON
node scripts/run.mjs --export-leaderboard out.json
```

### Kết quả đo tham khảo (Apple M4 · macOS `darwin 27.0.0 arm64` · Node `v22.23.0`)
| Bài đo | File bằng chứng | Kết quả thực tế | Ngưỡng yêu cầu |
|---|---|---|---|
| **Benchmark 30s (1280×720)** | [`bench.json`](bench.json) | `avg_fps = 624.1`, `p1_low_fps = 232.6`, `frame_ms_p95 = 3.4 ms`, `load_ms = 1843 ms`, `peak_mem_mb = 207.4 MB`, `vsync_off = true` | `avg_fps ≥ 60`, `p1_low ≥ 30`, `load_ms ≤ 10000` |
| **Soak Test (10 Đêm)** | [`soak.json`](soak.json) | `crashes = 0`, `mem = 41.4 → 45.8 MB (1.11×)`, `duration = 0.28s` | `crashes = 0`, `mem_end ≤ 1.2 × mem_start` |
| **Headless 18.000 ticks** | [`docs/proof/phase-3/verify-summary.txt`](docs/proof/phase-3/verify-summary.txt) | `0.186s` | `≤ 30s` |

---

## Sáng tạo của tôi

Toàn bộ yếu tố sáng tạo nằm hoàn toàn trong tầng hiển thị (`src/render/`) và tự tắt trong chế độ headless/benchmark để không ảnh hưởng số đo chuẩn:
1. **Screen-Space Dither Scope Cutout Shader (`src/render/main.ts`):** Khi Mây đi vào vùng bị tầng trên, dốc, tháp chuông hoặc cây cối che khuất trên Đảo Chuông 3 tầng, shader tự khoét đúng một vòng tròn mềm (bán kính `15%` chiều cao màn hình, Bayer 4×4 dither) xung quanh Mây mà giữ nguyên độ rắn sắc nét của phần còn lại.
2. **Mỹ thuật vẽ tay cổ tích (lấy cảm hứng từ *Hoa*) theo bảng màu chuẩn:** Texture cỏ màu nước, nón lá đan tre, đèn lồng giấy xếp & giấy rách vẽ bằng Canvas 2D sRGB, cây tán tròn Ghibli, biển mây trôi và hiệu ứng lá bay khi gió mạnh.
3. **Nhạc nền ngũ cung & 12 hiệu ứng âm thanh Web Audio API (`src/render/audio.ts`):** Tổng hợp hoàn toàn bằng code, không phụ thuộc file âm thanh ngoài.

---

## Tài liệu, Bằng chứng & Harness AI

- **Retro tổng kết 4 phase:** [`docs/notes/retro.md`](docs/notes/retro.md)
- **Ghi chép & ADR:** [`docs/notes/phase-1.md`](docs/notes/phase-1.md), [`docs/notes/phase-2.md`](docs/notes/phase-2.md), [`docs/notes/phase-3.md`](docs/notes/phase-3.md), [`docs/notes/adr-001-lantern-fuel-and-win-rule.md`](docs/notes/adr-001-lantern-fuel-and-win-rule.md), [`docs/notes/phase-4.md`](docs/notes/phase-4.md)
- **Bằng chứng chạy thật:** [`docs/proof/phase-1/`](docs/proof/phase-1/), [`docs/proof/phase-2/`](docs/proof/phase-2/), [`docs/proof/phase-3/`](docs/proof/phase-3/), [`docs/proof/phase-4/`](docs/proof/phase-4/)
- **Thay đổi, Bản quyền & Giấy phép:** [`CHANGELOG.md`](CHANGELOG.md), [`CREDITS.md`](CREDITS.md), [`LICENSE`](LICENSE)
- **Harness AI:** [`AGENTS.md`](AGENTS.md), [`.agents/skills/`](.agents/skills/), [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
