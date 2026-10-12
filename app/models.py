from datetime import datetime, timezone
from app import db


class Service(db.Model):
    __tablename__ = "services"
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(64), unique=True, nullable=False)
    name_tr = db.Column(db.String(128), nullable=False)
    name_en = db.Column(db.String(128), nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    packages = db.relationship("Package", back_populates="service", lazy="select")


class Package(db.Model):
    __tablename__ = "packages"
    id = db.Column(db.Integer, primary_key=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False)
    slug = db.Column(db.String(64), nullable=False)
    name_tr = db.Column(db.String(128), nullable=False)
    name_en = db.Column(db.String(128), nullable=False)
    setup_try = db.Column(db.Integer, nullable=False)
    monthly_try = db.Column(db.Integer, nullable=False)
    setup_usd = db.Column(db.Integer, nullable=False)
    monthly_usd = db.Column(db.Integer, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    service = db.relationship("Service", back_populates="packages")


class Customer(db.Model):
    __tablename__ = "customers"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(256), unique=True, nullable=False)
    name = db.Column(db.String(256), nullable=False)
    surname = db.Column(db.String(256), nullable=False)
    phone = db.Column(db.String(32), nullable=False)
    city = db.Column(db.String(128), nullable=False)
    address = db.Column(db.String(512), nullable=False)
    company = db.Column(db.String(256))
    country = db.Column(db.String(2), nullable=False)


class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    package_id = db.Column(db.Integer, db.ForeignKey("packages.id"), nullable=False)
    currency = db.Column(db.String(3), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    provider = db.Column(db.String(32), nullable=False)
    provider_ref = db.Column(db.String(256))
    status = db.Column(db.String(32), default="pending", nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class WebhookEvent(db.Model):
    __tablename__ = "webhook_events"
    event_id = db.Column(db.String(256), primary_key=True)
    provider = db.Column(db.String(32), nullable=False)
    received_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
