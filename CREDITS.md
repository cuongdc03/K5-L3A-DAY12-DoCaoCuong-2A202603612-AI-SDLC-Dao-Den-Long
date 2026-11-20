# CREDITS

## Bản gốc & Nội dung
- Nhân vật **Mây**, **Ông Đăng**, bối cảnh **Đảo Bến**, **Đảo Cau**, **Đảo Chuông**, **Đèn Lồng Lớn**, **Đom đóm**, **Bóng Mực**, **Gió Lạc**, và **Bùa Gió** là nguyên tác của đề bài **Day 12 AI SDLC Lab — Đảo Đèn Lồng**.
- Toàn bộ mô hình 3D (3 hòn đảo, cầu tre, dốc gỗ, tháp chuông, nón lá, đèn lồng, Bóng Mực, Gió Lạc, Bùa Gió, cây tán tròn, biển mây) được dựng bằng hình học procedural trong Three.js và Canvas 2D texture tự vẽ trong `src/render/textures.ts`, không sử dụng asset 3D hay ảnh bên ngoài.
- Toàn bộ nhạc nền ngũ cung và 12 hiệu ứng âm thanh (nhặt đom đóm, bùa gió, nạp đèn, thắp đèn, tỏa sáng, nhảy, lướt, trúng đòn, Bóng Mực xuất hiện, cảnh báo gió, đếm ngược 10s cuối, thắng/thua) được tổng hợp trực tiếp bằng Web Audio API trong `src/render/audio.ts`, không sử dụng file âm thanh bên ngoài.

## Thư viện & Công cụ mã nguồn mở
- **Three.js** — MIT License (https://threejs.org)
- **Vite** — MIT License (https://vite.dev)
- **esbuild** — MIT License (https://esbuild.github.io)
- **Vitest** — MIT License (https://vitest.dev)
- **TypeScript** — Apache-2.0 License (https://www.typescriptlang.org)
- **gamedev-skills/awesome-gamedev-agent-skills** (6 skill chọn lọc cài vào `.agents/skills/`) — MIT License

## Công cụ AI hỗ trợ
- **Antigravity (Gemini)** — hỗ trợ phân tích yêu cầu 4 phase, thiết kế kiến trúc, viết mã nguồn TypeScript/Three.js, xây dựng test, benchmark, soak test và tài liệu SDLC.
