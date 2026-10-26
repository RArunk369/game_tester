# IMPOSTER — Trust No One

A neon-themed real-time social deduction game for 2–8 players. Built with Node.js and a lightweight WebSocket multiplayer server.

## Run locally

Requirements: Node.js 18+.

```bash
npm start
```

Open http://localhost:3000. The host creates a room and shares its code. Players receive private roles, submit clues, vote, and play three rounds.

## Deploy

A `render.yaml` Blueprint is included for Render deployment. The app listens on the `PORT` environment variable and exposes `/health`.

## Prototype limitations

Rooms and scores are stored in server memory and reset on server restart. This is a prototype, not a security-audited production game.
