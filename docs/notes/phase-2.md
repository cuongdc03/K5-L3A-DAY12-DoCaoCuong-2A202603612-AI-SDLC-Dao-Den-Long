# Phase 2 Notes — TICKET-02 "Ba hòn đảo" (Contract v1.1)

## 1. Thay đổi thiết kế & Test từ Phase 1 → Phase 2
| Hạng mục | Phase 1 (tự chọn) | Phase 2 (chuẩn TICKET-02 v1.1) | Ảnh hưởng tới test cũ |
|---|---|---|---|
| Thông số cơ bản | `player_speed=7`, `carry=5`, `lantern_cost=3`, `pickup=1.8`, `interact=3.0`, `pulse_cost=1`, `pulse_radius=7` | `player_speed=6.0`, `carry=10`, `lantern_cost=10`, `pickup=1.0` (+`dy<=1.5`), `interact=2.0`, `pulse_cost=3`, `pulse_radius=5.0` (3D từ `Y+0.8`) | Cập nhật giá trị kỳ vọng trong `tests/core.test.ts` (nhóm *Phase 1 Regression*) để khớp bộ số chuẩn |
| Cách tính điểm | `+10` lúc nhặt đom đóm, `+25` mỗi stun | `+10` mỗi đom đóm **nạp**, `+100` mỗi đèn thắp, `+5` mỗi Bóng Mực trúng Pulse | Cập nhật assert điểm trong test regression kèm lý do |
| Rơi khỏi đảo | `fall_enabled: false` (chặn ở rìa 40m) | `fall_enabled: true` (`Y < -10`: −1 Ngọn Lửa bỏ qua bất tử, mất toàn bộ đom đóm, chờ 60 tick hồi sinh với 90 tick bất tử) | Thêm unit test & headless scenario `dash-fall` |
| Bóng Mực | 2 trạng thái (`chase`, `stunned`) | 5 trạng thái bắt buộc (`spawning`, `wander`, `chase`, `recoil`, `stunned`), phát hiện 12m / bỏ đuổi 18m, recoil 2m/60 tick | Cập nhật validator & thêm kiểm tra trạng thái `recoil` |

