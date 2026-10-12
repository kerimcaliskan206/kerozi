import os
from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

PUBLIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))


def create_app():
    app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path="")

    db_url = os.environ.get("DATABASE_URL", "sqlite:///local.db")
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    from app.routes import bp
    app.register_blueprint(bp)

    from app.seed import register_commands
    register_commands(app)

    @app.get("/")
    def index():
        return send_from_directory(PUBLIC_DIR, "index.html")

    @app.get("/fiyatlandirma")
    @app.get("/fiyatlandirma/")
    def pricing():
        return send_from_directory(os.path.join(PUBLIC_DIR, "fiyatlandirma"), "index.html")

    @app.get("/en")
    @app.get("/en/")
    def index_en():
        return send_from_directory(os.path.join(PUBLIC_DIR, "en"), "index.html")

    @app.get("/en/pricing")
    @app.get("/en/pricing/")
    def pricing_en():
        return send_from_directory(os.path.join(PUBLIC_DIR, "en", "pricing"), "index.html")

    return app
