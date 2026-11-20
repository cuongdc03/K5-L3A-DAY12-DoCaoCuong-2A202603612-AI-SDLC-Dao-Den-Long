# Đảo Đèn Lồng — Day 12 AI SDLC (Ba Hòn Đảo · Contract v1.2)

> **Video demo:** *(Sẽ cập nhật link Release `v1.0.0` ở Phase 4)*

Game 3D góc nhìn thứ ba xây dựng bằng **TypeScript + Vite + Three.js** (giao diện 3D) và **Node.js** (chế độ headless thuần logic 60 tick/giây tuân thủ **Test Contract v1.2**). Trải qua **3 Đêm** (*Đảo Bến*, *Đảo Cau*, *Đảo Chuông*), người chơi điều khiển **Mây** gom đom đóm, thắp & châm dầu giữ các Đèn Lồng Lớn sáng tới **Bình Minh** (`≥ 60%` số đèn), ngăn **Bóng Mực** hút dầu và **Gió Lạc** cướp đom đóm.

---

## Cài đặt & Chạy (tối đa 3 lệnh)

Yêu cầu: **Node.js >= 20** (macOS / Linux).

```bash
npm ci
npm run build
npm run start
```

Mở trình duyệt tại địa chỉ Vite hiển thị (mặc định `http://localhost:4173`).

---

## Điều khiển

| Phím | Chức năng |
|---|---|
| `W` `A` `S` `D` hoặc Phím mũi tên | Di chuyển theo hướng camera (tốc độ `6.0 m/s`, `7.2 m/s` khi có Bùa Gió) |
| `Space` | Nhảy (`7.0 m/s`) |
| `Shift` | Lướt / Dash (`14 m/s`, `0.2 s`, hồi `1.5 s`, miễn hồi chiêu khi có Bùa Gió) |
| `E` (hoặc `F` / `Enter`) | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (`10` đom đóm/đèn) |
| `Q` hoặc `K` | Tỏa Sáng / Pulse (tốn `3` đom đóm, bán kính 3D `5 m`, choáng `2 s`, đẩy `4 m`) |
| Kéo chuột phải hoặc `Z` / `C` | Xoay camera 3D (chỉnh độ nhạy trong Cài đặt) |
| `Esc` hoặc `P` | Tạm dừng (dừng toàn bộ logic) |

---

## Cách tính điểm & Thông số chuẩn (`game.contract.json` v1.2)

Toàn bộ thông số gameplay đọc trực tiếp từ [`game.contract.json`](game.contract.json):

- **Nạp / châm dầu 1 đom đóm vào Đèn Lồng:** `+5` điểm (`per_mote`)
- **Thắp sáng lần đầu** (`10` đom đóm): `+100` điểm (`per_lantern`) · **Thắp lại** (`5` đom đóm): `+40` điểm
- **Tỏa Sáng trúng 1 Bóng Mực:** `+5` điểm (`+15` nếu ngay trước đó nó đang hút dầu `drain`)
- **Bình Minh (thắng khi sống sót hết giờ với `≥ 60%` đèn sáng — `3/5`, `4/6`, `5/7`):** mỗi đèn đang sáng `+(50 + floor(fuel))` + mỗi Ngọn Lửa còn lại `+50` (bỏ thưởng thời gian)
- **Sức chứa tăng dần:** `min(20, 10 + 2 × successful_lights)` mỗi Đêm
- **Chế độ mù màu:** Bật **"Bảng màu dễ phân biệt"** trong Cài đặt (`#00B3FF` cho Bóng Mực, `#FFFFFF` + `⚠` cho cảnh báo, đèn tắt xẹp 20% + giấy rách, thanh dầu & đèn yếu nhấp nháy `1 Hz`).

---

## Kiểm thử & Chế độ Headless (Test Contract v1.1)

Chạy toàn bộ kiểm chứng (typecheck + build + unit/regression tests + headless scenarios cho 3 Đêm + benchmark 21.600 tick + kiểm tra tất định):

```bash
npm run verify
```

Chạy trực tiếp chế độ headless cho Đêm `1`, `2`, hoặc `3`:

```bash
node dist/headless.mjs --seed 2026 --night 3 --ticks 21600 --snapshot-every 600 --out tmp/night3.jsonl
```

Hỗ trợ đầy đủ `--scenario <file.json>` và `--inputs <file.json>` theo Contract v1.1 (sai định dạng thoát mã `2`, in lỗi ra `stderr`). Chạy trọn Đêm 3 (21.600 tick) mất **~0.23 giây** (ngưỡng yêu cầu `<= 30s`).

---

## Sáng tạo của tôi

Các yếu tố thẩm mỹ & âm thanh chỉ nằm trong tầng hiển thị (`src/render/`), **không ảnh hưởng đến đầu ra headless**:
1. **Mỹ thuật vẽ tay phong cách cổ tích (lấy cảm hứng từ *Hoa* / Ghibli) tuân thủ bảng màu chuẩn:** Texture cỏ màu nước vẽ tay bằng Canvas, cây tán tròn bồng bềnh, đèn lồng giấy xếp có hào quang mềm, biển mây trôi và hiệu ứng lá bay khi gió mạnh trên Đảo Chuông.
2. **Âm thanh tổng hợp Web Audio API (`src/render/audio.ts`):** Nhạc nền ngũ cung êm dịu về đêm cùng trọn bộ hiệu ứng âm thanh (nhặt đom đóm, bùa gió, thắp đèn, nhảy, lướt, tỏa sáng, Bóng Mực xuất hiện, cảnh báo gió, đếm ngược 10 giây cuối, thắng/thua) với âm lượng lưu bền vững.

*Bằng chứng không làm hỏng phần lõi:* Xem [`docs/proof/phase-2/verify-summary.txt`](docs/proof/phase-2/verify-summary.txt) (100% unit/regression/scenario tests, benchmark `0.233s` & determinism SHA-256 khớp).

---

## Tài liệu & Bằng chứng

- Ghi chép & Spec: [`docs/notes/phase-1.md`](docs/notes/phase-1.md), [`docs/notes/phase-2.md`](docs/notes/phase-2.md)
- Bằng chứng chạy thật: [`docs/proof/phase-1/`](docs/proof/phase-1/), [`docs/proof/phase-2/`](docs/proof/phase-2/)
- Harness AI: [`AGENTS.md`](AGENTS.md), [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
