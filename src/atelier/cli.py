import threading
import webbrowser

import click
import uvicorn


@click.command()
@click.option("--port", default=8457, type=int, help="Port to serve on")
@click.option("--host", default="127.0.0.1", type=str, help="Host to bind to")
@click.option("--no-browser", is_flag=True, default=False, help="Don't auto-open browser")
def main(port: int, host: str, no_browser: bool) -> None:
    """Atelier — browser-based GLM workbench for actuarial pricing."""
    url = f"http://{host}:{port}"

    if not no_browser:
        threading.Timer(1.5, webbrowser.open, args=(url,)).start()

    uvicorn.run(
        "atelier.app:create_app",
        factory=True,
        host=host,
        port=port,
        log_level="info",
    )
