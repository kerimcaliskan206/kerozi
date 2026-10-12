import logging
import os
import re

import requests
from flask import Blueprint, current_app, jsonify, redirect, request, send_from_directory
from sqlalchemy.exc import IntegrityError
from app import db
from app.models import Customer, Order, Package, Service, WebhookEvent
from app.ratelimit import get_client_ip, rate_limit

log = logging.getLogger(__name__)
bp = Blueprint("main", __name__)


@bp.get("/health")
def health():
    db.session.execute(db.text("SELECT 1"))
    return jsonify({"status": "ok"})


@bp.get("/api/config")
def get_config():
    base_url = os.environ.get("IYZICO_BASE_URL")
    return jsonify({"test_mode": not base_url or "sandbox" in base_url})


@bp.get("/api/services")
def get_services():
    tr = request.args.get("lang", "en") == "tr"
    services = Service.query.filter_by(active=True).order_by(Service.id).all()
    result = []
    for svc in services:
        pkg = next((p for p in svc.packages if p.active), None)
        if not pkg:
            continue
        result.append({
            "slug": svc.slug,
            "name": svc.name_tr if tr else svc.name_en,
            "package": {
                "id": pkg.id,
                "name": pkg.name_tr if tr else pkg.name_en,
                "price": pkg.setup_try + pkg.monthly_try if tr else pkg.setup_usd + pkg.monthly_usd,
                "currency": "TRY" if tr else "USD",
            },
        })
    return jsonify(result)


@bp.post("/api/orders")
@rate_limit()
def create_order():
    data = request.get_json(silent=True) or {}
    def field(key):
        value = data.get(key)
        return value.strip() if isinstance(value, str) else ""

    email = field("email").lower()
    name = field("name")
    surname = field("surname")
    phone = field("phone")
    city = field("city")
    address = field("address")
    company = field("company") or None
    country = (field("country") or "TR").upper()
    currency = (field("currency") or "TRY").upper()
    package_id = data.get("package_id")

    if not isinstance(package_id, int) or isinstance(package_id, bool):
        return jsonify({"error": "package_id is required and must be an integer"}), 400
    for key, value, limit in (("name", name, 128), ("surname", surname, 128),
                              ("city", city, 128), ("address", address, 512)):
        if not value:
            return jsonify({"error": f"{key} is required"}), 400
        if len(value) > limit:
            return jsonify({"error": f"{key} is too long"}), 400
    if not email:
        return jsonify({"error": "email is required"}), 400
    if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "email is invalid"}), 400
    if not phone:
        return jsonify({"error": "phone is required"}), 400
    if not re.fullmatch(r"\+?[0-9 ()\-]{7,20}", phone):
        return jsonify({"error": "phone is invalid"}), 400
    if len(country) != 2:
        return jsonify({"error": "country must be a 2-letter ISO code"}), 400
    if currency != "TRY":  # TODO: remove once Paddle is integrated
        return jsonify({"error": "only TRY is supported for now"}), 400

    pkg = db.session.get(Package, package_id)
    if not pkg or not pkg.active:
        return jsonify({"error": "package not found"}), 400

    if currency == "TRY":
        amount = pkg.setup_try + pkg.monthly_try
        provider = "iyzico"
    else:
        amount = pkg.setup_usd + pkg.monthly_usd
        provider = "paddle"

    customer = Customer.query.filter_by(email=email).first()
    if not customer:
        customer = Customer(email=email)
        db.session.add(customer)
    customer.name = name
    customer.surname = surname
    customer.phone = phone
    customer.city = city
    customer.address = address
    customer.company = company
    customer.country = country
    db.session.flush()

    order = Order(
        customer_id=customer.id,
        package_id=pkg.id,
        currency=currency,
        amount=amount,
        provider=provider,
        status="pending",
    )
    db.session.add(order)
    db.session.commit()

    return jsonify({"order_id": order.id, "amount": amount, "currency": currency}), 201


@bp.post("/api/orders/<int:order_id>/checkout/iyzico")
@rate_limit()
def checkout_iyzico(order_id):
    from app.payments.iyzico import IyzicoError, init_checkout_form

    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "order not found"}), 404
    if order.currency != "TRY" or order.provider != "iyzico":
        return jsonify({"error": "order is not an iyzico/TRY order"}), 400
    if order.status != "pending":
        return jsonify({"error": "order is not pending"}), 400

    customer = db.session.get(Customer, order.customer_id)
    pkg = db.session.get(Package, order.package_id)
    try:
        token, url = init_checkout_form(order, customer, pkg.name_tr, get_client_ip())
    except IyzicoError as e:
        current_app.logger.error(
            "iyzico checkout failed order=%s error=%s details=%s",
            order_id, type(e).__name__, e.details,
        )
        return jsonify({"error": str(e)}), 502
    except requests.RequestException as e:
        # network error (timeout, connection, DNS): log, then keep the previous behavior
        current_app.logger.error(
            "iyzico checkout failed order=%s error=%s message=%s",
            order_id, type(e).__name__, e,
        )
        raise

    order.provider = "iyzico"
    order.provider_ref = token
    db.session.commit()
    return jsonify({"payment_page_url": url})


_RESULT_STATES = {"paid": "basarili", "failed": "basarisiz"}


def _result_redirect(order):
    durum = _RESULT_STATES.get(order.status, "bekliyor")
    return redirect(f"/odeme-sonucu/?durum={durum}&siparis={order.id}", code=303)


@bp.post("/api/iyzico/callback")
def iyzico_callback():
    from app.payments.iyzico import IyzicoError, retrieve_checkout_form

    token = (request.form.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token is required"}), 400

    order = Order.query.filter_by(provider_ref=token).first()
    if not order:
        log.warning("iyzico callback: no order for token")
        return jsonify({"error": "order not found"}), 404

    if db.session.get(WebhookEvent, token):
        return _result_redirect(order)

    try:
        paid, price, paid_price = retrieve_checkout_form(token)
    except IyzicoError as e:
        log.error("iyzico retrieve failed for order %s: %s", order.id, e)
        return jsonify({"error": "could not verify payment"}), 502

    if paid and (price != order.amount or paid_price < order.amount):
        log.error(
            "iyzico amount mismatch order=%s expected=%s price=%s paidPrice=%s",
            order.id, order.amount, price, paid_price,
        )
        paid = False
    elif not paid:
        log.warning("iyzico payment not successful for order %s", order.id)

    db.session.add(WebhookEvent(event_id=token, provider="iyzico"))
    if order.status == "pending":
        order.status = "paid" if paid else "failed"
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()  # concurrent duplicate callback already processed it
        order = db.session.get(Order, order.id)
    return _result_redirect(order)


@bp.get("/payment/result")
def payment_result():
    durum = _RESULT_STATES.get(request.args.get("status"), "bekliyor")
    order = request.args.get("order", "")
    siparis = f"&siparis={order}" if order.isascii() and order.isdigit() else ""
    return redirect(f"/odeme-sonucu/?durum={durum}{siparis}", code=303)


@bp.get("/odeme-sonucu")
@bp.get("/odeme-sonucu/")
def payment_result_page():
    return send_from_directory(os.path.join(current_app.static_folder, "odeme-sonucu"), "index.html")
