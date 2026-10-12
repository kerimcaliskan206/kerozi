# Deploy checklist (Render)

Manual steps. Nothing here contains secrets; enter them only in the Render dashboard.

1. [ ] Create a **private** GitHub repository.
2. [ ] Push the project (check that `.venv/`, `instance/`, `*.db`, `.env`, `.claude/` are not included).
3. [ ] Render dashboard -> New -> **Blueprint** -> select the repo (reads `render.yaml`).
   Verify the web plan and Postgres plan names shown there are valid.
4. [ ] Set the env vars on the `kerozi` service (they are `sync: false`):
   - `IYZICO_API_KEY` (sandbox key)
   - `IYZICO_SECRET_KEY` (sandbox secret)
   - `IYZICO_CALLBACK_URL` (see next step)
5. [ ] After the first deploy, note the public URL and set
   `IYZICO_CALLBACK_URL=https://<service>.onrender.com/api/iyzico/callback`, then redeploy.
6. [ ] Open `https://<service>.onrender.com/health` -> `{"status":"ok"}`.
7. [ ] Run one **sandbox** payment end to end (order -> iyzico hosted form -> callback -> order status `paid`).
8. [ ] Check the client-IP rule in `app/ratelimit.py` with a real request on Render:
   send a request with a fake `X-Forwarded-For` header, log what `get_client_ip()` returns,
   and confirm it is your real IP (3rd from the right), not the spoofed value.
9. [ ] Only when everything above works: switch to production iyzico keys and
   `IYZICO_BASE_URL=https://api.iyzipay.com`.
