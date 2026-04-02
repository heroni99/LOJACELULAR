#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="$(pwd)"
TARGET_DIR="${LOJACELULAR_WSL_DIR:-$HOME/LOJACELULAR-wsl}"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # Keep the dev stack on the Node version required by Vite 8 and the workspace.
  # The distro default can lag behind and break `pnpm dev` even when build passes.
  source "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null
fi

if [[ ! -f "$SOURCE_DIR/package.json" ]]; then
  echo "Execute este comando na raiz do projeto."
  exit 1
fi

if [[ "$SOURCE_DIR" != /mnt/* ]]; then
  echo "Projeto ja esta no filesystem Linux da distro."
  echo "Iniciando stack local em: $SOURCE_DIR"
  pnpm docker:up
  exec pnpm dev
fi

echo "Sincronizando projeto para: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude '*.tsbuildinfo' \
  --exclude .git \
  "$SOURCE_DIR"/ "$TARGET_DIR"/

cd "$TARGET_DIR"

echo "Limpando artefatos de build sincronizados..."
find apps packages -type d -name dist -prune -exec rm -rf {} +
find apps packages -type f \( -name 'tsconfig.tsbuildinfo' -o -name '*.tsbuildinfo' \) -delete

if docker ps --format '{{.Names}}' | grep -q '^lojacelular-postgres$'; then
  echo "PostgreSQL ja esta em execucao."
else
  echo "Subindo PostgreSQL..."
  if ! pnpm docker:up; then
    if docker ps --format '{{.Names}}' | grep -q '^lojacelular-postgres$'; then
      echo "PostgreSQL existente detectado apos conflito de compose. Reutilizando container em execucao."
    else
      echo "Falha ao subir PostgreSQL automaticamente."
      exit 1
    fi
  fi
fi

echo "Sincronizando dependencias..."
pnpm install --frozen-lockfile

if [[ ! -d prisma/migrations ]]; then
  echo "Gerando Prisma, migrando e rodando seed inicial..."
  pnpm prisma:generate
  pnpm prisma:migrate:dev --name init
  pnpm prisma:seed
fi

echo "Iniciando web + api em $TARGET_DIR"
pkill -f "LOJACELULAR-wsl/apps/api" >/dev/null 2>&1 || true
pkill -f "LOJACELULAR-wsl/apps/web" >/dev/null 2>&1 || true
pkill -f "vite --host 0.0.0.0 --port 5173 --strictPort" >/dev/null 2>&1 || true
pkill -f "nest start --watch" >/dev/null 2>&1 || true
sleep 1
exec pnpm dev
