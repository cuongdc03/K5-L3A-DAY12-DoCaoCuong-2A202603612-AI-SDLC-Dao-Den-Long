# CREDITS

## Bản gốc & Nội dung
- Nhân vật **Mây**, bối cảnh **Đảo Bến**, **Đèn Lồng Lớn**, **Đom đóm**, và **Bóng Mực** là nguyên tác của đề bài **Day 12 AI SDLC Lab — Đảo Đèn Lồng**.
- Toàn bộ mô hình 3D (đảo, nón lá, đèn lồng, Bóng Mực, mây, cây thông) được dựng bằng hình học cơ bản (procedural geometry) trong Three.js, không sử dụng asset 3D bên ngoài.
- Toàn bộ hiệu ứng âm thanh (nhặt đom đóm, nạp đèn, thắp đèn, tỏa sáng, va chạm, thắng/thua) được tổng hợp trực tiếp bằng Web Audio API trong `src/render/audio.ts`, không sử dụng file âm thanh bên ngoài.

## Thư viện mã nguồn mở
- **Three.js** — MIT License (https://threejs.org)
- **Vite** — MIT License (https://vite.dev)
- **esbuild** — MIT License (https://esbuild.github.io)
- **Vitest** — MIT License (https://vitest.dev)
- **TypeScript** — Apache-2.0 License (https://www.typescriptlang.org)

## Công cụ AI hỗ trợ
- **Antigravity (Gemini)** — hỗ trợ phân tích yêu cầu, lập kế hoạch, viết mã nguồn TypeScript/Three.js, xây dựng test và kịch bản kiểm chứng.
