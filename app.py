from flask import Flask, render_template, request, redirect, session, jsonify
import json
import os

app = Flask(__name__)
app.secret_key = "srp_esports_secure_key_9988"  # Session encryption key

DATA_FILE = "data.json"

# 🔐 SECURE ADMIN LOGINS
USERNAME = "admin"
PASSWORD = "1234"


def load():
    """Load tournament state from file, migrating old schemas safely if detected."""
    if not os.path.exists(DATA_FILE):
        return {"teams": [], "matches": []}
    try:
        with open(DATA_FILE) as f:
            data = json.load(f)

            # Schema migration check: convert dict database to list array safely
            if isinstance(data.get("teams"), dict):
                converted_teams = []
                for name, stats in data["teams"].items():
                    converted_teams.append({
                        "name": name,
                        "M": stats.get("M", 0),
                        "W": stats.get("W", 0),
                        "L": stats.get("L", 0),
                        "D": stats.get("D", 0),
                        "RD": stats.get("RD", 0)
                    })
                data["teams"] = converted_teams

            if "matches" not in data:
                data["matches"] = []

            return data
    except Exception as e:
        print("Database read error, restoring fallback:", e)
        return {"teams": [], "matches": []}


def save(data):
    """Write tournament state to file."""
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)


@app.route("/")
def home():
    """Main route serving the single-page application client."""
    return render_template("index.html")


# ==============================
# 🛠️ REST API ENDPOINTS
# ==============================


@app.route("/api/get-data", methods=["GET"])
def get_data():
    """API endpoint to fetch live leaderboard and match stats."""
    return jsonify(load())


@app.route("/api/login", methods=["POST"])
def api_login():
    """Verify admin login credentials and initialize the session."""
    req = request.json or {}
    user = req.get("username")
    pwd = req.get("password")

    if user == USERNAME and pwd == PASSWORD:
        session["user"] = user
        return jsonify({"success": True})

    return jsonify({"success": False, "message": "Invalid credentials ❌"}), 401


@app.route("/api/logout", methods=["POST"])
def api_logout():
    """Terminate the admin session."""
    session.pop("user", None)
    return jsonify({"success": True})


@app.route("/api/check-auth", methods=["GET"])
def check_auth():
    """Check if client currently possesses active admin rights."""
    return jsonify({"authenticated": session.get("user") == USERNAME})


@app.route("/api/save-data", methods=["POST"])
def save_data():
    """Securely write updated team and match states received from client."""
    if session.get("user") != USERNAME:
        return jsonify({"success": False, "message": "Access Denied: Log in as admin."}), 403

    req = request.json or {}
    teams = req.get("teams", [])
    matches = req.get("matches", [])

    save({"teams": teams, "matches": matches})
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)