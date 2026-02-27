import os

from flask import Flask, jsonify

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-only-change-me")


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
def index():
    return "audio upload app is running", 200


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
