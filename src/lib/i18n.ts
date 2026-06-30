export type Language = 'es' | 'en' | 'pt'

export interface Translations {
  nav: {
    home: string
    services: string
    tracking: string
    about: string
    caseStudies: string
    coverage: string
    faq: string
    contact: string
    admin: string
    quote: string
    clientPortal: string
  }
  hero: {
    title: string
    subtitle: string
    quoteButton: string
    contactButton: string
    speed: string
    speedDesc: string
    transparency: string
    transparencyDesc: string
    efficiency: string
    efficiencyDesc: string
  }
  services: {
    title: string
    subtitle: string
    maritime: string
    maritimeDesc: string
    maritimeDetails: string[]
    land: string
    landDesc: string
    landDetails: string[]
    air: string
    airDesc: string
    airDetails: string[]
    local: string
    localDesc: string
    localDetails: string[]
    consulting: string
    consultingDesc: string
    consultingDetails: string[]
    special: string
    specialDesc: string
    specialDetails: string[]
  }
  auth: {
    adminInvalid: string
    partnerInvalid: string
    loginSuccess: string
    connectionError: string
    verifying: string
    sending: string
    login: string
    enterEmail: string
    waitCountdown: string
    codeSent: string
    newCodeSent: string
    otpSendError: string
    otpProcessError: string
    otpIncorrect: string
    otpVerifyError: string
    welcome: string
  }
  tracking: {
    title: string
    subtitle: string
    placeholder: string
    search: string
    noResults: string
    status: string
    eta: string
    freeDays: string
    urgent: string
    expired: string
    inputLabel: string
    searching: string
    helpText: string
    howToTitle: string
    howToIntro: string
    howToCntrLabel: string
    howToCntrEx: string
    howToMblLabel: string
    howToMblDesc: string
    howToRefLabel: string
    howToRefEx: string
    howToFooter: string
    notFoundTitle: string
    notFoundPrefix: string
    notFoundSuffix: string
    errorEnterQuery: string
    errorSearch: string
    foundToast: string
    notFoundToast: string
    resultTitle: string
    refLabel: string
    etdLabel: string
    etaLabel: string
    buqueLabel: string
    lineaLabel: string
    terminalLabel: string
    containersLabel: string
    pending: string
    toBeConfirmed: string
    noContainerInfo: string
    moreInfo: string
  }
  about: {
    paragraph1Part1: string
    paragraph1Part2: string
    paragraph2: string
    stats: { years: string; offices: string; destinations: string; support: string }
    values: Array<{ title: string; desc: string }>
    teamCaption: string
  }
  operativas: {
    title: string
    subtitle: string
    photoLoading: string
    photoCrane: string
    photoYard: string
    photoWarehouse: string
    photoSupervising: string
    photoForklift: string
  }
  quote: {
    title: string
    subtitle: string
    name: string
    email: string
    phone: string
    cargoType: string
    origin: string
    destination: string
    details: string
    submit: string
    captchaPrompt: string
    submitting: string
    success: string
    error: string
    select: string
    maritime: string
    land: string
    air: string
    multimodal: string
    cityCountry: string
    detailsPlaceholder: string
    validationError: string
  }
  testimonials: {
    title: string
    subtitle: string
  }
  faq: {
    title: string
    subtitle: string
    contactNote: string
  }
  cta: {
    title: string
    subtitle: string
    onlineQuote: string
  }
  footerNav: {
    maritimeFreight: string
    landFreight: string
    airFreight: string
    company: string
    location: string
    terms: string
    privacy: string
    slogan2: string
  }
  footer: {
    slogan: string
    rights: string
  }
  common: {
    loading: string
    yes: string
    no: string
    save: string
    cancel: string
    delete: string
    edit: string
    close: string
    download: string
    upload: string
  }
  clientPortal: {
    title: string
    login: string
    logout: string
    myShipments: string
    activeShipments: string
    history: string
    documents: string
    uploadDocument: string
    downloadDocument: string
    noShipments: string
    email: string
    password: string
    loginButton: string
    forgotPassword: string
  }
  dashboard: {
    title: string
    stats: string
    quotes: string
    shipments: string
    analytics: string
    exportPDF: string
    exportExcel: string
    totalShipments: string
    urgentShipments: string
    overdueShipments: string
    shipmentsPerMonth: string
    topClients: string
    averageTransit: string
    byTransportMode: string
    byOrigin: string
    byDestination: string
    quoteStatus: string
    pending: string
    responded: string
    won: string
    lost: string
    addNote: string
    notes: string
    conversionRate: string
  }
  facts: {
    title: string
    fact1: string
    fact2: string
    fact3: string
    fact4: string
    fact5: string
  }
}

