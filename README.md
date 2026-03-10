# 🚀 TWF Logistics - Sistema de Gestión y Tracking

Sistema web completo para **Transit World Forwarding** con gestión de cargas, tracking público y formulario de cotizaciones automático.

---

## ⚡ INICIO RÁPIDO

### 🔥 Acción Requerida: Configurar Email
El formulario de cotizaciones requiere configuración de EmailJS.

**👉 Lee:** [`INICIO_RAPIDO_EMAIL.md`](INICIO_RAPIDO_EMAIL.md) (8-10 minutos)

### 🏃 Ejecutar la Aplicación
```bash
npm install
npm run dev
```
Abre: http://localhost:5173

---

## 📋 Funcionalidades

✅ **Sitio Público**
- Landing page corporativa
- Formulario de cotizaciones con email automático
- Tracking público de cargas (sin datos sensibles)
- Secciones: Servicios, Nosotros, Cobertura, FAQ, Contacto

✅ **Dashboard Administrativo**
- Importación desde Google Sheets/Excel
- Gestión de cargas con alertas de urgencia
- Tracking interno completo
- Búsqueda y filtros avanzados

✅ **Sistema de Email** ⚠️ Requiere configuración
- Envío automático de cotizaciones
- Email profesional a bridvanovich@twf.uy
- Historial de cotizaciones guardado

---

## 📖 Documentación

### 🎯 Primeros Pasos
1. **[`INICIO_RAPIDO_EMAIL.md`](INICIO_RAPIDO_EMAIL.md)** - Configurar emails (CRÍTICO)
2. **[`EMPIEZA_AQUI.md`](EMPIEZA_AQUI.md)** - Guía de inicio completa
3. **[`CHECKLIST_CONFIGURACION_EMAIL.md`](CHECKLIST_CONFIGURACION_EMAIL.md)** - Checklist paso a paso

### 📧 Configuración de Email
- **[`GUIA_EMAIL_RAPIDA.md`](GUIA_EMAIL_RAPIDA.md)** - 5 minutos
- **[`CONFIGURACION_EMAIL.md`](CONFIGURACION_EMAIL.md)** - Detallada
- **[`CAMBIOS_SISTEMA_EMAIL.md`](CAMBIOS_SISTEMA_EMAIL.md)** - Técnica

### 📚 Documentación General
- **[`GUIA_NAVEGACION.md`](GUIA_NAVEGACION.md)** - Mapa de documentos
- **[`RESUMEN_CAMBIOS.md`](RESUMEN_CAMBIOS.md)** - Registro de cambios
- **[`PROXIMOS_PASOS.md`](PROXIMOS_PASOS.md)** - Roadmap
- **[`DOCUMENTACION_COMPLETA.md`](DOCUMENTACION_COMPLETA.md)** - Guía completa

---

## 🛠️ Stack Tecnológico

- **Framework:** React 19 + TypeScript
- **UI:** Tailwind CSS + shadcn/ui v4
- **Iconos:** Phosphor Icons
- **Animaciones:** Framer Motion
- **Email:** EmailJS
- **Storage:** Spark KV (key-value storage)
- **Build:** Vite

---

## 📁 Estructura del Proyecto

```
src/
├── App.tsx                          # Sitio público principal
├── components/
│   ├── Dashboard.tsx                # Panel administrativo
│   ├── PublicTracking.tsx           # Tracking público
│   ├── EmailConfigStatus.tsx        # Estado de email
│   ├── ExcelImport.tsx             # Importación de datos
│   └── ui/                          # Componentes shadcn
├── lib/
│   ├── emailjs-config.ts           # 🔥 CONFIGURAR AQUÍ
│   └── utils.ts
└── index.css                        # Estilos y tema
```

---

## ⚙️ Configuración

### 1. EmailJS (REQUERIDO para cotizaciones)
```typescript
// Editar: src/lib/emailjs-config.ts
export const EMAILJS_CONFIG = {
  PUBLIC_KEY: 'TU_PUBLIC_KEY',
  SERVICE_ID: 'TU_SERVICE_ID',
  TEMPLATE_ID: 'TU_TEMPLATE_ID',
  TO_EMAIL: 'bridvanovich@twf.uy'
}
```
👉 Ver [`GUIA_EMAIL_RAPIDA.md`](GUIA_EMAIL_RAPIDA.md)

### 2. Variables de Entorno (Opcional)
```bash
# .env
VITE_ADMIN_PASSWORD=tu_password_admin
```

---

## 🚀 Despliegue

### Vercel (Recomendado)
```bash
npm i -g vercel
vercel --prod
```

### Netlify
```bash
npm i -g netlify-cli
netlify deploy --prod
```

---

## 📊 Estado del Sistema

| Funcionalidad | Estado | Acción Requerida |
|---------------|--------|------------------|
| Sitio público | ✅ Funcional | - |
| Tracking público | ✅ Funcional | - |
| Dashboard admin | ✅ Funcional | - |
| Importación Google Sheets | ✅ Funcional | - |
| **Formulario cotizaciones** | ⚠️ Requiere config | **Configurar EmailJS** |
| Sync bidireccional | ⏳ Pendiente | Publicar app |

---

## 🆘 Soporte

- **Email:** bridvanovich@twf.uy
- **WhatsApp:** +598 99 511 196
- **Documentación:** Ver archivos `.md` en el proyecto

---

## 📄 Licencia

MIT License - Copyright GitHub, Inc.

---

**🎯 Próximo Paso Crítico:** Configurar EmailJS siguiendo [`INICIO_RAPIDO_EMAIL.md`](INICIO_RAPIDO_EMAIL.md)
