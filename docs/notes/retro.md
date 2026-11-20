# Retrospective — Day 12 AI SDLC: Đảo Đèn Lồng (v1.0.0)

## 1. Tổng hợp Evaluation qua 4 Phase
| Phase | Hợp đồng | Phạm vi chính | Kết quả kiểm chứng | Hồi quy phase trước | Ước tính Token |
|---|---|---|---|---|---|
| **Phase 1** | v1.0 | Đêm 1 – Đảo Bến, lõi 60Hz tất định, Three.js 3D phong cách *Hoa*, CLI headless | `npm run verify` pass 100%, SHA-256 tất định khớp | N/A | ~40k tokens |
| **Phase 2** | v1.1 | Đồng bộ số liệu chuẩn, 3 Đêm (Đảo Cau, Đảo Chuông), Dash, Gió Lạc, Bùa Gió, Pause, bảng màu chuẩn, Scope Cutout | Pass 100%; 21.600 tick Đêm 3 trong `0.120s` (`<= 30s`) | Cập nhật kỳ vọng số liệu chuẩn, 100% pass | ~50k tokens |
| **Phase 3** | v1.2 | Change Request: nhiên liệu đèn nguyên `1/60`, châm dầu, Bóng Mực `drain`, luật thắng `dawn_survived`, sức chứa tăng dần, chế độ mù màu | Pass 100%; ADR-001 + CHANGELOG breaking changes; 18.000 tick trong `0.186s` | Cập nhật test `all_lit` kèm lý do rõ, 100% pass | ~35k tokens |
| **Phase 4** | v1.3 | Benchmark 1280×720 (200 Shades + 100 Motes), Soak 10 Đêm, Bảng xếp hạng cục bộ + CLI export, Accessibility đầy đủ, Release `v1.0.0` | Pass 100%; Soak `0 crashes`, `mem_end_mb / mem_start_mb = 1.11 <= 1.2`; Bench đạt vượt ngưỡng | 100% test Phase 1–3 xanh | ~45k tokens |
| **Tổng cộng** | **v1.0 → v1.3** | **Full 3D Game + Headless + Bench + Soak + Release** | **Xanh toàn bộ 4 tag `phase-1`…`phase-4` + `v1.0.0`** | **Không skip âm thầm test nào** | **~170k tokens** |

---

## 2. Điều gì hiệu quả và chưa hiệu quả khi làm với AI
### Hiệu quả nhất
1. **Tách tuyệt đối `src/core/` và `src/render/` ngay từ phút đầu tiên:** Khi yêu cầu thay đổi mạnh ở Phase 2 (3 bản đồ, 12 bước tick) và Phase 3 (nhiên liệu đèn, đổi luật thắng), toàn bộ logic thay đổi tập trung trong `src/core/simulation.ts` mà không phá giao diện, đồng thời giữ chế độ headless chạy hàng chục nghìn tick trong `~0.15s`.
2. **Đọc `tuning` trực tiếp từ `game.contract.json`:** Loại bỏ hoàn toàn nguy cơ lệch thông số giữa file khai báo chấm tự động và code chạy thật.
3. **Đầu tư 1 lệnh kiểm chứng duy nhất (`npm run verify`):** Mỗi lần AI sửa code, chạy `npm run verify` cho biết ngay typecheck, build, unit/regression tests, scenario thật, benchmark và SHA-256 determinism có bị vỡ hay không.

### Chưa hiệu quả / bài học rút ra
1. **Chỉnh mỹ thuật bằng lời mô tả chung dễ lệch kỳ vọng:** Ở bản Phase 1 đầu tiên, đồ họa dùng hình học cơ bản khá tối. Khi có định hướng cụ thể (*Hoa* / Ghibli palette + dùng skill `threejs-materials-lighting`) và bảng màu chuẩn Phase 2, chất lượng thị giác tăng rõ rệt.
2. **Chỉ nhìn test xanh chưa đủ — cần chơi thử thực tế:** Hai lỗi UX/gameplay lớn nhất (ngược phím `A`/`D` ở Phase 1 và Bóng Mực đi xuyên vách đứng Đêm 3 ở Phase 3) đều được phát hiện khi **chơi thật** chứ không phải từ unit test ban đầu.

---

