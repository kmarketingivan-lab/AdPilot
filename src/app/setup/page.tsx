"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Credential sections with guides ──────────────────────────────

interface FieldMeta {
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
}

interface Section {
  id: string;
  title: string;
  icon: string;
  priority: "required" | "recommended" | "optional";
  guide: string[];
  fields: Record<string, FieldMeta>;
}

const SECTIONS: Section[] = [
  {
    id: "infrastructure",
    title: "Infrastruttura",
    icon: "S",
    priority: "required",
    guide: [
      "Questi valori funzionano gia con Docker Compose di default.",
      "Modifica solo se usi un database o Redis esterno.",
    ],
    fields: {
      DATABASE_URL: {
        label: "Database URL",
        placeholder: "postgresql://adpilot:adpilot_dev@localhost:5432/adpilot",
      },
      REDIS_URL: {
        label: "Redis URL",
        placeholder: "redis://localhost:6379",
      },
      NEXT_PUBLIC_APP_URL: {
        label: "App URL",
        placeholder: "http://localhost:3000",
      },
    },
  },
  {
    id: "auth",
    title: "Google OAuth (Login)",
    icon: "G",
    priority: "required",
    guide: [
      "1. Vai su console.cloud.google.com e crea un nuovo progetto (o seleziona quello esistente)",
      "2. Menu laterale > APIs & Services > Credentials",
      "3. Clicca + CREATE CREDENTIALS > OAuth client ID",
      "4. Se non hai configurato il consent screen: clicca Configure Consent Screen > External > compila nome app e email",
      "5. Tipo applicazione: Web application",
      "6. Authorized redirect URIs: aggiungi http://localhost:3000/api/auth/callback/google",
      "7. Per produzione aggiungi anche: https://tuodominio.com/api/auth/callback/google",
      "8. Copia Client ID e Client Secret qui sotto",
    ],
    fields: {
      GOOGLE_CLIENT_ID: {
        label: "Google Client ID",
        placeholder: "123456789.apps.googleusercontent.com",
      },
      GOOGLE_CLIENT_SECRET: {
        label: "Google Client Secret",
        placeholder: "GOCSPX-...",
        secret: true,
      },
      NEXTAUTH_SECRET: {
        label: "NextAuth Secret",
        placeholder: "Auto-generato se lasci vuoto",
        secret: true,
        optional: true,
      },
      NEXTAUTH_URL: {
        label: "NextAuth URL",
        placeholder: "http://localhost:3000",
      },
    },
  },
  {
    id: "encryption",
    title: "Encryption Key",
    icon: "K",
    priority: "required",
    guide: [
      "Chiave AES-256 per criptare i token OAuth nel database.",
      "Lascia vuoto per auto-generare. NON perderla dopo il deploy, altrimenti tutti i token salvati diventano illeggibili.",
    ],
    fields: {
      ENCRYPTION_KEY: {
        label: "Encryption Key (hex, 64 chars)",
        placeholder: "Auto-generato se lasci vuoto",
        secret: true,
        optional: true,
      },
    },
  },
  {
    id: "meta",
    title: "Meta (Facebook + Instagram)",
    icon: "M",
    priority: "recommended",
    guide: [
      "1. Vai su developers.facebook.com > My Apps > Create App",
      "2. Tipo: Business > nome: AdPilot",
      "3. Nel dashboard dell'app, vai su Settings > Basic",
      "4. Copia App ID e App Secret",
      "5. Aggiungi i prodotti: Facebook Login for Business, Instagram Graph API, Pages API",
      "6. Facebook Login > Settings > Valid OAuth Redirect URIs:",
      "   http://localhost:3000/api/social/callback/facebook",
      "7. Permessi necessari: pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_insights",
      "8. Per usare in produzione: completa App Review e richiedi i permessi",
    ],
    fields: {
      META_APP_ID: {
        label: "Meta App ID",
        placeholder: "123456789012345",
      },
      META_APP_SECRET: {
        label: "Meta App Secret",
        placeholder: "abc123def456...",
        secret: true,
      },
    },
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    icon: "in",
    priority: "recommended",
    guide: [
      "1. Vai su linkedin.com/developers > Create App",
      "2. Compila nome (AdPilot), associa una Company Page LinkedIn (creane una se non ce l'hai)",
      "3. Tab Auth: copia Client ID e Client Secret",
      "4. Authorized redirect URLs: http://localhost:3000/api/social/callback/linkedin",
      "5. Tab Products > richiedi: Share on LinkedIn, Sign In with LinkedIn v2, Marketing Developer Platform",
      "6. Marketing Developer Platform richiede approvazione (1-2 settimane) - nel frattempo puoi testare con Share on LinkedIn",
    ],
    fields: {
      LINKEDIN_CLIENT_ID: {
        label: "LinkedIn Client ID",
        placeholder: "86abc123def456",
      },
      LINKEDIN_CLIENT_SECRET: {
        label: "LinkedIn Client Secret",
        placeholder: "WPL...",
        secret: true,
      },
    },
  },
  {
    id: "twitter",
    title: "Twitter / X",
    icon: "X",
    priority: "optional",
    guide: [
      "1. Vai su developer.x.com > Developer Portal > Projects & Apps",
      "2. Crea un progetto e un'app al suo interno",
      "3. Tab Keys and Tokens > OAuth 2.0 Client ID and Client Secret (genera se non presenti)",
      "4. Tab Settings > User authentication settings > Edit:",
      "   - Type of App: Web App",
      "   - Callback URI: http://localhost:3000/api/social/callback/twitter",
      "   - Website URL: http://localhost:3000",
      "5. Permessi: tweet.read, tweet.write, users.read, offline.access",
      "6. Piano Free: 1.500 tweet/mese. Basic ($200/mo): 50K. Pro ($5K/mo): 300K",
    ],
    fields: {
      TWITTER_CLIENT_ID: {
        label: "Twitter Client ID",
        placeholder: "abc123...",
      },
      TWITTER_CLIENT_SECRET: {
        label: "Twitter Client Secret",
        placeholder: "xyz789...",
        secret: true,
      },
    },
  },
  {
    id: "tiktok",
    title: "TikTok",
    icon: "T",
    priority: "optional",
    guide: [
      "1. Vai su developers.tiktok.com > Manage apps > Create app",
      "2. Seleziona Content Posting API e User Info",
      "3. Compila le info dell'app, aggiungi redirect URI: http://localhost:3000/api/social/callback/tiktok",
      "4. Dopo approvazione, vai su App Details > copia Client Key e Client Secret",
      "5. L'approvazione richiede in genere 3-5 giorni lavorativi",
      "6. Nota: Content Posting API richiede account TikTok Business/Creator",
    ],
    fields: {
      TIKTOK_CLIENT_KEY: {
        label: "TikTok Client Key",
        placeholder: "aw1234...",
      },
      TIKTOK_CLIENT_SECRET: {
        label: "TikTok Client Secret",
        placeholder: "abc123...",
        secret: true,
      },
    },
  },
  {
    id: "google_analytics",
    title: "Google Analytics 4",
    icon: "GA",
    priority: "recommended",
    guide: [
      "1. Vai su console.cloud.google.com (stesso progetto di Google OAuth)",
      "2. APIs & Services > Enable APIs > cerca e abilita 'Google Analytics Data API'",
      "3. L'autenticazione usa le stesse credenziali OAuth di Google (gia configurate sopra)",
      "4. Il Property ID lo trovi su analytics.google.com > Admin > Property > Property Details",
      "5. Formato: numerico, es. 123456789",
    ],
    fields: {
      GA4_PROPERTY_ID: {
        label: "GA4 Property ID",
        placeholder: "123456789",
        optional: true,
      },
    },
  },
  {
    id: "google_ads",
    title: "Google Ads",
    icon: "Ad",
    priority: "optional",
    guide: [
      "1. Stessa Google Cloud Console > abilita 'Google Ads API'",
      "2. Developer Token: vai su ads.google.com > Tools > API Center > richiedi token",
      "   (inizia come Test Account, poi richiedi Basic/Standard access)",
      "3. Login Customer ID: il tuo MCC (Manager Account) ID, formato 000-000-0000",
      "4. Se non hai un MCC: ads.google.com > Create manager account",
    ],
    fields: {
      GOOGLE_ADS_DEVELOPER_TOKEN: {
        label: "Google Ads Developer Token",
        placeholder: "AbCdEfGh...",
        secret: true,
      },
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: {
        label: "Google Ads Login Customer ID",
        placeholder: "000-000-0000",
        optional: true,
      },
    },
  },
  {
    id: "cloudinary",
    title: "Cloudinary (Media)",
    icon: "C",
    priority: "recommended",
    guide: [
      "1. Vai su cloudinary.com > Sign Up (gratuito, 25GB storage + 25GB bandwidth/mese)",
      "2. Dopo il login, la Dashboard mostra subito Cloud Name, API Key, API Secret",
      "3. Copia i tre valori qui sotto",
      "4. Opzionale: Settings > Upload > Upload Presets > crea preset 'adpilot' come unsigned",
    ],
    fields: {
      CLOUDINARY_CLOUD_NAME: {
        label: "Cloud Name",
        placeholder: "dxyz1234",
      },
      CLOUDINARY_API_KEY: {
        label: "API Key",
        placeholder: "123456789012345",
      },
      CLOUDINARY_API_SECRET: {
        label: "API Secret",
        placeholder: "AbCdEfGhIjKlMn...",
        secret: true,
      },
    },
  },
  {
    id: "ses",
    title: "Amazon SES (Email)",
    icon: "E",
    priority: "recommended",
    guide: [
      "1. Vai su console.aws.amazon.com > Amazon SES",
      "2. Verifica dominio: SES > Identities > Create identity > Domain > inserisci il tuo dominio",
      "3. Aggiungi i record DNS (DKIM) che AWS ti mostra nel tuo registrar",
      "4. Per uscire dalla Sandbox (necessario per inviare a chiunque):",
      "   SES > Account dashboard > Request production access",
      "5. Credenziali: IAM > Users > Create user > Attach policy 'AmazonSESFullAccess'",
      "6. Security credentials > Create access key > copia Access Key ID e Secret",
      "7. Regione: scegli quella piu vicina (eu-west-1 per Europa, us-east-1 per USA)",
    ],
    fields: {
      SES_ACCESS_KEY_ID: {
        label: "AWS Access Key ID",
        placeholder: "AKIA...",
        secret: true,
      },
      SES_SECRET_ACCESS_KEY: {
        label: "AWS Secret Access Key",
        placeholder: "wJalrXUtnFEMI...",
        secret: true,
      },
      SES_REGION: {
        label: "Regione SES",
        placeholder: "eu-west-1",
      },
      SES_FROM_EMAIL: {
        label: "Email mittente (verificata in SES)",
        placeholder: "noreply@tuodominio.com",
      },
    },
  },
  {
    id: "stripe",
    title: "Stripe (Billing)",
    icon: "$",
    priority: "optional",
    guide: [
      "1. Vai su dashboard.stripe.com > Developers > API keys",
      "2. Copia la Secret key (sk_test_... per test, sk_live_... per produzione)",
      "3. Crea i 3 prodotti/prezzi: Product catalog > + Add product",
      "   - Starter: $19/mese recurring > dopo il salvataggio, copia il Price ID (price_...)",
      "   - Pro: $49/mese recurring > copia Price ID",
      "   - Agency: $99/mese recurring > copia Price ID",
      "4. Webhook: Developers > Webhooks > Add endpoint",
      "   URL: https://tuodominio.com/api/webhooks/stripe",
      "   Eventi: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted",
      "5. Copia il Webhook signing secret (whsec_...)",
      "6. Per test locali: installa Stripe CLI > stripe listen --forward-to localhost:3000/api/webhooks/stripe",
    ],
    fields: {
      STRIPE_SECRET_KEY: {
        label: "Stripe Secret Key",
        placeholder: "sk_test_...",
        secret: true,
      },
      STRIPE_WEBHOOK_SECRET: {
        label: "Stripe Webhook Secret",
        placeholder: "whsec_...",
        secret: true,
      },
      STRIPE_STARTER_PRICE_ID: {
        label: "Price ID - Starter ($19)",
        placeholder: "price_...",
      },
      STRIPE_PRO_PRICE_ID: {
        label: "Price ID - Pro ($49)",
        placeholder: "price_...",
      },
      STRIPE_AGENCY_PRICE_ID: {
        label: "Price ID - Agency ($99)",
        placeholder: "price_...",
      },
    },
  },
  {
    id: "ai",
    title: "Claude API (AI)",
    icon: "AI",
    priority: "recommended",
    guide: [
      "1. Vai su console.anthropic.com",
      "2. Settings > API Keys > Create Key",
      "3. Copia la chiave (sk-ant-...)",
      "4. Aggiungi credito: Settings > Billing > Add funds (minimo $5)",
      "5. Usato per: generazione copy ads, AI insights analytics, email writer",
    ],
    fields: {
      ANTHROPIC_API_KEY: {
        label: "Anthropic API Key",
        placeholder: "sk-ant-...",
        secret: true,
      },
    },
  },
  {
    id: "webby",
    title: "Webby (Landing Page Builder)",
    icon: "W",
    priority: "optional",
    guide: [
      "Solo se hai Webby installato separatamente.",
      "Inserisci l'URL e la API key dell'istanza Webby.",
      "Se non usi Webby, lascia vuoto — la funzione 'Genera Landing Page' sara disabilitata.",
    ],
    fields: {
      WEBBY_API_URL: {
        label: "Webby API URL",
        placeholder: "http://localhost:8000",
        optional: true,
      },
      WEBBY_API_KEY: {
        label: "Webby API Key",
        placeholder: "webby_...",
        secret: true,
        optional: true,
      },
    },
  },
];

