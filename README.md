# Campus Office Hours Booking API

A robust, timezone-aware campus office-hour booking API built with TypeScript, Node.js, Express, and PostgreSQL using a strict Three-Tier Layered Architecture and the Repository Pattern with Dependency Injection.

---

## 🏛 Architecture & Design Patterns

The system enforces a clean three-tier architecture that completely decouples business logic from data access and presentation layers:

```
┌────────────────────────────────────────────────────────┐
│                   Presentation Layer                   │
│   (Express Controllers & Routes, HTTP Parsing & Status)│
└───────────────────────────┬────────────────────────────┘
                            │ Calls methods with DTOs
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Business Logic Layer                  │
│       (BookingService, DST & Timezone Validation)       │
└───────────────────────────┬────────────────────────────┘
                            │ Depends only on Interface
                            ▼
┌────────────────────────────────────────────────────────┐
│                Data Access Interface                   │
│                 IBookingRepository                     │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
       Implemented by           Implemented by
                │                        │
┌───────────────┴────────┐      ┌────────┴───────────────┐
│ PostgresBookingRepository│    │  MockBookingRepository │
│      (TypeORM / SQL)   │      │     (In-Memory)        │
└───────────────┬────────┘      └────────────────────────┘
                │ (Executes SQL)
                ▼
┌────────────────────────┐
│  PostgreSQL Database   │
│ (office_hour_bookings) │
└────────────────────────┘
```

### Key Architectural Characteristics
- **Dependency Injection**: The `BookingService` accepts any implementation of `IBookingRepository` through its constructor. It has no dependency on PostgreSQL or TypeORM.
- **Mock Repository & Fast Unit Tests**: Unit tests inject `MockBookingRepository` directly into `BookingService`, executing in milliseconds without any database connection or network overhead.
- **Swappability**: The persistence layer can be swapped out without altering any business logic or service tests.

---

## 🕒 Timezone and Date Handling

Scheduling across multiple regions requires meticulous timezone handling:

1. **Normalized UTC Storage**: All booking start times are converted to Coordinated Universal Time (UTC) and stored in a PostgreSQL `TIMESTAMPTZ` column (`starts_at_utc`). UTC does not observe Daylight Saving Time, eliminating timezone-dependent query bugs.
2. **Original Timezone Preservation**: The user's requested IANA timezone (e.g. `America/New_York`, `America/Chicago`) is persisted in the `original_timezone` column.
3. **ISO-8601 with Offsets on Read**: When bookings are retrieved, the UTC instant is converted back to the booking's `original_timezone` and formatted into an ISO-8601 string that explicitly includes the offset (e.g., `2024-10-15T10:00:00-05:00`), never ending in raw `Z`.
4. **DST "Spring Forward" Gap Validation**: When clocks skip forward (such as on March 10, 2024 at 02:00 in `America/New_York`, where local time jumped to 03:00), local times such as `2024-03-10T02:30:00` do not exist. The API detects this gap and returns `400 Bad Request` with an explanatory error message.
5. **DST "Fall Back" Ambiguity Handling**: When clocks fall back (such as on November 3, 2024 at 02:00 in `America/New_York`, returning to 01:00), local times between 01:00 and 02:00 occur twice. The API resolves this to the earlier occurrence (Daylight Time, `-04:00` EDT) without crashing.
6. **Cross-Timezone Overlap Detection**: Overlap checks normalize both booking intervals to absolute UTC instants before applying interval intersection:
   $$\text{Overlap} \iff (\text{start}_A < \text{end}_B) \land (\text{end}_A > \text{start}_B)$$
   Adjacent bookings (where $\text{end}_A = \text{start}_B$) do not overlap.

---

## 🗄 Database Schema

The database table is named `office_hour_bookings`:

```sql
CREATE TABLE office_hour_bookings (
    id SERIAL PRIMARY KEY,
    professor_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    starts_at_utc TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL,
    original_timezone VARCHAR(100) NOT NULL
);
```

Columns:
| Column Name | SQL Type | Description |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Auto-incrementing unique identifier |
| `professor_id` | `VARCHAR(255) NOT NULL` | Professor identifier |
| `student_id` | `VARCHAR(255) NOT NULL` | Student identifier |
| `starts_at_utc` | `TIMESTAMPTZ NOT NULL` | Instant stored strictly in UTC |
| `duration_minutes` | `INTEGER NOT NULL` | Duration of office hours booking in minutes |
| `original_timezone` | `VARCHAR(100) NOT NULL` | IANA timezone string (e.g. `America/New_York`) |

