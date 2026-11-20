# Phase 3 Notes — TICKET-03 "Đèn cạn dầu" (Contract v1.2)

## 1. Tóm tắt thay đổi kiến trúc
Xem chi tiết quyết định thiết kế tại [ADR-001](adr-001-lantern-fuel-and-win-rule.md) và danh sách breaking changes tại [CHANGELOG.md](../../CHANGELOG.md).

## 2. Truy vết yêu cầu Phase 3 → Bằng chứng
| Yêu cầu (TICKET-03 / Contract v1.2) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Nhiên liệu đèn `0..100` (số nguyên `1/60`), hao `1/s`, `lantern_out`, châm dầu `refuel`, thắp lại `5` đom đóm (`+40`) | Unit test `tests/core.test.ts` + Headless scenario | `docs/proof/phase-3/scenario-fuel-relight-refuel.jsonl`, `vitest-output.txt` | Đạt |
| Bóng Mực `drain` đèn yếu (`fuel < 30`, mất safe zone), hút `5/s`, `fuel_drain` mỗi 60 tick, Pulse trúng `+15` | Unit test + Headless scenarios `shade-drain` & `shade-drain-pulse` | `docs/proof/phase-3/scenario-shade-drain.jsonl`, `scenario-shade-drain-pulse.jsonl` | Đạt |
| Luật thắng `dawn_survived` (`>= ceil(0.6*N)` đèn sáng tại bình minh), bỏ thắng sớm, ưu tiên `no_flames` | Unit test + Headless scenario `dawn-survived` | `docs/proof/phase-3/scenario-dawn-survived.jsonl`, `vitest-output.txt` | Đạt |
| Sức chứa tăng dần `min(20, 10 + 2 * successful_lights)` + HUD `carried / capacity` | Unit test + `src/render/main.ts` | `docs/proof/phase-3/vitest-output.txt` | Đạt |
| Chế độ mù màu ("Bảng màu dễ phân biệt": `#00B3FF`, `#FFFFFF` + `⚠`, đèn tắt xẹp 20% + giấy rách, thanh dầu & nhấp nháy 1Hz) | Build web + kiểm tra trực tiếp `index.html`, `src/render/main.ts`, `src/render/textures.ts` | `npm run build` xanh + `docs/proof/phase-3/verify-summary.txt` | Đạt |
| Hồi quy Phase 1–2 + Benchmark Đêm 3 (18.000 tick) + Tất định SHA-256 | `npm run verify` | `docs/proof/phase-3/verify-summary.txt` (`0.187s <= 30s`, SHA-256 khớp) | Đạt |

## 3. Nhật ký dùng AI, Lỗi phát hiện & Quản lý token (Phase 3)
- **Lỗi phát hiện khi chạy kiểm chứng:**
  1. Trong `src/render/textures.ts`, lệnh `edit_file` khớp 2 vị trí cuối hàm khiến `createTornLanternTexture` bị chèn 2 lần → phát hiện ngay qua phản hồi tool (`Made 2 replacements`) và dọn sạch trước khi build.
  2. Trong `scripts/verify.mjs`, scenario `shade-drain-pulse` ban đầu đặt Mây cách Bóng Mực `3 m` nên Bóng Mực chuyển từ `drain` → `chase` ngay tick 1 (do quy tắc Mây vào `<= 6 m` kích hoạt `chase`), làm điểm Pulse chỉ còn `+5` thay vì `+15`. Việc test fail chứng minh quy tắc chuyển trạng thái `drain → chase` hoạt động chính xác; đã tách thành 2 scenario rõ ràng (`shade-drain` ở ngoài 6m phát `fuel_drain`, và `shade-drain-pulse` ngắt `drain` ngay tick 0 nhận `+15`).
  3. **Bug phát hiện khi playtest Đêm 3:** Bóng Mực đi xuyên vách đứng từ tầng thấp lên tầng cao (ví dụ tầng 0 → tầng 1/2) mà không qua dốc, do bước di chuyển của Bóng Mực trong `src/core/simulation.ts` gọi thẳng `getTopSurfaceY` mà bỏ qua `resolveHorizontalMove`. Đã sửa triệt để cho cả `chase`, `wander`, `recoil` (chỉ bước lên bề mặt có `surf <= shade.y + 0.65`) và thêm unit test hồi quy trong `tests/core.test.ts`.
- **Quản lý token Phase 3:** ~30k–35k tokens (gọn gàng trong khung 30 phút nhờ kiến trúc tách `src/core/` và `fuel60` nguyên sạch sẽ).
