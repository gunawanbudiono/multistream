# 🎯 MULTISTREAM GOVERNANCE & PROTOCOL RULES (`GEMINI.md`)

This document is the **Single Source of Truth (SSOT)** for all development workflows, VM deployment protocols, architectural standards, and AI assistant behavior rules for the **`multistream`** project.

---

## 📌 1. SINGLE SOURCE OF TRUTH (SSOT) ARCHITECTURE

- **Project Name**: `multistream`
- **Local PC Directory (SSOT)**: `c:\Antigravity\multistream` *(No secondary or temp folders allowed)*
- **Official GitHub Repo (SSOT)**: `https://github.com/gunawanbudiono/multistream.git`
- **Upstream Open-Source Base**: `https://github.com/bangtutorial/streamflow.git`
- **VM Server IP**: `192.168.18.2`
- **VM Target Directory (SSOT)**: `/home/ngadimin/multistream` *(Strictly /home/ngadimin/multistream)*
- **Official Docker Container (SSOT)**: `multistream-app` *(Strictly 1 single container: multistream-app)*
- **App URL**: `http://192.168.18.2:7575` / `https://stream.starhits.id`

---

## 🚨 2. MANDATORY STEP-BY-STEP REVIEW & APPROVAL WORKFLOW (NO DIRECT EXECUTION)

For EVERY request or task, the AI MUST follow this 4-step execution flow:

1. 🔍 **Root Cause & Technical Analysis**:
   - Identify the exact problem, affected code files, and underlying root cause.
   - Explain why the issue happened in clean, professional Indonesian.
2. 💡 **Best Practice Proposal & Global Benchmark Comparison**:
   - Present the recommended best-practice solution (referencing global benchmarks like Restream.io, Castr, Twitch) and list all potential side-effects.
3. 🛑 **STOP & WAIT FOR USER REVIEW**:
   - **DO NOT execute any code, file edits, or git commits until the user explicitly reviews and approves the proposal.**
4. ⚡ **Verified Atomic Micro-Commit Execution**:
   - Execute only the approved change as a single, granular micro-commit, run automated verification, push to GitHub, and deploy to VM.

---

## 📡 3. ZERO-DOWNTIME STREAMING & SMOOTH RESUME PROTOCOL

1. 🚀 **ZERO-DOWNTIME STREAMING RULE**: Code deployments or container updates must NEVER abruptly kill active FFmpeg RTMP streaming worker processes without immediate seamless resumption.
2. ⏯️ **SEAMLESS TIME RESUME PROTOCOL (`-ss` Offset + Forward Keyframe Compensation)**:
   - If a container restart or deployment occurs during an active stream, the engine MUST calculate the exact elapsed timestamp (`elapsed_seconds = (Date.now() - startTime) / 1000`).
   - The engine MUST apply a **Forward Keyframe Buffer Compensation ($\delta = +0.75\text{s}$)** with `-accurate_seek` to ensure FFmpeg lands cleanly on the upcoming IDR Keyframe instead of rewinding previously broadcast frames, preventing any 1-second backward replay for viewers on YouTube/TikTok.
3. ⚡ **TURBO DOCKER REBUILD SCHEME (< 2 Seconds)**:
   - All deployments must utilize Docker BuildKit cache mounts (`--mount=type=cache,target=/root/.npm`) and background image preparation (`docker compose build app`) while the previous container is running.
   - Container swap must take $\le 2\text{ seconds}$ via `docker compose up -d app` to preserve RTMP ingestion sessions.
4. 💾 **AUTO PRE-DEPLOY DATABASE BACKUP**: Before executing VM updates, automatically verify database integrity.

---

## 💾 4. NON-DESTRUCTIVE DATABASE MIGRATIONS

1. 🚫 **NO DESTRUCTIVE QUERIES**: Dilarang menjalankan query destruktif (`DROP TABLE`, `ALTER TABLE DROP COLUMN`, atau `DELETE FROM users`) tanpa script cadangan dan konfirmasi eksplisit dari user.
2. 🛡️ **SAFE COLUMN ADDITIONS**: Setiap penambahan kolom baru pada tabel SQLite wajib bersifat *non-destructive* (menggunakan pengecekan `IF NOT EXISTS` atau *safe alter table* dengan penanganan `duplicate column name`).

---

## 🧪 5. MANDATORY PRE-FLIGHT VERIFICATION BATTERY

Sebelum AI melaporkan bahwa suatu tugas selesai, AI **WAJIB** menjalankan 3 pengujian otomatis:
1. ⚙️ **Validasi Sintaks Lokal**: Memastikan `node -c <file.js>` lolos dengan kode exit 0.
2. 🌐 **Validasi Respon HTTP Endpoint**: Memastikan endpoint utama (`/dashboard`, `/users`, `/gallery`) mengembalikan status `200 OK`.
3. 📜 **Pemeriksaan Log Container**: Memastikan `docker logs` bersih dari `UnhandledRejection` atau `UncaughtException`.

---

## 🔙 6. INSTANT 1-CLICK ROLLBACK PROTOCOL

1. 🏷️ **ATOMIC COMMIT CHECKPOINTS**: Setiap micro-commit harus memiliki deskripsi yang jelas dan independen (*atomic*).
2. ⚡ **INSTANT REVERT READY**: Jika setelah deployment user melaporkan kendala, AI wajib siap melakukan rollback 1-klik ke commit sebelumnya (`git revert` / `git reset`) dalam hitungan detik tanpa merusak database atau media.

---

## 📁 7. STRICT MEDIA VALIDATION & ANTI-EXPLOIT

