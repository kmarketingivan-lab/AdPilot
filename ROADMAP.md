# ADPILOT — ROADMAP DEFINITIVA v3

## Panoramica Progetto

**AdPilot** è un Digital Marketing Hub self-hosted che unifica in un'unica piattaforma:
- Social Media Manager (pubblicazione multi-piattaforma)
- Dashboard Analytics unificata (GA4, Google Ads, Meta Ads)
- AI Ads Copy & Creative Generator (Claude API)
- CRM + Email Automation (Amazon SES)
- Heatmap & Session Recording

**Landing Page Builder** è coperto dal progetto **Webby** (già esistente).

---

## Decisioni Architetturali

```
┌─────────────────────────────────┬─────────────────────────────────┐
│  DECISIONE                      │  SCELTA                         │
├─────────────────────────────────┼─────────────────────────────────┤
│  Nome progetto                  │  AdPilot                        │
│  Database                       │  PostgreSQL self-hosted (Docker)│
│  Social publishing engine       │  Migrazione in Next.js (no n8n) │
│  Email service                  │  Amazon SES (già attivo)        │
│  File storage                   │  Cloudinary                     │
│  Hosting                        │  Self-hosted VPS + Docker       │
│  Redis                          │  Self-hosted (Docker)           │
│  Ordine moduli                  │  Social→Dashboard→Ads→CRM→Heat │
│  Pricing                        │  Free/$19/$49/$99               │
└─────────────────────────────────┴─────────────────────────────────┘
```

---

## Asset Esistenti Integrati

```
┌───────────────────────────────┬────────────────────────────────────┐
│  ASSET ESISTENTE              │  COSA COPRE NEL HUB               │
├───────────────────────────────┼────────────────────────────────────┤
│  Webby (Python, 17.4K LOC)   │  Landing Page Builder              │
│  - Genera siti Next.js 15    │  - 15 tipi piattaforma             │
│  - 35+ features              │  - Genera da prompt italiano       │
│  - Multi-API fallback        │  - Validazione + auto-fix          │
│  - 75 cataloghi tecnici      │  - Produzione-ready                │
├───────────────────────────────┼────────────────────────────────────┤
│  La Grande Automazione (n8n)  │  Social Media Publishing Engine    │
│  - Pubblica IG + FB + LI     │  - Logica da migrare in TypeScript │
│  - Token manager autonomo    │  - Upload Cloudinary               │
│  - Email notifiche           │  - Caption + hashtag               │
│  - Analytics base            │  - Retry + error handling          │
├───────────────────────────────┼────────────────────────────────────┤
│  Automazione-DeepSeek         │  Template & Content Generation     │
│  - 4 worker paralleli CDP    │  - Generazione bulk template       │
│  - 75 cataloghi (9.2 MB)     │  - Riusabile per email templates   │
│  - Anti-detection            │  - Riusabile per ad copy library   │
│  - Quality grading           │  - Riusabile per workflow templates│
└───────────────────────────────┴────────────────────────────────────┘
```

---

## Architettura Finale

```
                          VPS (Docker Compose)
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              ADPILOT (Next.js 15)                     │  │
│  │                                                       │  │
│  │  ┌─────────┐ ┌──────┐ ┌─────┐ ┌─────┐ ┌───┐ ┌─────┐│  │
│  │  │ Social  │ │Dashb.│ │ Ads │ │ CRM │ │EM │ │Heat ││  │
│  │  │ Manager │ │Analyt│ │ AI  │ │     │ │AIL│ │ map ││  │
│  │  └────┬────┘ └──┬───┘ └──┬──┘ └──┬──┘ └─┬─┘ └──┬──┘│  │
│  │       │         │        │       │       │      │    │  │
│  │  ┌────┴─────────┴────────┴───────┴───────┴──────┴──┐ │  │
│  │  │              tRPC API Layer                      │ │  │
│  │  └──────────────────┬───────────────────────────────┘ │  │
│  │                     │                                 │  │
│  │  ┌─────────┐  ┌─────┴─────┐  ┌───────────────────┐   │  │
│  │  │ NextAuth│  │  BullMQ   │  │  Social Publisher  │   │  │
│  │  │  v5     │  │  Workers  │  │  (ex n8n logic)    │   │  │
│  │  └─────────┘  └───────────┘  └───────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│  ┌───────────┐    ┌──────┴──────┐                          │
│  │PostgreSQL │    │    Redis    │                          │
│  │  (Prisma) │    │   (BullMQ) │                          │
│  └───────────┘    └─────────────┘                          │
│                                                             │
│  ┌─────────────────────┐                                   │
│  │  Nginx (reverse     │ ← SSL Let's Encrypt              │
│  │  proxy + static)    │ ← Dominio adpilot.tuodominio.com │
│  └─────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
   ┌──────────┐  ┌───────────┐  ┌──────────┐
   │Cloudinary│  │Amazon SES │  │Claude API│
   │ (media)  │  │  (email)  │  │   (AI)   │
   └──────────┘  └───────────┘  └──────────┘
```

---