// ─── Components ───────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Section["priority"] }) {
  const colors = {
    required: "bg-red-500/20 text-red-400 border-red-500/30",
    recommended: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    optional: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };
  const labels = {
    required: "Obbligatorio",
    recommended: "Consigliato",
    optional: "Opzionale",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[priority]}`}>
      {labels[priority]}
    </span>
  );
}

function StatusDot({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${configured ? "bg-emerald-400" : "bg-zinc-600"}`}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────

type FormValues = Record<string, string>;

export default function SetupPage() {
  const [values, setValues] = useState<FormValues>({});
  const [sectionStatus, setSectionStatus] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<string>("infrastructure");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Load existing values
  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => {
        const flat: FormValues = {};
        const status: Record<string, boolean> = {};
        for (const [sectionId, keys] of Object.entries(data.values as Record<string, Record<string, { value: string; hasValue: boolean }>>)) {
          let allConfigured = true;
          for (const [key, meta] of Object.entries(keys)) {
            flat[key] = meta.hasValue ? meta.value : "";
            // Check if required fields in this section are filled
            const sectionDef = SECTIONS.find((s) => s.id === sectionId);
            const fieldDef = sectionDef?.fields[key];
            if (!fieldDef?.optional && !meta.hasValue) {
              allConfigured = false;
            }
          }
          status[sectionId] = allConfigured;
        }
        setValues(flat);
        setSectionStatus(status);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "ok", text: "File .env salvato! Riavvia il server per applicare le modifiche." });
      } else {
        setMessage({ type: "err", text: data.message });
      }
    } catch (e) {
      setMessage({ type: "err", text: `Errore di rete: ${e}` });
    } finally {
      setSaving(false);
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const currentSection = SECTIONS.find((s) => s.id === activeSection)!;

  const configuredCount = Object.values(sectionStatus).filter(Boolean).length;
  const requiredSections = SECTIONS.filter((s) => s.priority === "required");
  const requiredDone = requiredSections.filter((s) => sectionStatus[s.id]).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-400 text-lg">Caricamento configurazione...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AdPilot Setup</h1>
              <p className="text-zinc-400 mt-1">
                Configura le credenziali per attivare i moduli della piattaforma
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-zinc-500">
                {configuredCount}/{SECTIONS.length} sezioni configurate
                {" | "}
                <span className={requiredDone === requiredSections.length ? "text-emerald-400" : "text-red-400"}>
                  {requiredDone}/{requiredSections.length} obbligatorie
                </span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-white text-black rounded-lg font-medium text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {saving ? "Salvataggio..." : "Salva .env"}
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${(configuredCount / SECTIONS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`max-w-7xl mx-auto px-6 mt-4`}>
          <div
            className={`px-4 py-3 rounded-lg text-sm ${
              message.type === "ok"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {message.text}
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-72 shrink-0">
          <div className="sticky top-6 space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  activeSection === s.id
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <span className="w-8 h-8 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono shrink-0">
                  {s.icon}
                </span>
                <span className="flex-1 truncate">{s.title}</span>
                <StatusDot configured={!!sectionStatus[s.id]} />
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
            {/* Section header */}
            <div className="px-6 py-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">{currentSection.title}</h2>
                <PriorityBadge priority={currentSection.priority} />
              </div>
            </div>

            {/* Guide */}
            <div className="px-6 py-4 bg-zinc-950/50 border-b border-zinc-800">
              <details open>
                <summary className="text-sm font-medium text-zinc-300 cursor-pointer select-none hover:text-white">
                  Guida passo-passo
                </summary>
                <ol className="mt-3 space-y-1.5 text-sm text-zinc-400">
                  {currentSection.guide.map((step, i) => (
                    <li key={i} className="leading-relaxed pl-1">
                      {step}
                    </li>
                  ))}
                </ol>
              </details>
            </div>

            {/* Fields */}
            <div className="px-6 py-5 space-y-5">
              {Object.entries(currentSection.fields).map(([key, field]) => (
                <div key={key}>
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-1.5">
                    {field.label}
                    {field.optional && (
                      <span className="text-xs text-zinc-600 font-normal">(opzionale)</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={field.secret && !showSecrets[key] ? "password" : "text"}
                      value={values[key] ?? ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={field.placeholder}
                      className="flex-1 px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 font-mono transition-colors"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {field.secret && (
                      <button
                        type="button"
                        onClick={() => toggleSecret(key)}
                        className="px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors shrink-0"
                      >
                        {showSecrets[key] ? "Nascondi" : "Mostra"}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-600 font-mono">{key}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-zinc-600">
          <span>Il file .env viene salvato nella root del progetto. Non viene mai committato in git.</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-white text-black rounded-lg font-medium text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvataggio..." : "Salva .env"}
          </button>
        </div>
      </div>
    </div>
  );
}