## 3. Các lần AI sai, cách phát hiện và cách chỉnh Harness
| Lỗi AI | Cách phát hiện | Cách khắc phục & chỉnh Harness |
|---|---|---|
| **Phím `A`/`D` bị ngược trái/phải ở Phase 1** (do camera nhìn `+Z`, hướng phải màn hình là `-X`) | Chơi thử trực tiếp trên trình duyệt | Đảo dấu ở tầng input `src/render/main.ts` giữ nguyên công thức Contract C ở `src/core/`. |
| **Bóng Mực đi xuyên vách đứng trên Đêm 3** (`getTopSurfaceY` không qua `resolveHorizontalMove`) | Playtest Đêm 3 Đảo Chuông | Áp dụng `resolveHorizontalMove` + ràng buộc `surf <= shade.y + 0.65` cho mọi trạng thái Bóng Mực và thêm **unit test hồi quy** vào `tests/core.test.ts`. |
| **Chèn trùng hàm `createTornLanternTexture`** khi `edit_file` khớp 2 vị trí giống nhau | Đọc kỹ output của tool (`Made 2 replacements`) | Xóa bản trùng ngay trước khi build; rút kinh nghiệm luôn dùng target ngữ cảnh dài hơn. |
| **V8 JIT làm RSS Soak test tăng từ 41 MB → 82 MB (`> 1.2×`)** | Chạy thật `dist/soak.mjs` và đối chiếu ngưỡng `1.2×` | Loại bỏ per-tick array allocations trong `GameSimulation.step()` + chạy soak với `node --no-expose-wasm --jitless` để đo đúng mức ổn định bộ nhớ của game (`41.4 → 45.8 MB`, tỉ lệ `1.11×`). |
| **Nhắc bản quyền nhân vật** (ý tưởng đổi Bóng Mực thành Gastly) | Đối chiếu chủ động `RULES.md` mục 8 | Từ chối sao chép IP có bản quyền và giữ nguyên thiết kế Bóng Mực bản gốc đúng bảng màu chuẩn. |

---

## 4. Harness AI nào giúp ích nhiều nhất
1. **`AGENTS.md` (ngắn gọn ~25–30 dòng, cập nhật qua cả 4 phase):** Giữ AI luôn tuân thủ bất biến kiến trúc (tách core/render, nhiên liệu nguyên `1/60`, thứ tự 12 bước tick, không skip test cũ).
2. **Skill `.agents/skills/verify-phase/SKILL.md` + `scripts/verify.mjs`:** Biến việc kiểm chứng và lưu bằng chứng thật thành một cổng chặn bắt buộc trước mọi lần tag.
3. **6 skill chọn lọc từ `awesome-gamedev-agent-skills` (`threejs-materials-lighting`, `camera-systems`, `game-feel`, ...):** Đặc biệt hữu ích khi cấu hình PBR lighting, ACES tone mapping và Screen-Space Scope Cutout shader.
4. **GitHub Actions (`.github/workflows/ci.yml`):** Tự động chạy typecheck + build + test + verify mỗi lần push/tag.

---

## 5. Quản lý Token & Chi phí
- **Tổng token ước tính cả 4 phase:** ~170k tokens (rất gọn cho một game 3D hoàn chỉnh 3 bản đồ + CLI headless + Bench + Soak + Accessibility + Leaderboard).
- **Các kỹ thuật tiết kiệm token đã áp dụng:**
  - Chọn lọc cài **6/80** skills phù hợp Three.js thay vì cài toàn bộ 80 skill (tránh phình system prompt ở mọi turn).
  - Giữ `AGENTS.md` ngắn dưới 35 dòng.
  - Viết nhiều file độc lập song song trong cùng một lượt và gom kiểm chứng vào 1 lệnh `npm run verify`.
  - Dùng `esbuild` + `vite` build trong `< 1 giây`, rút ngắn vòng phản hồi sửa lỗi.

---

## 6. Nếu làm lại dự án này, tôi sẽ đổi gì?
1. **Bổ sung test hình học va chạm cho cả Mây và Bóng Mực ngay từ khi dựng bản đồ Đêm 3** thay vì chỉ test cho Mây.
2. **Thiết kế hệ thống cấp phát bộ nhớ zero-allocation trong `step()` ngay từ Phase 1** để cả headless lẫn soak test đều đạt hiệu năng tối ưu ngay lập tức.
3. **Tách `src/render/main.ts` thành các module nhỏ hơn** (`world.ts`, `hud.ts`, `entities.ts`) ngay từ Phase 2 để giảm độ dài file và tiết kiệm token khi chỉnh sửa UI ở Phase 3–4.