## Docker Compose

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    build: .
    command: node dist/worker.js
    env_file: .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: adpilot
      POSTGRES_USER: adpilot
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - certdata:/etc/letsencrypt
    depends_on:
      - app
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  certdata:
```

---

## Stack Tecnologico Completo

### Core
```
next@15                        react@19                    typescript@5.5+
```

### Database & Cache
```
prisma@6                       @prisma/client              ioredis
bullmq                         (PostgreSQL 16, Redis 7)
```

### Auth
```
next-auth@5                    @auth/prisma-adapter
```

### UI
```
tailwindcss@4                  @radix-ui/* (via shadcn)    lucide-react
class-variance-authority       clsx                        tailwind-merge
sonner                         cmdk
```

### API
```
@trpc/server@11                @trpc/client@11             @trpc/react-query@11
@tanstack/react-query@5        zod
```

### AI
```
@anthropic-ai/sdk              ai (Vercel AI SDK)
```

### Servizi esterni
```
@aws-sdk/client-ses            @aws-sdk/client-sesv2       cloudinary
googleapis                     stripe
```

### UI specializzata
```
recharts                       @tanstack/react-table       react-big-calendar
@dnd-kit/core                  @dnd-kit/sortable           reactflow
react-dropzone                 date-fns                    @react-email/components
rrweb                          rrweb-player
```

### Utility
```
csv-parse                      jspdf                       html2canvas
xlsx
```

### Dev
```
eslint                         prettier                    vitest
@testing-library/react         playwright                  msw
tsx                            prisma (CLI)
```

---

## Struttura Progetto

```
adpilot/
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── overview/page.tsx
│   │   │   ├── social/
│   │   │   │   ├── page.tsx              # Calendario
│   │   │   │   ├── compose/page.tsx      # Composer
│   │   │   │   ├── accounts/page.tsx     # Account connessi
│   │   │   │   └── library/page.tsx      # Media library
│   │   │   ├── analytics/
│   │   │   │   ├── page.tsx              # Dashboard principale
│   │   │   │   ├── campaigns/page.tsx    # Tabella campagne
│   │   │   │   └── reports/page.tsx      # Report generator
│   │   │   ├── ads/
│   │   │   │   ├── page.tsx              # Campaign list
│   │   │   │   ├── generate/page.tsx     # AI copy generator
│   │   │   │   ├── preview/page.tsx      # Ad preview
│   │   │   │   └── library/page.tsx      # Copy library
│   │   │   ├── crm/
│   │   │   │   ├── page.tsx              # Contact list
│   │   │   │   ├── [id]/page.tsx         # Contact detail
│   │   │   │   ├── pipeline/page.tsx     # Kanban board
│   │   │   │   └── import/page.tsx       # CSV import
│   │   │   ├── email/
│   │   │   │   ├── page.tsx              # Campaign list
│   │   │   │   ├── compose/page.tsx      # Email builder
│   │   │   │   ├── automations/page.tsx  # Workflow editor
│   │   │   │   └── lists/page.tsx        # List management
│   │   │   ├── heatmap/
│   │   │   │   ├── page.tsx              # Site list
│   │   │   │   ├── [siteId]/page.tsx     # Heatmap viewer
│   │   │   │   └── sessions/page.tsx     # Session replay list
│   │   │   └── settings/
│   │   │       ├── page.tsx              # General
│   │   │       ├── billing/page.tsx      # Piani & fatturazione
│   │   │       ├── team/page.tsx         # Membri workspace
│   │   │       └── integrations/page.tsx # API keys & connessioni
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── webhooks/
│   │       │   ├── stripe/route.ts
│   │       │   ├── ses/route.ts
│   │       │   └── ads/route.ts
│   │       └── tracking/route.ts
│   ├── components/
│   │   ├── ui/                           # shadcn/ui
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── topbar.tsx
│   │   │   └── breadcrumb.tsx
│   │   ├── social/
│   │   ├── analytics/
│   │   ├── ads/
│   │   ├── crm/
│   │   ├── email/
│   │   └── heatmap/
│   ├── server/
│   │   ├── db.ts
│   │   ├── auth.ts
│   │   ├── trpc/
│   │   │   ├── init.ts
│   │   │   ├── router.ts
│   │   │   ├── social.ts
│   │   │   ├── analytics.ts
│   │   │   ├── ads.ts
│   │   │   ├── crm.ts
│   │   │   ├── email.ts
│   │   │   └── heatmap.ts
│   │   ├── queue/
│   │   │   ├── connection.ts
│   │   │   ├── queues.ts
│   │   │   └── workers/
│   │   │       ├── social-publisher.ts
│   │   │       ├── email-sender.ts
│   │   │       ├── analytics-sync.ts
│   │   │       ├── report-generator.ts
│   │   │       └── token-refresher.ts
│   │   └── services/
│   │       ├── social/
│   │       │   ├── meta.ts
│   │       │   ├── linkedin.ts
│   │       │   ├── twitter.ts
│   │       │   ├── tiktok.ts
│   │       │   └── token-manager.ts
│   │       ├── ads/
│   │       │   ├── google-ads.ts
│   │       │   └── meta-ads.ts
│   │       ├── analytics/
│   │       │   ├── ga4.ts
│   │       │   ├── google-ads.ts
│   │       │   └── meta-ads.ts
│   │       ├── email/
│   │       │   ├── ses.ts
│   │       │   └── automation-engine.ts
│   │       ├── ai/
│   │       │   ├── claude.ts
│   │       │   ├── copy-generator.ts
│   │       │   └── insights.ts
│   │       ├── media/
│   │       │   └── cloudinary.ts
│   │       └── billing/
│   │           └── stripe.ts
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── constants.ts
│   │   └── encryption.ts
│   ├── hooks/
│   │   ├── use-workspace.ts
│   │   └── use-realtime.ts
│   └── types/
│       └── index.ts
├── worker/
│   └── index.ts
├── tracking-script/
│   └── tracker.js
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## Schema Prisma Completo

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ═══════════════════════════════════════
// AUTH & MULTI-TENANT
// ═══════════════════════════════════════

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  role          Role      @default(USER)
  createdAt     DateTime  @default(now())
  workspaces    WorkspaceMember[]
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Workspace {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  plan            Plan     @default(FREE)
  createdAt       DateTime @default(now())
  members         WorkspaceMember[]
  socialAccounts  SocialAccount[]
  posts           Post[]
  campaigns       Campaign[]
  contacts        Contact[]
  emailLists      EmailList[]
  heatmapSites    HeatmapSite[]
  adsConnections  AdsConnection[]
  mediaFiles      MediaFile[]
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  role        WorkspaceRole @default(MEMBER)
  userId      String
  workspaceId String
  user        User          @relation(fields: [userId], references: [id])
  workspace   Workspace     @relation(fields: [workspaceId], references: [id])
  @@unique([userId, workspaceId])
}

// ═══════════════════════════════════════
// SOCIAL MEDIA
// ═══════════════════════════════════════

model SocialAccount {
  id             String    @id @default(cuid())
  platform       Platform
  accountName    String
  accountId      String
  accessToken    String
  refreshToken   String?
  tokenExpiresAt DateTime?
  metadata       Json?
  workspaceId    String
  workspace      Workspace @relation(fields: [workspaceId], references: [id])
  posts          PostPlatform[]
  @@unique([platform, accountId, workspaceId])
}

model Post {
  id            String      @id @default(cuid())
  content       String
  hashtags      String[]
  scheduledAt   DateTime?
  publishedAt   DateTime?
  status        PostStatus  @default(DRAFT)
  aiGenerated   Boolean     @default(false)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  workspaceId   String
  workspace     Workspace   @relation(fields: [workspaceId], references: [id])
  platforms     PostPlatform[]
  mediaFiles    PostMedia[]
}

model PostPlatform {
  id              String     @id @default(cuid())
  platform        Platform
  externalPostId  String?
  status          PostStatus @default(DRAFT)
  error           String?
  impressions     Int        @default(0)
  clicks          Int        @default(0)
  likes           Int        @default(0)
  comments        Int        @default(0)
  shares          Int        @default(0)
  reach           Int        @default(0)
  postId          String
  post            Post       @relation(fields: [postId], references: [id])
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id])
  @@unique([postId, platform])
}

model PostMedia {
  id        String    @id @default(cuid())
  postId    String
  post      Post      @relation(fields: [postId], references: [id])
  mediaId   String
  media     MediaFile @relation(fields: [mediaId], references: [id])
  sortOrder Int       @default(0)
}

model MediaFile {
  id          String    @id @default(cuid())
  filename    String
  url         String
  cdnUrl      String?
  mimeType    String
  size        Int
  width       Int?
  height      Int?
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  posts       PostMedia[]
  createdAt   DateTime  @default(now())
}

// ═══════════════════════════════════════
// ADS (Google + Meta)
// ═══════════════════════════════════════

model AdsConnection {
  id             String      @id @default(cuid())
  platform       AdsPlatform
  accountId      String
  accountName    String?
  accessToken    String
  refreshToken   String
  tokenExpiresAt DateTime?
  workspaceId    String
  workspace      Workspace   @relation(fields: [workspaceId], references: [id])
  campaigns      Campaign[]
  @@unique([platform, accountId, workspaceId])
}

model Campaign {
  id            String          @id @default(cuid())
  externalId    String?
  name          String
  platform      AdsPlatform
  status        CampaignStatus  @default(DRAFT)
  objective     String?
  budget        Float?
  budgetType    BudgetType      @default(DAILY)
  startDate     DateTime?
  endDate       DateTime?
  workspaceId   String
  workspace     Workspace       @relation(fields: [workspaceId], references: [id])
  connectionId  String
  connection    AdsConnection   @relation(fields: [connectionId], references: [id])
  creatives     AdCreative[]
  metrics       CampaignMetric[]
}

model AdCreative {
  id             String         @id @default(cuid())
  headline       String
  description    String
  imageUrl       String?
  videoUrl       String?
  ctaText        String?
  destinationUrl String?
  aiGenerated    Boolean        @default(false)
  status         CreativeStatus @default(DRAFT)
  campaignId     String
  campaign       Campaign       @relation(fields: [campaignId], references: [id])
  metrics        CreativeMetric[]
}

model CampaignMetric {
  id            String   @id @default(cuid())
  date          DateTime @db.Date
  impressions   Int      @default(0)
  clicks        Int      @default(0)
  conversions   Int      @default(0)
  spend         Float    @default(0)
  cpc           Float?
  ctr           Float?
  cpa           Float?
  roas          Float?
  campaignId    String
  campaign      Campaign @relation(fields: [campaignId], references: [id])
  @@unique([campaignId, date])
}

model CreativeMetric {
  id            String   @id @default(cuid())
  date          DateTime @db.Date
  impressions   Int      @default(0)
  clicks        Int      @default(0)
  conversions   Int      @default(0)
  spend         Float    @default(0)
  creativeId    String
  creative      AdCreative @relation(fields: [creativeId], references: [id])
  @@unique([creativeId, date])
}

// ═══════════════════════════════════════
// CRM
// ═══════════════════════════════════════

model Contact {
  id            String        @id @default(cuid())
  email         String
  firstName     String?
  lastName      String?
  phone         String?
  company       String?
  jobTitle      String?
  source        LeadSource?
  stage         PipelineStage @default(LEAD)
  score         Int           @default(0)
  tags          String[]
  customFields  Json?
  avatarUrl     String?
  workspaceId   String
  workspace     Workspace     @relation(fields: [workspaceId], references: [id])
  activities    Activity[]
  emailEvents   EmailEvent[]
  notes         ContactNote[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  @@unique([email, workspaceId])
}

model ContactNote {
  id        String   @id @default(cuid())
  content   String
  contactId String
  contact   Contact  @relation(fields: [contactId], references: [id])
  createdAt DateTime @default(now())
}

model Activity {
  id          String       @id @default(cuid())
  type        ActivityType
  description String?
  metadata    Json?
  contactId   String
  contact     Contact      @relation(fields: [contactId], references: [id])
  createdAt   DateTime     @default(now())
}

// ═══════════════════════════════════════
// EMAIL AUTOMATION
// ═══════════════════════════════════════

model EmailList {
  id            String    @id @default(cuid())
  name          String
  description   String?
  workspaceId   String
  workspace     Workspace @relation(fields: [workspaceId], references: [id])
  subscribers   EmailSubscriber[]
  campaigns     EmailCampaign[]
}

model EmailSubscriber {
  id        String           @id @default(cuid())
  email     String
  status    SubscriberStatus @default(ACTIVE)
  listId    String
  list      EmailList        @relation(fields: [listId], references: [id])
  createdAt DateTime         @default(now())
  @@unique([email, listId])
}

model EmailCampaign {
  id          String              @id @default(cuid())
  name        String
  subject     String
  preheader   String?
  htmlContent String
  status      EmailCampaignStatus @default(DRAFT)
  scheduledAt DateTime?
  sentAt      DateTime?
  listId      String
  list        EmailList           @relation(fields: [listId], references: [id])
  events      EmailEvent[]
}

model EmailEvent {
  id         String         @id @default(cuid())
  type       EmailEventType
  contactId  String?
  contact    Contact?       @relation(fields: [contactId], references: [id])
  campaignId String
  campaign   EmailCampaign  @relation(fields: [campaignId], references: [id])
  metadata   Json?
  createdAt  DateTime       @default(now())
}

model EmailAutomation {
  id          String   @id @default(cuid())
  name        String
  trigger     Json
  steps       Json
  active      Boolean  @default(false)
  workspaceId String
  createdAt   DateTime @default(now())
}

// ═══════════════════════════════════════
// HEATMAP & SESSION RECORDING
// ═══════════════════════════════════════

model HeatmapSite {
  id          String    @id @default(cuid())
  domain      String
  trackingId  String    @unique @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  sessions    HeatmapSession[]
}

model HeatmapSession {
  id           String    @id @default(cuid())
  visitorId    String
  userAgent    String?
  screenWidth  Int
  screenHeight Int
  pageUrl      String
  duration     Int?
  siteId       String
  site         HeatmapSite @relation(fields: [siteId], references: [id])
  events       HeatmapEvent[]
  recording    Json?
  startedAt    DateTime  @default(now())
}

model HeatmapEvent {
  id          String           @id @default(cuid())
  type        HeatmapEventType
  x           Int
  y           Int
  scrollDepth Float?
  element     String?
  sessionId   String
  session     HeatmapSession   @relation(fields: [sessionId], references: [id])
  timestamp   DateTime         @default(now())
}

// ═══════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════

enum Role             { USER ADMIN }
enum Plan             { FREE STARTER PRO AGENCY }
enum WorkspaceRole    { OWNER ADMIN MEMBER VIEWER }
enum Platform         { FACEBOOK INSTAGRAM LINKEDIN TWITTER TIKTOK YOUTUBE }
enum PostStatus       { DRAFT REVIEW APPROVED SCHEDULED PUBLISHING PUBLISHED FAILED }
enum AdsPlatform      { GOOGLE_ADS META_ADS }
enum CampaignStatus   { DRAFT ACTIVE PAUSED COMPLETED ARCHIVED }
enum BudgetType       { DAILY LIFETIME }
enum CreativeStatus   { DRAFT ACTIVE PAUSED WINNER LOSER }
enum LeadSource       { ORGANIC PAID_SEARCH PAID_SOCIAL REFERRAL DIRECT EMAIL WEBINAR OTHER }
enum PipelineStage    { LEAD MQL SQL OPPORTUNITY CUSTOMER LOST }
enum ActivityType     { EMAIL_SENT EMAIL_OPENED PAGE_VIEW AD_CLICK FORM_SUBMIT NOTE CALL MEETING STAGE_CHANGE }
enum SubscriberStatus { ACTIVE UNSUBSCRIBED BOUNCED }
enum EmailCampaignStatus { DRAFT SCHEDULED SENDING SENT CANCELLED }
enum EmailEventType   { SENT DELIVERED OPENED CLICKED BOUNCED UNSUBSCRIBED COMPLAINED }
enum HeatmapEventType { CLICK SCROLL MOUSEMOVE RAGE_CLICK DEAD_CLICK }
```

---

## FASE 0 — Foundation (Settimane 1-2)

### Task

| # | Task | Dettaglio | Ore |
|---|------|-----------|-----|
| 0.1 | ~~Init Next.js 15~~ | App Router, TS strict, Tailwind v4 | 1 | DONE |
| 0.2 | ~~Docker Compose~~ | PostgreSQL 16, Redis 7, Nginx, app + worker | 3 | DONE |
| 0.3 | ~~Prisma schema~~ | Schema completo (26 model, 17 enum) + seed + prisma.config.ts (Prisma 7) | 3 | DONE |
| 0.4 | ~~tRPC setup~~ | Root router, context, auth/workspace middleware, provider, API route | 3 | DONE |
| 0.5 | ~~NextAuth v5~~ | Google OAuth + pagina signin (Magic Link placeholder) | 4 | DONE |
| 0.6 | ~~shadcn/ui init~~ | 22 componenti (button, card, dialog, sheet, command, ecc.) + TooltipProvider + Toaster | 2 | DONE |
| 0.7 | ~~Dashboard layout~~ | Sidebar collapsible, topbar con user menu, breadcrumb auto, dark/light toggle, overview page | 6 | DONE |
| 0.8 | ~~Multi-tenant~~ | Workspace CRUD, inviti, remove member, switcher in sidebar, WorkspaceProvider context | 6 | DONE |
| 0.9 | ~~BullMQ setup~~ | Redis connection, 5 queues (social/token/analytics/email/report), worker process con graceful shutdown | 3 | DONE |
| 0.10 | ~~Cloudinary client~~ | Upload wrapper, 8 resize presets (IG/FB/LI/TW/TT), delete | 2 | DONE |
| 0.11 | ~~Amazon SES client~~ | sendEmail wrapper, renderTemplate con {{vars}} | 2 | DONE |
| 0.12 | ~~Encryption utils~~ | AES-256-GCM encrypt/decrypt/generateKey | 2 | DONE |
| 0.13 | ~~Nginx config~~ | Reverse proxy, SSL, gzip, security headers, rate limiting | 2 | DONE |
| 0.14 | ~~CI/CD~~ | GitHub Actions: lint → typecheck → build → docker | 3 | DONE |
| | **Totale Fase 0** | | **42h** | **COMPLETATA** |

---

## FASE 1 — Social Media Manager (Settimane 3-5)

Include la **migrazione di La Grande Automazione** da n8n a TypeScript.

### 1A — Migrazione La Grande Automazione → TypeScript

| # | Task | Cosa migra da n8n | Ore | Stato |
|---|------|-------------------|-----|-------|
| 1.1 | ~~Meta service~~ | IG container/publish/carousel + FB post/photos + token exchange + insights | 6 | DONE |
| 1.2 | ~~LinkedIn service~~ | Register upload + upload binary + UGC post + analytics + token refresh | 5 | DONE |
| 1.3 | ~~Token manager~~ | Check expiry, refresh per platform (Meta/LI/TW/TT), encrypt & save | 6 | DONE |
| 1.4 | ~~Token refresher worker~~ | BullMQ repeatable job ogni 8h, refreshAllExpiring() | 3 | DONE |
| 1.5 | ~~Social publisher worker~~ | Orchestrator: Cloudinary resize → publish parallelo per platform → status update | 6 | DONE |
| 1.6 | ~~Email notifiche~~ | notifyPublishSuccess/Failure/TokenExpiring via SES con HTML templates | 3 | DONE |
| 1.7 | ~~Twitter/X service~~ | OAuth 2.0 PKCE, POST /2/tweets, threads, chunked media upload | 5 | DONE |
| 1.8 | ~~TikTok service~~ | Content Posting API (video+foto), analytics, OAuth refresh | 5 | DONE |
| | **Subtotale migrazione** | | **39h** | **COMPLETATA** |

### 1B — Frontend Social Media Manager

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 1.9 | ~~Account connection page~~ | Grid account, status badge, connect dialog, disconnect, OAuth URLs | 5 | DONE |
| 1.10 | ~~Post composer~~ | Textarea con counter per-platform, platform selector, hashtag badges, schedule picker | 8 | DONE |
| 1.11 | ~~Media upload~~ | react-dropzone, Cloudinary upload, progress, preview, API route multipart | 4 | DONE |
| 1.12 | ~~AI caption~~ | generateCaption tRPC (placeholder), topic+tone input, UI integrata nel composer | 4 | DONE |
| 1.13 | ~~Calendario editoriale~~ | Vista mese/settimana, calendar grid, post chips colorati, side panel, filtri | 8 | DONE |
| 1.14 | ~~Scheduling~~ | Schedule/reschedule/cancel via tRPC, BullMQ delayed jobs | 4 | DONE |
| 1.15 | ~~Media library~~ | Griglia responsive, search, upload dialog, preview dialog, pagination | 4 | DONE |
| 1.16 | ~~Analytics post~~ | Tabella metriche sortable, KPI cards, top 5 posts, engagement rate | 5 | DONE |
| 1.17 | ~~Workflow approvazione~~ | Status transitions role-based (VIEWER/MEMBER/ADMIN/OWNER), action buttons | 3 | DONE |
| 1.18 | ~~Testing~~ | Unit + integration, mock API | 5 | DONE |
| | **Subtotale frontend** | | **50h** | **18/18 DONE** |
| | **TOTALE FASE 1** | | **89h** | **18/18 DONE** |

### API Integration Map

```
Meta Graph API (v24.0)
├── POST /{page-id}/feed                    → Pubblica post FB
├── POST /{page-id}/photos                  → Pubblica foto FB
├── POST /{ig-user}/media                   → Crea container IG
├── POST /{ig-user}/media_publish           → Pubblica IG
├── GET  /{post-id}/insights                → Metriche
├── GET  /oauth/access_token                → Token exchange
└── OAuth: pages_manage_posts, instagram_content_publish

LinkedIn API v2
├── POST /ugcPosts                          → Pubblica post
├── POST /assets?action=registerUpload      → Register upload
├── PUT  {uploadUrl}                        → Upload binary
├── GET  /organizationalEntityShareStatistics → Metriche
└── OAuth: r_liteprofile, w_member_social

Twitter/X API v2
├── POST /2/tweets                          → Pubblica tweet
├── POST /2/media/upload                    → Upload media
├── GET  /2/tweets/{id}                     → Metriche
└── OAuth 2.0 PKCE

TikTok Content Posting API
├── POST /v2/post/publish/inbox/video/init  → Init upload
├── PUT  {uploadUrl}                        → Upload video
├── POST /v2/post/publish/                  → Pubblica
└── OAuth 2.0
```

---

## FASE 2 — Dashboard Unificata Analytics (Settimane 6-8)

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 2.1 | ~~GA4 connector~~ | OAuth, `runReport` API, fetch metriche per date range | 6 | DONE |
| 2.2 | ~~Google Ads connector~~ | OAuth, GAQL via `searchStream`, fetch campaign metrics | 6 | DONE |
| 2.3 | ~~Meta Ads connector~~ | OAuth, Marketing API `/insights`, fetch metriche | 5 | DONE |
| 2.4 | ~~Data sync worker~~ | BullMQ repeatable: sync metriche ogni 6h | 4 | DONE |
| 2.5 | ~~Overview KPI cards~~ | Spesa, Conversioni, ROAS, CPC, CTR, Sessioni, Lead. Confronto vs periodo precedente | 6 | DONE |
| 2.6 | ~~Grafici temporali~~ | Recharts LineChart, toggle metriche, confronto 2 periodi | 5 | DONE |
| 2.7 | ~~Confronto piattaforme~~ | BarChart Google Ads vs Meta Ads | 3 | DONE |
| 2.8 | ~~Tabella campagne~~ | @tanstack/react-table unificata, sorting, filtri, search | 5 | DONE |
| 2.9 | ~~Date range picker~~ | Presets + custom + confronto periodo | 3 | DONE |
| 2.10 | ~~Social analytics~~ | Metriche aggregate post, engagement rate, top post | 4 | DONE |
| 2.11 | ~~Report PDF~~ | jsPDF + html2canvas, grafici + KPI + tabelle | 5 | DONE |
| 2.12 | ~~Report Excel~~ | xlsx export | 2 | DONE |
| 2.13 | ~~Report schedulato~~ | BullMQ weekly, genera + invia via SES | 3 | DONE |
| 2.14 | ~~Alerting~~ | Regole configurabili, notifica in-app + email | 5 | DONE |
| 2.15 | ~~AI Insights~~ | Claude analizza dati → suggerimenti in italiano | 4 | DONE |
| 2.16 | ~~Testing~~ | Mock API, test connectors, test aggregation | 4 | DONE |
| | **TOTALE FASE 2** | | **70h** | **16/16 DONE** |

### API Queries

```
Google Analytics 4 — Data API
POST /v1beta/properties/{propertyId}:runReport
  dateRanges: [{ startDate: "30daysAgo", endDate: "today" }]
  metrics: sessions, totalUsers, conversions, bounceRate
  dimensions: date, sessionSource

Google Ads — GAQL via SearchStream
POST /v17/customers/{customerId}/googleAds:searchStream
  SELECT campaign.name, campaign.status,
    metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.cost_per_conversion
  FROM campaign WHERE segments.date DURING LAST_30_DAYS

Meta Marketing API — Insights
GET /v21.0/act_{adAccountId}/insights
  fields=impressions,clicks,spend,actions,cost_per_action_type,ctr,cpc
  level=campaign, time_increment=1
```

---

## FASE 3 — AI Ads Copy & Creative Generator (Settimane 9-11)

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 3.1 | ~~Brief wizard~~ | Form multi-step: prodotto, target, USP, tono, obiettivo, piattaforma, budget | 6 | DONE |
| 3.2 | ~~Copy generator service~~ | Claude API, system prompt copywriting, rispetta limiti caratteri, 5-10 varianti, output JSON | 5 | DONE |
| 3.3 | ~~Copy generator UI~~ | Streaming con Vercel AI SDK, card varianti, azioni (salva/modifica/usa) | 4 | DONE |
| 3.4 | ~~Ad preview — Google Search~~ | Simula SERP: titolo blu, URL verde, descrizione | 4 | DONE |
| 3.5 | ~~Ad preview — Meta Feed~~ | Simula FB/IG feed: immagine, testo, headline, CTA | 4 | DONE |
| 3.6 | ~~Ad preview — LinkedIn/Story~~ | Preview LinkedIn feed + IG Story | 3 | DONE |
| 3.7 | ~~Combinatore varianti~~ | N headline × M description × K CTA → matrice, preview ciascuna | 4 | DONE |
| 3.8 | ~~A/B test — Google Ads~~ | API: Campaign → AdGroup → ResponsiveSearchAd con varianti | 6 | DONE |
| 3.9 | ~~A/B test — Meta Ads~~ | API: Campaign → AdSet → multiple Ad con creative diverse | 6 | DONE |
| 3.10 | ~~Performance tracker~~ | Metriche per variante, significatività statistica, badge Winner | 5 | DONE |
| 3.11 | ~~Copy library~~ | CRUD, tag per settore/tono/piattaforma, ricerca, filtri | 4 | DONE |
| 3.12 | ~~Competitor analysis~~ | URL → Claude analizza → suggerisce differenziazione | 4 | DONE |
| 3.13 | ~~Multi-lingua~~ | IT/EN/ES/FR/DE con adattamento culturale | 3 | DONE |
| 3.14 | ~~Testing~~ | Mock Claude, test generator, test API Ads | 4 | DONE |
| | **TOTALE FASE 3** | | **62h** | **14/14 DONE** |

### Limiti Caratteri per Piattaforma

```
GOOGLE_SEARCH:  headline 30 chars (max 15), description 90 chars (max 4)
GOOGLE_DISPLAY: headline 30, long headline 90, description 90
META_FEED:      primary text 125 (consigliato), headline 27, description 27
META_STORY:     primary text 125, headline 40
LINKEDIN:       intro text 150 (consigliato), headline 70
```

---

## FASE 4 — CRM + Email Automation (Settimane 12-15)

### 4A — CRM

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 4.1 | ~~Contact list page~~ | @tanstack/react-table, search, filtri, bulk actions, paginazione | 6 | DONE |
| 4.2 | ~~Contact detail page~~ | Header + avatar, tabs: Overview/Timeline/Email/Note | 6 | DONE |
| 4.3 | ~~Activity timeline~~ | Lista cronologica cross-module, icone per tipo, filtro | 5 | DONE |
| 4.4 | ~~Import CSV~~ | Upload, preview, mapping colonne, dedup, progress bar | 5 | DONE |
| 4.5 | ~~Pipeline Kanban~~ | @dnd-kit: Lead/MQL/SQL/Opportunity/Customer/Lost, drag & drop | 7 | DONE |
| 4.6 | ~~Lead scoring engine~~ | Regole configurabili, BullMQ ricalcolo su activity | 5 | DONE |
| 4.7 | ~~Segmentazione~~ | Query builder visuale, AND/OR, preview conteggio live | 6 | DONE |
| 4.8 | ~~Webhook lead ads~~ | Auto-create contatto da Google/Meta Lead Ads | 4 | DONE |
| 4.9 | ~~Note & attività~~ | Nota, log chiamata/meeting, visualizzazione timeline | 3 | DONE |
| | **Subtotale CRM** | | **47h** | **9/9 DONE** |

### 4B — Email Automation

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 4.10 | ~~Amazon SES integration~~ | sendEmail, sendBulkEmail, SNS webhook bounce/complaint, tracking | 5 | DONE |
| 4.11 | ~~Email builder~~ | Drag & drop con @react-email, preview mobile/desktop, merge vars | 10 | DONE |
| 4.12 | ~~Template library~~ | 8 template predefiniti, preview + "Usa questo" | 4 | DONE |
| 4.13 | ~~Liste & segmenti~~ | CRUD liste, segmenti dinamici, conteggio subscriber | 4 | DONE |
| 4.14 | ~~Campagne email~~ | Wizard: lista → template → subject → preview → schedule/send, batch 50/sec | 6 | DONE |
| 4.15 | ~~A/B test email~~ | 2 subject su 20% lista, dopo 4h winner all'80% | 5 | DONE |
| 4.16 | ~~Email analytics~~ | sent/delivered/opened/clicked/bounced, grafici, click heatmap | 5 | DONE |
| 4.17 | ~~Automation workflow editor~~ | reactflow canvas, nodi: Trigger/Condition/SendEmail/Wait/AddTag/ChangeStage/Webhook | 12 | DONE |
| 4.18 | ~~Automation engine~~ | Esegue workflow JSON, delay con BullMQ, condizioni, logging | 8 | DONE |
| 4.19 | ~~AI email writer~~ | Claude genera subject (5 varianti) + body, streaming | 3 | DONE |
| 4.20 | ~~Testing~~ | Mock SES, test engine, test builder | 5 | DONE |
| | **Subtotale Email** | | **67h** | **11/11 DONE** |
| | **TOTALE FASE 4** | | **114h** | **20/20 DONE** |

### Workflow Automation Engine

```
TRIGGERS                    CONDITIONS              ACTIONS
─────────────────           ──────────────           ─────────────────
• Form submitted            • IF score > N           • Send email
• Tag added/removed         • IF tag = X             • Add/remove tag
• Stage changed             • IF source = Y          • Change stage
• Email opened              • IF days since last     • Update score
• Email link clicked          activity > N           • Add to list
• Ad clicked (webhook)      • IF in segment Z        • Remove from list
• Page visited                                       • Send notification
• Contact created                                    • Wait (delay)
                                                     • Webhook
```

---

## FASE 5 — Heatmap & Session Recording (Settimane 16-18)

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 5.1 | ~~Tracking script~~ | Vanilla JS <3KB gzip: click, scroll, mousemove, rage click, sendBeacon batch 5s | 10 | DONE |
| 5.2 | ~~Tracking API~~ | POST /api/tracking: valida, rate limit, batch insert | 5 | DONE |
| 5.3 | ~~Setup page~~ | Genera trackingId, snippet copiabile, verifica installazione | 3 | DONE |
| 5.4 | ~~Click heatmap~~ | Canvas overlay su screenshot, gradiente colore per densità | 10 | DONE |
| 5.5 | ~~Scroll heatmap~~ | Barra laterale % utenti per profondità | 5 | DONE |
| 5.6 | ~~Move heatmap~~ | Dati mousemove, toggle click/scroll/move | 3 | DONE |
| 5.7 | ~~rrweb integration~~ | Recorder nel tracking script (opt-in Pro+), storage compresso | 6 | DONE |
| 5.8 | ~~Session replay player~~ | rrweb-player, timeline eventi, velocità 1x/2x/4x | 5 | DONE |
| 5.9 | ~~Session list~~ | Tabella: durata, pagine, device, browser, click, rage clicks | 5 | DONE |
| 5.10 | ~~Funnel analysis~~ | Badge, aggregazione per pagina, funnel chart, Sankey flow | 4 | DONE |
| 5.11 | ~~Rage + dead click~~ | Aggregazione per pagina, alert soglia | 5 | DONE |
| 5.12 | ~~Link a CRM~~ | Form submit con email → collega sessioni a contatto | 4 | DONE |
| 5.13 | ~~Privacy & GDPR~~ | Auto-mask password, [data-hm-mask], cookie-free, data retention | 3 | DONE |
| 5.14 | ~~Testing~~ | Test script jsdom, test API, test rendering | 5 | DONE |
| | **TOTALE FASE 5** | | **73h** | **14/14 DONE** |

### Tracking Script

```javascript
(function(w, d, tid) {
  var q = [], sid = sessionStorage.getItem('_hm_sid') || crypto.randomUUID();
  sessionStorage.setItem('_hm_sid', sid);
  var vid = localStorage.getItem('_hm_vid') || crypto.randomUUID();
  localStorage.setItem('_hm_vid', vid);

  function track(type, data) {
    q.push({ type, ...data, t: Date.now() });
  }

  d.addEventListener('click', function(e) {
    track('click', { x: e.pageX, y: e.pageY, el: e.target.tagName });
  });

  var maxScroll = 0;
  w.addEventListener('scroll', throttle(function() {
    var depth = (w.scrollY + w.innerHeight) / d.documentElement.scrollHeight;
    if (depth > maxScroll) { maxScroll = depth; track('scroll', { d: depth }); }
  }, 500));

  d.addEventListener('mousemove', throttle(function(e) {
    track('move', { x: e.pageX, y: e.pageY });
  }, 200));

  setInterval(function() {
    if (q.length === 0) return;
    navigator.sendBeacon('https://YOUR_DOMAIN/api/tracking', JSON.stringify({
      tid: tid, sid: sid, vid: vid, url: location.href,
      sw: screen.width, sh: screen.height, events: q.splice(0)
    }));
  }, 5000);

  d.addEventListener('visibilitychange', function() {
    if (d.visibilityState === 'hidden' && q.length > 0) {
      navigator.sendBeacon('https://YOUR_DOMAIN/api/tracking', JSON.stringify({
        tid: tid, sid: sid, vid: vid, url: location.href,
        sw: screen.width, sh: screen.height, events: q.splice(0)
      }));
    }
  });

  function throttle(fn, ms) {
    var last = 0;
    return function() {
      var now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, arguments); }
    };
  }
})(window, document, 'TRACKING_ID_HERE');
```

---

## FASE 6 — Integration, Billing & Launch (Settimane 19-21)

| # | Task | Dettaglio | Ore | Stato |
|---|------|-----------|-----|-------|
| 6.1 | ~~Overview unificata~~ | KPI top da ogni modulo, grafici mini, attività recenti, alert | 6 | DONE |
| 6.2 | ~~Profilo contatto 360°~~ | Timeline cross-module: social, ads, email, heatmap | 6 | DONE |
| 6.3 | ~~Webby integration~~ | "Genera Landing Page" → chiama Webby → deploy → auto tracking | 8 | DONE |
| 6.4 | ~~Notifiche in-app~~ | Bell icon, dropdown, polling 30s | 5 | DONE |
| 6.5 | ~~Stripe billing~~ | Free / Starter $19 / Pro $49 / Agency $99, webhook lifecycle | 8 | DONE |
| 6.6 | ~~Onboarding wizard~~ | Connetti social → ads → tracking → primo post | 5 | DONE |
| 6.7 | ~~Settings pages~~ | General, Team, Integrations, Billing | 5 | DONE |
| 6.8 | ~~Performance~~ | Redis caching, ISR, lazy loading, image optimization | 6 | DONE |
| 6.9 | ~~Mobile responsive~~ | Fix tutti i moduli per tablet (768px) e mobile (375px) | 6 | DONE |
| 6.10 | ~~Security~~ | Rate limiting, token encryption, CORS, CSP, input sanitization | 5 | DONE |
| 6.11 | ~~Backup & monitoring~~ | pg_dump daily, health check, error logging | 4 | DONE |
| 6.12 | ~~E2E testing~~ | Playwright: auth, post, campaign, contacts, email, heatmap | 8 | DONE |
| 6.13 | ~~Deploy production~~ | Docker multi-stage build, docker-compose up, DNS, SSL, smoke test | 4 | DONE |
| | **TOTALE FASE 6** | | **76h** | **13/13 DONE** |

### Piani Pricing

```
FREE           STARTER $19/mo     PRO $49/mo          AGENCY $99/mo
─────────────  ─────────────────  ──────────────────  ──────────────────
1 workspace    3 workspace        Unlimited workspace Unlimited workspace
3 social acc   10 social acc      Unlimited acc       Unlimited acc
500 contatti   5K contatti        25K contatti        100K contatti
1K email/mo    10K email/mo       50K email/mo        200K email/mo
No heatmap     Heatmap base       Session recording   Session recording
No AI          AI (50 gen/mo)     AI unlimited        AI unlimited
               -                  -                   White-label
               -                  -                   API access
               -                  -                   Priority support
```

---

## Riepilogo Finale

```
FASE  │ MODULO                         │ ORE   │ SETTIMANE │ NOTE
──────┼────────────────────────────────┼───────┼───────────┼─────────────────────
  0   │ Foundation                     │  42h  │   1-2     │ Docker, auth, layout
  1   │ Social Media Manager           │  89h  │   3-5     │ Migrazione n8n → TS
  2   │ Dashboard Analytics            │  70h  │   6-8     │ GA4, Google/Meta Ads
  3   │ AI Ads Copy & Creative         │  62h  │   9-11    │ Claude API
  4   │ CRM + Email Automation         │ 114h  │  12-15    │ Modulo più grande
  5   │ Heatmap & Session Recording    │  73h  │  16-18    │ Tracking script
  6   │ Integration & Launch           │  76h  │  19-21    │ Stripe, deploy
──────┼────────────────────────────────┼───────┼───────────┼─────────────────────
      │ TOTALE                         │ 526h  │  ~21 sett │ ~5.5 mesi (umano)
```

### Con Claude Code (multi-agent)

```
SCENARIO REALISTICO:    ~6 settimane (30 giorni lavorativi)
SCENARIO AGGRESSIVO:    ~4 settimane (dedica 4-5h/giorno)
SCENARIO CONSERVATIVO:  ~8 settimane (2-3h/giorno)

Costo API Claude: ~€50-100 totale
Tempo supervisione umana: ~25-30h distribuite
```

### Costi Infrastruttura Mensili (Produzione)

```
VPS Hetzner CX31 (4vCPU, 8GB, 80GB)    ~€15/mo
Cloudinary                               €0 (free tier 25GB)
Amazon SES                               ~€5/mo (pay-per-use)
Claude API                               ~€20-50/mo
Dominio                                  ~€1/mo
────────────────────────────────────────────────
TOTALE                                   ~€41-71/mo
```

---

## Pre-lavoro (da fare PRIMA di iniziare lo sviluppo)

| # | Preparazione | Tempo |
|---|---|---|
| 1 | Crea app su Meta Developer Console (OAuth IG+FB) | 30 min |
| 2 | Crea app su LinkedIn Developer (OAuth + Verify) | 30 min |
| 3 | Crea progetto su Google Cloud Console (GA4 + Ads) | 20 min |
| 4 | Crea app su Twitter Developer Portal (OAuth 2.0) | 15 min |
| 5 | Acquista/configura VPS Hetzner CX31 | 15 min |
| 6 | Punta dominio al VPS (DNS A record) | 5 min |
| 7 | Verifica Amazon SES (dominio, fuori sandbox) | 10 min |
| 8 | Crea account Cloudinary (API key + upload preset) | 5 min |
| 9 | Ottieni API key Claude (anthropic.com) | 5 min |
| | **Totale pre-lavoro** | **~2.5 ore** |
