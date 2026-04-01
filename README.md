# StackAI Backend

Node.js/Express backend for the StackAI mobile app. Provides user authentication via Supabase Auth, CRUD endpoints for stacks, lab results, and cycles, and a secure proxy to Anthropic's Claude API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database / Auth | Supabase (PostgreSQL + Supabase Auth) |
| AI Proxy | Anthropic SDK → `claude-sonnet-4-20250514` |
| Security | Helmet, CORS, express-rate-limit |

---

## Project Structure

```
stackai-app/
├── src/
│   ├── index.js              # App entry point, middleware, route mounting
│   ├── config/
│   │   └── supabase.js       # Supabase public + service-role clients
│   ├── middleware/
│   │   └── auth.js           # JWT verification via Supabase Auth
│   └── routes/
│       ├── auth.js           # signup / login / logout / me
│       ├── stack.js          # stack CRUD
│       ├── labs.js           # lab results CRUD
│       ├── cycles.js         # cycles CRUD
│       └── chat.js           # Anthropic proxy (streaming + non-streaming)
├── supabase/
│   └── schema.sql            # Database schema + RLS policies
├── .env.example              # Environment variable template
├── package.json
└── README.md
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` key |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |

### 3. Set up the database

1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste the contents of `supabase/schema.sql` and run it

This creates the `stacks`, `lab_results`, and `cycles` tables with Row Level Security policies and updated_at triggers.

### 4. Run the server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:3000` by default.

---

## API Reference

All protected endpoints require the header:
```
Authorization: Bearer <supabase-access-token>
```

The access token is returned in the `session.access_token` field on login/signup.

---

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login, returns session |
| POST | `/api/auth/logout` | Yes | Invalidate session |
| GET | `/api/auth/me` | Yes | Get current user |

**Signup / Login body:**
```json
{ "email": "user@example.com", "password": "secret", "name": "Alice" }
```

---

### Stack

| Method | Path | Description |
|---|---|---|
| GET | `/api/stack` | List all stack items |
| POST | `/api/stack` | Add a stack item |
| PUT | `/api/stack/:id` | Update a stack item |
| DELETE | `/api/stack/:id` | Delete a stack item |

**POST body:**
```json
{
  "name": "Morning stack",
  "compound": "Creatine",
  "dose": 5,
  "unit": "g",
  "frequency": "daily",
  "notes": "With breakfast"
}
```

---

### Lab Results

| Method | Path | Description |
|---|---|---|
| GET | `/api/labs` | List all lab results |
| POST | `/api/labs` | Add a lab result |
| PUT | `/api/labs/:id` | Update a lab result |
| DELETE | `/api/labs/:id` | Delete a lab result |

**POST body:**
```json
{
  "test_name": "Total Testosterone",
  "value": 650,
  "unit": "ng/dL",
  "tested_at": "2026-03-01T08:00:00Z",
  "notes": "Fasted morning draw"
}
```

---

### Cycles

| Method | Path | Description |
|---|---|---|
| GET | `/api/cycles` | List all cycles |
| POST | `/api/cycles` | Create a cycle |
| PUT | `/api/cycles/:id` | Update a cycle |
| DELETE | `/api/cycles/:id` | Delete a cycle |

**POST body:**
```json
{
  "name": "Bulk cycle Q1 2026",
  "compounds": [
    { "name": "Testosterone Enanthate", "dose": 500, "unit": "mg", "frequency": "2x/week" }
  ],
  "start_date": "2026-01-01",
  "end_date": "2026-04-01",
  "notes": "First cycle"
}
```

---

### Chat (Anthropic Proxy)

| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Send a message to Claude |

**POST body:**
```json
{
  "messages": [
    { "role": "user", "content": "What does my testosterone level mean?" }
  ],
  "system": "You are a knowledgeable health assistant.",
  "stream": false
}
```

Set `"stream": true` to receive a Server-Sent Events response. Each event is a JSON-encoded Anthropic stream event; the final event is `[DONE]`.

**Rate limit:** 20 requests per minute per IP.

---

## Security Notes

- The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — never expose it to the client.
- RLS policies on all tables ensure users can only read/write their own data.
- The Anthropic API key is kept server-side only; the mobile app never sees it.
- Helmet sets secure HTTP headers on every response.
- Rate limiting protects both the server and the Anthropic API from abuse.