## 2. Acceptance Criteria (Phần 3 — Tính năng mới) & Truy vết bằng chứng
| Tính năng (TICKET-02) | Acceptance Criteria | Bằng chứng | Kết quả |
|---|---|---|---|
| **Lướt (Dash)** | Nhấn `Shift`/`dash` lướt `14 m/s` trong `12 tick` (`0.2s`), hồi chiêu `1.5s`, giữ độ cao khi trên không, phát `dash {}` | `tests/core.test.ts`, `docs/proof/phase-2/scenario-dash-fall.jsonl` | Đạt |
| **Rơi & Hồi sinh** | Rơi `Y < -10` → −1 Ngọn Lửa (bỏ qua bất tử), mất đom đóm (`lost`), chờ 60 tick hồi sinh ở spawn với `invuln=90 tick` | `tests/core.test.ts`, `docs/proof/phase-2/scenario-dash-fall.jsonl` | Đạt |
| **Đêm 2 — Đảo Cau** | 2 đảo R=28m + cầu tre `x∈[26,44], z∈[-2,2]` + 2 bục nhảy `(20,0,18)` & `(50,0,-18)` phóng đáp sang đảo kia + 6 đèn `L1..L6` | `tests/core.test.ts`, `src/core/maps.ts`, `src/render/main.ts` | Đạt |
| **Đêm 3 — Đảo Chuông** | 3 tầng (Y=0/3/6), vách đứng, 2 dốc 30°/150°, bục nhảy `(0,3,13)` lên tầng 2, tháp chuông R=2m, gió mạnh 5s mỗi 30s (báo trước 2s) | `tests/core.test.ts`, `docs/proof/phase-2/scenario-night3-tier-wind-pause.jsonl` | Đạt |
| **Gió Lạc (Drifters)** | `idle` → `chase` khi `carried >= 5` & `dist <= 15m`; chạm cướp `min(3, carried)` (`drifter_steal`) rồi `flee`; Pulse lúc `flee` thả lại đom đóm rơi (`drifter_drop`) | `tests/core.test.ts`, `docs/proof/phase-2/scenario-night2-drifter-charm.jsonl` | Đạt |
| **Bùa Gió (Wind Charm)** | Nhặt `C1`/`C2` → `charm_picked`, tốc độ `7.2 m/s`, Lướt không hồi chiêu trong `600 tick`, xuất hiện lại sau `2700 tick` | `tests/core.test.ts`, `docs/proof/phase-2/scenario-night2-drifter-charm.jsonl` | Đạt |
| **Chuỗi 3 Đêm & Menu** | Menu chính → Giới thiệu Đêm (tên đảo + lời Ông Đăng) → Chơi → Kết quả → Đêm tiếp / Bình Minh (tổng điểm) | `index.html`, `src/render/main.ts` | Đạt |
| **Tạm dừng (`Esc`/`P`)** | `state: "paused"`, `tick` tăng nhưng `sim_tick` & timers đứng yên; có Tiếp tục / Chơi lại / Cài đặt / Về menu | `tests/core.test.ts`, `docs/proof/phase-2/scenario-night3-tier-wind-pause.jsonl` | Đạt |
| **Cài đặt & Âm thanh** | Âm lượng + độ nhạy chuột lưu `localStorage`; nhạc nền đêm + 10 SFX (kể cả đếm ngược 10s cuối) | `src/render/audio.ts`, `src/render/main.ts` | Đạt |
| **HUD & Bảng màu chuẩn** | Đủ 7 vùng HUD (10 ô đom đóm, đồng hồ nhấp nháy đỏ ≤ 30s, nhắc `E — Nạp ánh sáng (x/10)`, mũi tên chỉ đèn ngoài màn hình), màu chuẩn ±10% RGB, ambient `0.15 + 0.55*(lit/total)` | `index.html`, `src/render/main.ts`, `src/render/textures.ts` | Đạt |
| **Hiệu năng & Tất định** | Headless Đêm 3 (21.600 tick) chạy trong `0.233s` (`<= 30s`); 2 lần chạy seed 2026 khớp SHA-256 | `docs/proof/phase-2/verify-summary.txt` | Đạt |

## 3. Nhật ký dùng AI, Lỗi phát hiện & Quản lý token (Phase 2)
- **Lỗi phát hiện trong quá trình kiểm chứng:**
  1. TypeScript control-flow narrowing trong `runHeadlessSimulation`: sau khi kiểm tra `sim.state === 'won' || sim.state === 'lost'` đầu vòng lặp, TS không biết `sim.step()` thay đổi `sim.state`. Đã sửa gọn bằng closure `isGameOver()`.
  2. Scenario `night3-tier-wind-pause` ban đầu đặt `snapshotEvery: 600` với 20 tick pause nên snapshot ở tick 1800 có `sim_tick = 1780` (chưa tới tick 1800 khi gió bật). Việc test fail đã **chứng minh cơ chế Pause đóng băng `sim_tick` chạy đúng**; đã chỉnh `ticks: 1920, snapshotEvery: 60` để chụp được trạng thái gió bật.
- **Cập nhật Harness AI:** Đã cập nhật `AGENTS.md` và `.agents/skills/verify-phase/SKILL.md` cho Contract v1.1 (thứ tự 12 bước tick, 5 trạng thái Bóng Mực, benchmark 21.600 tick).
- **Ước tính token Phase 2:** ~45k–55k tokens (nâng cấp trọn bộ core 3 bản đồ, CLI v1.1, 3D UI 3 Đêm + Menu/Pause/Settings/Audio/HUD chuẩn màu, test suite & proof).
