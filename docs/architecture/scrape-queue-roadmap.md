# Scrape queue — roadmap (no implementado todavía)

## Por qué este doc existe

Hoy el endpoint `/api/v1/books/reading-info/batch` con `scrape_missing=true`
sigue haciendo el scrape **dentro del request path**. Eso significa:

- Cold path puede tardar 2-30s aunque el batch sea paralelo
- Si gutenberg.org está lento, todos los workers FastAPI se quedan esperando
- Spike de tráfico → backlog → 503 al resto del API

Esto es **aceptable hoy** porque:

1. El warmup pre-cachea las top 9 categorías + sus top 10 libros al
   startup → ~90 reading-info en DB antes del primer click real
2. SWR forever (24h-7d) → segunda visita a cualquier libro ya visto = instant
3. Single-instance, founder-only validation: tráfico bajo

Esto **NO escala** cuando:

- Despliegas con autoscaling (>1 pod)
- Tienes >50 users concurrentes
- Quieres p99 latency < 500ms en cualquier categoría

## Solución target

```
USER → GET /reading-info/batch?ids=...
         │
         ▼
       BACKEND
         │
         ├─ SELECT ids cacheados (asyncpg, ~10ms)
         │
         ├─ Para missing: enqueue scrape jobs (Redis LPUSH)
         │
         └─ Return inmediato: {data: cached, pending_ids: [...]}
                                                  │
              FRONTEND ────────────────────────────┘
                │
                ▼
              Polls /reading-info/batch?ids=pending_ids cada 2s
                hasta pending_ids está vacío.
                Mientras tanto: muestra "..." en las cards de pending.

      WORKER POOL (separado, autoscaling independiente)
         │
         ▼
       arq / Celery / RQ consume Redis queue
         │
         ├─ Single global rate-limit a gutenberg.org (Redis SET NX EX)
         ├─ tenacity retry exponencial + circuit breaker
         ├─ Bulk UPSERT al terminar batches
         └─ structlog → Datadog · alertas en p99 / failure rate
```

## Cambios concretos

### Backend

```python
# new: app/workers/scrape_jobs.py
from arq import create_pool
from arq.connections import RedisSettings

async def scrape_reading_info_job(ctx, gutenberg_id: int):
    info = await _scrape_reading_info(gutenberg_id)
    if info["reading_ease"] is not None:
        await upsert_reading_info_many([_info_to_row(gutenberg_id, info)])
    return info

class WorkerSettings:
    functions = [scrape_reading_info_job]
    redis_settings = RedisSettings.from_dsn(os.environ["REDIS_URL"])
    max_jobs = 12  # global rate cap to gutenberg.org
```

### Endpoint

```python
@router.get("/reading-info/batch")
async def reading_info_batch(ids: str, ...):
    cached = await select_reading_info_many(id_list)
    missing = [i for i in id_list if i not in cached]

    if missing:
        pool = await create_pool(WorkerSettings.redis_settings)
        for gid in missing:
            # _job_id ensures dedupe: the same gid in queue twice = 1 job
            await pool.enqueue_job(
                "scrape_reading_info_job", gid, _job_id=f"scrape:{gid}"
            )

    return {
        "data": cached,
        "pending_ids": missing,
    }
```

### Frontend

```ts
// useReadingInfoBatch with polling
function useReadingInfoBatch(ids: number[]) {
  const [pending, setPending] = useState<number[]>([])

  const query = useQuery({
    queryKey: ["reading-info-batch", ids],
    queryFn: async ({ signal }) => {
      const r = await api.get<{data: Record<number, ReadingInfo>, pending_ids: number[]}>(
        `/api/v1/books/reading-info/batch?ids=${ids.join(",")}`,
        { signal }
      )
      setPending(r.pending_ids)
      return r.data
    },
    refetchInterval: pending.length > 0 ? 2000 : false,
    enabled: ids.length > 0,
  })

  return query
}
```

## Cuándo implementar

Triggers para empezar este trabajo:

1. p99 latency de `/reading-info/batch` > 5s sostenido
2. Despliegas a >1 pod (multi-instance)
3. >100 usuarios activos por hora
4. Gutendex/gutenberg.org te rate-limita por egress IP

## Esfuerzo estimado

- arq setup + worker file + Redis hosted: 3h
- Endpoint refactor + frontend polling: 2h
- Migration de in-flight Futures a Redis SET NX EX: 1h
- Smoke testing distribuido: 2h
- **Total: ~1 día de trabajo**

## Por qué no lo hacemos AHORA

- Requiere Redis (otro servicio gestionado, otra dependencia)
- El warmup actual cubre el 90% del tráfico real esperable
- Validation founder = single-instance es suficiente
- Si lo armamos pre-launch, lo over-engineer-eamos

Esperar al trigger explícito mantiene el código simple y el roadmap honesto.
