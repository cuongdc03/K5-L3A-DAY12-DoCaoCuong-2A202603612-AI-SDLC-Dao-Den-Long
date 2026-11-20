# CHANGELOG

## [v1.0.0 — Phase 4 · Contract v1.3] — TICKET-04 "Bình minh: phát hành v1.0.0"
### Added
- **Chế độ Benchmark chuẩn (`node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`):** Mở cửa sổ 1280×720 tắt vsync, dựng Đêm 1 với 200 Bóng Mực `wander` (InstancedMesh) + 100 đom đóm + 3 đèn `L1–L3` sáng (`fuel=100`), camera bay vòng tròn `R=30m, Y=15m` 15s/vòng, 3s warmup, xuất `bench.json` chuẩn Contract v1.3.
- **Soak Test (`node --no-expose-wasm --jitless dist/soak.mjs --seed 7 --nights 10 --out soak.json`):** Chạy headless 10 Đêm liên tiếp xoay vòng 1→2→3 với input ngẫu nhiên theo seed, đo RSS đầu/cuối (`crashes: 0`, `mem_end_mb <= 1.2 * mem_start_mb`).
- **Bảng xếp hạng cục bộ:** Lưu top 10 trên đĩa (`~/.dao-den-long/leaderboard.json`) qua `scripts/run.mjs`, cho nhập tên `3–12` ký tự (hỗ trợ tiếng Việt có dấu) sau Bình Minh hoặc khi thua, xem từ Menu chính, và xuất JSON bằng `node scripts/run.mjs --export-leaderboard out.json`.
- **Dễ tiếp cận (Accessibility):** Đổi phím đầy đủ 9 hành động (phát hiện trùng phím + nút *Khôi phục mặc định*), phụ đề hình ảnh + mũi tên mép màn hình cho Bóng Mực xuất hiện / gió sắp thổi / 10s cuối / đèn `< 30%`, tùy chọn **Giảm chuyển động** (tắt rung & chớp), cỡ chữ UI tối thiểu `18px` + tùy chọn **Chữ lớn (`×1.25`)**.
- **Tối ưu bộ nhớ hot path (`src/core/simulation.ts`):** Loại bỏ cấp phát mảng thừa mỗi tick (`EMPTY_EVENTS`, in-place array compaction, in-place sort) giúp soak test ổn định bộ nhớ tuyệt đối.
- **Retro tổng kết 4 phase:** [`docs/notes/retro.md`](docs/notes/retro.md).

---

## [Phase 3 — Contract v1.2] — TICKET-03 "Đèn cạn dầu"
### BREAKING CHANGES
- **Luật thắng (`all_lit` → `dawn_survived`):** Bỏ thắng sớm khi thắp đủ đèn; thắng khi sống tới bình minh với `>= ceil(0.6 × tổng đèn)` đèn sáng (`3/5`, `4/6`, `5/7`).
- **Thời lượng 3 Đêm rút ngắn:** `240 / 270 / 300s`.
- **Nhiên liệu đèn & Bóng Mực `drain`:** Đèn hao `1/s` (lưu nguyên `1/60`), hết dầu tắt (`lantern_out`), châm dầu (`refuel`), thắp lại tốn `5` đom đóm (`+40`); đèn `< 30` mất vùng an toàn, Bóng Mực `drain` hút `5/s`.
- **Công thức điểm mới:** `+5/mote`, `+100` lần đầu, `+40` thắp lại, `+5` / `+15` Pulse, thưởng Bình Minh `sum(50 + floor(fuel)) + flames * 50`, bỏ thưởng thời gian.
- **Thêm:** Sức chứa tăng dần `min(20, 10 + 2 * successful_lights)`, chế độ mù màu, sửa lỗi Bóng Mực leo vách đứng Đêm 3, ADR-001.

---

## [Phase 2 — Contract v1.1] — TICKET-02 "Ba hòn đảo"
- Đồng bộ số liệu chuẩn (`player_speed=6.0`, `carry=10`, `lantern_cost=10`, `fall_enabled=true`, thứ tự 12 bước/tick).
- Mở rộng thành 3 Đêm chuẩn: Đảo Bến, Đảo Cau (cầu tre + 2 bục nhảy), Đảo Chuông (3 tầng + 2 dốc + bục nhảy + tháp chuông + gió mạnh).
- Thêm Lướt (Dash), Gió Lạc (Drifters), Bùa Gió (Charms), Pause (`Esc`/`P`), Menu chuỗi 3 Đêm, Cài đặt, HUD đầy đủ, bảng màu chuẩn và Screen-Space Scope Cutout Shader.

---

## [Phase 1 — Contract v1.0] — PRD-0
- Xây dựng bản chơi được Đêm 1 – Đảo Bến (Three.js 3D + Node.js headless CLI 60Hz tất định).
