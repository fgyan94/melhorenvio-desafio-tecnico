# API Gateway Log Processor

Serviço HTTP em NestJS que processa arquivos de log NDJSON do API Gateway de forma incremental, persiste os registros em MySQL e exporta relatórios CSV.

> Para detalhes sobre as decisões de design e arquitetura, consulte [`docs/decisoes-tecnicas.md`](docs/decisoes-tecnicas.md).

---

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2 (`docker compose`, não `docker-compose`)

---

## Configuração

1. Clone o repositório e acesse a pasta do projeto:

```bash
git clone <url-do-repositorio>
cd <pasta-do-repositorio>/solution
```

2. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

O `.env` padrão já está configurado para funcionar com o Docker Compose:

```env
DATABASE_URL=mysql://appuser:apppassword@mysql:3306/gateway_logs
PORT=3000
```

> Não altere o host `mysql` — é o nome do serviço definido no `docker-compose.yml`.

---

## Subindo a stack

```bash
docker compose up --build
```

O comando irá:
1. Construir a imagem da aplicação
2. Iniciar o MySQL 8 e aguardar o healthcheck
3. Executar `prisma migrate deploy` automaticamente
4. Iniciar a aplicação na porta `3000`

Para rodar em background:

```bash
docker compose up --build -d
```

Para parar e remover os containers:

```bash
docker compose down
```

---

## Documentação interativa (Swagger)

Acesse no navegador após subir a stack:

```
http://localhost:3000/api
```

O JSON OpenAPI está disponível em:

```
http://localhost:3000/api-json
```

---

## Endpoints

### POST /logs/process

Processa um arquivo de log NDJSON e persiste os registros no banco de forma idempotente.

**Passo 1 — Coloque o arquivo na pasta `logs/` na raiz do projeto:**

```
logs/
└── seu-arquivo.ndjson   ← coloque aqui
```

**Passo 2 — Faça a requisição usando o caminho `/data/logs/` dentro do container:**

```bash
curl -X POST http://localhost:3000/logs/process \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/data/logs/seu-arquivo.ndjson"}'
```

> O diretório `logs/` da raiz do projeto é montado automaticamente como `/data/logs/` dentro do container pelo `docker-compose.yml`. Qualquer arquivo colocado em `logs/` fica acessível pelo caminho `/data/logs/nome-do-arquivo`.

**Resposta (`200 OK`):**

```json
{
  "inserted": 142,
  "skipped": 8,
  "failed": 2,
  "durationMs": 317
}
```

| Campo        | Descrição                                                                                     |
|--------------|-----------------------------------------------------------------------------------------------|
| `inserted`   | Linhas novas inseridas com sucesso                                                            |
| `skipped`    | Linhas ignoradas por já existirem no banco (duplicatas identificadas por hash SHA-256)        |
| `failed`     | Linhas que falharam no parse JSON/Zod ou no insert — detalhes salvos em `gateway_log_failures` |
| `durationMs` | Tempo total de processamento em milissegundos                                                 |

---

### POST /logs/export

Exporta um relatório CSV com base no tipo informado. A resposta é um arquivo para download direto.

```bash
curl -X POST http://localhost:3000/logs/export \
  -H "Content-Type: application/json" \
  -d '{"type": "consumer"}' \
  --output consumer_report.csv
```

**Tipos disponíveis:**

| `type`     | Descrição                                    | Colunas do CSV                                                      |
|------------|----------------------------------------------|---------------------------------------------------------------------|
| `consumer` | Total de requisições agrupado por consumidor | `consumer_id`, `total_requests`                                     |
| `service`  | Total de requisições agrupado por serviço    | `service_name`, `total_requests`                                    |
| `latency`  | Latência média agrupada por serviço          | `service_name`, `avg_proxy_ms`, `avg_gateway_ms`, `avg_request_ms` |

**Resposta (`200 OK`):** arquivo CSV com header UTF-8, sem BOM.

Exemplos para cada tipo:

```bash
# Relatório por consumidor
curl -X POST http://localhost:3000/logs/export \
  -H "Content-Type: application/json" \
  -d '{"type": "consumer"}' --output consumer.csv

# Relatório por serviço
curl -X POST http://localhost:3000/logs/export \
  -H "Content-Type: application/json" \
  -d '{"type": "service"}' --output service.csv

# Relatório de latência média
curl -X POST http://localhost:3000/logs/export \
  -H "Content-Type: application/json" \
  -d '{"type": "latency"}' --output latency.csv
```

---

## Testes

**Unitários:**

```bash
npm test
```

**Integração (requer Docker):**

```bash
npm run test:e2e
```

Os testes de integração sobem um container MySQL isolado via Testcontainers, executam as migrations e destroem o banco ao final — sem estado residual.
