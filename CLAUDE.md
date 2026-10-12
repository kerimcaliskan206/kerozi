# KEROZI

Flask + Flask-SQLAlchemy backend for a site selling 4 services
(payment integration, mobile integration, business systems integration, website development),
each with packages. Customers pick a package and pay: iyzico for Turkey (TRY), Paddle for international (USD).

## Rules
- Python 3, Flask app factory in app/__init__.py, entry point wsgi.py.
- SQLite locally, PostgreSQL in production via DATABASE_URL.
- Money is ALWAYS integer minor units (kuruş/cents). Never float.
- Secrets only from environment variables. Never hardcode keys.
- Card data never touches our server: hosted checkout only.
- Orders become "paid" ONLY via verified webhook, never via redirect.
- Keep code minimal. No extra libraries unless asked. No tests unless asked.
- Only touch files named in the task. Don't explore the repo. Don't refactor unrelated code.
- Finish by listing changed files and the exact commands to verify. Keep the summary short.

Frontend: static files in public/, served by Flask. No build step.
