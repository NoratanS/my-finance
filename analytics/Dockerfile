# Build stage: resolve the locked dependency set into a virtualenv with uv.
# uv ships as a static binary in its own image, so getting it costs the runtime
# stage nothing.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /bin/uv
WORKDIR /app

# Byte-compile on install, copy instead of hardlink, and never fetch a second
# interpreter: all three make the venv self-contained enough to hand over.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Manifest and lockfile first so the dependency layer stays cached until they
# change — the same reason backend/Dockerfile copies pom.xml on its own.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY README.md ./
COPY src/ src/
RUN uv sync --locked --no-dev

# Runtime stage: the interpreter plus the finished venv, no uv and no build
# cache. One Python base for both stages, unlike backend/Dockerfile's JDK to
# JRE drop: there is nothing to compile away here, only the installer.
FROM python:3.12-slim
RUN groupadd --system app && useradd --system --gid app app
WORKDIR /app
# uv installs the project itself in editable mode, so the venv points at
# /app/src — the runtime path has to match the build path, hence copying /app
# whole rather than lifting .venv out on its own.
COPY --from=build --chown=app:app /app /app
USER app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "analytics.main:app", "--host", "0.0.0.0", "--port", "8000"]
