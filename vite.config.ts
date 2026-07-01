import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// ── SEO/OG por marca (build-time) ──────────────────────────────────────
// index.html trae los metadatos de TWF por defecto, delimitados por
// <!-- BRAND:META:START --> … <!-- BRAND:META:END -->. Cuando el proyecto de
// Vercel de Mediterránea se buildea con VITE_BRAND=med, este plugin reemplaza
// ese bloque por el de Med. Necesario porque los crawlers sociales (WhatsApp,
// LinkedIn, buscadores) leen el HTML estático y NO ejecutan applyBrand() en JS.
// TWF (VITE_BRAND ausente o 'twf') → index.html queda intacto.
const MED_META = `<title>Mediterranea Carghas — Logística internacional sin fronteras | Marítimo, Aéreo y Terrestre</title>
    <meta name="description" content="Mediterranea Carghas: logística internacional integral — marítimo (FCL/LCL), aéreo y terrestre con cobertura en el Cono Sur y el mundo. Cotizá tu embarque y seguí tu carga en tiempo real." />
    <meta name="keywords" content="logística internacional, freight forwarder, transporte internacional, importación exportación, FCL, LCL, aéreo, terrestre, Mercosur, Mediterranea Carghas, Argentina, carga marítima, consolidado" />
    <meta name="author" content="Mediterranea Carghas" />
    <meta name="geo.region" content="AR" />
    <meta property="og:site_name" content="Mediterranea Carghas" />
    <meta property="og:title" content="Mediterranea Carghas — Logística internacional sin fronteras" />
    <meta property="og:description" content="Tu socio en comercio internacional. Marítimo, aéreo y terrestre con alcance global — una sola ventana para toda tu logística." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://mediterraneacarghas.com.ar" />
    <meta property="og:image" content="https://mediterraneacarghas.com.ar/med-og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="es_AR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://mediterraneacarghas.com.ar" />
    <meta name="twitter:title" content="Mediterranea Carghas — Logística internacional sin fronteras" />
    <meta name="twitter:description" content="Tu socio en comercio internacional. Marítimo, aéreo y terrestre con alcance global." />
    <meta name="twitter:image" content="https://mediterraneacarghas.com.ar/med-og-image.jpg" />
    <link rel="canonical" href="https://mediterraneacarghas.com.ar" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Mediterranea Carghas",
      "url": "https://mediterraneacarghas.com.ar",
      "logo": "https://mediterraneacarghas.com.ar/med-icon-512.png",
      "description": "Logística internacional integral: marítimo, aéreo y terrestre con alcance global.",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "AR"
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "areaServed": ["AR", "UY", "BR", "CL", "PY"],
        "availableLanguage": ["es"]
      }
    }
    </script>`

function brandIndexMeta(): Plugin | null {
  if (process.env.VITE_BRAND !== 'med') return null
  return {
    name: 'brand-index-meta',
    transformIndexHtml(html) {
      return html
        .replace(/<html lang="[^"]*">/, '<html lang="es-AR">')
        .replace(
          /<!-- BRAND:META:START[\s\S]*?<!-- BRAND:META:END -->/,
          `<!-- BRAND:META:START (med) -->\n    ${MED_META}\n    <!-- BRAND:META:END -->`
        )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    brandIndexMeta(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  build: {
    // SECURITY: Never expose source code in production
    sourcemap: false,
  },
});
