import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from decimal import Decimal

import requests

INIT_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom"
RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail"


class IyzicoError(Exception):
    def __init__(self, message, details=None):
        super().__init__(message)
        # Only non-sensitive diagnostics: status, errorCode, errorMessage, errorGroup, http_status.
        self.details = details or {}


def _price(minor):
    # integer kuruş -> "123.45" string, no floats
    return f"{minor // 100}.{minor % 100:02d}"


def _auth_headers(api_key, secret_key, path, body):
    rnd = str(int(time.time() * 1000)) + secrets.token_hex(4)
    signature = hmac.new(
        secret_key.encode(), (rnd + path + body).encode(), hashlib.sha256
    ).hexdigest()
    auth = base64.b64encode(
        f"apiKey:{api_key}&randomKey:{rnd}&signature:{signature}".encode()
    ).decode()
    return {
        "Authorization": f"IYZWSv2 {auth}",
        "x-iyzi-rnd": rnd,
        "Content-Type": "application/json",
    }


def init_checkout_form(order, customer, package_name, ip):
    """Start a hosted Checkout Form. Returns (token, payment_page_url)."""
    api_key = os.environ["IYZICO_API_KEY"]
    secret_key = os.environ["IYZICO_SECRET_KEY"]
    base_url = os.environ["IYZICO_BASE_URL"].rstrip("/")
    callback_url = os.environ["IYZICO_CALLBACK_URL"]

    contact_name = f"{customer.name} {customer.surname}"
    address = customer.address
    city = customer.city
    country = "Turkey"  # TRY orders only
    payload = {
        "locale": "tr",
        "conversationId": str(order.id),
        "price": _price(order.amount),
        "paidPrice": _price(order.amount),
        "currency": "TRY",
        "basketId": str(order.id),
        "paymentGroup": "PRODUCT",
        "callbackUrl": callback_url,
        "buyer": {
            "id": str(customer.id),
            "name": customer.name,
            "surname": customer.surname,
            # TODO: placeholder only. iyzico requires a TC kimlik no; collect the real
            # value from the buyer (or obtain one legitimately) before going live.
            "identityNumber": "11111111111",
            "email": customer.email,
            "gsmNumber": customer.phone,
            "registrationAddress": address,
            "city": city,
            "country": country,
            "ip": ip or "85.34.78.112",
        },
        "shippingAddress": {
            "contactName": contact_name,
            "city": city,
            "country": country,
            "address": address,
        },
        "billingAddress": {
            "contactName": contact_name,
            "city": city,
            "country": country,
            "address": address,
        },
        "basketItems": [
            {
                "id": str(order.package_id),
                "name": package_name,
                "category1": "Service",
                "itemType": "VIRTUAL",
                "price": _price(order.amount),
            }
        ],
    }

    # Sign exactly the bytes we send.
    body = json.dumps(payload, separators=(",", ":"))
    headers = _auth_headers(api_key, secret_key, INIT_PATH, body)
    resp = requests.post(base_url + INIT_PATH, data=body.encode(), headers=headers, timeout=30)
    try:
        data = resp.json()
    except ValueError:
        raise IyzicoError(
            f"iyzico returned HTTP {resp.status_code}", {"http_status": resp.status_code}
        )
    if data.get("status") != "success":
        details = {k: data.get(k) for k in ("status", "errorCode", "errorMessage", "errorGroup")}
        details["http_status"] = resp.status_code
        raise IyzicoError(data.get("errorMessage") or "iyzico checkout init failed", details)
    return data["token"], data["paymentPageUrl"]


def _to_minor(value):
    # iyzico decimal (parsed as Decimal, never float) -> integer kuruş
    return int((Decimal(str(value)) * 100).to_integral_value())


def retrieve_checkout_form(token):
    """Server-side verification. Returns (paid, price_minor, paid_price_minor)."""
    api_key = os.environ["IYZICO_API_KEY"]
    secret_key = os.environ["IYZICO_SECRET_KEY"]
    base_url = os.environ["IYZICO_BASE_URL"].rstrip("/")

    body = json.dumps({"locale": "tr", "token": token}, separators=(",", ":"))
    headers = _auth_headers(api_key, secret_key, RETRIEVE_PATH, body)
    try:
        resp = requests.post(base_url + RETRIEVE_PATH, data=body.encode(), headers=headers, timeout=30)
        data = json.loads(resp.text, parse_float=Decimal)
    except (requests.RequestException, ValueError):
        raise IyzicoError("iyzico retrieve request failed")
    if data.get("status") != "success":
        raise IyzicoError(data.get("errorMessage") or "iyzico retrieve failed")
    if data.get("token") != token:
        raise IyzicoError("iyzico retrieve token mismatch")

    paid = str(data.get("paymentStatus", "")).upper() in ("SUCCESS", "COMPLETED")
    if data.get("currency") != "TRY":
        paid = False
    # price = basket total (what we sent); paidPrice may include installment fees.
    return paid, _to_minor(data.get("price", 0)), _to_minor(data.get("paidPrice", 0))
