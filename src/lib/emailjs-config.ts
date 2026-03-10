export const EMAILJS_CONFIG = {
  PUBLIC_KEY: '1aATpoWycn9fIqrzd',     // ← Pega aquí
  SERVICE_ID: 'service_sh86jph',   // ← Pega aquí
  TEMPLATE_ID: 'template_9hhcjmw', // ← Pega aquí
  TO_EMAIL: 'bridvanovich@twf.uy'  // ← Ya está configurado
}

export const isEmailJSConfigured = () => {
  return (
    EMAILJS_CONFIG.PUBLIC_KEY !== '1aATpoWycn9fIqrzd' &&
    EMAILJS_CONFIG.SERVICE_ID !== 'service_sh86jph' &&
    EMAILJS_CONFIG.TEMPLATE_ID !== 'template_9hhcjmw'
  )
}
