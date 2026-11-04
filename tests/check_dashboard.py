# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""Check a deployed dashboard or a local production export in Chromium.

    uv run --with playwright==1.62.0 playwright install --with-deps chromium
    uv run tests/check_dashboard.py --url https://your-dashboard.example

--coach sends one short test prompt using the deployed coach configuration.
--refresh starts one real refresh using the website's configured button.
--mock-coach intercepts Google requests to check replies, errors and recovery
against a production build configured with a placeholder key.
No API keys, request headers, training details or prompts are printed.
"""

import argparse
import json
import re
from urllib.parse import urlsplit

from playwright.sync_api import Error as BrowserError
from playwright.sync_api import sync_playwright

ROUTES = [
    "/",
    "/aktivitaeten/",
    "/training/",
    "/statistiken/",
    "/gesundheit/",
    "/rekorde/",
    "/wettkaempfe/",
    "/coach/",
]
ACCOUNT_ID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--browser", help="Optional local Chromium executable")
    parser.add_argument("--coach", action="store_true")
    parser.add_argument(
        "--mock-coach",
        action="store_true",
        help="Test replies and failures without calling Google",
    )
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    with sync_playwright() as playwright:
        options = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-dev-shm-usage"],
        }
        if args.browser:
            options["executable_path"] = args.browser
        browser = playwright.chromium.launch(**options)
        context = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            locale="de-DE",
            timezone_id="Europe/Berlin",
        )
        mock_status = {"code": 200}
        if args.mock_coach:

            def mock_google(route):
                status = mock_status["code"]
                body = (
                    "data: "
                    + json.dumps(
                        {
                            "candidates": [
                                {
                                    "content": {
                                        "parts": [
                                            {"text": "Funktionstest erfolgreich."}
                                        ]
                                    }
                                }
                            ]
                        }
                    )
                    + "\n\n"
                )
                route.fulfill(
                    status=status,
                    content_type="text/event-stream"
                    if status == 200
                    else "application/json",
                    headers={
                        "access-control-allow-origin": "*",
                        "access-control-allow-headers": "*",
                        "access-control-allow-methods": "POST, OPTIONS",
                    },
                    body=body
                    if status == 200
                    else '{"error":{"message":"Test service unavailable"}}',
                )

            context.route("https://generativelanguage.googleapis.com/**", mock_google)
        page = context.new_page()
        errors = []
        page.on(
            "pageerror",
            lambda error: errors.append(
                re.sub(r"(https?://[^?\s]+)\?[^\s]+", r"\1?[redacted]", str(error))[
                    :800
                ]
            ),
        )
        report = {
            "routes": [],
            "activity_details": [],
            "search": False,
            "mobile_navigation": False,
        }
        for route in ROUTES:
            response = page.goto(base + route, wait_until="networkidle", timeout=60000)
            assert response.status == 200, f"Page failed: {route} ({response.status})"
            page.locator("h1").wait_for(timeout=30000)
            assert not errors, f"JavaScript error on {route}"
            assert not page.evaluate(
                "document.documentElement.scrollWidth > innerWidth"
            ), f"Horizontal overflow: {route}"
            if route == "/":
                assert not ACCOUNT_ID.search(page.locator("h1").inner_text()), (
                    "Account ID rendered as name"
                )
            report["routes"].append(route)

        response = context.request.get(base + "/data/activities.json")
        assert response.ok, "Activity index missing"
        activities = response.json()
        assert activities, "Activity index empty"
        for sport in ["running", "cycling", "lap_swimming", "strength_training"]:
            activity = next(
                (row for row in activities if row.get("typeKey") == sport), None
            )
            if not activity:
                continue
            aid = activity["activityId"]
            detail_response = context.request.get(base + f"/data/activity/{aid}.json")
            assert detail_response.ok, f"Detail file missing for {sport}"
            assert detail_response.json().get("summary"), (
                f"Empty detail summary for {sport}"
            )
            page.goto(base + f"/aktivitaeten/?a={aid}", wait_until="networkidle")
            dialog = page.get_by_role("dialog")
            dialog.wait_for(state="visible", timeout=15000)
            assert dialog.get_by_text("Zeit", exact=True).count(), (
                f"Activity measurements missing for {sport}"
            )
            assert not errors, f"JavaScript error in {sport} detail"
            page.get_by_role("button", name="Schließen", exact=True).click()
            dialog.wait_for(state="hidden")
            report["activity_details"].append(sport)

        page.goto(base + "/aktivitaeten/", wait_until="networkidle")
        search = page.get_by_placeholder("Suchen — Name, Sportart oder Datum")
        search.fill("no-activity-can-have-this-test-name")
        page.get_by_text("Nichts gefunden.", exact=True).wait_for()
        search.fill(activities[0]["activityName"].replace("\u200b", ""))
        page.get_by_text("Nichts gefunden.", exact=True).wait_for(state="hidden")
        report["search"] = True

        mobile = context.new_page()
        mobile.set_viewport_size({"width": 390, "height": 844})
        mobile.goto(base + "/", wait_until="networkidle")
        mobile.get_by_role("button", name="Menü öffnen", exact=True).click()
        mobile.get_by_role("link", name="Statistiken", exact=True).click()
        mobile.get_by_role("heading", name="Wirst du besser?", exact=True).wait_for()
        assert (
            mobile.get_by_role("button", name="Menü öffnen").get_attribute(
                "aria-expanded"
            )
            == "false"
        )
        assert not mobile.evaluate(
            "document.documentElement.scrollWidth > innerWidth"
        ), "Mobile horizontal overflow"
        report["mobile_navigation"] = True
        mobile.close()

        # Older cached data may still contain an account ID. Test the actual
        # greeting with that payload so a future export regression stays hidden.
        fallback = context.new_page()
        fallback.route(
            "**/data/profile.json",
            lambda route: route.fulfill(
                json={"full_name": "11111111-2222-4333-8444-555555555555"}
            ),
        )
        fallback.goto(base + "/", wait_until="networkidle")
        heading = fallback.locator("h1").inner_text()
        assert not ACCOUNT_ID.search(heading) and ", ." not in heading
        fallback.close()
        report["invalid_name_fallback"] = True

        if args.mock_coach:
            metrics_page = context.new_page()
            metrics_page.on("pageerror", lambda error: errors.append(str(error)[:800]))
            metrics_page.route(
                "**/data/manifest.json",
                lambda route: route.fulfill(
                    json={
                        "generated_at": "2026-11-03T12:00:00Z",
                        "source": "python_garminconnect",
                        "sections": {},
                    }
                ),
            )
            metrics_page.route(
                "**/data/daily.json",
                lambda route: route.fulfill(
                    json={"readiness": [{"calendarDate": "2026-11-03", "score": 75}]}
                ),
            )
            metrics_page.route(
                "**/data/fitness.json",
                lambda route: route.fulfill(
                    json={
                        "training_status": {
                            "mostRecentTrainingStatus": {
                                "latestTrainingStatusData": {
                                    "watch": {
                                        "trainingStatusFeedbackPhrase": "PRODUCTIVE",
                                        "weeklyTrainingLoad": 500,
                                    }
                                }
                            }
                        },
                        "cycling_ftp": {"functionalThresholdPower": 250},
                        "cycling_ability": {
                            "calendarDate": "2026-11-03",
                            "aerobicEndurance": 75.5,
                            "aerobicCapacity": 65.2,
                            "anaerobicCapacity": 55.1,
                        },
                        "max_metrics_latest": {
                            "cycling": {
                                "calendarDate": "2026-11-03",
                                "vo2MaxPreciseValue": 55.3,
                            }
                        },
                        "training_status_history": [
                            {"calendarDate": "2026-10-26", "weeklyTrainingLoad": 400},
                            {"calendarDate": "2026-11-02", "weeklyTrainingLoad": 500},
                        ],
                        "power_curve": {
                            "series": [
                                {"duration": 60, "power": 350},
                                {"duration": 300, "power": 250},
                            ]
                        },
                    }
                ),
            )
            metrics_page.goto(base + "/training/", wait_until="networkidle")
            metrics_page.get_by_role(
                "heading", name="Garmin-Leistung", exact=True
            ).wait_for()
            metrics_page.get_by_text("Produktiv", exact=True).wait_for()
            metrics_page.get_by_text("FTP Rad", exact=True).wait_for()
            metrics_page.get_by_text("Rad: aerobe Ausdauer", exact=True).wait_for()
            metrics_page.get_by_text("Rad: aerobe Kapazität", exact=True).wait_for()
            metrics_page.get_by_text("Rad: anaerobe Kapazität", exact=True).wait_for()
            metrics_page.get_by_text("Trainingsbereitschaft", exact=True).wait_for()
            metrics_page.get_by_text("Leistungsverlauf", exact=True).click()
            metrics_page.get_by_role(
                "heading", name="Leistungskurve Rad · 90 Tage", exact=True
            ).wait_for()
            assert metrics_page.locator("canvas").count() >= 2
            metrics_page.set_viewport_size({"width": 390, "height": 844})
            # Chart.js resizes its canvas through ResizeObserver after the viewport changes.
            metrics_page.wait_for_function(
                "document.documentElement.scrollWidth <= innerWidth", timeout=5000
            )
            assert not metrics_page.evaluate(
                "document.documentElement.scrollWidth > innerWidth"
            ), "Performance cards overflow on mobile"
            assert not errors, "JavaScript errors in new performance features"
            metrics_page.close()
            report["garmin_performance_features"] = True

        failures = []
        service_statuses = []
        page.on(
            "response",
            lambda response: (
                service_statuses.append(
                    {
                        "service": urlsplit(response.url).hostname,
                        "status": response.status,
                    }
                )
                if urlsplit(response.url).hostname
                in ("api.github.com", "generativelanguage.googleapis.com")
                else None
            ),
        )
        if args.coach or args.mock_coach:
            try:
                page.goto(base + "/coach/", wait_until="networkidle")
                assert page.get_by_role(
                    "button", name="Vorschlag holen", exact=True
                ).is_enabled(), "Coach is not configured"
                page.get_by_placeholder("Warum keine harte Einheit heute?").fill(
                    "Bitte bestätige nur kurz, dass du antworten kannst. Schreibe: Funktionstest erfolgreich."
                )
                page.get_by_role("button", name="Senden", exact=True).click()
                assistant = page.locator("div.rounded-bl-md").last
                assistant.wait_for(state="visible")
                page.wait_for_function(
                    "() => [...document.querySelectorAll('div.rounded-bl-md')].some(e => e.textContent.toLowerCase().includes('funktionstest erfolgreich'))",
                    timeout=90000,
                )
                report["coach"] = "response_received"
                if args.mock_coach:
                    mock_status["code"] = 503
                    page.get_by_placeholder("Warum keine harte Einheit heute?").fill(
                        "Prüfe den Fehlerfall."
                    )
                    page.get_by_role("button", name="Senden", exact=True).click()
                    page.wait_for_function(
                        "() => [...document.querySelectorAll('div.rounded-bl-md')].at(-1)?.textContent.includes('Gemini antwortete mit 503')",
                        timeout=15000,
                    )
                    assert not errors, "Coach crashed when its service was unavailable"
                    mock_status["code"] = 200
                    page.get_by_placeholder("Warum keine harte Einheit heute?").fill(
                        "Prüfe die Wiederherstellung."
                    )
                    page.get_by_role("button", name="Senden", exact=True).click()
                    page.wait_for_function(
                        "() => [...document.querySelectorAll('div.rounded-bl-md')].at(-1)?.textContent.includes('Funktionstest erfolgreich')",
                        timeout=15000,
                    )
                    report["mock_coach_error_and_recovery"] = True
            except (AssertionError, BrowserError):
                report["coach"] = "failed"
                failures.append("coach")

        if args.refresh:
            try:
                page.goto(base + "/", wait_until="networkidle")
                with page.expect_response(
                    lambda response: (
                        response.request.method == "POST"
                        and urlsplit(response.url).hostname == "api.github.com"
                        and urlsplit(response.url).path.endswith("/dispatches")
                    ),
                    timeout=20000,
                ) as dispatch:
                    page.get_by_role(
                        "button", name="Daten aktualisieren", exact=True
                    ).click()
                assert dispatch.value.status == 204, (
                    f"Refresh was rejected: HTTP {dispatch.value.status}"
                )
                report["refresh"] = "workflow_started"
            except (AssertionError, BrowserError):
                report["refresh"] = "failed"
                failures.append("refresh")

        report["javascript_errors"] = errors
        report["service_statuses"] = service_statuses
        print(json.dumps(report, ensure_ascii=False, indent=2))
        browser.close()
        assert not errors, "JavaScript errors occurred"
        assert not failures, f"Optional checks failed: {', '.join(failures)}"


if __name__ == "__main__":
    main()
