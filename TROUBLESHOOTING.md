# Troubleshooting Guide: Runner Stopped Working

## Проблема: Runner работал, но перестал выполнять действия

Если ваш runner на Railway раньше работал нормально, но потом перестал выполнять действия, следуйте этому руководству.

## Шаг 1: Проверьте логи Railway

### Откройте Railway Dashboard
1. Зайдите на [railway.app](https://railway.app)
2. Выберите проект с runner
3. Откройте вкладку "Deployments"
4. Нажмите на последний deployment
5. Откройте "View Logs"

### Что искать в логах:

#### ✅ Нормальные логи (runner работает):
```
[INFO] Session Framework Runner
[INFO] Runner ID: runner-railway-01
[INFO] Mode: API + HTTP
[INFO] HTTP API listening on port 3001
[INFO] Claimed job: abc123
[INFO] Navigating to: https://example.com
[INFO] Navigation complete
```

#### ❌ Проблема: Ошибки подключения к Supabase
```
[ERROR] API request failed: /jobs { error: 'TypeError: fetch failed' }
[ERROR] API request failed: /health { error: 'TypeError: fetch failed' }
```

**Причина:** Runner не может подключиться к Supabase API

**Решение:**
1. Проверьте переменную окружения `API_BASE_URL`:
   ```
   API_BASE_URL=https://[ваш-проект].supabase.co/functions/v1/session-api
   ```
2. Убедитесь, что Supabase Edge Functions развернуты
3. Проверьте, что Supabase проект активен (не на паузе)

#### ❌ Проблема: Browser crashed
```
[ERROR] Target crashed
[ERROR] Browser has been closed
browserType.launch: Target page, context or browser has been closed
```

**Причина:** Недостаточно памяти или браузер крашится

**Решение:**
1. Увеличьте память в Railway (Settings → Resources)
2. Уменьшите `MAX_CONCURRENCY` в env variables
3. Проверьте, что `HEADLESS=true` установлен

#### ❌ Проблема: No jobs available
```
[DEBUG] No jobs available
```

**Причина:** В очереди нет задач

**Решение:**
- Создайте задачу через UI
- Проверьте таблицу `execution_queue` в Supabase

## Шаг 2: Проверьте переменные окружения Railway

Зайдите в Settings → Variables и проверьте:

### Обязательные:
```env
API_BASE_URL=https://bmstbbpijhjdgwdtkmzx.supabase.co/functions/v1/session-api
HEADLESS=true
```

### Рекомендуемые:
```env
MAX_CONCURRENCY=3
LOG_LEVEL=info
HTTP_API_PORT=3001
```

## Шаг 3: Проверьте Supabase Edge Functions

### Откройте Supabase Dashboard
1. Зайдите на [supabase.com](https://supabase.com)
2. Откройте ваш проект
3. Edge Functions → Deployed Functions

### Проверьте, что развернуты:
- `session-api` - основной API для runner
- `agent-executor` - для автономного режима (если используется)

### Если функции не развернуты:
```bash
# Локально
cd supabase
supabase functions deploy session-api
```

## Шаг 4: Проверьте Supabase Database

### Откройте SQL Editor в Supabase

#### Проверка 1: Есть ли задачи в очереди?
```sql
SELECT * FROM execution_queue
WHERE claimed_by IS NULL
ORDER BY priority DESC, created_at ASC
LIMIT 10;
```

**Если пусто:** Создайте новую задачу через UI или API

#### Проверка 2: Есть ли зависшие задачи?
```sql
SELECT * FROM sessions
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '30 minutes';
```

**Если есть:** Сбросьте их статус:
```sql
UPDATE sessions
SET status = 'error',
    error = 'Timeout - reset by admin'
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '30 minutes';
```

#### Проверка 3: Работает ли runner heartbeat?
```sql
SELECT * FROM runner_health
WHERE runner_id = 'runner-railway-01'
ORDER BY last_heartbeat DESC
LIMIT 1;
```

**Если last_heartbeat старый:** Runner не отправляет heartbeat (проверьте логи Railway)

## Шаг 5: Тест runner через HTTP API

### Если Railway дает публичный URL:

```bash
# Health check
curl https://your-railway-url.railway.app/health

# Ожидаемый ответ:
{"status":"ok","browserActive":false,"currentUrl":null}
```

### Тест выполнения действия:
```bash
curl -X POST https://your-railway-url.railway.app/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "navigate",
    "url": "https://example.com"
  }'
```

## Шаг 6: Общие проблемы и решения

### Проблема: "Max concurrency reached"

**Причина:** Слишком много активных сессий

**Решение:**
1. Проверьте таблицу `scheduler_config`:
   ```sql
   SELECT * FROM scheduler_config;
   ```
2. Увеличьте `max_concurrency` или подождите завершения сессий

### Проблема: Медленное выполнение

**Причина:** Малоресурсов или сетевые задержки

**Решение:**
1. Увеличьте память/CPU в Railway
2. Проверьте логи на частые retry
3. Увеличьте timeout для действий

### Проблема: Действия не находят элементы

**Причина:** Селекторы изменились или страница не загрузилась

**Решение:**
1. Проверьте селекторы в сценарии
2. Добавьте `wait` действия перед click/type
3. Используйте более надежные селекторы (ID, data-testid)

## Шаг 7: Redeploy Runner

Если ничего не помогло:

### В Railway Dashboard:
1. Settings → Deployments
2. Нажмите "Redeploy" на последнем успешном deployment
3. Дождитесь завершения
4. Проверьте логи

### Через Git:
```bash
# Сделайте пустой коммит
git commit --allow-empty -m "Redeploy runner"
git push
```

## Шаг 8: Проверьте последние коммиты

Если проблема появилась после обновления кода:

```bash
# Посмотрите последние изменения
git log --oneline -10

# Проверьте, что изменилось в runner
git diff HEAD~5 HEAD -- runner/

# Если нужно откатиться
git revert HEAD
git push
```

## Чек-лист быстрой диагностики

- [ ] Railway logs показывают "HTTP API listening on port 3001"
- [ ] Нет ошибок "fetch failed" в логах
- [ ] API_BASE_URL правильный в Railway env vars
- [ ] HEADLESS=true установлен
- [ ] Supabase edge function `session-api` развернута
- [ ] В execution_queue есть незаявленные задачи
- [ ] runner_health показывает свежий heartbeat
- [ ] Нет зависших сессий в статусе 'running'
- [ ] Память Railway >= 2GB
- [ ] Supabase проект активен (не на паузе)

## Контакты для поддержки

Если проблема не решается:
1. Соберите логи Railway (последние 100 строк)
2. Сделайте screenshot Supabase Edge Functions status
3. Проверьте `execution_queue` и `sessions` tables
4. Создайте issue с этой информацией

## Дополнительные диагностические команды

### Проверка всех активных runner'ов:
```sql
SELECT
  runner_id,
  last_heartbeat,
  active_sessions,
  total_sessions_executed,
  total_failures,
  uptime_seconds
FROM runner_health
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
ORDER BY last_heartbeat DESC;
```

### Статистика выполнения задач:
```sql
SELECT
  status,
  COUNT(*) as count,
  AVG(execution_time_ms) as avg_time_ms
FROM sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

### Последние ошибки:
```sql
SELECT
  s.id,
  s.status,
  s.error,
  s.started_at,
  sc.name as scenario_name
FROM sessions s
LEFT JOIN scenarios sc ON s.scenario_id = sc.id
WHERE s.status = 'error'
ORDER BY s.created_at DESC
LIMIT 10;
```
