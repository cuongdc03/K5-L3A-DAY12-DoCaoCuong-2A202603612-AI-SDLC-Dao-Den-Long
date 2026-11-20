# CHANGELOG

## [Phase 3 — Contract v1.2] — TICKET-03 "Đèn cạn dầu"
### BREAKING CHANGES
- **Luật thắng (`all_lit` → `dawn_survived`):** Thắp đủ tất cả đèn không còn kết thúc Đêm sớm. Thắng chỉ xảy ra khi sống sót tới bình minh (`time_left_s == 0`) với số đèn đang sáng `>= ceil(0.6 × tổng đèn)` (Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`).
- **Thời lượng 3 Đêm rút ngắn:** Đêm 1 `300s → 240s`, Đêm 2 `330s → 270s`, Đêm 3 `360s → 300s`.
- **Nhiên liệu đèn & tắt đèn:** Đèn sáng hao `1.0 fuel/s`; hết dầu (`fuel <= 0`) đèn tắt (`lantern_out`), `deposited = 0`, `ever_lit = true`. Đèn sáng chưa đầy dầu nhận châm dầu (`refuel`, `+10 fuel/mote`). Thắp lại đèn `ever_lit` chỉ cần `5` đom đóm.
- **Vùng an toàn & Bóng Mực `drain`:** Đèn có `fuel < 30` mất vùng an toàn (`safe_radius = 6m`). Bóng Mực có thêm trạng thái `drain` hút `5 fuel/s` (phát `fuel_drain` mỗi 60 tick).
- **Công thức điểm mới:** `+5` mỗi đom đóm nạp/châm dầu (thay vì `+10`); `+100` thắp lần đầu; `+40` thắp lại; `+5` Pulse Bóng Mực thường hoặc `+15` nếu đang `drain`; thưởng Bình Minh mỗi đèn sáng `+50 + floor(fuel)` và mỗi Ngọn Lửa `+50`; **bỏ thưởng thời gian** (`per_second_left = 0`).
- **Schema Contract v1.2:** Snapshot thêm `lanterns[].{fuel, ever_lit, relit_count}`, `player.capacity`; `lantern_lit` thêm trường `relight: boolean`; thêm events `refuel`, `lantern_out`, `fuel_drain`.

### Added
- Sức chứa tăng dần: `capacity = min(20, 10 + 2 × successful_lights)` mỗi Đêm.
- Chế độ mù màu (**"Bảng màu dễ phân biệt"** lưu `localStorage`): viền/mắt Bóng Mực `#00B3FF`, cảnh báo UI `#FFFFFF` + `⚠`, đèn tắt xẹp 20% + giấy rách, đèn yếu (`fuel < 30`) + thanh dầu nhấp nháy `1 Hz`.
- ADR thiết kế: [`docs/notes/adr-001-lantern-fuel-and-win-rule.md`](docs/notes/adr-001-lantern-fuel-and-win-rule.md).

---

## [Phase 2 — Contract v1.1] — TICKET-02 "Ba hòn đảo"
- Đồng bộ toàn bộ số liệu chuẩn (`player_speed=6.0`, `carry_capacity=10`, `lantern_cost=10`, `fall_enabled=true`, thứ tự 12 bước/tick).
- Mở rộng thành 3 Đêm chuẩn: Đảo Bến, Đảo Cau (cầu tre + 2 bục nhảy), Đảo Chuông (3 tầng + 2 dốc + bục nhảy + tháp chuông + gió mạnh).
- Thêm Lướt (Dash), Gió Lạc (Drifters), Bùa Gió (Charms), Pause (`Esc`/`P`), Menu chuỗi 3 Đêm, Cài đặt, HUD đầy đủ, bảng màu chuẩn và Screen-Space Scope Cutout Shader.

## [Phase 1 — Contract v1.0] — PRD-0
- Xây dựng bản chơi được Đêm 1 – Đảo Bến (Three.js 3D + Node.js headless CLI 60Hz tất định).