---

## 🚀 Running with Docker Compose

To start the entire containerized environment with automated schema migration:

```bash
docker-compose up -d
```

This starts:
- `db`: PostgreSQL 15 database on port `5432` with health checks and auto-seeding from `scripts/init.sql`.
- `api`: Application server on port `3000` waiting for database health check before listening.

To inspect logs:
```bash
docker-compose logs -f
```

To stop:
```bash
docker-compose down
```

---

## 💻 Running Locally

### Prerequisites
- Node.js >= 18
- PostgreSQL >= 14 (or use Docker for PostgreSQL)

### Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Build project
npm run build

# 4. Start production server
npm start

# Or start in development mode with ts-node
npm run dev
```

---

## 🧪 Testing

### 1. Run Unit Tests (In-Memory Mock Repository)
Verifies service logic and architectural decoupling without hitting a database:
```bash
npm run test:unit
```

### 2. Run Integration Tests
Verifies HTTP endpoints, request schema validation, status codes, and error formatting:
```bash
npm run test:integration
```

### 3. Run All Tests
```bash
npm test
```

---

## 📡 API Reference

### 1. Create a Booking
- **Method**: `POST /api/bookings`
- **Headers**: `Content-Type: application/json`

#### Request Body
```json
{
  "professor_id": "prof_oak",
  "student_id": "ash_ketchum",
  "local_start_time": "2024-10-15T10:00:00",
  "timezone": "America/Chicago",
  "duration_minutes": 30
}
```

#### Response: `201 Created`
```json
{
  "id": 1,
  "professor_id": "prof_oak",
  "student_id": "ash_ketchum",
  "starts_at": "2024-10-15T10:00:00-05:00",
  "duration_minutes": 30
}
```

#### Error Responses
- `400 Bad Request`:
  - When local time falls in a Daylight Saving Time spring-forward gap (e.g. `2024-03-10T02:30:00` in `America/New_York`).
  - When timezone is not a valid IANA zone string.
  - When duration is <= 0 or not an integer.
  - When required fields are missing or malformed.
- `409 Conflict`:
  - When another booking overlaps with the requested interval for the same professor.

---

### 2. Retrieve Bookings by Professor
- **Method**: `GET /api/bookings?professor_id={id}`

#### Response: `200 OK`
```json
[
  {
    "id": 1,
    "professor_id": "prof_oak",
    "student_id": "ash_ketchum",
    "starts_at": "2024-10-15T10:00:00-05:00",
    "duration_minutes": 30
  }
]
```

---

### 3. Health Check
- **Method**: `GET /health`
- **Response**: `200 OK`
```json
{
  "status": "ok"
}
```

---

## 📁 Repository Structure

```
├── src/
│   ├── controllers/
│   │   └── BookingController.ts       # HTTP request parsing, status codes, response formatting
│   ├── services/
│   │   └── BookingService.ts          # Business logic, overlap validation, DST rules
│   ├── repositories/
│   │   ├── IBookingRepository.ts      # Repository interface (Domain Contract)
│   │   ├── PostgresBookingRepository.ts # Database repository implementation
│   │   └── MockBookingRepository.ts   # In-memory repository for unit tests
│   ├── entities/
│   │   └── BookingEntity.ts           # TypeORM entity and domain Booking type
│   ├── utils/
│   │   └── timezone.ts                # Timezone parsing, DST gap check, offset formatting
│   ├── app.ts                         # Express application factory with DI
│   ├── database.ts                    # TypeORM DataSource & connection initializer
│   └── index.ts                       # Application bootstrap and server entry point
├── tests/
│   ├── unit/
│   │   └── BookingService.test.ts     # Service layer unit tests with MockRepository
│   └── integration/
│       └── BookingController.test.ts  # Controller HTTP contract tests
├── scripts/
│   └── init.sql                       # PostgreSQL schema initialization script
├── Dockerfile                         # Multi-stage container build
├── docker-compose.yml                 # Service definitions for db and api
├── .env.example                       # Documented environment variables
├── package.json
└── tsconfig.json
```
