# Đảo Đèn Lồng — Day 12 AI SDLC

> **Video demo:** *(Sẽ cập nhật link Release `v1.0.0` ở Phase 4)*

Game 3D góc nhìn thứ ba xây dựng bằng **TypeScript + Vite + Three.js** (giao diện 3D) và **Node.js** (chế độ headless thuần logic 60 tick/giây tuân thủ **Test Contract v1.0**). Người chơi điều khiển **Mây** (đội nón lá treo đèn lồng nhỏ) gom đom đóm trên **Đảo Bến**, thắp sáng 5 **Đèn Lồng Lớn**, và dùng ánh sáng xua đuổi **Bóng Mực**.

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
| `W` `A` `S` `D` hoặc Phím mũi tên | Di chuyển theo hướng camera |
| `Space` | Nhảy |
| `F` hoặc `Enter` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất |
| `Shift` hoặc `K` | Tỏa sáng (Pulse) xua & làm choáng Bóng Mực (tốn 1 đom đóm) |
| `Q` / `E` hoặc kéo chuột phải | Xoay camera 3D quanh Mây |
| `R` | Chơi lại sau khi thắng/thua |

---

## Cách tính điểm & Thông số (`game.contract.json`)

Toàn bộ thông số gameplay đọc trực tiếp từ [`game.contract.json`](game.contract.json) (nguồn chân lý duy nhất cho cả bản 3D và headless):

- **Nhặt 1 đom đóm:** `+10` điểm (`per_mote`)
- **Thắp sáng 1 Đèn Lồng Lớn** (đủ 3 đom đóm): `+100` điểm (`per_lantern`)
- **Làm choáng 1 Bóng Mực bằng Pulse:** `+25` điểm (`per_stun`)
- **Thưởng khi thắng (thắp đủ 5 đèn):** `floor(time_left_s) * 2` (`per_second_left`) + `flames * 50` (`per_flame_left`)
- **Rơi khỏi đảo (`fall_enabled: false`):** Không áp dụng ở Phase 1 (đảo có tường biên vô hình bán kính `40 m`).

---

## Kiểm thử & Chế độ Headless (Test Contract v1.0)

Chạy toàn bộ kiểm chứng (typecheck + build + unit tests + headless scenarios + kiểm tra tất định):

```bash
npm run verify
```

Chạy trực tiếp chế độ headless theo Contract v1.0:

```bash
node dist/headless.mjs --seed 42 --night 1 --ticks 600 --snapshot-every 10 --out tmp/run.jsonl
```

Hỗ trợ đầy đủ `--scenario <file.json>` và `--inputs <file.json>` (sai định dạng thoát mã `2`, in lỗi ra `stderr`).

---

## Sáng tạo của tôi

Các yếu tố bổ sung chỉ nằm trong tầng hiển thị (`src/render/`), **không ảnh hưởng đến đầu ra headless**:
1. **Biển mây trôi & bầu trời đêm chuyển sắc ấm dần:** Khi thắp thêm từng Đèn Lồng Lớn, ánh sáng môi trường và sương đêm chuyển dần từ tím đen lạnh sang vàng cam ấm áp; vòng tròn vùng an toàn (`safe_radius = 6 m`) hiện rõ quanh đèn đã thắp.
2. **Âm thanh tổng hợp Web Audio API (`src/render/audio.ts`):** Tạo tiếng chuông nhẹ khi nhặt đom đóm, hợp âm ấm khi thắp đèn, sóng âm khi Pulse — không cần file âm thanh ngoài và có nút bật/tắt trên HUD.

*Bằng chứng không làm hỏng phần lõi:* Xem [`docs/proof/phase-1/verify-summary.txt`](docs/proof/phase-1/verify-summary.txt) (100% unit/contract tests & determinism SHA-256 khớp).

---

## Tài liệu & Bằng chứng

- Ghi chép Phase 1 (giả định, truy vết, nhật ký AI & token): [`docs/notes/phase-1.md`](docs/notes/phase-1.md)
- Bằng chứng chạy thật Phase 1: [`docs/proof/phase-1/`](docs/proof/phase-1/)
- Harness AI: [`AGENTS.md`](AGENTS.md), [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Tài liệu gốc của lab: [`GUIDE.md`](GUIDE.md), [`CHECKPOINTS.md`](CHECKPOINTS.md), [`SUBMISSION.md`](SUBMISSION.md), [`RULES.md`](RULES.md), [`RUBRIC.md`](RUBRIC.md)
