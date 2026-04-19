# Harvester

Self-hosted automation for M-Team: watch the public search feed, match torrents against user-defined rule-sets, and hand grabs off to qBittorrent. Windows-first; runs fine on macOS/Linux.

Status: **Phase 1 scaffold** — backend + minimal UI. See [doc/IMPLEMENTATION.md](doc/IMPLEMENTATION.md) for the full phase plan and [spike/SPIKE_REPORT.md](spike/SPIKE_REPORT.md) for the live M-Team API findings this build is based on.

## Install

Requires Node.js `>=20.11.0` (20 LTS) and qBittorrent 4.x–5.1.x running with WebUI enabled.

```
git clone <repo>
cd harvester
npm install
cd web && npm install && cd ..
npm run build
```

## Run

- Windows: `scripts\start.bat`
- macOS/Linux: `./scripts/start.sh`

On first boot Harvester writes its data to:
- Windows: `%APPDATA%\Harvester\`
- macOS/Linux: `~/.config/harvester/`

Open `http://127.0.0.1:5173` and complete the first-run wizard.

## Dev

```
npm install
cd web && npm install && cd ..
./scripts/dev.sh
```

The backend runs on `:5173` by default; Vite's dev server proxies `/api/*` to it.

## License

MIT — see [LICENSE](LICENSE).
