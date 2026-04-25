# Migración a multi-worker / multi-pod (3 pasos)

Estado actual: single-process FastAPI. La arquitectura ya está preparada
para escalar; activación es por feature flags via env vars, sin cambios
de código.

---

## Paso 1 — Sin riesgo · LISTO HOY

Activable inmediato. Cero infra extra.

**Activar** modo async para evitar que el request path bloquee mientras
gutenberg.org scrapea:

Frontend ya usa `?async_scrape=true` (commit actual). Cuando el cache
miss → backend retorna instant + scrapea en background.

**Smoke test** confirmar:

```bash
curl 'http://localhost:8000/api/v1/books/reading-info/batch?ids=1,2,3&async_scrape=true'
# → {"data": {}, "pending_ids": [1,2,3]}   en <500ms
```

**Lo que ya funciona sin Redis** (modo single-process):

- Stampede dedupe in-memory (`_scrape_inflight`)
- TTLCache local (search, meta, negative)
- asyncpg pool real (no threadpool blocking)
- Circuit breaker per-host (gutendex.com, gutenberg.org)
- Retry con exp backoff
- Cache-Control condicional según `data_density`
- Warmup de top categorías al startup

---

## Paso 2 — Activar Redis · 30 min de trabajo + 1 hora testing

**Cuándo**: cuando despliegues a >1 worker (`uvicorn --workers 4`) o
cuando agregues una segunda instancia/pod.

### Trigger

```bash
# Add to .env (or k8s secret)
REDIS_URL=redis://default:password@redis-host:6379/0
```

### Lo que se activa automáticamente

1. **Distributed lock** (`core/distributed_lock.py`)
   - Cuando `REDIS_URL` está set, `stampede_lock()` usa SET NX EX
   - El módulo ya tiene la implementación Redis completa
   - Hoy todavía no llamamos `stampede_lock()` directamente — los
     `_scrape_inflight` siguen siendo dicts. Migrar es 1 commit:

   ```python
   # services/gutenberg.py — _scrape_only (futuro commit)
   async def _scrape_only(gid: int) -> tuple[int, dict | None]:
       async with stampede_lock(f"reading-info:{gid}", ttl=60) as (is_owner, fut):
           if is_owner:
               try:
                   info = await _scrape_reading_info(gid)
                   await stampede_publish(f"reading-info:{gid}", info)
                   return gid, info
               except Exception as e:
                   await stampede_publish_error(f"reading-info:{gid}", e)
                   return gid, None
           else:
               try:
                   info = await fut
                   return gid, info
               except Exception:
                   return gid, None
   ```

2. **L2 cache compartido** (`core/cache.py`)
   - `TwoLayerCache(namespace, l1_ttl=300, l2_ttl=3600)` ya existe
   - Migrar `_search_fresh`/`_meta_fresh` para usar `TwoLayerCache`
     reemplaza el TTLCache local + activa Redis L2 cuando esté disponible
   - Beneficio: warm cache sobrevive deploys y se comparte entre pods

3. **Verificación**:
   ```bash
   # En logs
   [redis] connected to redis://...
   # En request
   X-Cache-Layer: l2-redis     (header opcional, agregar si quieres tracing)
   ```

### Riesgo

Bajo. Si Redis está caído, los módulos detectan timeout en el ping inicial
y degradan a in-memory transparentemente. La app NO se cae.

---

## Paso 3 — Queue dedicado para scraping · OPCIONAL · cuando >100 users/h

**Cuándo**: si p99 de `/reading-info/batch` async > 5s sostenido, o si
quieres escapar definitivamente de scraping en request-path.

### Cambios

1. Agregar `arq` (Redis-backed queue) o `Celery`
2. Worker process separado consume jobs:

   ```python
   # app/workers/scrape_worker.py
   async def scrape_reading_info_job(ctx, gid: int):
       info = await _scrape_reading_info(gid)
       if info["cefr"]:
           await upsert_reading_info_many([_info_to_row(gid, info)])

   class WorkerSettings:
       functions = [scrape_reading_info_job]
       redis_settings = RedisSettings.from_dsn(REDIS_URL)
       max_jobs = 12  # global rate limit
   ```

3. Endpoint cambia de `BackgroundTasks` a `arq enqueue_job`:

   ```python
   pool = await create_pool(WorkerSettings.redis_settings)
   for gid in pending:
       await pool.enqueue_job(
           "scrape_reading_info_job", gid,
           _job_id=f"scrape:{gid}",  # dedupe — same id queued twice = 1 job
       )
   ```

### Beneficios sobre BackgroundTasks

- Worker pool independiente del API → API escala sin escalar workers
- Rate limit global a gutenberg.org (no por-instancia)
- Retry automático en jobs fallidos
- Observability: `arq stats` muestra cola, latencia, fallos
- Circuit breaker compartido entre todos los workers via Redis

### Esfuerzo

- Worker setup + dockerización: 4h
- Migración endpoint + smoke testing: 2h
- Total: **~1 día**

---

## Tabla resumen

| Capacidad | Hoy | Paso 1 | Paso 2 (Redis) | Paso 3 (Queue) |
|---|---|---|---|---|
| Single-process | ✅ | ✅ | ✅ | ✅ |
| Multi-worker safe | ⚠️ | ⚠️ | ✅ | ✅ |
| Multi-pod safe | ❌ | ❌ | ✅ | ✅ |
| Cache cross-pod | ❌ | ❌ | ✅ | ✅ |
| Cache survive restart | ❌ | ❌ | ✅ | ✅ |
| Scraping fuera de request | ❌ | ✅ (BackgroundTasks) | ✅ (BackgroundTasks) | ✅ (queue) |
| Worker pool independiente | ❌ | ❌ | ❌ | ✅ |
| Global rate limit Gutendex | ❌ | ❌ | ✅ (vía SET NX EX) | ✅ |
| Circuit breaker compartido | ❌ | ❌ | ⚠️ (cada pod tiene su breaker) | ✅ |
| Observability del scrape | logger | logger | logger | arq dashboard + métricas |

---

## Falla en producción si NO se hace

| Si te quedas en | Falla cuando |
|---|---|
| Hoy (single-process) | Más de 1 worker / pod → duplicación de scrapes, rate-limit Gutendex |
| Paso 1 sin Paso 2 | Cache memory-only → cada deploy frío + cada autoscaling cold-start = 30-60s de "?" badges para los primeros users |
| Paso 2 sin Paso 3 | Spike de tráfico → BackgroundTasks acumulados → workers FastAPI degradados → 503 al resto del API |
| Sin circuit breaker | Gutendex caído → timeouts en cascada → workers bloqueados → API entera lenta |
| Sin retry | Un blip transient → scrape falla → user ve "?" → DB queda envenenada por TTL |

Todos estos escenarios están **prevenidos** por la implementación actual:

- Circuit breaker per-host (`core/circuit.py`) corta fail-fast tras 5 fails consecutivos
- Retry con exp backoff (tenacity) cubre transient
- Negative cache 5min (no en DB) evita poison de errores transitorios
- `data_density` flag evita CDN poison
- `async_scrape=true` saca scraping del request path

Activar Paso 2 + 3 es **upgrade**, no rescate.
