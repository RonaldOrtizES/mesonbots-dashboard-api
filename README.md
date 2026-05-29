# 🏠 MesónBots API

Backend del Mesón — Node.js + TypeScript + Express, deployado en Vercel y conectado a Neon Postgres.

## 🛠️ Stack

- **Node.js 20+** + **TypeScript 5.6**
- **Express 4** — Framework HTTP
- **PostgreSQL** (Neon) con pool de conexiones
- **JWT** para autenticación
- **Zod** para validación de entrada
- **bcrypt** para hashing de contraseñas
- **Helmet** + **CORS** + **Rate limiting** para seguridad
- **Vercel Serverless Functions** para deploy

## 📁 Estructura

```
mesonbots-api/
├── api/
│   └── index.ts              # Entry point para Vercel (serverless)
├── src/
│   ├── server.ts             # Entry point para desarrollo local
│   ├── app.ts                # Configuración de Express
│   ├── config/
│   │   └── env.ts            # Variables de entorno validadas con Zod
│   ├── db/
│   │   ├── client.ts         # Pool de conexiones Postgres
│   │   └── seed.ts           # Datos de ejemplo
│   ├── middleware/
│   │   ├── auth.ts           # JWT middleware
│   │   └── error-handler.ts  # Manejo centralizado de errores
│   ├── modules/
│   │   ├── auth/             # Login, /me, cambio de contraseña
│   │   ├── dashboard/        # Resumen y métricas
│   │   ├── conversaciones/   # CRUD de chats
│   │   ├── citas/            # Agenda
│   │   ├── clientes/         # End customers
│   │   ├── personaje/        # Configuración del bot
│   │   ├── plan/             # Suscripción y facturas
│   │   ├── servicios/        # Servicios del negocio
│   │   └── webhooks/         # Meta y Twilio
│   ├── types/
│   │   └── index.ts          # Tipos compartidos
│   └── utils/
│       ├── jwt.ts            # Firmar/verificar tokens
│       └── responses.ts      # Respuestas estandarizadas
├── vercel.json               # Configuración de Vercel
├── tsconfig.json
├── package.json
└── .env.example
```

## 🚀 Quick start

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con:
- `DATABASE_URL` — Connection string de Neon (usá el del POOLER, con `-pooler` en el host)
- `JWT_SECRET` — Generá uno con: `openssl rand -base64 64`
- `META_VERIFY_TOKEN` — Inventá uno para validar webhooks de Meta

### 3. Ejecutar el schema de la DB

En Neon Console → SQL Editor, pegá el archivo `mesonbots-schema.sql` (el del backend anterior) y ejecutalo.

### 4. Poblar con datos de ejemplo

```bash
npm run seed
```

Esto crea:
- Tenant "Taller Don Beto"
- Usuario admin: `don.beto@taller.com` / `mesonbots2026`
- 10 clientes, 11 citas, 8 conversaciones, métricas, facturas

### 5. Correr en local

```bash
npm run dev
```

Servidor en `http://localhost:3000`

### 6. Probar

```bash
# Health check
curl http://localhost:3000/api/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"don.beto@taller.com","password":"mesonbots2026"}'

# Usá el token devuelto
curl http://localhost:3000/api/dashboard/resumen \
  -H "Authorization: Bearer TU_TOKEN_AQUI"
```

## 🌍 Deploy a Vercel

### Opción A: Desde CLI

```bash
npm i -g vercel
vercel login
vercel
```

### Opción B: Desde GitHub

