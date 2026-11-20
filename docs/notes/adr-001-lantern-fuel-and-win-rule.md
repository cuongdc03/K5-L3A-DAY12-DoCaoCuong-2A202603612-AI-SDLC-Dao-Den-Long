# ADR-001: Chuyển mô hình Đèn Lồng có nhiên liệu & Luật thắng sống sót tới bình minh (Phase 3 · TICKET-03)

- **Trạng thái:** Đã áp dụng (Phase 3 / Contract v1.2)
- **Bối cảnh:** Trong Phase 1–2, đèn sau khi thắp sẽ sáng vĩnh viễn và game kết thúc thắng ngay khi thắp đủ đèn (`all_lit`), khiến nửa sau Đêm thiếu căng thẳng. TICKET-03 yêu cầu đèn cạn dầu theo thời gian, Bóng Mực hút dầu đèn yếu (`fuel < 30`), và người chơi phải giữ ít nhất `ceil(0.6 × tổng đèn)` đèn sáng tới bình minh (`dawn_survived`).

## Quyết định thiết kế

### 1. Biểu diễn nhiên liệu bằng số nguyên `1/60` (`fuel60: 0..6000`)
- **Vấn đề:** Nếu lưu `fuel` dạng `number` (IEEE-754 float) và trừ `1/60` mỗi tick (14.400–18.000 tick), sai số cộng dồn sẽ làm lệch biên `fuel === 30` (ngưỡng mất vùng an toàn), `fuel <= 0` (thời điểm `lantern_out`), và công thức `ceil((100 - fuel) / 10)` khi châm dầu.
- **Giải pháp:** Lưu `LanternEntity.fuel60` là **số nguyên** trong `[0, 6000]` (tương ứng `0.0`–`100.0` với độ phân giải `1/60`).
  - Hao tự nhiên: `fuel60 -= 1` mỗi tick.
  - Bóng Mực hút (`drain`): `fuel60 -= 5` mỗi tick (cộng dồn nhiều con).
  - Châm dầu: `used = min(carried, Math.ceil((6000 - fuel60) / 600))`, `fuel60 = min(6000, fuel60 + used * 600)`.
  - Vùng an toàn chỉ có hiệu lực khi `lit && fuel60 >= 1800` (đúng `30.0` vẫn còn).
  - Chỉ làm tròn 1 chữ số thập phân (`round1(fuel60 / 60)`) khi xuất snapshot/event JSONL.

### 2. Mở rộng máy trạng thái Đèn & Bóng Mực
- **Đèn Lồng:** Thêm `everLit` và `relitCount`. Khi `fuel60 <= 0` ngay sau bước 2 → `lit = false`, `deposited = 0`, `everLit = true`, phát `lantern_out`. Thắp lại đèn đã từng sáng (`everLit === true`) chỉ tốn `5` đom đóm (`+40` điểm) thay vì `10` (`+100` điểm).
- **Bóng Mực:** Thêm trạng thái thứ 6 `drain`. Chỉ Bóng Mực `wander` mới tìm đèn sáng có `fuel60 < 1800`; khi cách `<= 2 m` thì chuyển `drain`. Chuyển khỏi `drain` sang `chase` (Mây vào `<= 6 m`), `stunned` (Pulse trúng, thưởng tổng `+15`), hoặc `wander` (đèn tắt / châm lên `>= 30` / cách `> 2 m`).

### 3. Thay thế điều kiện thắng `all_lit` bằng `dawn_survived`
- Xóa nhánh thắng sớm khi thắp đèn ở bước 5 & bước 11.
- Tại bước 11 (xét thắng/thua cuối tick):
  1. `flames <= 0` → luôn thua `no_flames` (ưu tiên cao nhất, kể cả đúng tick bình minh).
  2. `timeLeftS <= 0`: nếu `litCount >= ceil(0.6 * totalLanterns)` → thắng `dawn_survived` (thưởng `sum(50 + floor(fuel)) + flames * 50`, bỏ thưởng thời gian); ngược lại → thua `dawn`.

## Hệ quả & Cập nhật test
- Test cũ kiểm tra thắng sớm `all_lit` và điểm `+10/mote` trong `tests/core.test.ts` bị luật mới thay thế → đã được **cập nhật kèm chú thích rõ lý do** (không bỏ qua âm thầm).
- Toàn bộ test hồi quy Phase 1–2 không bị thay thế (di chuyển, cam_yaw, dash, rơi/hồi sinh, bục nhảy, dốc, Gió Lạc, Bùa Gió, Pause, exit code 2, tất định) vẫn giữ nguyên và pass 100%.
