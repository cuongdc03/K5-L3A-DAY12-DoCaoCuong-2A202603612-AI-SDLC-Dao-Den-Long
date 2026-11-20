# Phase 4 Notes — TICKET-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

## 1. Cấu hình máy đo tham khảo
- **OS:** macOS (`darwin 27.0.0`, `arm64`)
- **Chip / GPU:** Apple M4 (ANGLE Metal Renderer)
- **Node.js:** `v22.23.0`
- **Renderer:** Three.js `r174` (WebGL2) trong cửa sổ Chrome 1280×720 (`--disable-gpu-vsync --disable-frame-rate-limit`)

## 2. Truy vết yêu cầu Phase 4 → Bằng chứng
| Yêu cầu (TICKET-04 / Contract v1.3) | Cách kiểm chứng | Số đo / Bằng chứng | Kết quả |
|---|---|---|---|
| **Benchmark 1280×720** (Đêm 1, 200 Shades `wander` + 100 Motes + L1–L3 lit, 3s warmup + 30s đo) | `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` | [`bench.json`](../../bench.json): `avg_fps = 624.1` (`≥ 60`), `p1_low_fps = 232.6` (`≥ 30`), `frame_ms_p95 = 3.4 ms`, `load_ms = 1843 ms` (`≤ 10000`), `peak_mem_mb = 207.4 MB`, `vsync_off = true` | Đạt |
| **Soak test 10 Đêm liên tiếp** (xoay vòng Đêm 1→2→3, input ngẫu nhiên theo seed) | `node --no-expose-wasm --jitless dist/soak.mjs --seed 7 --nights 10 --out soak.json` | [`soak.json`](../../soak.json): `crashes = 0`, `mem_start_mb = 41.4`, `mem_end_mb = 45.8` (`1.11× ≤ 1.2×`), `duration_s = 0.28s` | Đạt |
| **Bảng xếp hạng cục bộ + CLI Export** | Form nhập tên 3–12 ký tự (hỗ trợ tiếng Việt) lưu `~/.dao-den-long/leaderboard.json` + `node scripts/run.mjs --export-leaderboard out.json` | `scripts/run.mjs`, `src/render/accessibility.ts`, `docs/proof/phase-4/leaderboard-export.json` | Đạt |
| **Dễ tiếp cận (Accessibility)** | Đổi 9 phím + báo trùng + khôi phục mặc định; phụ đề + mũi tên mép màn hình (Bóng Mực, gió, 10s cuối, đèn `<30%`); Giảm chuyển động; cỡ chữ UI `≥ 18px` + Chữ lớn `×1.25` | `index.html`, `src/render/accessibility.ts`, `src/render/main.ts` | Đạt |
| **Hồi quy Phase 1–3 & Tất định** | `npm run verify` | `docs/proof/phase-4/verify-summary.txt`, `vitest-output.txt` (13/13 test pass, SHA-256 khớp) | Đạt |
| **Đóng gói, Tài liệu & Retro** | `README.md` (≤3 lệnh), `CHANGELOG.md` (4 phase), `CREDITS.md`, `LICENSE`, `docs/notes/retro.md`, tag `phase-4`, Release `v1.0.0` | Toàn bộ file có mặt trong repo & Release `v1.0.0` | Đạt |
