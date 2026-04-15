declare global {
  interface Window {
    gtag?: (
      command: string,
      targetId: string | Date,
      config?: Record<string, any>
    ) => void
    dataLayer?: any[]
  }
}

export const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID || ''

const isGAConfigured = (): boolean => {
  if (!GA_TRACKING_ID) return false
  if (GA_TRACKING_ID.startsWith('G-XXX')) return false
  return true
}

export const pageview = (url: string) => {
  if (!isGAConfigured()) return
  if (typeof window.gtag !== 'undefined') {
    window.gtag('config', GA_TRACKING_ID, {
      page_path: url,
    })
  }
}

export const event = ({ action, category, label, value }: {
  action: string
  category: string
  label?: string
  value?: number
}) => {
  if (!isGAConfigured()) return
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    })
  }
}

export const trackQuoteSubmission = (cargoType: string) => {
  event({
    action: 'submit_quote_form',
    category: 'engagement',
    label: cargoType,
  })
}

export const trackWhatsAppClick = () => {
  event({
    action: 'click_whatsapp',
    category: 'engagement',
    label: 'floating_button',
  })
}

export const trackEmailClick = () => {
  event({
    action: 'click_email',
    category: 'engagement',
    label: 'contact_section',
  })
}

export const trackTrackingQuery = (searchTerm: string) => {
  event({
    action: 'search_tracking',
    category: 'engagement',
    label: searchTerm,
  })
}

export const trackPhoneClick = () => {
  event({
    action: 'click_phone',
    category: 'engagement',
    label: 'contact_section',
  })
}

export const trackNavigationClick = (section: string) => {
  event({
    action: 'click_navigation',
    category: 'navigation',
    label: section,
  })
}

export const trackServiceView = (serviceName: string) => {
  event({
    action: 'view_service',
    category: 'engagement',
    label: serviceName,
  })
}

export const initGA = () => {
  if (!isGAConfigured()) return
  if (typeof window !== 'undefined' && !window.gtag) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() {
      window.dataLayer?.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', GA_TRACKING_ID, {
      send_page_view: false,
    })
  }
}