export const translations: Record<Language, Translations> = {
  es: {
    nav: {
      home: 'Inicio',
      services: 'Servicios',
      tracking: 'Tracking',
      about: 'Nosotros',
      caseStudies: 'Casos de Éxito',
      coverage: 'Cobertura',
      faq: 'FAQ',
      contact: 'Contacto',
      admin: 'Admin',
      quote: 'Cotizar',
      clientPortal: 'Portal Cliente'
    },
    hero: {
      title: 'Transit World Forwarding - Soluciones Logísticas Globales a Tu Medida',
      subtitle: 'Flete marítimo, terrestre y aéreo desde Uruguay al mundo con tracking en tiempo real',
      quoteButton: 'Cotizá tu Carga Gratis',
      contactButton: 'Contactar Ahora',
      speed: 'Rapidez',
      speedDesc: 'Operaciones ágiles y tiempos optimizados',
      transparency: 'Transparencia',
      transparencyDesc: 'Seguimiento en tiempo real de cada carga',
      efficiency: 'Eficiencia',
      efficiencyDesc: 'Rutas optimizadas al mejor costo'
    },
    services: {
      title: 'Nuestros Servicios de Logística Internacional',
      subtitle: 'Flete marítimo, terrestre y aéreo con seguimiento 24/7 y atención personalizada',
      maritime: 'Flete Marítimo Internacional',
      maritimeDesc: 'FCL y LCL desde y hacia todo el mundo',
      maritimeDetails: [
        'Importación y exportación global',
        'Coordinación con MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidado y desconsolidado en depósitos fiscalizados',
        'Gestión completa de documentación'
      ],
      land: 'Flete Terrestre Internacional',
      landDesc: 'Transporte regional puerta a puerta',
      landDetails: [
        'Transporte desde/hacia Brasil, Argentina, Paraguay y Chile',
        'Coordinación puerta a puerta',
        'Seguimiento en tiempo real',
        'Gestión documental completa'
      ],
      air: 'Flete Aéreo Internacional',
      airDesc: 'Servicio express para cargas urgentes',
      airDetails: [
        'Importación/exportación express',
        'Coordinación con principales aerolíneas',
        'Ideal para cargas urgentes o alto valor',
        'Tiempos de tránsito reducidos'
      ],
      local: 'Operativas Locales',
      localDesc: 'Desconsolidación y entregas directas',
      localDetails: [
        'Trasiegos y desconsolidaciones',
        'Entregas directas',
        'Coordinación con Montecon, TCP',
        'Gestión de liberaciones y tasas portuarias'
      ],
      consulting: 'Asesoramiento Logístico',
      consultingDesc: 'Planificación y optimización integral',
      consultingDetails: [
        'Planificación de rutas, tiempos y costos',
        'Asistencia aduanera y documentación',
        'Optimización de embarques',
        'Consultoría personalizada'
      ],
      special: 'Cargas Especiales e IMO',
      specialDesc: 'Transporte certificado de cargas peligrosas',
      specialDetails: [
        'Coordinación segura y certificada',
        'Cargas peligrosas o sobredimensionadas',
        'Seguimiento detallado',
        'Cumplimiento normativo total'
      ]
    },
    tracking: {
      title: 'Tracking de Contenedores en Tiempo Real',
      subtitle: 'Ingrese el número de contenedor o referencia para rastrear su envío desde origen hasta destino',
      placeholder: 'Ej: TCNU6972495, A7039',
      search: 'Buscar',
      noResults: 'No se encontraron resultados',
      status: 'Estado',
      eta: 'ETA',
      freeDays: 'Días libres',
      urgent: 'Urgente',
      expired: 'Vencido',
      inputLabel: 'Número de Contenedor, MBL o Referencia',
      searching: 'Buscando...',
      helpText: 'Ingrese el número de contenedor, MBL o referencia para rastrear su envío',
      howToTitle: '¿Cómo rastrear su envío?',
      howToIntro: 'Puede buscar su carga utilizando cualquiera de los siguientes datos:',
      howToCntrLabel: 'Número de Contenedor',
      howToCntrEx: '(Ej: TCNU6972495)',
      howToMblLabel: 'Número de MBL',
      howToMblDesc: '(Conocimiento de embarque)',
      howToRefLabel: 'Referencia',
      howToRefEx: '(Ej: A7039)',
      howToFooter: 'Si no cuenta con estos datos, contáctenos por WhatsApp o email y le proporcionaremos la información de seguimiento.',
      notFoundTitle: 'No se encontraron resultados',
      notFoundPrefix: 'No se encontró ningún envío con',
      notFoundSuffix: '. Verifique el número ingresado o contáctenos por WhatsApp para asistencia.',
      errorEnterQuery: 'Ingrese un número de contenedor, MBL o referencia',
      errorSearch: 'Error al buscar. Intente nuevamente.',
      foundToast: 'Envío encontrado',
      notFoundToast: 'No se encontró el envío. Verifique el número ingresado.',
      resultTitle: 'Información del Envío',
      refLabel: 'Referencia',
      etdLabel: 'ETD (Salida)',
      etaLabel: 'ETA (Llegada estimada)',
      buqueLabel: 'Buque',
      lineaLabel: 'Línea Naviera',
      terminalLabel: 'Terminal',
      containersLabel: 'Contenedores',
      pending: 'Pendiente',
      toBeConfirmed: 'Por confirmar',
      noContainerInfo: 'Sin información de contenedores',
      moreInfo: 'Para más información sobre su envío, contacte a nuestro equipo vía WhatsApp o email.'
    },
    about: {
      paragraph1Part1: 'Con más de 15 años en comercio exterior,',
      paragraph1Part2: 'conecta tu negocio con más de 250 destinos en los 5 continentes.',
      paragraph2: 'Operamos desde Uruguay y Argentina con una red de agentes de confianza en los principales puertos del mundo. Cada cliente tiene un ejecutivo asignado que coordina su carga de punta a punta.',
      stats: {
        years: 'Años de Experiencia',
        offices: 'Oficinas Operativas',
        destinations: 'Destinos Conectados',
        support: 'Atención Continua'
      },
      values: [
        { title: 'Compromiso', desc: 'Dedicación total con cada cliente y operación' },
        { title: 'Eficiencia', desc: 'Procesos optimizados y resultados medibles' },
        { title: 'Comunicación', desc: 'Información clara y constante' },
        { title: 'Soluciones', desc: 'Estrategias inteligentes y personalizadas' }
      ],
      teamCaption: 'Nuestro equipo en terreno — supervisión directa de operativas en depósito fiscal'
    },
    operativas: {
      title: 'Nuestras Operativas',
      subtitle: 'Imágenes reales de nuestras operaciones logísticas en puertos, depósitos y rutas internacionales',
      photoLoading: 'Carga de contenedores',
      photoCrane: 'Operativa portuaria',
      photoYard: 'Depósito de contenedores',
      photoWarehouse: 'Desconsolidado en depósito',
      photoSupervising: 'Supervisión en terreno',
      photoForklift: 'Manejo de mercadería'
    },
    quote: {
      title: 'Cotizá tu Flete Internacional Gratis',
      subtitle: 'Completá el formulario y recibí tu cotización en menos de 24 horas',
      name: 'Nombre / Empresa',
      email: 'Email',
      phone: 'WhatsApp / Teléfono',
      cargoType: 'Tipo de Carga',
      origin: 'Origen',
      destination: 'Destino',
      details: 'Detalle de la Carga',
      submit: 'Enviar Cotización',
      captchaPrompt: 'Completá el captcha',
      submitting: 'Enviando...',
      success: '¡Cotización enviada exitosamente! Nos contactaremos pronto.',
      error: 'Hubo un error al enviar la cotización. Por favor intente nuevamente o contáctenos por WhatsApp.',
      select: 'Seleccionar...',
      maritime: 'Marítima (FCL/LCL)',
      land: 'Terrestre',
      air: 'Aérea',
      multimodal: 'Multimodal',
      cityCountry: 'Ciudad, País',
      detailsPlaceholder: 'Tipo de mercadería, peso aproximado, dimensiones, etc.',
      validationError: 'Por favor complete los campos requeridos'
    },
    testimonials: {
      title: 'Lo que dicen nuestros clientes',
      subtitle: 'Empresas que eligen TWF para mover su carga al mundo'
    },
    faq: {
      title: 'Preguntas Frecuentes',
      subtitle: 'Respuestas a las consultas más comunes sobre nuestros servicios',
      contactNote: 'Respondemos consultas en menos de 24 horas por WhatsApp, email o teléfono'
    },
    cta: {
      title: '¿Listo para mover tu carga?',
      subtitle: 'Cotizá en minutos. Respuesta inmediata por WhatsApp.',
      onlineQuote: 'Cotizar Online'
    },
    footerNav: {
      maritimeFreight: 'Flete Marítimo',
      landFreight: 'Flete Terrestre',
      airFreight: 'Flete Aéreo',
      company: 'Empresa',
      location: 'Ubicación',
      terms: 'Términos y Condiciones',
      privacy: 'Política de Privacidad',
      slogan2: 'Soluciones logísticas globales con atención local'
    },
    footer: {
      slogan: 'Movemos tu negocio al mundo',
      rights: 'Todos los derechos reservados.'
    },
    common: {
      loading: 'Cargando...',
      yes: 'Sí',
      no: 'No',
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      close: 'Cerrar',
      download: 'Descargar',
      upload: 'Subir'
    },
    clientPortal: {
      title: 'Portal de Cliente',
      login: 'Iniciar Sesión',
      logout: 'Cerrar Sesión',
      myShipments: 'Mis Cargas',
      activeShipments: 'Cargas Activas',
      history: 'Historial',
      documents: 'Documentos',
      uploadDocument: 'Subir Documento',
      downloadDocument: 'Descargar',
      noShipments: 'No hay cargas para mostrar',
      email: 'Email',
      password: 'Contraseña',
      loginButton: 'Ingresar',
      forgotPassword: '¿Olvidaste tu contraseña?'
    },
    dashboard: {
      title: 'Panel de Administración',
      stats: 'Estadísticas',
      quotes: 'Cotizaciones',
      shipments: 'Cargas',
      analytics: 'Analíticas',
      exportPDF: 'Exportar PDF',
      exportExcel: 'Exportar Excel',
      totalShipments: 'Total Cargas',
      urgentShipments: 'Urgentes',
      overdueShipments: 'Vencidas',
      shipmentsPerMonth: 'Cargas por Mes',
      topClients: 'Top 5 Clientes',
      averageTransit: 'Tiempo Promedio de Tránsito',
      byTransportMode: 'Por Modo de Transporte',
      byOrigin: 'Por País de Origen',
      byDestination: 'Por País de Destino',
      quoteStatus: 'Estado de Cotización',
      pending: 'Pendiente',
      responded: 'Respondida',
      won: 'Ganada',
      lost: 'Perdida',
      addNote: 'Agregar Nota',
      notes: 'Notas',
      conversionRate: 'Tasa de Conversión'
    },
    facts: {
      title: '¿Sabías que?',
      fact1: 'El 90% del comercio mundial se realiza por vía marítima',
      fact2: 'Un contenedor de 40 pies puede transportar hasta 10.000 cajas de vino',
      fact3: 'El flete aéreo puede reducir hasta 15 días el tiempo de tránsito comparado con el marítimo',
      fact4: 'La consolidación de carga puede reducir costos hasta un 60% en fletes internacionales',
      fact5: 'Los tiempos de tránsito marítimo típicos: Asia 35-45 días, Europa 25-35 días, EEUU 20-30 días'
    },
    auth: {
      adminInvalid: 'Usuario o contraseña incorrectos',
      partnerInvalid: 'Credenciales incorrectas',
      loginSuccess: 'Inicio de sesión exitoso',
      connectionError: 'Error de conexión — intentá nuevamente',
      verifying: 'Verificando...',
      sending: 'Enviando...',
      login: 'Ingresar',
      enterEmail: 'Ingresá tu email',
      waitCountdown: 'Esperá {s}s para reenviar',
      codeSent: 'Código enviado a {email}',
      newCodeSent: 'Nuevo código enviado',
      otpSendError: 'Error al enviar el código',
      otpProcessError: 'Error al procesar la solicitud',
      otpIncorrect: 'Código incorrecto',
      otpVerifyError: 'Error al verificar el código',
      welcome: 'Bienvenido/a'
    }
  },
  en: {
    nav: {
      home: 'Home',
      services: 'Services',
      tracking: 'Tracking',
      about: 'About Us',
      caseStudies: 'Success Stories',
      coverage: 'Coverage',
      faq: 'FAQ',
      contact: 'Contact',
      admin: 'Admin',
      quote: 'Quote',
      clientPortal: 'Client Portal'
    },
    hero: {
      title: 'Transit World Forwarding - Global Logistics Solutions Tailored to You',
      subtitle: 'Ocean, land, and air freight from Uruguay worldwide with real-time tracking',
      quoteButton: 'Get a Free Quote',
      contactButton: 'Contact Now',
      speed: 'Speed',
      speedDesc: 'Agile operations and optimized times',
      transparency: 'Transparency',
      transparencyDesc: 'Real-time tracking for every shipment',
      efficiency: 'Efficiency',
      efficiencyDesc: 'Optimized routes at the best cost'
    },
    services: {
      title: 'Our International Logistics Services',
      subtitle: 'Ocean, land, and air freight with 24/7 tracking and personalized support',
      maritime: 'International Maritime Freight',
      maritimeDesc: 'FCL and LCL worldwide',
      maritimeDetails: [
        'Global import and export',
        'Coordination with MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidation and deconsolidation in bonded warehouses',
        'Full documentation management'
      ],
      land: 'International Land Freight',
      landDesc: 'Regional door-to-door transport',
      landDetails: [
        'Transport to/from Brazil, Argentina, Paraguay and Chile',
        'Door-to-door coordination',
        'Real-time tracking',
        'Full documentation management'
      ],
      air: 'International Air Freight',
      airDesc: 'Express service for urgent cargo',
      airDetails: [
        'Express import/export',
        'Coordination with major airlines',
        'Ideal for urgent or high-value cargo',
        'Reduced transit times'
      ],
      local: 'Local Operations',
      localDesc: 'Deconsolidation and direct deliveries',
      localDetails: [
        'Transfers and deconsolidations',
        'Direct deliveries',
        'Coordination with Montecon, TCP',
        'Release management and port fees'
      ],
      consulting: 'Logistics Consulting',
      consultingDesc: 'Comprehensive planning and optimization',
      consultingDetails: [
        'Route, timing and cost planning',
        'Customs assistance and documentation',
        'Shipment optimization',
        'Personalized consulting'
      ],
      special: 'Special Cargo and IMO',
      specialDesc: 'Certified transport of dangerous goods',
      specialDetails: [
        'Safe and certified coordination',
        'Dangerous or oversized cargo',
        'Detailed tracking',
        'Full regulatory compliance'
      ]
    },
    tracking: {
      title: 'Real-Time Container Tracking',
      subtitle: 'Enter container number or reference to track your shipment from origin to destination',
      placeholder: 'Ex: TCNU6972495, A7039',
      search: 'Search',
      noResults: 'No results found',
      status: 'Status',
      eta: 'ETA',
      freeDays: 'Free days',
      urgent: 'Urgent',
      expired: 'Expired',
      inputLabel: 'Container number, MBL or Reference',
      searching: 'Searching...',
      helpText: 'Enter the container number, MBL or reference to track your shipment',
      howToTitle: 'How to track your shipment?',
      howToIntro: 'You can search for your cargo using any of the following data:',
      howToCntrLabel: 'Container Number',
      howToCntrEx: '(Ex: TCNU6972495)',
      howToMblLabel: 'MBL Number',
      howToMblDesc: '(Master Bill of Lading)',
      howToRefLabel: 'Reference',
      howToRefEx: '(Ex: A7039)',
      howToFooter: "If you don't have this data, contact us via WhatsApp or email and we'll provide the tracking information.",
      notFoundTitle: 'No results found',
      notFoundPrefix: 'No shipment found for',
      notFoundSuffix: '. Check the number you entered or contact us via WhatsApp for assistance.',
      errorEnterQuery: 'Enter a container number, MBL or reference',
      errorSearch: 'Search error. Please try again.',
      foundToast: 'Shipment found',
      notFoundToast: 'Shipment not found. Check the number you entered.',
      resultTitle: 'Shipment Information',
      refLabel: 'Reference',
      etdLabel: 'ETD (Departure)',
      etaLabel: 'ETA (Estimated arrival)',
      buqueLabel: 'Vessel',
      lineaLabel: 'Shipping Line',
      terminalLabel: 'Terminal',
      containersLabel: 'Containers',
      pending: 'Pending',
      toBeConfirmed: 'To be confirmed',
      noContainerInfo: 'No container information',
      moreInfo: 'For more information about your shipment, contact our team via WhatsApp or email.'
    },
    about: {
      paragraph1Part1: 'With over 15 years in foreign trade,',
      paragraph1Part2: 'connects your business with 250+ destinations across 5 continents.',
      paragraph2: 'We operate from Uruguay and Argentina with a network of trusted agents in the world’s main ports. Every client gets a dedicated account executive who coordinates their cargo end to end.',
      stats: {
        years: 'Years of Experience',
        offices: 'Operations Offices',
        destinations: 'Connected Destinations',
        support: 'Continuous Support'
      },
      values: [
        { title: 'Commitment', desc: 'Total dedication to each client and operation' },
        { title: 'Efficiency', desc: 'Optimized processes and measurable results' },
        { title: 'Communication', desc: 'Clear and constant information' },
        { title: 'Solutions', desc: 'Smart and personalized strategies' }
      ],
      teamCaption: 'Our team on the ground — direct supervision of operations at the fiscal depot'
    },
    operativas: {
      title: 'Our Operations',
      subtitle: 'Real images of our logistics operations at ports, depots and international routes',
      photoLoading: 'Container loading',
      photoCrane: 'Port operations',
      photoYard: 'Container yard',
      photoWarehouse: 'Warehouse deconsolidation',
      photoSupervising: 'Field supervision',
      photoForklift: 'Cargo handling'
    },
    quote: {
      title: 'Get Your Free International Freight Quote',
      subtitle: 'Fill out the form and receive your quote within 24 hours',
      name: 'Name / Company',
      email: 'Email',
      phone: 'WhatsApp / Phone',
      cargoType: 'Cargo Type',
      origin: 'Origin',
      destination: 'Destination',
      details: 'Cargo Details',
      submit: 'Send Quote',
      captchaPrompt: 'Complete the captcha',
      submitting: 'Sending...',
      success: 'Quote sent successfully! We will contact you soon.',
      error: 'There was an error sending the quote. Please try again or contact us via WhatsApp.',
      select: 'Select...',
      maritime: 'Maritime (FCL/LCL)',
      land: 'Land',
      air: 'Air',
      multimodal: 'Multimodal',
      cityCountry: 'City, Country',
      detailsPlaceholder: 'Type of goods, approximate weight, dimensions, etc.',
      validationError: 'Please fill in the required fields'
    },
    testimonials: {
      title: 'What our clients say',
      subtitle: 'Companies that choose TWF to move their cargo worldwide'
    },
    faq: {
      title: 'Frequently Asked Questions',
      subtitle: 'Answers to the most common questions about our services',
      contactNote: 'We respond to inquiries within 24 hours via WhatsApp, email, or phone'
    },
    cta: {
      title: 'Ready to move your cargo?',
      subtitle: 'Get a quote in minutes. Instant WhatsApp response.',
      onlineQuote: 'Online Quote'
    },
    footerNav: {
      maritimeFreight: 'Maritime Freight',
      landFreight: 'Land Freight',
      airFreight: 'Air Freight',
      company: 'Company',
      location: 'Location',
      terms: 'Terms & Conditions',
      privacy: 'Privacy Policy',
      slogan2: 'Global logistics solutions with local attention'
    },
    footer: {
      slogan: 'Moving your business to the world',
      rights: 'All rights reserved.'
    },
    common: {
      loading: 'Loading...',
      yes: 'Yes',
      no: 'No',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      download: 'Download',
      upload: 'Upload'
    },
    clientPortal: {
      title: 'Client Portal',
      login: 'Login',
      logout: 'Logout',
      myShipments: 'My Shipments',
      activeShipments: 'Active Shipments',
      history: 'History',
      documents: 'Documents',
      uploadDocument: 'Upload Document',
      downloadDocument: 'Download',
      noShipments: 'No shipments to display',
      email: 'Email',
      password: 'Password',
      loginButton: 'Sign In',
      forgotPassword: 'Forgot password?'
    },
    dashboard: {
      title: 'Admin Dashboard',
      stats: 'Statistics',
      quotes: 'Quotes',
      shipments: 'Shipments',
      analytics: 'Analytics',
      exportPDF: 'Export PDF',
      exportExcel: 'Export Excel',
      totalShipments: 'Total Shipments',
      urgentShipments: 'Urgent',
      overdueShipments: 'Overdue',
      shipmentsPerMonth: 'Shipments per Month',
      topClients: 'Top 5 Clients',
      averageTransit: 'Average Transit Time',
      byTransportMode: 'By Transport Mode',
      byOrigin: 'By Country of Origin',
      byDestination: 'By Country of Destination',
      quoteStatus: 'Quote Status',
      pending: 'Pending',
      responded: 'Responded',
      won: 'Won',
      lost: 'Lost',
      addNote: 'Add Note',
      notes: 'Notes',
      conversionRate: 'Conversion Rate'
    },
    facts: {
      title: 'Did you know?',
      fact1: '90% of global trade is carried by sea',
      fact2: 'A 40-foot container can transport up to 10,000 wine boxes',
      fact3: 'Air freight can reduce transit time by up to 15 days compared to maritime',
      fact4: 'Cargo consolidation can reduce costs by up to 60% in international freight',
      fact5: 'Typical maritime transit times: Asia 35-45 days, Europe 25-35 days, USA 20-30 days'
    },
    auth: {
      adminInvalid: 'Invalid username or password',
      partnerInvalid: 'Invalid credentials',
      loginSuccess: 'Signed in successfully',
      connectionError: 'Connection error — please try again',
      verifying: 'Verifying...',
      sending: 'Sending...',
      login: 'Sign in',
      enterEmail: 'Enter your email',
      waitCountdown: 'Wait {s}s before resending',
      codeSent: 'Code sent to {email}',
      newCodeSent: 'New code sent',
      otpSendError: 'Error sending the code',
      otpProcessError: 'Error processing the request',
      otpIncorrect: 'Incorrect code',
      otpVerifyError: 'Error verifying the code',
      welcome: 'Welcome'
    }
  },
  pt: {
    nav: {
      home: 'Início',
      services: 'Serviços',
      tracking: 'Rastreamento',
      about: 'Sobre Nós',
      caseStudies: 'Cases de Sucesso',
      coverage: 'Cobertura',
      faq: 'FAQ',
      contact: 'Contato',
      admin: 'Admin',
      quote: 'Cotação',
      clientPortal: 'Portal do Cliente'
    },
    hero: {
      title: 'Transit World Forwarding - Soluções Logísticas Globais Personalizadas',
      subtitle: 'Frete marítimo, terrestre e aéreo do Uruguai ao mundo com rastreamento em tempo real',
      quoteButton: 'Cotar sua Carga Grátis',
      contactButton: 'Contatar Agora',
      speed: 'Rapidez',
      speedDesc: 'Operações ágeis e tempos otimizados',
      transparency: 'Transparência',
      transparencyDesc: 'Rastreamento em tempo real de cada carga',
      efficiency: 'Eficiência',
      efficiencyDesc: 'Rotas otimizadas ao melhor custo'
    },
    services: {
      title: 'Nossos Serviços de Logística Internacional',
      subtitle: 'Frete marítimo, terrestre e aéreo com rastreamento 24/7 e atendimento personalizado',
      maritime: 'Frete Marítimo Internacional',
      maritimeDesc: 'FCL e LCL para todo o mundo',
      maritimeDetails: [
        'Importação e exportação global',
        'Coordenação com MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidação e desconsolidação em armazéns alfandegados',
        'Gestão completa de documentação'
      ],
      land: 'Frete Terrestre Internacional',
      landDesc: 'Transporte regional porta a porta',
      landDetails: [
        'Transporte de/para Brasil, Argentina, Paraguai e Chile',
        'Coordenação porta a porta',
        'Rastreamento em tempo real',
        'Gestão documental completa'
      ],
      air: 'Frete Aéreo Internacional',
      airDesc: 'Serviço expresso para cargas urgentes',
      airDetails: [
        'Importação/exportação expressa',
        'Coordenação com as principais companhias aéreas',
        'Ideal para cargas urgentes ou de alto valor',
        'Tempos de trânsito reduzidos'
      ],
      local: 'Operações Locais',
      localDesc: 'Desconsolidação e entregas diretas',
      localDetails: [
        'Transferências e desconsolidações',
        'Entregas diretas',
        'Coordenação com Montecon, TCP',
        'Gestão de liberações e taxas portuárias'
      ],
      consulting: 'Consultoria Logística',
      consultingDesc: 'Planejamento e otimização integral',
      consultingDetails: [
        'Planejamento de rotas, tempos e custos',
        'Assistência aduaneira e documentação',
        'Otimização de embarques',
        'Consultoria personalizada'
      ],
      special: 'Cargas Especiais e IMO',
      specialDesc: 'Transporte certificado de cargas perigosas',
      specialDetails: [
        'Coordenação segura e certificada',
        'Cargas perigosas ou sobredimensionadas',
        'Rastreamento detalhado',
        'Cumprimento regulatório total'
      ]
    },
    tracking: {
      title: 'Rastreamento de Contêineres em Tempo Real',
      subtitle: 'Digite o número do contêiner ou referência para rastrear seu envio da origem ao destino',
      placeholder: 'Ex: TCNU6972495, A7039',
      search: 'Buscar',
      noResults: 'Nenhum resultado encontrado',
      status: 'Status',
      eta: 'ETA',
      freeDays: 'Dias livres',
      urgent: 'Urgente',
      expired: 'Vencido',
      inputLabel: 'Número do Contêiner, MBL ou Referência',
      searching: 'Buscando...',
      helpText: 'Digite o número do contêiner, MBL ou referência para rastrear seu envio',
      howToTitle: 'Como rastrear seu envio?',
      howToIntro: 'Você pode buscar sua carga usando qualquer um dos seguintes dados:',
      howToCntrLabel: 'Número do Contêiner',
      howToCntrEx: '(Ex: TCNU6972495)',
      howToMblLabel: 'Número do MBL',
      howToMblDesc: '(Conhecimento de embarque)',
      howToRefLabel: 'Referência',
      howToRefEx: '(Ex: A7039)',
      howToFooter: 'Se você não tiver esses dados, entre em contato via WhatsApp ou e-mail e forneceremos as informações de rastreamento.',
      notFoundTitle: 'Nenhum resultado encontrado',
      notFoundPrefix: 'Nenhum envio encontrado para',
      notFoundSuffix: '. Verifique o número digitado ou entre em contato via WhatsApp para assistência.',
      errorEnterQuery: 'Digite um número de contêiner, MBL ou referência',
      errorSearch: 'Erro ao buscar. Tente novamente.',
      foundToast: 'Envio encontrado',
      notFoundToast: 'Envio não encontrado. Verifique o número digitado.',
      resultTitle: 'Informações do Envio',
      refLabel: 'Referência',
      etdLabel: 'ETD (Saída)',
      etaLabel: 'ETA (Chegada estimada)',
      buqueLabel: 'Navio',
      lineaLabel: 'Companhia Marítima',
      terminalLabel: 'Terminal',
      containersLabel: 'Contêineres',
      pending: 'Pendente',
      toBeConfirmed: 'A confirmar',
      noContainerInfo: 'Sem informações de contêineres',
      moreInfo: 'Para mais informações sobre seu envio, entre em contato com nossa equipe via WhatsApp ou e-mail.'
    },
    about: {
      paragraph1Part1: 'Com mais de 15 anos em comércio exterior,',
      paragraph1Part2: 'conecta seu negócio a mais de 250 destinos em 5 continentes.',
      paragraph2: 'Operamos do Uruguai e Argentina com uma rede de agentes de confiança nos principais portos do mundo. Cada cliente tem um executivo dedicado que coordena sua carga de ponta a ponta.',
      stats: {
        years: 'Anos de Experiência',
        offices: 'Escritórios Operacionais',
        destinations: 'Destinos Conectados',
        support: 'Atendimento Contínuo'
      },
      values: [
        { title: 'Compromisso', desc: 'Dedicação total com cada cliente e operação' },
        { title: 'Eficiência', desc: 'Processos otimizados e resultados mensuráveis' },
        { title: 'Comunicação', desc: 'Informação clara e constante' },
        { title: 'Soluções', desc: 'Estratégias inteligentes e personalizadas' }
      ],
      teamCaption: 'Nossa equipe em campo — supervisão direta das operações em depósito alfandegado'
    },
    operativas: {
      title: 'Nossas Operações',
      subtitle: 'Imagens reais de nossas operações logísticas em portos, depósitos e rotas internacionais',
      photoLoading: 'Carregamento de contêineres',
      photoCrane: 'Operação portuária',
      photoYard: 'Pátio de contêineres',
      photoWarehouse: 'Desconsolidação em depósito',
      photoSupervising: 'Supervisão em campo',
      photoForklift: 'Manuseio de mercadoria'
    },
    quote: {
      title: 'Solicite sua Cotação de Frete Grátis',
      subtitle: 'Preencha o formulário e receba sua cotação em menos de 24 horas',
      name: 'Nome / Empresa',
      email: 'Email',
      phone: 'WhatsApp / Telefone',
      cargoType: 'Tipo de Carga',
      origin: 'Origem',
      destination: 'Destino',
      details: 'Detalhes da Carga',
      submit: 'Enviar Cotação',
      captchaPrompt: 'Complete o captcha',
      submitting: 'Enviando...',
      success: 'Cotação enviada com sucesso! Entraremos em contato em breve.',
      error: 'Houve um erro ao enviar a cotação. Por favor, tente novamente ou entre em contato via WhatsApp.',
      select: 'Selecionar...',
      maritime: 'Marítima (FCL/LCL)',
      land: 'Terrestre',
      air: 'Aérea',
      multimodal: 'Multimodal',
      cityCountry: 'Cidade, País',
      detailsPlaceholder: 'Tipo de mercadoria, peso aproximado, dimensões, etc.',
      validationError: 'Por favor preencha os campos obrigatórios'
    },
    testimonials: {
      title: 'O que nossos clientes dizem',
      subtitle: 'Empresas que escolhem a TWF para mover sua carga pelo mundo'
    },
    faq: {
      title: 'Perguntas Frequentes',
      subtitle: 'Respostas às perguntas mais comuns sobre nossos serviços',
      contactNote: 'Respondemos consultas em menos de 24 horas por WhatsApp, email ou telefone'
    },
    cta: {
      title: 'Pronto para mover sua carga?',
      subtitle: 'Cotação em minutos. Resposta imediata pelo WhatsApp.',
      onlineQuote: 'Cotação Online'
    },
    footerNav: {
      maritimeFreight: 'Frete Marítimo',
      landFreight: 'Frete Terrestre',
      airFreight: 'Frete Aéreo',
      company: 'Empresa',
      location: 'Localização',
      terms: 'Termos e Condições',
      privacy: 'Política de Privacidade',
      slogan2: 'Soluções logísticas globais com atenção local'
    },
    footer: {
      slogan: 'Movemos seu negócio para o mundo',
      rights: 'Todos os direitos reservados.'
    },
    common: {
      loading: 'Carregando...',
      yes: 'Sim',
      no: 'Não',
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      edit: 'Editar',
      close: 'Fechar',
      download: 'Baixar',
      upload: 'Enviar'
    },
    clientPortal: {
      title: 'Portal do Cliente',
      login: 'Entrar',
      logout: 'Sair',
      myShipments: 'Minhas Cargas',
      activeShipments: 'Cargas Ativas',
      history: 'Histórico',
      documents: 'Documentos',
      uploadDocument: 'Enviar Documento',
      downloadDocument: 'Baixar',
      noShipments: 'Nenhuma carga para exibir',
      email: 'Email',
      password: 'Senha',
      loginButton: 'Entrar',
      forgotPassword: 'Esqueceu a senha?'
    },
    dashboard: {
      title: 'Painel Administrativo',
      stats: 'Estatísticas',
      quotes: 'Cotações',
      shipments: 'Cargas',
      analytics: 'Análises',
      exportPDF: 'Exportar PDF',
      exportExcel: 'Exportar Excel',
      totalShipments: 'Total de Cargas',
      urgentShipments: 'Urgentes',
      overdueShipments: 'Vencidas',
      shipmentsPerMonth: 'Cargas por Mês',
      topClients: 'Top 5 Clientes',
      averageTransit: 'Tempo Médio de Trânsito',
      byTransportMode: 'Por Modo de Transporte',
      byOrigin: 'Por País de Origem',
      byDestination: 'Por País de Destino',
      quoteStatus: 'Status da Cotação',
      pending: 'Pendente',
      responded: 'Respondida',
      won: 'Ganha',
      lost: 'Perdida',
      addNote: 'Adicionar Nota',
      notes: 'Notas',
      conversionRate: 'Taxa de Conversão'
    },
    facts: {
      title: 'Você sabia?',
      fact1: '90% do comércio mundial é realizado por via marítima',
      fact2: 'Um contêiner de 40 pés pode transportar até 10.000 caixas de vinho',
      fact3: 'O frete aéreo pode reduzir até 15 dias o tempo de trânsito comparado ao marítimo',
      fact4: 'A consolidação de carga pode reduzir custos em até 60% em fretes internacionais',
      fact5: 'Tempos típicos de trânsito marítimo: Ásia 35-45 dias, Europa 25-35 dias, EUA 20-30 dias'
    },
    auth: {
      adminInvalid: 'Usuário ou senha incorretos',
      partnerInvalid: 'Credenciais incorretas',
      loginSuccess: 'Login realizado com sucesso',
      connectionError: 'Erro de conexão — tente novamente',
      verifying: 'Verificando...',
      sending: 'Enviando...',
      login: 'Entrar',
      enterEmail: 'Digite seu email',
      waitCountdown: 'Aguarde {s}s para reenviar',
      codeSent: 'Código enviado para {email}',
      newCodeSent: 'Novo código enviado',
      otpSendError: 'Erro ao enviar o código',
      otpProcessError: 'Erro ao processar a solicitação',
      otpIncorrect: 'Código incorreto',
      otpVerifyError: 'Erro ao verificar o código',
      welcome: 'Bem-vindo(a)'
    }
  }
}

export function useTranslation(lang: Language = 'es'): Translations {
  return translations[lang] || translations.es
}

const LANGUAGE_STORAGE_KEY = 'twf-language'

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'es'
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'es' || stored === 'en' || stored === 'pt') return stored
  } catch {}
  return 'es'
}

export function setStoredLanguage(lang: Language): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lang) } catch {}
}
