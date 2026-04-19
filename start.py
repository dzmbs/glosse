import os
import uvicorn

port = int(os.environ.get("PORT", 8123))
uvicorn.run("glosse.server.app:app", host="0.0.0.0", port=port)