1. 🔒 **ALLOWED EXTENSIONS & MIME TYPES**: Folder upload hanya menerima format media valid (`.mp4`, `.mov`, `.mkv`, `.ts`, `.mp3`, `.aac`) dengan verifikasi MIME type.
2. 🚫 **ANTI-SCRIPT EXECUTION**: Dilarang mengunggah berkas script berbahaya (`.sh`, `.php`, `.exe`, `.js`) ke direktori media.

---

## 🐳 8. DOCKER & CONTAINER HYGIENE (ANTI-DUPLICATION)

1. 🚫 **SINGLE CONTAINER ENFORCEMENT**: Always target container `multistream-app`. Never create secondary containers (e.g. `streamflow-app`, `multistream-v2`).
2. 🚫 **VOLUMES & STORAGE PURGING**: Periodically run `docker system prune -f` to clear dangling build caches.
3. 🚫 **NO DOCKER CONFLICTS**: Ensure port `7575` is exclusively bound to `multistream-app`.

---

## 🔒 9. STORAGE & DISK HYGIENE RULES

1. 🚫 **AUTOMATIC TEMP CLEANUP**: Video chunk uploads and FFmpeg transcode operations MUST execute automatic `fs.unlink` on `/public/uploads/temp/` upon completion or failure.
2. 🚫 **NO DUPLICATE FILE UPLOADS**: Video upload endpoints must verify file names & sizes before saving to prevent duplicate giant files.
3. 🚫 **VM DIRECTORY HYGIENE**: Never leave foreign build directories (e.g. `data-warehouse`, `neon-vault`) inside `/home/ngadimin/multistream`.

---

## ⚡ 10. OFFICIAL ONE-LINE VM DEPLOYMENT COMMAND

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -batch -pw 'kebonsunrise' ngadimin@192.168.18.2 'cd /home/ngadimin/multistream ; git fetch origin main ; git reset --hard origin/main ; docker restart multistream-app'
```

---

## 🧠 11. COMMUNICATION & COPYWRITING PROTOCOL

1. 🌐 **WEB UI COPYWRITING**: Seluruh teks antarmuka web aplikasi (Button labels, Modal headers, Table columns, Badges, Toast notifications, Error messages) **WAJIB 100% menggunakan Bahasa Inggris profesional** demi konsistensi sistem.
2. 💬 **ASSISTANT CHAT LANGUAGE**: Komunikasi di dalam kolom chat percakapan ini **WAJIB menggunakan Bahasa Indonesia** yang jelas, ringkas, dan berstandar profesional.

---

## 🎨 12. UI/UX STYLING & CUSTOM MODAL STANDARDS

1. 🚫 **NO NATIVE BROWSER POPUPS**: Dilarang keras menggunakan pop-up bawaan browser (`window.alert()`, `window.confirm()`, `window.prompt()`).
2. ✨ **CUSTOM SLEEK MODALS & TOASTS**: Seluruh dialog konfirmasi, peringatan, dan detail modal WAJIB menggunakan custom modal overlay Tailwind CSS yang konsisten dengan tema gelap aplikasi (`bg-dark-800`, `border-[#27272a]`, `rounded-2xl`, `backdrop-blur-sm`).
3. 🎯 **DESIGN FIDELITY**: Mengikuti estetika desain gelap, modern, dan rapi yang telah ada pada Streamflow.

---

## 🧹 13. CLEAN CODE & ARCHITECTURAL SSOT PRINCIPLES

1. 🧼 **CLEAN CODE PRACTICES**:
   - **DRY & Single Responsibility**: Setiap modul, model, dan helper harus memiliki tanggung jawab tunggal (*Single Responsibility Principle*). Hindari duplikasi logika di backend maupun template frontend.
   - **Clean Error Handling**: Selalu gunakan blok `try/catch` dengan error logging yang jelas. Dilarang membiarkan `empty catch block` atau `unhandled promise rejections`.
   - **Dead Code Elimination**: Hapus kode usang (*dead code*), import yang tidak terpakai, dan sisa console debug berlebihan sebelum commit.
2. 🏛️ **ARCHITECTURAL SSOT (SINGLE SOURCE OF TRUTH)**:
   - **Centralized Business Logic**: Logika manipulasi data wajib berada di dalam Models (`models/User.js`, `models/Video.js`, `models/Stream.js`), bukan tersebar acak di route handler.
   - **Consistent UI State**: Parameter status (seperti `isImpersonating`, role badge, dan user avatars) wajib bersumber dari satu session middleware terpusat untuk mencegah *state mismatch* di client.
   - **Naming Consistency**: Seluruh penamaan variabel, fungsi, route endpoint, direktori sistem, dan container Docker wajib konsisten dan deskriptif.

---

## 🚫 14. STRICT WORKSPACE & MULTI-PROJECT ISOLATION RULE

1. 🛑 **NO CROSS-PROJECT EXECUTION**: Workspace dan sesi chat ini **EKSKLUSIF HANYA untuk project `multistream`** (`c:\Antigravity\multistream`). AI **DILARANG KERAS** mengeksekusi, mengedit file, membuat file, atau menjalankan git/deploy command untuk project lain (seperti `starhits-finance`, `AI-Music`, `catalog-delivery`, `trackdelivery`, dll) di dalam workspace ini.
2. ⚠️ **IMMEDIATE PROJECT BOUNDARY REMINDER**: Jika user secara tidak sengaja menanyakan, mengirim screenshot, atau meminta modifikasi terkait project di luar `multistream`:
   - AI **WAJIB LANGSUNG MEMBERIKAN REMINDER / PERINGATAN DI AWAL** bahwa request tersebut berada di luar lingkup project MultiStream.
   - AI hanya boleh memberikan saran konseptual atau teks prompt terpisah yang siap di-copy user ke project yang bersangkutan, dan **DILARANG** melakukan modifikasi file pada direktori project lain agar riwayat percakapan dan repositori tidak tercampur aduk.
