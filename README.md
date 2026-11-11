# Lottery module (embedded in maraki_bingo)

Isolated lottery/ekub storefront + staff panel, mounted at **`/lottery`**.

Bingo gameplay, wallet, Socket.IO, and Telegram polling are **not** modified by this module.

**Default:** `LOTTERY_ENABLED` is **on** unless set to `no`.

## Setup

1. Create a **separate MySQL database** (recommended): `maraki_ekub`
2. In bingo `.env`:

```env
LOTTERY_ENABLED=yes
LOTTERY_BASE_PATH=/lottery
LOTTERY_DB_NAME=maraki_ekub
LOTTERY_ADMIN_USERNAME=lotteryadmin
LOTTERY_ADMIN_PASSWORD=your-strong-password
LOTTERY_TELEGRAM_ENABLED=no
```

3. Install deps from bingo root: `npm install`
4. Restart bingo. Open:
   - Storefront: `http://host:port/lottery`
   - Staff: `http://host:port/lottery/manage`
   - Health: `http://host:port/lottery/api/health`

## Isolation rules

- Own DB (or at least lottery tables via lottery migrations)
- Own staff login (not bingo admin JWT)
- Own cookies scoped to `/lottery/`
- Telegram bot **off by default** — if enabled, use `LOTTERY_TELEGRAM_BOT_TOKEN` (never reuse bingo’s token)

## Disable

```env
LOTTERY_ENABLED=no
```

Bingo continues as before; `/lottery` is not mounted.
