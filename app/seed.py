import click
from flask.cli import with_appcontext
from app import db
from app.models import Service, Package

# All amounts are integer minor units (kuruş / cents).
SERVICES = [
    {"slug": "crm-otomasyon", "name_tr": "CRM ve Otomasyon", "name_en": "CRM and Automation",
     "setup_try": 750000, "setup_usd": 15000},
    {"slug": "ai-entegrasyonu", "name_tr": "AI Entegrasyonu", "name_en": "AI Integration",
     "setup_try": 1250000, "setup_usd": 25000},
    {"slug": "web-gelistirme", "name_tr": "Web Geliştirme", "name_en": "Web Development",
     "setup_try": 1000000, "setup_usd": 20000},
    {"slug": "mobil-uygulamalar", "name_tr": "Mobil Uygulamalar", "name_en": "Mobile Apps",
     "setup_try": 3750000, "setup_usd": 75000},
]

PACKAGE = {"slug": "paket", "name_tr": "Başlangıç Paketi", "name_en": "Starter Package"}


def register_commands(app):
    @app.cli.command("init-db")
    @with_appcontext
    def init_db():
        db.create_all()
        for data in SERVICES:
            svc = Service.query.filter_by(slug=data["slug"]).first()
            if not svc:
                svc = Service(slug=data["slug"], name_tr=data["name_tr"], name_en=data["name_en"])
                db.session.add(svc)
                db.session.flush()
            else:
                svc.name_tr = data["name_tr"]
                svc.name_en = data["name_en"]
                svc.active = True

            pkg = Package.query.filter_by(service_id=svc.id, slug=PACKAGE["slug"]).first()
            if not pkg:
                pkg = Package(service_id=svc.id, slug=PACKAGE["slug"])
                db.session.add(pkg)
            pkg.name_tr = PACKAGE["name_tr"]
            pkg.name_en = PACKAGE["name_en"]
            pkg.setup_try = data["setup_try"]
            pkg.monthly_try = 0
            pkg.setup_usd = data["setup_usd"]
            pkg.monthly_usd = 0
            pkg.active = True
        db.session.commit()
        click.echo("Database initialized.")
