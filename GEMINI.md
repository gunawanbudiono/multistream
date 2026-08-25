# 🎯 MULTISTREAM PROJECT RULES & CONTEXT GUIDELINES (`GEMINI.md`)

This document contains authoritative rules, environment configurations, server credentials, UI/UX guidelines, architectural analysis, side-effect mitigations, and workflow rules for the **`multistream`** project.

---

## 📌 1. PROJECT ARCHITECTURE & REPOSITORIES

- **Project Name**: `multistream`
- **Local PC Directory**: `c:\Antigravity\multistream`
- **Official GitHub Repo**: `https://github.com/gunawanbudiono/multistream.git`
- **Upstream Open-Source Base**: `https://github.com/bangtutorial/streamflow.git`

---

## 🌐 2. SERVER & DEPLOYMENT CREDENTIALS

- **VM Server IP**: `192.168.18.2`
- **SSH Username**: `ngadimin`
- **SSH Password**: `kebonsunrise`
- **App URL**: `http://192.168.18.2:7575` / `https://stream.starhits.id`
- **VM Working Directories**:
  - `/home/ngadimin/multistream`
  - `/home/ngadimin/streamflow`
- **Docker Container Name**: `streamflow-app` (or `multistream-app`)
- **Default Impersonated Member Account**: `entertainment` (ID: `16425157-7975-4cbd-9368-2df8cb73a100`)

### ⚡ One-Line VM Deployment Command
```powershell
& 'C:\Program Files\PuTTY\plink.exe' -batch -pw 'kebonsunrise' ngadimin@192.168.18.2 'cd /home/ngadimin/streamflow ; git fetch origin main ; git reset --hard origin/main ; docker restart streamflow-app'
```

---

## 🔒 3. STORAGE & DISK HYGIENE RULES (STRICT ANTI-DUPLICATION)

1. 🚫 **STRICT TEMP CLEANUP PROTOCOL**: Every chunked video upload or FFmpeg transcode operation MUST execute automatic cleanup (`fs.unlink`) on `/public/uploads/temp/` upon completion or error. No chunk remnants allowed.
2. 🚫 **NO DUPLICATE FILE UPLOADS**: Video upload endpoints must verify file names & sizes to prevent saving identical giant video files multiple times.
3. 🚫 **VM DIRECTORY HYGIENE**: Never leave foreign build directories (e.g. `data-warehouse`, `neon-vault`, `starhits-mcn`) inside `/home/ngadimin/streamflow`.
4. 🚫 **AUTOMATIC DOCKER PRUNING**: Periodically run `docker system prune -f` to clear dangling build caches.

---

## 🔄 4. GIT MICRO-COMMIT & ATOMIC APPROVAL WORKFLOW RULES

1. **Analysis & User Approval First**: AI must NEVER modify multiple files or features at once. Every single small change must be proposed, analyzed for side-effects, and approved by the user BEFORE code execution.
2. **Granular Micro-Commits**: Commit and push to Git frequently after every small, verified change so code can be safely reverted at any point.
3. **Automated Verification**: Always test and verify changes using automated scripts or HTTP requests before reporting completion.

---

## 🧠 5. COMMUNICATION STYLE

- **Response Language**: Bahasa Indonesia yang jelas, ringkas, dan berstandar profesional.
- **No Unauthorized Modifications**: Follow reference designs 100% without adding arbitrary layout or styling changes.