1. Subí el código a un repo de GitHub
2. En [vercel.com](https://vercel.com) → Add New Project → Import el repo
3. Configurá las variables de entorno (todas las de `.env.example`)
4. Deploy

### Variables de entorno en Vercel

En el dashboard de Vercel → Settings → Environment Variables, agregá:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Tu connection string de Neon (CON `-pooler`) |
| `JWT_SECRET` | String aleatorio largo |
| `JWT_EXPIRES_IN` | `7d` |
| `META_VERIFY_TOKEN` | Inventalo |
| `META_ACCESS_TOKEN` | De Meta for Developers |
| `META_PHONE_NUMBER_ID` | De Meta for Developers |
| `ANTHROPIC_API_KEY` | De console.anthropic.com |
| `CORS_ORIGINS` | `https://mesonbots.com,https://app.mesonbots.com` |
| `NODE_ENV` | `production` |

## 📡 Endpoints

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login (público) |
| GET | `/api/auth/me` | Datos del usuario actual |
| POST | `/api/auth/change-password` | Cambiar contraseña |

### Dashboard
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/dashboard/resumen` | Métricas resumen |
| GET | `/api/dashboard/metricas?dias=7` | Métricas de los últimos N días |

### Conversaciones
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/conversaciones` | Lista con filtros |
| GET | `/api/conversaciones/:id` | Detalle |
| GET | `/api/conversaciones/:id/mensajes` | Mensajes del chat |
| PATCH | `/api/conversaciones/:id/estado` | Cambiar estado |

### Citas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/citas?desde=...&hasta=...` | Lista filtrada |
| POST | `/api/citas` | Crear cita |
| PATCH | `/api/citas/:id` | Actualizar |
| DELETE | `/api/citas/:id` | Cancelar |

### Clientes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/clientes` | Lista |
| GET | `/api/clientes/:id` | Detalle |
| PATCH | `/api/clientes/:id` | Actualizar |

### Personaje
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/personaje` | Tu vecino actual |
| PATCH | `/api/personaje` | Editar (nombre custom, prompt, horarios) |
| GET | `/api/personaje/disponibles` | Todos los personajes del Mesón |

### Plan
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/plan` | Suscripción activa |
| GET | `/api/plan/facturas` | Historial de facturas |
| GET | `/api/plan/planes-disponibles` | Planes ofrecidos |

### Servicios
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/servicios` | Lista de servicios del negocio |
| POST | `/api/servicios` | Crear servicio |
| PATCH | `/api/servicios/:id` | Editar |
| DELETE | `/api/servicios/:id` | Desactivar |

### Webhooks
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/webhook/meta` | Eventos de WhatsApp |
| POST | `/webhook/twilio/sms` | SMS entrantes (verificación) |
| POST | `/webhook/twilio/voice` | Llamadas |

## 🔒 Autenticación

Todos los endpoints excepto `/api/auth/login`, `/api/health` y `/webhook/*` requieren JWT.

Envía el token en el header:
```
Authorization: Bearer <tu_jwt_aqui>
```

El token incluye: `userId`, `tenantId`, `email`, `role`.

Todos los queries filtran automáticamente por `tenant_id` del JWT — **multi-tenancy garantizado**.

## 🧪 Probar con curl

```bash
# 1. Login y guardar token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"don.beto@taller.com","password":"mesonbots2026"}' \
  | jq -r '.data.token')

# 2. Usarlo en requests subsecuentes
curl http://localhost:3000/api/dashboard/resumen \
  -H "Authorization: Bearer $TOKEN" | jq

curl http://localhost:3000/api/conversaciones \
  -H "Authorization: Bearer $TOKEN" | jq

curl http://localhost:3000/api/citas \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 🔌 Conectar el dashboard de Angular

En el frontend, reemplazá el `MockDataService` por llamadas a esta API:

```typescript
// src/app/core/services/api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

const API_URL = 'https://mesonbots-api.vercel.app'; // o tu URL real

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private get headers() {
    const token = localStorage.getItem('mesonbots_token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  getResumen() {
    return this.http.get(`${API_URL}/api/dashboard/resumen`, { headers: this.headers });
  }

  // ... etc
}
```

## ⚠️ Consideraciones para Vercel serverless

1. **Cold starts**: La primera invocación tras inactividad tarda 1-2 segundos. Para webhooks críticos de WhatsApp, considerá usar Vercel Cron Jobs para mantener "caliente".

2. **Conexiones a DB**: Usá SIEMPRE el connection string del **pooler de Neon** (`-pooler` en el host). El pool en `db/client.ts` está configurado con `max: 5` para no agotar conexiones.

3. **Timeout**: Plan Hobby permite 10s por request, plan Pro 60s. Si necesitás más, migrá a Fly.io.

4. **No hay procesos background**: Para crons (envío de recordatorios, agregación de métricas), usá Vercel Cron Jobs:
   ```json
   // vercel.json
   "crons": [
     { "path": "/api/cron/recordatorios", "schedule": "0 9 * * *" }
   ]
   ```

5. **Webhooks de Meta**: Si tenés alto volumen (>100 mensajes/min), Vercel puede no ser ideal. Considerá mover los webhooks a Fly.io.

## 🐛 Troubleshooting

**Error: "JWT_SECRET debe tener al menos 32 caracteres"**
→ Generá uno largo: `openssl rand -base64 64`

**Error: "ECONNREFUSED" al conectar a Neon**
→ Verificá que `DATABASE_URL` use el `-pooler` y tenga `sslmode=require`

**Error: "Too many connections"**
→ Estás usando el endpoint directo en vez del pooler. Cambialo.

**CORS bloqueado en el frontend**
→ Agregá tu dominio a `CORS_ORIGINS` en las env vars

## 📜 Filosofía

> "No son bots. Son vecinos."

Este backend es la voz del Mesón. Cada query, cada endpoint, cada error está pensado para que los vecinos (Don Tito, Niña Carmen, Doc Pelusa) sigan atendiendo el WhatsApp del negocio sin que el dueño se preocupe por nada.

Hecho con orgullo salvadoreño 🇸🇻
