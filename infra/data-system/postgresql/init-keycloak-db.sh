#!/bin/bash
# Creates the 'keycloak' database on the shared PostgreSQL instance.
# Mounted into /docker-entrypoint-initdb.d/ and runs on first boot.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE keycloak OWNER $POSTGRES_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
EOSQL
