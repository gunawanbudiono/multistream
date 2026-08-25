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

1. 🚀 **ZERO-DOWNTIME STREAMING RULE**: Code deployments or container updates must NEVER abruptly kill active FFmpeg RTMP streaming worker processes unless explicitly authorized by the user.
2. ⏯️ **SEAMLESS TIME RESUME PROTOCOL (`-ss` Offset)**: If a container restart occurs during an active stream, the engine MUST persist the exact elapsed playback timestamp (`elapsed_seconds`) in SQLite DB and resume streaming using FFmpeg offset `-ss <elapsed_seconds>` so viewers on YouTube/TikTok experience a continuous, smooth stream without resetting to 0.
3. 💾 **AUTO PRE-DEPLOY DATABASE BACKUP**: Before executing VM updates, automatically create a backup of `streamflow.db` to `streamflow.db.bak`.

---

## 🐳 4. DOCKER & CONTAINER HYGIENE (ANTI-DUPLICATION)

1. 🚫 **SINGLE CONTAINER ENFORCEMENT**: Always target container `multistream-app`. Never create secondary containers (e.g. `streamflow-app`, `multistream-v2`).
2. 🚫 **VOLUMES & STORAGE PURGING**: Periodically run `docker system prune -f` to clear dangling build caches.
3. 🚫 **NO DOCKER CONFLICTS**: Ensure port `7575` is exclusively bound to `multistream-app`.

---

## 🔒 5. STORAGE & DISK HYGIENE RULES

1. 🚫 **AUTOMATIC TEMP CLEANUP**: Video chunk uploads and FFmpeg transcode operations MUST execute automatic `fs.unlink` on `/public/uploads/temp/` upon completion or failure.
2. 🚫 **NO DUPLICATE FILE UPLOADS**: Video upload endpoints must verify file names & sizes before saving to prevent duplicate giant files.
3. 🚫 **VM DIRECTORY HYGIENE**: Never leave foreign build directories (e.g. `data-warehouse`, `neon-vault`) inside `/home/ngadimin/multistream`.

---

## ⚡ 6. OFFICIAL ONE-LINE VM DEPLOYMENT COMMAND

```powershell
& 'C:\Program Files\PuTTY\plink.exe' -batch -pw 'kebonsunrise' ngadimin@192.168.18.2 'cd /home/ngadimin/multistream ; git fetch origin main ; git reset --hard origin/main ; docker restart multistream-app'
```

---

## 🧠 7. COMMUNICATION & BEHAVIORAL STYLE

- **Language**: Clear, concise, professional Bahasa Indonesia.
- **Strict Compliance**: Follow original Streamflow base design 100%. No unauthorized UI modifications.
