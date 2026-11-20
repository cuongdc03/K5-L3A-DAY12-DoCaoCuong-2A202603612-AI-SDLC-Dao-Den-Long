# Phase 1 Notes — PRD-0 (Đảo Đèn Lồng)

## 1. Giả định cho các chỗ mơ hồ trong PRD-0
| Hạng mục | Giả định đã chọn | Lý do |
|---|---|---|
| Kích thước Đảo Bến | Hình tròn bán kính `40 m`, tâm `(0, 0, 0)`, tường biên vô hình (`fall_enabled: false`) | Đơn giản hóa Phase 1, tránh phạt rơi chưa yêu cầu |
| Vị trí 5 Đèn Lồng Lớn (`L1`–`L5`) | Xếp đều theo vòng tròn bán kính `25 m` trên mặt đất `Y = 0` | Cân bằng quãng đường di chuyển từ tâm đảo |
| Tốc độ & sức chứa | `player_speed = 7.0 m/s`, `carry_capacity = 5`, `lantern_cost = 3` | Nhịp chơi vừa tay (~180s cho 5 đèn = 15 đom đóm) |
| Tỏa sáng (Pulse) | Tốn `1` đom đóm (`pulse_cost = 1`), bán kính `7.0 m`, choáng `2.5 s`, đẩy lùi `5.0 m`, hồi chiêu `2.0 s` | Tạo cân nhắc chiến thuật giữa giữ sáng để thắp đèn hay tự vệ |
| Bóng Mực & Máu | `flames = 3`, `invuln_s = 1.5 s`, `hit_drop_ratio = 0.5` (rơi mất khỏi tay), `shade_speed = 4.5 m/s`, `shade_hit_radius = 1.2 m` | Người chơi đủ nhanh để né; có thời gian bất tử tránh chết tức thì |
| Vùng an toàn quanh đèn | `safe_radius = 6.0 m` áp dụng cho **đèn đã thắp (`lit: true`)** | Khớp mô tả "Bóng Mực sợ những chiếc đèn" và tạo phần thưởng khi thắp đèn |
| Điểm số | `per_mote: 10`, `per_lantern: 100`, `per_stun: 25`, thưởng thắng: `floor(time_left_s) * 2 + flames * 50` | Rõ ràng, dễ kiểm tra qua JSONL |
| Sinh ngẫu nhiên mặc định | Khi `random_motes=true`: 20 đom đóm ban đầu, tự bổ sung khi < 15. Khi `random_shades=true`: 2 Bóng Mực ban đầu, thêm 1 con mỗi 25s (tối đa 5) | Giữ áp lực vừa phải; tắt hoàn toàn khi scenario đặt `false` |

## 2. Truy vết yêu cầu Phase 1 → Bằng chứng
| Yêu cầu (PRD-0 / Contract v1.0) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Nhân vật di chuyển, xoay camera (`cam_yaw_deg`), chuẩn hóa vector `move` | Unit test `tests/core.test.ts` | `docs/proof/phase-1/vitest-output.txt` | Đạt |
| Nhặt đom đóm (`pickup_radius`, `carry_capacity`, `mote_picked`) | Unit test + Headless scenario | `docs/proof/phase-1/scenario-win.jsonl` | Đạt |
| Nạp ánh sáng & thắp Đèn Lồng (`interact`, `deposit`, `lantern_lit`) | Unit test + Headless scenario | `docs/proof/phase-1/scenario-win.jsonl` | Đạt |
| Tỏa sáng xua Bóng Mực (`pulse`, `stunned`, `pulse_push_m`, cooldown) | Unit test + Headless scenario | `docs/proof/phase-1/scenario-combat.jsonl` | Đạt |
| Bóng Mực đuổi, chạm mất máu & rơi đom đóm, `safe_radius` quanh đèn đã thắp | Unit test + Headless scenario | `docs/proof/phase-1/vitest-output.txt`, `scenario-combat.jsonl` | Đạt |
| Điều kiện thắng (`all_lit`) & thua (`no_flames`, `dawn`) + điểm số | Unit test + Headless scenario | `docs/proof/phase-1/scenario-win.jsonl`, `scenario-combat.jsonl` | Đạt |
| File inputs/scenario sai định dạng → mã thoát `2`, ghi `stderr` | Integration test `tests/headless.test.ts` | `docs/proof/phase-1/vitest-output.txt` | Đạt |
| Tính tất định (cùng seed/inputs → output giống hệt) | Chạy 2 lần seed `2026`, so SHA-256 | `docs/proof/phase-1/verify-summary.txt` | Đạt |
| Game 3D chơi được Đêm 1, Mây đội nón lá treo đèn, HUD, chơi lại | Build web `dist/web/` + chạy thực tế trên trình duyệt | `npm run build` xanh + `src/render/main.ts` | Đạt |

## 3. Nhật ký dùng AI & Quản lý token (Phase 1)
- **Công cụ:** Antigravity (Gemini) điều phối đọc đề, thiết kế kiến trúc, sinh code và chạy kiểm chứng tự động.
- **Cách tiết kiệm token:**
  1. Đọc đủ tài liệu và chốt toàn bộ `tuning` + Test Contract v1.0 **trước** khi sinh code → không phải viết lại kiến trúc.
  2. Tách `src/core/` thuần TypeScript, import trực tiếp `game.contract.json` để tránh lệch thông số.
  3. Giữ `AGENTS.md` dưới 35 dòng và gom toàn bộ kiểm chứng vào 1 lệnh `npm run verify`.
- **Ước tính token Phase 1:** ~35k–45k tokens (bao gồm đọc 6 file `.md`, viết core + headless CLI + 3D Three.js + test suite + verification script + docs).
- **Lỗi AI / Điều chỉnh harness:**
  - **Lỗi phát hiện khi chơi thử:** Phím `A`/`D` bị ngược trái/phải trong bản 3D vì camera nhìn về `+Z` (nên hướng phải màn hình trong hệ tay phải Three.js là `-X`, không phải `+X`). Đã sửa ngay tại tầng input của `src/render/main.ts` (`D` → `mx = -1`, `A` → `mx = +1`) mà giữ nguyên 100% công thức `cam_yaw_deg` của Test Contract v1.0 trong `src/core/simulation.ts`.
  - Đã chủ động thiết lập `AGENTS.md`, skill `.agents/skills/verify-phase/SKILL.md`, script `scripts/verify.mjs` và GitHub Actions `.github/workflows/ci.yml` để làm chốt chặn tự động cho các phase sau.
  - Đã cài có chọn lọc **6/80** skills phù hợp nhất từ `gamedev-skills/awesome-gamedev-agent-skills` vào `.agents/skills/` (`threejs-scene-setup`, `threejs-materials-lighting`, `camera-systems`, `game-feel`, `game-ai`, `game-ui-ux`) và áp dụng `threejs-materials-lighting` (ACESFilmicToneMapping, sRGB canvas textures, PBR lighting) để nâng cấp phong cách vẽ tay cổ tích lấy cảm hứng từ game *Hoa*.

## 4. Đánh giá nhanh Phase 1
- **Đạt:** Toàn bộ lõi gameplay Đêm 1, Test Contract v1.0 (CLI, JSONL, exit code 2, determinism), giao diện 3D Three.js với phong cách đêm ấm áp cổ tích và bộ kiểm chứng 1 lệnh.
- **Cần chuẩn bị cho Phase 2:** Khi Ticket-02 phát hành, rà soát xem các thông số `tuning` hay cơ chế mới có ảnh hưởng `src/core/simulation.ts` không và giữ toàn bộ test Phase 1 xanh (hoặc cập nhật kèm lý do rõ ràng).
