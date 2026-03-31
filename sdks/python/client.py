import requests


class CloudGreenClient:
    def __init__(self, base_url: str = "http://localhost:8787"):
        self.base_url = base_url.rstrip("/")

    def health(self):
        return self._get("/api/health")

    def carbon_current(self, zone: str = "IN"):
        return self._get(f"/api/carbon/current?zone={zone}")

    def mint(self, account: str, amount: float):
        return self._post("/api/token/mint", {"account": account, "amount": amount})

    def transfer(self, from_account: str, to_account: str, amount: float):
        return self._post(
            "/api/token/transfer",
            {"from": from_account, "to": to_account, "amount": amount},
        )

    def executive_overview(self):
        return self._get("/api/executive/overview")

    def _get(self, path: str):
        response = requests.get(f"{self.base_url}{path}", timeout=20)
        response.raise_for_status()
        return response.json()

    def _post(self, path: str, payload: dict):
        response = requests.post(f"{self.base_url}{path}", json=payload, timeout=20)
        response.raise_for_status()
        return response.json()
